import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

/**
 * The act boss is drawn from the pixels that actually ship.
 *
 * WO-49 generated `art-07-boss` attempt 1 and rejected every cell: all four were
 * three-quarter hero renders with a baked background, so `pipeline/registry/slots.ts`
 * declares them dropped and no boss frame reaches the atlas. The bosses therefore draw
 * their procedural placeholder, and that is a visual fact no unit test can see — the
 * manifest can be right while the canvas still paints something else, which is exactly what
 * WO-27 found on the enemy sheets.
 *
 * So this spec reads the canvas back at the authored 640 x 360 and fingerprints the
 * placeholder truck: `ensureVehicleTexture` draws a 30 x 44 `rust` body with a 24 px
 * `asphaltLight` cargo panel and an 18 px `teal` windscreen. Nothing else in the game —
 * no shipped sheet, no prop, no tile — produces that 30 px run, and no boss cell of attempt
 * 1 contains `rust` at all. When a boss sheet is finally accepted this spec is the one that
 * must change: it pins the rejection, not the absence of art.
 */

const BASE = '/deadlane/';
const SEED = 424242;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;

/** Palette mirror, used as a nearest-colour classifier rather than for exact equality. */
const PALETTE = {
  void: [0x0b, 0x0d, 0x10],
  asphalt: [0x16, 0x1a, 0x21],
  asphaltLight: [0x23, 0x2a, 0x34],
  steel: [0x3d, 0x47, 0x53],
  steelLight: [0x7a, 0x87, 0x94],
  bone: [0xc8, 0xd2, 0xdc],
  white: [0xf2, 0xf6, 0xf9],
  rust: [0x7a, 0x2f, 0x2f],
  signalRed: [0xb8, 0x45, 0x2f],
  amber: [0xe0, 0x76, 0x2a],
  sand: [0xe8, 0xc1, 0x5a],
  olive: [0x4e, 0x7a, 0x3f],
  teal: [0x2f, 0x6f, 0x6a],
  deepBlue: [0x2b, 0x4c, 0x7e],
  violet: [0x6a, 0x4f, 0xa3],
  hotPink: [0xff, 0x2e, 0x63],
} as const satisfies Record<string, readonly [number, number, number]>;

type PaletteKey = keyof typeof PALETTE;

type Rgb = readonly [number, number, number];

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Buffer;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface DeadlaneSnapshot {
  boss: { id: string; hp: number; maxHp: number } | null;
  sectorCard: { level: number; label: string } | null;
  hud: { distance: number; level: number };
}

interface DeadlaneControl {
  fastForward(pixels: number): void;
}

interface Manifest {
  readonly sheets: Record<string, unknown>;
  readonly sprites: Record<string, unknown>;
}

