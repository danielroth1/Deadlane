import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * The tiled highway, asserted on real rendered pixels.
 *
 * The tile layer is a visual feature: no unit test can see whether the sheet is drawn, in
 * which direction it scrolls, or whether it paints a grid — all three of those were wrong
 * in the first round while every command passed. This spec reads the canvas back at the
 * game's own 640 x 360 resolution and checks the picture.
 */

const BASE = '/deadlane/';
const SEED = 424242;

/** Mirror of `ROAD` in src/config.ts. */
const ROAD = { left: 128, width: 384 } as const;

interface DeadlaneSnapshot {
  paused: boolean;
  sectorCard: unknown;
  /** Unrounded world scroll in pixels — the value the road renderer is given. */
  worldDistance: number;
  hud: { distance: number; speed: number };
}

interface Frame {
  readonly width: number;
  readonly height: number;
  /** 3 for an opaque screenshot, 4 if the pipeline ever hands back alpha. */
  readonly channels: number;
  readonly data: Buffer;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
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

function rgb(frame: Frame, x: number, y: number): [number, number, number] {
  const i = (y * frame.width + x) * frame.channels;
  return [frame.data[i] ?? 0, frame.data[i + 1] ?? 0, frame.data[i + 2] ?? 0];
}

function luma(frame: Frame, x: number, y: number): number {
  const [r, g, b] = rgb(frame, x, y);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Start a highway run and wait until the sector card has cleared and the road is moving. */
async function startRun(page: Page): Promise<void> {
  await page.goto(`${BASE}?debug=1&seed=${SEED}`);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        await page.keyboard.press('Space');
        return page.evaluate(() =>
          Boolean((window as unknown as { __deadlane?: unknown }).__deadlane),
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      // `hud.distance` is metres (40 mm per pixel), so 30 m is a safe distance past the
      // sector card, not the 120 m the first draft waited for.
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Pause and wait until the world is frozen; returns the frozen distance in pixels. */
async function pause(page: Page): Promise<number> {
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane?.paused === true,
    undefined,
    { timeout: 5_000 },
  );
  return (await readSnapshot(page)).worldDistance;
}

test('the highway is drawn from the art-13 tile sheet, without a grid', async ({ page }) => {
  await startRun(page);
  const frame = await grab(page);

  // 1. Tiles are actually on screen. The drawn fallback fills each terrain band with one
  //    flat palette colour, whereas the generated grass tile is olive plus a scatter of
  //    palette speckles: several colours, none of them dominant to within 5 %.
  const grassStats = (fromX: number, toX: number): { distinct: number; topShare: number } => {
    const counts = new Map<string, number>();
    let total = 0;
    for (let y = 100; y < 300; y += 1) {
      for (let x = fromX; x < toX; x += 1) {
        const key = rgb(frame, x, y).join(',');
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total += 1;
      }
    }
    const top = Math.max(...counts.values());
    return { distinct: counts.size, topShare: top / total };
  };

  const leftGrass = grassStats(2, ROAD.left - 18);
  const rightGrass = grassStats(ROAD.left + ROAD.width + 16, 638);

  expect(leftGrass.distinct, 'left terrain band is a flat drawn fill, not the tile sheet')
    .toBeGreaterThanOrEqual(10);
  expect(leftGrass.topShare).toBeLessThan(0.95);
  expect(rightGrass.distinct, 'right terrain band is a flat drawn fill, not the tile sheet')
    .toBeGreaterThanOrEqual(10);
  expect(rightGrass.topShare).toBeLessThan(0.95);

  // 2. No lattice. The first round stamped a 1 px void ring around every 32 px cell, which
  //    drew a near-black line the full width of the road. Asphalt is lighter than void, so
  //    a row claiming to be asphalt must not be mostly void.
  const voidShare = (y: number): number => {
    let matches = 0;
    let samples = 0;
    for (let x = ROAD.left + 10; x < ROAD.left + ROAD.width - 10; x += 1) {
      const [r, g, b] = rgb(frame, x, y);
      samples += 1;
      if (Math.abs(r - 0x0b) <= 8 && Math.abs(g - 0x0d) <= 8 && Math.abs(b - 0x10) <= 8) {
        matches += 1;
      }
    }
    return matches / samples;
  };

  let worstRow = 0;
  let worstShare = 0;
  for (let y = 40; y < 320; y += 1) {
    const share = voidShare(y);
    if (share > worstShare) {
      worstShare = share;
      worstRow = y;
    }
  }

  expect(
    worstShare,
    `row ${worstRow} is ${(worstShare * 100).toFixed(0)}% void — that is a tile seam line`,
  ).toBeLessThan(0.4);
});

test('the tile pattern scrolls down the screen with the world', async ({ page }) => {
  await startRun(page);

  // Two frames, both frozen by the pause flag, so the shift measured between them is
  // exactly the distance the world moved — no screenshot latency in the number.
  const before = await pause(page);
  const frameA = await grab(page);

  await page.keyboard.press('Escape');
  await page.waitForFunction(
    (target) => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap !== undefined && snap.worldDistance >= target;
    },
    before + 8,
    { polling: 'raf', timeout: 5_000 },
  );
  const after = await pause(page);
  const frameB = await grab(page);

  const travel = after - before;
  expect(travel).toBeGreaterThan(2);
  // The tile repeats every 32 px, so a shift larger than one tile is only measurable
  // modulo the tile. Every pause round trip stays well inside that, but the comparison
  // below holds for any distance.
  const expectedShift = travel % 32;

  // Compare a strip of grass beside the road (no traffic, no HUD) as a 2D texture and find
  // the vertical shift that best re-aligns B onto A. A per-row average would be almost
  // flat — the tile is noise — so every pixel of the strip takes part in the match. The
  // pattern moves down, so B[x][y + travel] = A[x][y].
  const stripCost = (shift: number): number => {
    let cost = 0;
    let samples = 0;
    for (let y = 40; y < 300; y += 1) {
      for (let x = 6; x < 110; x += 2) {
        cost += Math.abs(luma(frameA, x, y) - luma(frameB, x, y + shift));
        samples += 1;
      }
    }
    return cost / samples;
  };

  let bestShift = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let shift = 0; shift < 32; shift += 1) {
    const cost = stripCost(shift);
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = shift;
    }
  }
  expect(
    Math.abs(bestShift - expectedShift),
    `pattern moved ${bestShift}px but the world moved ${travel}px (${expectedShift}px modulo the tile) — the tile layer scrolls the wrong way`,
  ).toBeLessThanOrEqual(2);
});
