import { expect, test, type Page } from '@playwright/test';

/**
 * Road hazards, end to end on the production build.
 *
 * Two rules the order adds cannot be seen from a unit test alone: a ramp must lift the car
 * over a solid barrier, and a barrier on the ground must spend armour rather than be driven
 * through. Both are driven through the same `?debug=1` control surface the other specs use,
 * so the assertions read the state the HUD draws from.
 */

const BASE = '/deadlane/';
const SEED = 606406;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;

interface CarState {
  readonly x: number;
  readonly y: number;
  readonly airborne: boolean;
}

interface PropContactState {
  readonly kind: string;
  readonly collision: 'solid' | 'soft' | 'hazard';
  readonly damage: boolean;
}

/** Mirror of the read-only `window.__deadlane` snapshot, hazard fields only. */
interface DeadlaneSnapshot {
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  readonly car: CarState;
  readonly lastLanding: 'dust' | 'splash' | null;
  readonly lastPropContact: PropContactState | null;
  readonly hud: {
    readonly armor: number;
    readonly lives: number;
    readonly distance: number;
  };
}

/** Mirror of the debug-only actions this spec drives. */
interface DeadlaneControl {
  stageBarrier(): void;
  stageRampBarrier(): void;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

async function control(page: Page, action: keyof DeadlaneControl): Promise<void> {
  await page.evaluate((name) => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl }).__deadlaneControl;
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
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

test('a ramp launches the car over a solid barrier without spending armour', async ({
  page,
}) => {
  await startRun(page);
  const before = await readSnapshot(page);

  await control(page, 'stageRampBarrier');

  // The car reaches the ramp a fraction of a second later; a 60 s spec timeout is ample.
  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap !== undefined && snap.car.airborne;
    },
    undefined,
    { timeout: 10_000 },
  );

  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap !== undefined && !snap.car.airborne && snap.lastLanding !== null;
    },
    undefined,
    { timeout: 10_000 },
  );

  const after = await readSnapshot(page);

  // The barrier was in the car's lane, past the ramp. Clearing it means no armour spent and
  // no life lost; the landing still fired.
  expect(after.hud.armor).toBe(before.hud.armor);
  expect(after.hud.lives).toBe(before.hud.lives);
  expect(after.lastLanding).not.toBeNull();
  expect(after.lastPropContact?.kind ?? '').not.toBe('barrier');
});

test('a solid barrier on the ground spends armour instead of being driven through', async ({
  page,
}) => {
  await startRun(page);
  const before = await readSnapshot(page);

  await control(page, 'stageBarrier');

  await expect
    .poll(
      async () => {
        const snap = await readSnapshot(page);
        return snap.hud.armor;
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(before.hud.armor);

  const after = await readSnapshot(page);
  expect(after.lastPropContact?.kind).toBe('barrier');
  expect(after.lastPropContact?.collision).toBe('solid');
  expect(after.lastPropContact?.damage).toBe(true);
});
