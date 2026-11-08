import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * The tiled road, asserted on real rendered pixels.
 *
 * The tile layer is a visual feature: no unit test can see whether the sheet is drawn, in
 * which direction it scrolls, or whether it paints a grid — all three of those were wrong
 * in WO-44's first round while every command passed. `road-tiles.sheet.test.ts` measures
 * the window rectangles against the committed PNGs; this spec reads the canvas back at the
 * game's own 640 x 360 resolution and proves those windows reached the screen, on all three
 * themes that have a sheet: highway, canyon and water.
 *
 * Nothing here is paused when it samples colours. The pause card is a 70 % void overlay
 * across the whole screen, so a paused frame can only be compared with another paused
 * frame; the colour assertions run on a live frame and every one of them is built to ignore
 * traffic — a median down a column, a rank of the row steps, a longest run — because a car
 * in one lane must not be able to fake a fallback road or hide one.
 *
 * The canvas is screenshotted at the authored 640 x 360: `Scale.FIT` would otherwise give a
 * bilinear upscale, and half the contrast of a 1 px seam is exactly what that upscale eats.
 */

const BASE = '/deadlane/';
const SEED = 424242;

/**
 * Mirrors of `roadProfileFor` in `src/levels/types.ts`: tunnel and river lanes are 76 px,
 * everything else uses `ROAD.laneWidth`. Canyon is 5 × 64, river is 5 × 76.
 */
const HIGHWAY = { left: 128, width: 384, lanes: 6, laneWidth: 64 } as const;
const CANYON = { left: 160, width: 320, lanes: 5, laneWidth: 64 } as const;
const RIVER = { left: 130, width: 380, lanes: 5, laneWidth: 76 } as const;

/**
 * Palette mirror. Every sheet pixel was quantised onto these 16 colours, so a rendered pixel
 * is matched to the nearest one rather than compared exactly: the canvas is scaled to the
 * viewport and each level dims the world by its own `visibility` (a canyon frame is drawn
 * 8 % toward void).
 */
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

interface DeadlaneSnapshot {
  paused: boolean;
  sectorCard: { level: number; label: string } | null;
  lastSectorCard: { level: number; label: string } | null;
  /** Unrounded world scroll in pixels — the value the road renderer is given. */
  worldDistance: number;
  hud: { distance: number; speed: number; level: number };
}

interface Frame {
  readonly width: number;
  readonly height: number;
  /** 3 for an opaque screenshot, 4 if the pipeline ever hands back alpha. */
  readonly channels: number;
  readonly data: Buffer;
}

interface RoadProfile {
  readonly left: number;
  readonly width: number;
  readonly lanes: number;
  readonly laneWidth: number;
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

function rgb(frame: Frame, x: number, y: number): Rgb {
  const i = (y * frame.width + x) * frame.channels;
  return [frame.data[i] ?? 0, frame.data[i + 1] ?? 0, frame.data[i + 2] ?? 0];
}

function luma(pixel: Rgb): number {
  return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
}

/**
 * Which palette colour a rendered pixel is.
 *
 * Exact equality is not usable here: the canvas is CSS-scaled to the viewport and the
 * screenshot is resampled back to 640 × 360, so a pixel on the edge of two textured pixels
 * arrives blended. Nearest-colour is the right question anyway — it is the same rule the
 * pipeline used to quantise the sheet — and it also absorbs the level's own darkness
 * overlay (`canyon` is drawn 8 % toward void).
 */
function classify(pixel: Rgb): PaletteKey {
  let best: PaletteKey = 'void';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(PALETTE) as PaletteKey[]) {
    const entry = PALETTE[key];
    const dr = pixel[0] - entry[0];
    const dg = pixel[1] - entry[1];
    const db = pixel[2] - entry[2];
    // The pipeline's weighted distance, so "nearest" means the same thing here.
    const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return best;
}

/** Share of a region classified as one of `keys`. */
function paletteShare(
  frame: Frame,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  keys: readonly PaletteKey[],
): number {
  let hits = 0;
  let total = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      total += 1;
      if (keys.includes(classify(rgb(frame, x, y)))) hits += 1;
    }
  }
  return hits / total;
}

