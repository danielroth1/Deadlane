import { expect, test, type Page } from '@playwright/test';

/**
 * Scoring behaviour on the real collision path.
 *
 * The pure table is unit-tested in `src/systems/scoring.test.ts`; this spec proves the run
 * actually feeds it: a bullet fired by the player wrecks civilian traffic, pays the
 * configured penalty and raises the banner.
 */

const BASE = '/deadlane/';

/** Mirror of `SCORE.civilianDestroyed` in src/config.ts. */
const CIVILIAN_DESTROYED = -500;

interface ScoreEventRecord {
  kind: string;
  delta: number;
}

interface DeadlaneSnapshot {
  sectorCard: unknown;
  lastScoreEvent: ScoreEventRecord | null;
  lastBanner: string | null;
  hud: { distance: number };
}

interface DeadlaneControl {
  stageCivilianAhead(): void;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

test('a player bullet wrecks a civilian and charges the configured penalty', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}?debug=1&seed=424242`);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  // The title scene arms its Space listener once preload finishes, so press until the
  // debug surface exists instead of racing the boot sequence.
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
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 0;
    },
    undefined,
    { timeout: 15_000 },
  );

  // Put one civilian in the gun line. This is the debug-only action surface, not a
  // read of gameplay state.
  await page.evaluate(() => {
    const control = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!control) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    control.stageCivilianAhead();
  });

  // Fire on the same path as the player: one shell leaves the muzzle, then the collision
  // resolves on the following frames.
  await page.keyboard.press('Space', { delay: 80 });

  await expect.poll(async () => (await readSnapshot(page)).lastBanner, { timeout: 5_000 }).toBe(
    'CIVILIAN DOWN',
  );

  const snap = await readSnapshot(page);
  expect(snap.lastScoreEvent).toEqual({
    kind: 'civilianDestroyed',
    delta: CIVILIAN_DESTROYED,
  });
  expect(errors).toEqual([]);
});