async function snapshot(page: Page): Promise<DeadlaneSnapshot | null> {
  return page.evaluate(
    () => (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane ?? null,
  );
}

/** Screenshot the canvas and resample it back to the authored 640 x 360 grid. */
async function grab(page: Page): Promise<Frame> {
  const png = await page.locator('#dl-root canvas').screenshot();
  const { data, info } = await sharp(png)
    .resize(640, 360, { kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

function rgb(frame: Frame, x: number, y: number): Rgb {
  const i = (y * frame.width + x) * frame.channels;
  return [frame.data[i] ?? 0, frame.data[i + 1] ?? 0, frame.data[i + 2] ?? 0];
}

/**
 * Which palette colour a rendered pixel is.
 *
 * The screenshot is resampled from a CSS-scaled canvas and the boss is tinted while it
 * telegraphs, so exact equality is the wrong question. Nearest colour is the same rule the
 * pipeline used to quantise every sheet, and a tinted placeholder body still lands on
 * `rust`; the cargo panel and windscreen checks below only match on an untinted frame, so
 * the spec samples until it gets one.
 */
function classify(pixel: Rgb): PaletteKey {
  let best: PaletteKey = 'void';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(PALETTE) as PaletteKey[]) {
    const entry = PALETTE[key];
    const dr = pixel[0] - entry[0];
    const dg = pixel[1] - entry[1];
    const db = pixel[2] - entry[2];
    const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return best;
}

function isColour(frame: Frame, x: number, y: number, key: PaletteKey): boolean {
  return classify(rgb(frame, x, y)) === key;
}

/** Longest run of one palette colour inside one row, between two columns. */
function longestRun(frame: Frame, y: number, x0: number, x1: number, key: PaletteKey): number {
  let best = 0;
  let run = 0;
  for (let x = x0; x <= x1; x += 1) {
    if (isColour(frame, x, y, key)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * The placeholder truck's own geometry, measured on one candidate run of body pixels.
 *
 * `ensureVehicleTexture` size 120 draws a 30 x 44 rounded body, a 24 x 26 cargo panel 4 rows
 * down from the top, a 3 px steel strip across the panel and an 18 x 6 windscreen 32 rows
 * down. The left and right body edges stay `rust` for the full height, which is what makes
 * the vertical extent measurable; a road lord's 22 px wedge cannot produce a 30 px run.
 */
function measureBody(frame: Frame, left: number, right: number, row: number): Rect | null {
  let top = row;
  while (top - 1 >= 0 && isColour(frame, left, top - 1, 'rust') && isColour(frame, right, top - 1, 'rust')) {
    top -= 1;
  }

  let bottom = row;
  while (
    bottom + 1 < frame.height &&
    isColour(frame, left, bottom + 1, 'rust') &&
    isColour(frame, right, bottom + 1, 'rust')
  ) {
    bottom += 1;
  }

  const height = bottom - top + 1;
  if (height < 42 || height > 46) return null;

  const width = right - left + 1;
  if (longestRun(frame, top + 10, left, right, 'asphaltLight') < 20) return null;
  if (longestRun(frame, top + 34, left, right, 'teal') < 15) return null;

  return { x: left, y: top, w: width, h: height };
}

/** The placeholder truck on screen, or null when this frame does not show one. */
function findPlaceholderTruck(frame: Frame): Rect | null {
  for (let y = 0; y < frame.height; y += 1) {
    let start = -1;
    for (let x = 0; x <= frame.width; x += 1) {
      const rust = x < frame.width && isColour(frame, x, y, 'rust');
      if (rust && start < 0) start = x;
      if (rust || start < 0) continue;

      const width = x - start;
      if (width >= 29 && width <= 31) {
        const rect = measureBody(frame, start, x - 1, y);
        if (rect) return rect;
      }
      start = -1;
    }
  }
  return null;
}

test('the act boss draws the procedural placeholder because art-07 ships no frame', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // The sheet is rejected whole, so the atlas carries no boss frame and no boss sheet: the
  // game has nothing but the placeholder to draw.
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/assets/assets.json'), 'utf8'),
  ) as Manifest;
  expect(Object.keys(manifest.sprites).filter((id) => id.startsWith('boss/'))).toEqual([]);
  expect(manifest.sheets['art-07-boss']).toBeUndefined();

  await page.goto(DEBUG_URL);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        await page.keyboard.press('Space');
        return (await snapshot(page)) !== null;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const snap = await snapshot(page);
        return snap !== null && snap.sectorCard === null && snap.hud.distance > 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  // Control: the fingerprint is not something the highway draws anyway. If this ever finds a
  // "placeholder truck" before a boss exists, the detector is matching something else and
  // the assertion below proves nothing.
  expect(
    findPlaceholderTruck(await grab(page)),
    'the highway must not show a placeholder truck before the boss arrives',
  ).toBeNull();

  // One jump reaches the sector boundary, where the highway's command carrier is waiting.
  await page.evaluate((px) => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl }).__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.fastForward(px);
  }, 30_000);

  await expect
    .poll(async () => (await snapshot(page))?.boss?.id ?? null, { timeout: 10_000 })
    .toBe('command-carrier');

  // The boss tints amber while it telegraphs, so sample until an untinted frame shows the
  // placeholder's cargo panel and windscreen. `BOSS.stationAhead` is 132 px above the car's
  // 288, so a body at the station has its 44 px top at y 134; the band rejects a body caught
  // mid-descent and any lookalike elsewhere on screen.
  const deadline = Date.now() + 15_000;
  let body: Rect | null = null;
  while (!body && Date.now() < deadline) {
    const rect = findPlaceholderTruck(await grab(page));
    if (rect && rect.y >= 110 && rect.y <= 160) body = rect;
    else await page.waitForTimeout(80);
  }

  expect(body, 'no placeholder truck was on screen during the boss encounter').not.toBeNull();
  const boss = await snapshot(page);
  expect(boss?.boss?.id).toBe('command-carrier');
  expect(boss?.boss?.hp ?? 0).toBeGreaterThan(0);

  // 30 px wide, 44 px tall — the placeholder body, not a 128 px sheet cell and not a road lord.
  expect(body?.w).toBeGreaterThanOrEqual(29);
  expect(body?.w).toBeLessThanOrEqual(31);
  expect(body?.h).toBeGreaterThanOrEqual(42);
  expect(body?.h).toBeLessThanOrEqual(46);

  expect(errors).toEqual([]);
});
