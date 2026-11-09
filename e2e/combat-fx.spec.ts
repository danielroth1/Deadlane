import { expect, test, type Page } from '@playwright/test';

/**
 * Combat and motion effects, end to end on the production build.
 *
 * Three things the effect layer promises cannot be seen from a unit test: a staged aircraft
 * actually grows a rotor and that rotor is actually turning, a hard steer actually lays
 * tyre lines on the road, and two kills actually wear different explosion packages. All
 * three are asserted on the `?debug=1` counters the order adds, never on canvas pixels.
 */

const BASE = '/deadlane/';
const SEED = 594059;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;

/** Mirror of `FX.skidMarkMax` — the ceiling the decal layer must never cross. */
const SKID_MARK_CAP = 64;

type FxVariant = 'fireball' | 'smoke' | 'debris' | 'shockwave' | 'boss';

interface DeadlaneSnapshot {
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  /** The last explosion package played. */
  readonly lastFx: FxVariant | null;
  /** Live tyre lines on the road. */
  readonly skidMarks: number;
  /** Quarter turns the aircraft rotors have stepped. */
  readonly rotorTicks: number;
  readonly hud: { readonly distance: number };
}

interface DeadlaneControl {
  stageEnemy(id?: string): void;
  stageRocketTarget(): void;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

function control(page: Page, action: keyof DeadlaneControl, arg?: string): Promise<void> {
  return page.evaluate(
    ({ name, arg }) => {
      const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
        .__deadlaneControl;
      if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
      if (name === 'stageEnemy') api.stageEnemy(arg);
      else api.stageRocketTarget();
    },
    { name: action, arg },
  );
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
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

test('a staged aircraft grows a rotor that keeps turning', async ({ page }) => {
  await startRun(page);
  await control(page, 'stageEnemy', 'helicopter');

  // The rotor steps a quarter turn every few frames: the counter must climb, not just
  // exist, which is what separates an animated rotor from a static cross.
  await expect.poll(async () => (await readSnapshot(page)).rotorTicks, { timeout: 8_000 }).toBeGreaterThan(2);

  const before = (await readSnapshot(page)).rotorTicks;
  await page.waitForTimeout(400);
  const after = (await readSnapshot(page)).rotorTicks;

  expect(after).toBeGreaterThan(before);
});

test('a hard steer lays tyre lines, and the decal layer stays capped', async ({ page }) => {
  await startRun(page);
  expect((await readSnapshot(page)).skidMarks).toBe(0);

  await page.keyboard.down('ArrowLeft');
  await expect
    .poll(async () => (await readSnapshot(page)).skidMarks, { timeout: 8_000 })
    .toBeGreaterThan(0);

  // Hold the wheel over long enough that an uncapped layer would be well past the ceiling.
  await page.waitForTimeout(2_500);
  const held = await readSnapshot(page);
  expect(held.skidMarks).toBeGreaterThan(0);
  expect(held.skidMarks).toBeLessThanOrEqual(SKID_MARK_CAP);

  await page.keyboard.up('ArrowLeft');
});

test('two kills wear different explosion packages', async ({ page }) => {
  await startRun(page);

  await control(page, 'stageRocketTarget');
  await expect.poll(async () => (await readSnapshot(page)).lastFx, { timeout: 10_000 }).not.toBeNull();

  const first = (await readSnapshot(page)).lastFx;
  expect(['fireball', 'smoke', 'debris', 'shockwave']).toContain(first);

  // The rocket tube has an 800 ms cooldown (`weapons.json`); staging a second target inside
  // it would clear the road and then fire nothing, so let the tube recover first.
  await page.waitForTimeout(950);
  await control(page, 'stageRocketTarget');
  await expect
    .poll(async () => (await readSnapshot(page)).lastFx, { timeout: 10_000 })
    .not.toBe(first);
});