/**
 * Median share of a column classified as one of `keys`.
 *
 * Traffic is the reason this is a median and not a mean: a vehicle covers a few dozen of
 * the sampled columns for a fraction of the rows, while a drawn fill would cover every
 * column for every row. The median ignores the vehicle and still reports 1 for the fill.
 */
function medianColumnShare(
  frame: Frame,
  columns: readonly number[],
  y0: number,
  y1: number,
  keys: readonly PaletteKey[],
): number {
  const shares = columns.map((x) => {
    let hits = 0;
    let total = 0;
    for (let y = y0; y <= y1; y += 1) {
      total += 1;
      if (keys.includes(classify(rgb(frame, x, y)))) hits += 1;
    }
    return hits / total;
  });
  return median(shares);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Longest unbroken run of rows in one column painted one of `keys`.
 *
 * This is how a *drawn* line is told apart from painted texture: the edge lines the drawn
 * theme paints are a 3 px column of bone for the full height of the screen, while a water
 * sheet's crests are a few rows of bone at a time. A share cannot separate those two — bone
 * is 8 % of the water window — but a 270-row run can.
 */
function longestRun(
  frame: Frame,
  x: number,
  y0: number,
  y1: number,
  keys: readonly PaletteKey[],
): number {
  let longest = 0;
  let run = 0;
  for (let y = y0; y <= y1; y += 1) {
    if (keys.includes(classify(rgb(frame, x, y)))) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

/** Start a highway run and wait until the sector card has cleared and the road is moving. */
async function startRun(page: Page): Promise<void> {
  // The game draws at 640 x 360 and `Scale.FIT` stretches the canvas to the viewport. At a
  // 1280 x 720 viewport the screenshot is a bilinear upscale of the framebuffer, so a 1 px
  // line arrives as a two-row ramp and half its contrast is gone — which is exactly the
  // artefact these tests exist to find. A viewport of the authored size makes the canvas
  // 1:1 and the screenshot a copy of the framebuffer.
  await page.setViewportSize({ width: 640, height: 360 });
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

/** Advance the run by `pixels` of world distance instead of waiting out the clock. */
async function fastForward(page: Page, pixels: number): Promise<void> {
  await page.evaluate((px) => {
    const api = (window as unknown as { __deadlaneControl?: { fastForward(p: number): void } })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.fastForward(px);
  }, pixels);
}

/**
 * Jump the run across a sector boundary and wait until the new sector's card has cleared.
 *
 * A sector is 24 000–28 000 px at 220 px/s, so waiting it out in real time would make this
 * spec two minutes long. The jump moves only the same `distance` cursor the run moves, so
 * the boundary, the intro card and the new road all resolve on their own.
 */
async function crossSector(page: Page, label: string): Promise<void> {
  await fastForward(page, 30_000);
  await page.waitForFunction(
    (target) => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap?.lastSectorCard?.label === target && snap.sectorCard === null;
    },
    label,
    { timeout: 30_000 },
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

/**
 * The x columns inside each lane, 10 px clear of the 16 px dash bands that straddle the
 * lane boundaries. A dash is supposed to be there; a marking anywhere else is not.
 */
function laneInteriors(road: RoadProfile): number[] {
  const columns: number[] = [];
  for (let lane = 0; lane < road.lanes; lane += 1) {
    const first = road.left + lane * road.laneWidth + 10;
    for (let x = first; x < first + road.laneWidth - 20; x += 1) columns.push(x);
  }
  return columns;
}

/** Screen x of each painted lane divider: the dash band is centred on the boundary. */
function laneBoundaries(road: RoadProfile): number[] {
  const boundaries: number[] = [];
  for (let lane = 1; lane < road.lanes; lane += 1) {
    boundaries.push(road.left + lane * road.laneWidth);
  }
  return boundaries;
}

/** Median luma of every column in `columns`, taken over rows `y0` to `y1`. */
function columnMedians(
  frame: Frame,
  columns: readonly number[],
  y0: number,
  y1: number,
): number[] {
  return columns.map((x) => {
    const values: number[] = [];
    for (let y = y0; y <= y1; y += 1) values.push(luma(rgb(frame, x, y)));
    return median(values);
  });
}

/**
 * Mean luma of every row from `y0` to `y1`, across `columns`.
 *
 * Mean, not median: a median across a lane is blind to a *ramp*. Every row of the water holds
 * both teal and steel, so the median barely moves while the row itself gets brighter, and a
 * window that wrapped a bright row onto a dark one would go unseen. The cost of a mean is
 * that a vehicle moves the rows it covers, which is what {@link largestStep} is for.
 */
function rowProfile(frame: Frame, columns: readonly number[], y0: number, y1: number): number[] {
  const values: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    const total = columns.reduce((sum, x) => sum + luma(rgb(frame, x, y)), 0);
    values.push(total / columns.length);
  }
  return values;
}

/**
 * The `rank`-th largest jump between neighbouring rows of a profile.
 *
 * A band edge is periodic — one jump every window height — while a vehicle contributes at
 * most two (its nose and its tail). Asking for, say, the third largest step keeps the band
 * edge and drops a car, which a plain maximum would not.
 */
function largestStep(
  profile: readonly number[],
  rank = 1,
): { readonly step: number; readonly at: number } {
  const steps: { step: number; at: number }[] = [];
  for (let i = 0; i < profile.length - 1; i += 1) {
    steps.push({ step: Math.abs((profile[i + 1] ?? 0) - (profile[i] ?? 0)), at: i });
  }
  steps.sort((a, b) => b.step - a.step);
  return steps[rank - 1] ?? { step: 0, at: 0 };
}

/**
 * Luma above which a pixel is paint rather than asphalt. The sheet's own asphalt window
 * measures a column median of 56–68 and its painted dash measures 151, so this sits in the
 * empty band between the two rather than next to either one.
 */
const ASPHALT_LUMA_CEILING = 110;

/**
 * Freeze the run, screenshot it, let it scroll, freeze and screenshot again.
 *
 * Both frames are frozen by the pause flag, so the shift measured between them is exactly
 * the distance the world moved — no screenshot latency in the number. The strip is compared
 * as a 2D texture and the vertical shift that best re-aligns B onto A is searched for: a
 * per-row average would be almost flat, and the pattern moves down, so
 * B[x][y + travel] = A[x][y].
 */
async function measureScroll(
  page: Page,
  strip: { readonly x0: number; readonly x1: number; readonly period: number },
): Promise<{ readonly travel: number; readonly shift: number; readonly expected: number }> {
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
  let bestShift = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let shift = 0; shift < strip.period; shift += 1) {
    let cost = 0;
    let samples = 0;
    for (let y = 60; y < 300; y += 1) {
      for (let x = strip.x0; x < strip.x1; x += 2) {
        cost += Math.abs(luma(rgb(frameA, x, y)) - luma(rgb(frameB, x, y + shift)));
        samples += 1;
      }
    }
    const mean = cost / samples;
    if (mean < bestCost) {
      bestCost = mean;
      bestShift = shift;
    }
  }

  return { travel, shift: bestShift, expected: travel % strip.period };
}

async function expectPatternScrolls(
  page: Page,
  label: string,
  strip: { readonly x0: number; readonly x1: number; readonly period: number },
): Promise<void> {
  const { travel, shift, expected } = await measureScroll(page, strip);

  expect(travel, `${label}: the world did not move between the two frames`).toBeGreaterThan(2);
  expect(
    Math.abs(shift - expected),
    `${label}: the pattern moved ${shift}px but the world moved ${travel}px (${expected}px modulo the ${strip.period}px window) — the tile layer scrolls the wrong way`,
  ).toBeLessThanOrEqual(2);
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

  const leftGrass = grassStats(2, HIGHWAY.left - 18);
  const rightGrass = grassStats(HIGHWAY.left + HIGHWAY.width + 16, 638);

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
    for (let x = HIGHWAY.left + 10; x < HIGHWAY.left + HIGHWAY.width - 10; x += 1) {
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
  // The sand window is 32 rows tall, so that is its scroll period — and a shift larger than
  // one window is only measurable modulo the window.
  await expectPatternScrolls(page, 'highway', { x0: 6, x1: 110, period: 32 });
});

test('the canyon road is drawn from the art-14 tile sheet, with no marking inside a lane', async ({
  page,
}) => {
  await startRun(page);
  await crossSector(page, 'REDLINE CANYON');
  const frame = await grab(page);

  // 1. The terrain is the sheet's sand, not the drawn rust band. `rust` is what the
  //    fallback fills those 160 px with, so any of it is a fallback leak; the sand plain is
  //    the tile. Measured on this frame: 98 % sand, 0 % rust, on both sides.
  const terrain = [
    { label: 'left', x0: 6, x1: 150 },
    { label: 'right', x0: 490, x1: 634 },
  ] as const;
  for (const band of terrain) {
    const rust = paletteShare(frame, band.x0, band.x1, 100, 300, ['rust']);
    const sand = paletteShare(frame, band.x0, band.x1, 100, 300, ['sand']);
    expect(rust, `${band.label} canyon terrain is the drawn rust fill`).toBeLessThan(0.01);
    expect(sand, `${band.label} canyon terrain is not the sand plain`).toBeGreaterThan(0.9);
    // The plain is not a flat fill either: the sheet scatters grit across it, and the tile
    // layer repeats that grit rather than drawing one colour.
    expect(sand, `${band.label} canyon terrain is a flat fill`).toBeLessThan(0.995);
    expect(
      paletteShare(frame, band.x0, band.x1, 100, 300, ['amber', 'bone', 'signalRed']),
      `${band.label} canyon terrain has no grit on it`,
    ).toBeGreaterThan(0.005);
  }

  // 2. The surface is the sheet's cracked asphalt (`steel`), not the drawn road fill
  //    (`asphalt`). Its surface window is 84 % steel and 4 % asphalt, so 100 % asphalt is
  //    what the fallback would show and 3 % is what the tile shows - measured: 75 % steel,
  //    3 % asphalt (the rest is the sheet's own asphalt-light and grit, plus traffic).
  const roadLeft = CANYON.left;
  const roadRight = CANYON.left + CANYON.width - 1;
  expect(
    paletteShare(frame, roadLeft, roadRight, 60, 320, ['steel']),
    'the canyon road is not the sheet asphalt',
  ).toBeGreaterThan(0.5);
  expect(
    medianColumnShare(frame, laneInteriors(CANYON), 60, 320, ['asphalt']),
    'the canyon road is the drawn asphalt fill',
  ).toBeLessThan(0.15);

  // 3. No marking anywhere inside a lane. The surface window is 13 px wide and sits two
  //    columns from the sheet's solid edge line and one from its painted dash, so a window
  //    that leaked either column would repeat a marking every 13 px across the road.
  //    Measured on this frame the brightest lane column is 70 luma against the sheet's
  //    151-luma dash.
  const surface = laneInteriors(CANYON);
  for (const [index, value] of columnMedians(frame, surface, 60, 320).entries()) {
    expect(
      value,
      `column x=${surface[index]} is ${value.toFixed(0)} luma inside a lane — a marking leaked into the surface window`,
    ).toBeLessThan(ASPHALT_LUMA_CEILING);
  }

  // 4. No rule across the road either. The sheet's own rows step 22 luma at most and this
  //    frame steps 24, so a window that wrapped a bright row onto a dark one — a band edge
  //    every 30 px — would stand out as a bigger step than anything inside the window.
  const rows = largestStep(rowProfile(frame, surface, 40, 240), 3);
  expect(
    rows.step,
    `the row profile steps ${rows.step.toFixed(0)} luma at y=${40 + rows.at} — that is a band edge, not asphalt`,
  ).toBeLessThan(30);

  // 5. The dash bands are drawn, on the lane boundaries, from the sheet's painted line.
  //    This is the positive control for 3: the same measurement does find a marking.
  for (const boundary of laneBoundaries(CANYON)) {
    const [centre] = columnMedians(frame, [boundary], 60, 320);
    expect(centre, `no dash on the lane boundary x=${boundary}`).toBeGreaterThan(140);
    const [beside] = columnMedians(frame, [boundary - 7], 60, 320);
    expect(beside, `the dash band at x=${boundary} is wider than 15 px`).toBeLessThan(
      ASPHALT_LUMA_CEILING,
    );
  }
});

test('the canyon tile pattern scrolls down the screen with the world', async ({ page }) => {
  await startRun(page);
  await crossSector(page, 'REDLINE CANYON');
  // The sand window is 32 rows tall, so that is its scroll period.
  await expectPatternScrolls(page, 'canyon', { x0: 6, x1: 110, period: 32 });
});

test('the river is drawn from the art-15 water sheet, with no road markings at all', async ({
  page,
}) => {
  await startRun(page);
  await crossSector(page, 'REDLINE CANYON');
  await crossSector(page, 'DELTA RUN');
  const frame = await grab(page);

  // 1. The road is water, and it is not asphalt. `asphalt` is the colour the drawn road
  //    fill paints across the channel and it appears in no band of the water sheet except
  //    the deck's own grooves, so its absence from the channel and the terrain proves the
  //    tarmac road is gone. Measured on this frame: 0.2 % asphalt anywhere in the channel,
  //    0.0 % in the lane columns (median column), against 100 % for a drawn fill.
  const channel = { x0: RIVER.left, x1: RIVER.left + RIVER.width - 1 };
  expect(
    paletteShare(frame, 4, 636, 60, 330, ['asphalt']),
    'the river still paints road asphalt on screen',
  ).toBeLessThan(0.005);
  const lanes = laneInteriors(RIVER);
  expect(
    medianColumnShare(frame, lanes, 60, 320, ['asphalt']),
    'the river channel is drawn in road asphalt',
  ).toBe(0);
  for (const band of [
    { label: 'left terrain', x0: 6, x1: RIVER.left - 10 },
    { label: 'right terrain', x0: RIVER.left + RIVER.width + 10, x1: 634 },
  ] as const) {
    expect(
      medianColumnShare(
        frame,
        Array.from({ length: band.x1 - band.x0 + 1 }, (_, i) => band.x0 + i),
        60,
        330,
        ['asphalt'],
      ),
      `the river ${band.label} is drawn in road asphalt`,
    ).toBe(0);
  }

  // 2. No rule across the water either. The surface window's own rows step 22 luma at
  // most, so a window that wrapped a bright row onto a dark one — the `open water` cell
  // does exactly that, 50 luma at a 30-row wrap — would stand out as a band edge every
  // 26 px down the channel.
  const rows = largestStep(rowProfile(frame, lanes, 40, 240), 3);
  expect(
    rows.step,
    `the row profile steps ${rows.step.toFixed(0)} luma at y=${40 + rows.at} — that is a band edge, not water`,
  ).toBeLessThan(35);

  // 3. ... and it is the sheet's water, not the drawn fill. The fallback fills the channel
  //    with `deepBlue` and shows no white crests; the sheet's water is teal and steel with
  //    white crests. Measured: 27 % teal, 38 % steel, 12 % bone and white, 0 % deep blue.
  expect(
    paletteShare(frame, channel.x0, channel.x1, 60, 330, ['deepBlue']),
    'the river channel still shows the drawn deep blue fill',
  ).toBeLessThan(0.01);
  expect(
    paletteShare(frame, channel.x0, channel.x1, 60, 330, ['teal']),
    'there is no water in the channel',
  ).toBeGreaterThan(0.2);
  expect(
    paletteShare(frame, channel.x0, channel.x1, 60, 330, ['steel']),
    'the channel is not the sheet water',
  ).toBeGreaterThan(0.0);
  expect(
    paletteShare(frame, channel.x0, channel.x1, 60, 330, ['bone', 'white']),
    'the channel is a flat fill, not water with crests',
  ).toBeGreaterThan(0.0);

  // 4. No edge line and no guardrail ticks. Both are `bone`, and both belong to a tarmac
  //    road: the drawn theme paints a 3 px edge line over the full height of the screen and
  //    5 x 12 px ticks every 48 px down each shoulder. A share cannot tell them apart from
  //    the water's own crests — bone is 8 % of the water window — so this measures the one
  //    thing a drawn line has and a crest does not: a run. Measured: the edge columns never
  //    hold more than 1 row of bone, the whole channel never more than 13, and a drawn line
  //    is 270.
  const edgeColumns = [
    RIVER.left + 3,
    RIVER.left + 4,
    RIVER.left + 5,
    RIVER.left + RIVER.width - 6,
    RIVER.left + RIVER.width - 5,
    RIVER.left + RIVER.width - 4,
  ];
  for (const x of edgeColumns) {
    const run = longestRun(frame, x, 60, 330, ['bone', 'white']);
    expect(
      run,
      `x=${x} holds ${run} rows of bone in a row — that is the drawn edge line, painted on water`,
    ).toBeLessThan(30);
  }
  // The ticks are 12 rows tall, so a run cannot see them; the shoulder bands are the sheet's
  // deck and hold no bone at all, while a tick covers 15 % of the strip's height.
  for (const shoulder of [
    { label: 'left', x0: RIVER.left - 8, x1: RIVER.left - 1 },
    { label: 'right', x0: RIVER.left + RIVER.width, x1: RIVER.left + RIVER.width + 7 },
  ] as const) {
    expect(
      paletteShare(frame, shoulder.x0, shoulder.x1, 60, 330, ['bone', 'white']),
      `the ${shoulder.label} shoulder still draws guardrail ticks`,
    ).toBeLessThan(0.02);
  }

  // 5. The wake that does cross a lane boundary is the sheet's foam, not the drawn dash:
  //    the drawn dash is a 4 px bone rectangle, the sheet's foam band is 16 px and carries
  //    its white in a patch. Measured: 44-47 % bone and white in the 8 px around the line.
  for (const boundary of laneBoundaries(RIVER)) {
    const wake = paletteShare(frame, boundary - 4, boundary + 4, 60, 330, ['bone', 'white']);
    expect(wake, `no foam wake on the lane boundary x=${boundary}`).toBeGreaterThan(0.2);
  }

  // 6. No marking inside a lane. A lane band is 76 px and its wake band is 16 px on the
  //    boundary, so water fills the rest; measured the brightest lane column is 117 luma.
  for (const [index, value] of columnMedians(frame, lanes, 60, 320).entries()) {
    expect(
      value,
      `column x=${lanes[index]} is ${value.toFixed(0)} luma inside a lane — a marking on water`,
    ).toBeLessThan(140);
  }

  // 7. The pier deck is the shoulder: warm planking beside the water it lines. Measured
  //    42 % amber, against 0 % in the channel.
  expect(
    paletteShare(frame, RIVER.left - 8, RIVER.left - 1, 60, 330, ['amber']),
    'the river shoulder is not the sheet deck',
  ).toBeGreaterThan(0.2);
});

test('the water tile pattern scrolls down the screen with the world', async ({ page }) => {
  await startRun(page);
  await crossSector(page, 'REDLINE CANYON');
  await crossSector(page, 'DELTA RUN');
  // The terrain window is 22 rows tall, not 32: each band wraps at its own window height,
  // and a band that wrapped at 32 would jump 10 px every tile.
  await expectPatternScrolls(page, 'river', { x0: 6, x1: 110, period: 22 });
});
