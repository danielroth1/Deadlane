import { expect, test, type Page } from '@playwright/test';

/**
 * Water sections, proved on the debug surface.
 *
 * The unit matrix proves the surface data; this spec proves the shipped run reads it. It
 * jumps the run onto a water stretch through the debug control, waits for the ordinary
 * `applySurface` crossing to resolve, and then asserts the three things a player would see:
 * the hull frame, a boat-only hostile, and a splash event. It then jumps to the causeway and
 * proves the reverse transform. Nothing here is staged by hand: the crossing is the real
 * one the run performs every time it reaches a shore.
 */

const BASE = '/deadlane/';
const SEED = 424242;

/** The hostile ids the content table declares water-only. */
const WATER_ENEMIES = ['gunboat', 'speedboat', 'jetski', 'dredger'];

interface SurfaceSegment {
  readonly from: number;
  readonly to: number;
  readonly kind: 'land' | 'water';
}

interface DeadlaneSnapshot {
  readonly worldDistance: number;
  readonly surface: 'land' | 'water';
  readonly surfaceFrame: 'car' | 'boat';
  readonly surfaceEvents: number;
  readonly lastSurfaceEvent: {
    readonly from: 'land' | 'water';
    readonly to: 'land' | 'water';
    readonly kind: 'splash';
    readonly splashes: number;
  } | null;
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  readonly vehicles: readonly { readonly kind: string; readonly id: string }[];
  readonly road: { readonly surface: 'land' | 'water'; readonly surfaces: readonly SurfaceSegment[] };
  readonly hud: { readonly distance: number; readonly level: number };
}

interface DeadlaneControl {
  fastForward(pixels: number): void;
  fastForwardToWater(): void;
}

async function snapshot(page: Page): Promise<DeadlaneSnapshot | null> {
  return page.evaluate(
    () => (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane ?? null,
  );
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  const snap = await snapshot(page);
  if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
  return snap;
}

async function fastForwardToWater(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.fastForwardToWater();
  });
}

async function fastForward(page: Page, pixels: number): Promise<void> {
  await page.evaluate((px) => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.fastForward(px);
  }, pixels);
}

async function startRun(page: Page): Promise<void> {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`${BASE}?debug=1&seed=${SEED}`);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        await page.keyboard.press('Space');
        return (await snapshot(page)) !== null;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

test('a water stretch puts the car on the hull, spawns boats and splashes at the shore', async ({
  page,
}) => {
  await startRun(page);

  await fastForwardToWater(page);

  // 1. The run crossed onto water on its own `applySurface` path: the surface, the body and
  //    the recorded crossing all agree.
  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap?.surface === 'water' && snap.surfaceFrame === 'boat';
    },
    undefined,
    { timeout: 10_000 },
  );

  const onWater = await readSnapshot(page);
  expect(onWater.road.surface, 'the road snapshot disagrees with the run').toBe('water');
  expect(onWater.surfaceEvents).toBeGreaterThanOrEqual(1);
  expect(onWater.lastSurfaceEvent).toMatchObject({ to: 'water', kind: 'splash' });
  expect(onWater.lastSurfaceEvent?.splashes ?? 0).toBeGreaterThan(0);

  // The sector really holds both materials; a stretch that merely floods the screen would
  // not prove a transform.
  const kinds = new Set(onWater.road.surfaces.map((segment) => segment.kind));
  expect(kinds.has('water')).toBe(true);
  expect(kinds.has('land')).toBe(true);

  // 2. A boat-only hostile reaches the road. `gunboat`/`speedboat`/`jetski`/`dredger` are
  //    the content rows declared water-only, so one of them on screen is the generator's
  //    surface filter doing its job in the shipped build.
  await page.waitForFunction(
    (ids) => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return Boolean(
        snap?.vehicles.some((vehicle) => vehicle.kind === 'enemy' && ids.includes(vehicle.id)),
      );
    },
    WATER_ENEMIES,
    { timeout: 20_000 },
  );

  const withEnemies = await readSnapshot(page);
  const enemyIds = withEnemies.vehicles
    .filter((vehicle) => vehicle.kind === 'enemy')
    .map((vehicle) => vehicle.id);
  expect(enemyIds.some((id) => WATER_ENEMIES.includes(id))).toBe(true);
  // ... and nothing wheeled is on the water with it.
  for (const id of enemyIds) {
    expect(WATER_ENEMIES, `${id} spawned on water`).toContain(id);
  }

  // 3. Drive to the causeway and back onto the car. The jump targets just inside the land
  //    stretch, so the next frame performs the opposite crossing.
  const land = withEnemies.road.surfaces.find((segment) => segment.kind === 'land');
  expect(land, 'the water sector has no causeway').toBeDefined();
  if (!land) return;

  const pixels = Math.max(1, land.from - withEnemies.worldDistance + 20);
  await fastForward(page, pixels);

  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap?.surface === 'land' && snap.surfaceFrame === 'car';
    },
    undefined,
    { timeout: 10_000 },
  );

  const onLand = await readSnapshot(page);
  expect(onLand.lastSurfaceEvent).toMatchObject({ from: 'water', to: 'land', kind: 'splash' });
  expect(onLand.surfaceEvents).toBeGreaterThanOrEqual(2);
});
