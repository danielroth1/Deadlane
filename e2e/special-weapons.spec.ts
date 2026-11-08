import { expect, test, type Page } from '@playwright/test';

/**
 * The special weapons, driven through the shipped scene on the production build.
 *
 * None of this is visible to a unit test: the geometry is pure and covered in
 * `src/systems/weapons.test.ts`, but "a pursuer crossing a world-static slick spins",
 * "a rocket detonates and kills" and "the flame cone burns a car down" only exist once the
 * scene, the art and the collision pass are assembled.
 *
 * Every stage is a real gameplay path — the debug control clears the road, places one
 * lane-holding hostile and then fires or drops through the same method the keyboard drives —
 * so the assertions read the `?debug=1` snapshot rather than the canvas.
 */

const BASE = '/deadlane/';
const SEED = 737577;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;

interface VehicleState {
  readonly kind: 'player' | 'enemy' | 'civilian';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** True while a slick has the car spinning. */
  readonly spinning: boolean;
  readonly wrecked: boolean;
}

interface DeadlaneSnapshot {
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  readonly lastWeaponKill: 'rocket' | 'flame' | null;
  readonly vehicles: readonly VehicleState[];
  readonly hud: {
    readonly distance: number;
    readonly rockets: number;
    readonly flame: number;
  };
}

interface DeadlaneControl {
  stageOilPursuer(): void;
  stageRocketTarget(): void;
  stageFlameTarget(): void;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

function control(page: Page, action: keyof DeadlaneControl): Promise<void> {
  return page.evaluate((name) => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api[name]();
  }, action);
}

/** Start a run and wait until the sector card has cleared. */
async function startRun(page: Page): Promise<void> {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(DEBUG_URL);
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
      // `hud.distance` is metres, so 30 m is well past the sector card.
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

const enemies = (snap: DeadlaneSnapshot): readonly VehicleState[] =>
  snap.vehicles.filter((vehicle) => vehicle.kind === 'enemy');

test('a pursuer crossing a world-static slick spins instead of dying', async ({ page }) => {
  await startRun(page);
  await control(page, 'stageOilPursuer');

  await expect
    .poll(
      async () => enemies(await readSnapshot(page)).some((enemy) => enemy.spinning),
      { timeout: 8_000 },
    )
    .toBe(true);

  const after = await readSnapshot(page);
  const spinning = enemies(after).filter((enemy) => enemy.spinning);

  // The slick costs control, not the car: the spinning hostile is still on the road.
  expect(spinning.length).toBeGreaterThan(0);
  // And the slick is not a kill, so no weapon kill is recorded.
  expect(after.lastWeaponKill).toBeNull();
});

test('a rocket detonates on a hostile and kills it', async ({ page }) => {
  await startRun(page);
  const before = await readSnapshot(page);

  await control(page, 'stageRocketTarget');

  await expect
    .poll(async () => (await readSnapshot(page)).lastWeaponKill, { timeout: 8_000 })
    .toBe('rocket');

  // The launch is spent ammo, not a free shot.
  const ammo = (await readSnapshot(page)).hud.rockets;
  expect(ammo).toBe(Math.max(0, before.hud.rockets - 1));
});

test('the flame cone burns a close hostile down', async ({ page }) => {
  await startRun(page);
  const before = await readSnapshot(page);

  await control(page, 'stageFlameTarget');

  await expect
    .poll(async () => (await readSnapshot(page)).lastWeaponKill, { timeout: 8_000 })
    .toBe('flame');

  const ammo = (await readSnapshot(page)).hud.flame;
  expect(ammo).toBe(Math.max(0, before.hud.flame - 1));
});
