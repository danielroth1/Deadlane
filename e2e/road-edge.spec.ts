import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * The road's edges, proved on rendered pixels, and the price of leaving them.
 *
 * Two things changed that no unit test can see. The surface is no longer one width per level
 * type: a sector carries width keyframes, so the road tightens and opens again as the car
 * drives. And the car is no longer pinned to the paint: it can cross the shoulder, and the
 * rough ground beside it is what punishes the mistake.
 *
 * The width proof reads the drawn edge lines straight off the canvas. They are road
 * furniture painted for the full height of the screen, so a column of them survives traffic
 * and scenery in a way a terrain/road boundary does not — the verge is exactly where the
 * decor now stands.
 *
 * The off-road proof asserts on the `?debug=1` snapshot, per the test rules: the state the
 * HUD draws its warning from, the speed the rough ground clamps to, and the armour the
 * ordinary damage path spends.
 */

const BASE = '/deadlane/';
const SEED = 813813;

/**
 * Mirror of `CAMERA.zoom` in `src/config.ts`.
 *
 * The world camera is zoomed out, so a world x lands on `x * zoom` on screen. Every number
 * below is in world pixels until it is converted here.
 */
const ZOOM = 0.75;

/**
 * Ceiling the rough ground holds the car to, in world px/s of the HUD readout.
 *
 * `(MOTION.cruiseSpeed + MOTION.cruiseBonus) * OFFROAD.speedFactor` is 187 at full
 * intensity, and the car coasts at 220 without any pedal at all — so a speed at or below
 * this while the snapshot says `offRoad` proves the penalty, and it costs the test no
 * assumption about which pedal is held.
 */
const OFF_ROAD_SPEED_CEILING = 192;

/** The screenshots are taken at the authored size, so the canvas is 1:1 and needs no resampling. */
interface Frame {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Buffer;
}

interface RoadSnapshot {
  readonly left: number;
  readonly width: number;
  readonly lanes: number;
  readonly laneWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly keyframes: readonly { readonly at: number; readonly width: number }[];
}

interface DeadlaneSnapshot {
  readonly worldDistance: number;
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  readonly offRoad: boolean;
  readonly lastBanner: string | null;
  readonly road: RoadSnapshot;
  readonly hud: { readonly armor: number; readonly lives: number; readonly speed: number; readonly distance: number };
}

/** The screen column a world x is drawn in. */
function toScreen(worldX: number): number {
  return Math.round(worldX * ZOOM);
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

async function grab(page: Page): Promise<Frame> {
  const png = await page.locator('#dl-root canvas').screenshot();
  const { data, info } = await sharp(png)
    .resize(640, 360, { kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

function rgb(frame: Frame, x: number, y: number): readonly [number, number, number] {
  const i = (y * frame.width + x) * frame.channels;
  return [frame.data[i] ?? 0, frame.data[i + 1] ?? 0, frame.data[i + 2] ?? 0];
}

/**
 * Share of one column that is edge-line paint.
 *
 * The edge lines are `bone` (a 3 px painted strip); `white` is folded in because the canvas
 * is scaled to the viewport and a 1 px strip can arrive blended toward it. The guardrail
 * ticks are the same bone at 35 %, but they sit on the shoulder outside the line and never
 * cover a whole column.
 */
function paintShare(frame: Frame, x: number, y0: number, y1: number): number {
  let hits = 0;
  let total = 0;
  for (let y = y0; y <= y1; y += 1) {
    const [r, g, b] = rgb(frame, x, y);
    total += 1;
    const bone = Math.abs(r - 0xc8) <= 26 && Math.abs(g - 0xd2) <= 26 && Math.abs(b - 0xdc) <= 26;
    const white = r >= 0xe0 && g >= 0xe6 && b >= 0xe8;
    if (bone || white) hits += 1;
  }
  return hits / total;
}

/**
 * The screen column of the brightest edge line inside `[from, to]`.
 *
 * A single painted source column is not one screen column at this zoom, so the search asks
 * which nearby column is most of that paint rather than assuming the arithmetic answer.
 */
function edgeColumn(frame: Frame, from: number, to: number): { x: number; share: number } {
  let best = { x: from, share: 0 };
  for (let x = Math.max(1, from); x <= Math.min(frame.width - 2, to); x += 1) {
    const share = paintShare(frame, x, 60, 300);
    if (share > best.share) best = { x, share };
  }
  return best;
}

/** Start a run and wait until the sector card has cleared and the road is moving. */
async function startRun(page: Page): Promise<void> {
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
      // `hud.distance` is metres (40 mm per pixel), so 30 m is past the sector card.
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Advance the run to a world distance instead of waiting out the clock. */
async function seekTo(page: Page, at: number): Promise<void> {
  const now = (await readSnapshot(page)).worldDistance;
  const pixels = Math.round(at - now);
  if (pixels <= 0) return;

  await page.evaluate((px) => {
    const api = (window as unknown as { __deadlaneControl?: { fastForward(p: number): void } })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.fastForward(px);
  }, pixels);

  // One frame has to run for the new distance to reach the renderer.
  await page.waitForFunction(
    (target) => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap !== undefined && snap.worldDistance >= target;
    },
    pixels + now - 20,
    { polling: 'raf', timeout: 10_000 },
  );
}

/** The two drawn edge lines of the road, in screen columns, with their paint shares. */
async function measureEdges(page: Page): Promise<{
  readonly road: RoadSnapshot;
  readonly left: { x: number; share: number };
  readonly right: { x: number; share: number };
}> {
  const frame = await grab(page);
  const road = (await readSnapshot(page)).road;
  const right = road.left + road.width;

  return {
    road,
    left: edgeColumn(frame, toScreen(road.left) - 6, toScreen(road.left) + 12),
    right: edgeColumn(frame, toScreen(right) - 12, toScreen(right) + 6),
  };
}

/**
 * The width keyframes that matter: the tightest and the widest, kept inside the first
 * 20 000 px so a fast-forward never runs the sector out and spawns the act boss.
 */
function extremes(road: RoadSnapshot): { narrow: { at: number; width: number }; wide: { at: number; width: number } } {
  const usable = road.keyframes.filter((key) => key.at > 0 && key.at < 20_000);
  expect(usable.length, 'the sector has no width keyframes to sample').toBeGreaterThan(2);

  const narrow = usable.reduce((a, b) => (b.width < a.width ? b : a));
  const wide = usable.reduce((a, b) => (b.width > a.width ? b : a));
  return { narrow, wide };
}

test('the road narrows and widens again, centred, on rendered pixels', async ({ page }) => {
  await startRun(page);

  const { narrow, wide } = extremes((await readSnapshot(page)).road);
  expect(wide.width, 'the sector never widens past its narrowest stretch').toBeGreaterThan(
    narrow.width + 20,
  );

  // Visit the narrow stretch first: the run only ever moves forward.
  const stops = [narrow, wide].sort((a, b) => a.at - b.at);
  const measured: { width: number; span: number; centreOffset: number }[] = [];

  for (const stop of stops) {
    await seekTo(page, stop.at);

    const edges = await measureEdges(page);
    const expectedSpan = (edges.road.width - 9) * ZOOM;

    // The lines themselves: inside the surface, a few pixels in from each edge.
    expect(
      edges.left.x,
      `no left edge line at the ${stop === narrow ? 'narrow' : 'wide'} stretch (x=${edges.left.x}, road left=${toScreen(edges.road.left)})`,
    ).toBeGreaterThanOrEqual(toScreen(edges.road.left) - 2);
    expect(edges.left.x).toBeLessThanOrEqual(toScreen(edges.road.left) + 10);
    expect(edges.left.share, 'the left edge line is missing from the frame').toBeGreaterThan(0.6);

    const rightEdge = toScreen(edges.road.left + edges.road.width);
    expect(edges.right.x).toBeGreaterThanOrEqual(rightEdge - 10);
    expect(edges.right.x).toBeLessThanOrEqual(rightEdge + 2);
    expect(edges.right.share, 'the right edge line is missing from the frame').toBeGreaterThan(0.6);

    const span = edges.right.x - edges.left.x;
    expect(
      Math.abs(span - expectedSpan),
      `the drawn road is ${span}px wide but the profile at ${stop.at} draws ${expectedSpan.toFixed(1)}px`,
    ).toBeLessThanOrEqual(8);

    measured.push({
      width: edges.road.width,
      span,
      centreOffset: (edges.left.x + edges.right.x) / 2 - 320,
    });
  }

  // Deliberately wide bounds: the two stretches are different roads, and the point is that
  // the screen shows the difference.
  const [first, second] = measured;
  expect(first, 'no first measurement').toBeDefined();
  expect(second, 'no second measurement').toBeDefined();
  expect(
    Math.abs((second?.span ?? 0) - (first?.span ?? 0)),
    'the narrow and wide stretches are drawn at the same width',
  ).toBeGreaterThan(20);

  // Centred on the 640 px canvas: widening and narrowing move both edges, not one.
  for (const sample of measured) {
    expect(Math.abs(sample.centreOffset), 'the road is not centred in the viewport').toBeLessThanOrEqual(
      6,
    );
  }
});

test('leaving the road warns, slows the car and costs armour', async ({ page }) => {
  await startRun(page);

  const start = await readSnapshot(page);
  expect(start.offRoad, 'the car started off the road').toBe(false);
  const armourBefore = start.hud.armor;
  expect(armourBefore, 'the run starts with no armour to spend').toBeGreaterThan(0);

  // Hold right until the car is over the edge. `OFFROAD.apron` is 24 px at 260 px/s, so this
  // is well inside two seconds even from the road's centre.
  await page.keyboard.down('ArrowRight');

  await expect
    .poll(
      async () => {
        const snap = await readSnapshot(page);
        return snap.offRoad && snap.lastBanner === 'OFF ROAD';
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  const offRoad = await readSnapshot(page);
  await page.keyboard.up('ArrowRight');

  // The rough-ground speed penalty: the car cannot be doing more than a share of cruise.
  // The first snapshot taken while the warning appears can still carry the pre-clamp speed,
  // so wait for a frame that has actually applied the penalty instead of reading that one.
  expect(offRoad.offRoad, 'the car left the road before the speed check').toBe(true);
  await expect
    .poll(async () => (await readSnapshot(page)).hud.speed, { timeout: 5_000 })
    .toBeLessThanOrEqual(OFF_ROAD_SPEED_CEILING);

  // Left alone, the car keeps losing armour on the ordinary damage path.
  await expect
    .poll(
      async () => {
        const snap = await readSnapshot(page);
        return snap.offRoad && snap.hud.armor < armourBefore;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  const damaged = await readSnapshot(page);
  expect(damaged.hud.lives, 'rough ground spent a life before it had spent the armour').toBe(
    start.hud.lives,
  );
});
