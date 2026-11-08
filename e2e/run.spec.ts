import { expect, test, type Page } from '@playwright/test';

/**
 * The end of a run.
 *
 * `smoke.spec.ts` proves the game boots and holds frame rate; this spec proves a run can
 * actually finish. Every wait below is a poll of the debug snapshot rather than a fixed
 * timeout, and the two long journeys — a sector boundary and the death that ends the run —
 * are reached through the debug-only control surface, so the spec does not spend eighty
 * seconds driving 24 000 world pixels at 220 px/s.
 */

const BASE = '/deadlane/';
const SEED = 424242;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;
/** Mirrors `GAME.storagePrefix` + `best` in src/config.ts. */
const BEST_KEY = 'deadlane.best';

/** Mirror of the read-only `window.__deadlane` snapshot the HUD installs at `?debug=1`. */
interface DeadlaneSnapshot {
  sectorCard: { level: number; label: string } | null;
  lastSectorCard: { level: number; label: string } | null;
  enemies: number;
  boss: { id: string; hp: number; maxHp: number } | null;
  lastScoreEvent: { kind: string; delta: number } | null;
  hud: {
    score: number;
    distance: number;
    speed: number;
    level: number;
    armor: number;
    maxArmor: number;
    lives: number;
    maxLives: number;
  };
}

/** Mirror of the read-only `window.__deadlaneOver` snapshot the result screen installs. */
interface RunResultSnapshot {
  score: number;
  distance: number;
  level: number;
  seed: number;
  lives: number;
  best: number;
  isBest: boolean;
}

/** Mirror of the debug-only `window.__deadlaneControl` actions. */
interface DeadlaneControl {
  fastForward(pixels: number): void;
  loseLife(): void;
  destroyPlayer(): void;
  destroyBoss(): void;
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

async function result(page: Page): Promise<RunResultSnapshot | null> {
  return page.evaluate(
    () => (window as unknown as { __deadlaneOver?: RunResultSnapshot }).__deadlaneOver ?? null,
  );
}

/** Advance the run by `pixels` of world distance instead of waiting out the clock. */
async function fastForward(page: Page, pixels: number): Promise<void> {
  await page.evaluate((px) => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.fastForward(px);
  }, pixels);
}

/** Spend one life through the real wreck path (armour to zero, then the respawn). */
async function loseLife(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.loseLife();
  });
}

/** Kill the live act boss through the normal damage path, paying its reward. */
async function destroyBoss(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.destroyBoss();
  });
}

/** The title arms its Space listener once preload finishes, so press until a run exists. */
async function startRun(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Space');
        return (await snapshot(page)) !== null;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

/** The sector card has cleared and the road is moving. */
async function waitForPlay(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const snap = await snapshot(page);
        return snap !== null && snap.sectorCard === null && snap.hud.distance > 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

test('a run reaches game over, redeploys on Space and keeps the best score across a reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(DEBUG_URL);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  // Start from a clean ledger so the first death is unambiguously a new best.
  await page.evaluate((key) => localStorage.removeItem(key), BEST_KEY);

  await startRun(page);
  await waitForPlay(page);

  // Only a scored run can write a best, so let the counter move before wrecking the car.
  await expect
    .poll(async () => (await readSnapshot(page)).hud.score, { timeout: 10_000 })
    .toBeGreaterThan(0);

  // Three lives start the run, and they are separate from armour: every wreck spends one
  // life and respawns the car with a full loadout, so the run only ends on the third.
  const started = await readSnapshot(page);
  expect(started.hud.lives).toBe(3);
  expect(started.hud.maxLives).toBe(3);
  // `PLAYER.startArmor` in src/config.ts; the starting loadout a respawn restores.
  expect(started.hud.armor).toBe(3);

  const distanceAtFirstWreck = started.hud.distance;
  await loseLife(page);
  await expect
    .poll(async () => (await snapshot(page))?.hud.lives ?? null, { timeout: 5_000 })
    .toBe(2);
  const afterFirst = await readSnapshot(page);
  // A respawn restores armour and keeps the road moving instead of handing off to the result.
  expect(afterFirst.hud.armor).toBe(3);
  expect(afterFirst.hud.distance).toBeGreaterThanOrEqual(distanceAtFirstWreck);

  await loseLife(page);
  await expect
    .poll(async () => (await snapshot(page))?.hud.lives ?? null, { timeout: 5_000 })
    .toBe(1);

  await loseLife(page);

  // Game over: the run's snapshot is gone with the HUD, and the result screen is up.
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__deadlane)), { timeout: 10_000 })
    .toBe(false);
  await expect
    .poll(async () => (await result(page)) !== null, { timeout: 10_000 })
    .toBe(true);

  const lost = await result(page);
  if (!lost) throw new Error('result snapshot disappeared before it could be read');
  expect(lost.seed).toBe(SEED);
  expect(lost.level).toBe(1);
  expect(lost.score).toBeGreaterThan(0);
  expect(lost.distance).toBeGreaterThan(0);
  expect(lost.lives).toBe(0);
  expect(lost.best).toBe(lost.score);
  expect(lost.isBest).toBe(true);

  expect(await page.evaluate((key) => localStorage.getItem(key), BEST_KEY)).toBe(
    String(lost.score),
  );

  // Space redeploys from the result screen into a fresh run on sector 1.
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await snapshot(page))?.sectorCard?.level ?? null, { timeout: 20_000 })
    .toBe(1);

  const redeployed = await readSnapshot(page);
  expect(redeployed.hud.level).toBe(1);
  expect(redeployed.hud.score).toBe(0);
  expect(redeployed.hud.lives).toBe(3);
  expect(redeployed.lastSectorCard?.level).toBe(1);
  await expect.poll(() => page.evaluate(() => '__deadlaneOver' in window)).toBe(false);

  // The best score is stored, so a full reload of the page cannot lose it.
  await page.reload();
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate((key) => localStorage.getItem(key), BEST_KEY)).toBe(
    String(lost.score),
  );

  // ... and the reloaded build still starts a run.
  await startRun(page);
  await waitForPlay(page);
  expect((await readSnapshot(page)).hud.level).toBe(1);

  expect(errors).toEqual([]);
});

test('a boss gates the sector boundary, survives more world distance, and hands over to the next act', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(DEBUG_URL);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  await startRun(page);
  await waitForPlay(page);

  const first = await readSnapshot(page);
  expect(first.hud.level).toBe(1);
  expect(first.lastSectorCard?.level).toBe(1);
  expect(first.boss).toBeNull();

  // A sector is 24 000–28 000 px; one jump reaches its end instead of eighty seconds of
  // wall clock. The boundary now spawns the act boss instead of the next sector, so the
  // highway's command carrier is on the road with sector 1 still running.
  await fastForward(page, 30_000);
  await expect
    .poll(async () => (await snapshot(page))?.boss?.id ?? null, { timeout: 10_000 })
    .toBe('command-carrier');

  const fighting = await readSnapshot(page);
  expect(fighting.hud.level).toBe(1);
  expect(fighting.lastSectorCard?.level).toBe(1);
  expect(fighting.sectorCard).toBeNull();
  expect(fighting.boss?.hp).toBeGreaterThan(0);
  expect(fighting.boss?.maxHp).toBeGreaterThan(0);

  // A sector reset must never despawn a live boss: push another sector's worth of distance
  // through the run and the encounter, and the sector, are both still there.
  await fastForward(page, 30_000);
  const stillFighting = await readSnapshot(page);
  expect(stillFighting.boss?.id).toBe('command-carrier');
  expect(stillFighting.boss?.hp).toBe(fighting.boss?.hp);
  expect(stillFighting.hud.level).toBe(1);
  expect(stillFighting.sectorCard).toBeNull();

  // Killing it pays the content reward and releases the transition.
  const scoreBefore = stillFighting.hud.score;
  await destroyBoss(page);
  await expect
    .poll(async () => (await snapshot(page))?.lastSectorCard?.level ?? null, { timeout: 10_000 })
    .toBe(2);

  const crossed = await readSnapshot(page);
  expect(crossed.hud.level).toBe(2);
  expect(crossed.sectorCard?.level).toBe(2);
  expect(crossed.sectorCard?.label).toBe('REDLINE CANYON');
  expect(crossed.boss).toBeNull();
  expect(crossed.hud.score).toBeGreaterThanOrEqual(scoreBefore + 1500);
  expect(crossed.lastScoreEvent?.kind).toBe('bossDestroyed');
  // The boundary empties the arena: anything still alive belongs to the sector just left.
  expect(crossed.enemies).toBe(0);

  // The card clears on its own and the new sector starts from a standing start.
  await expect
    .poll(async () => (await snapshot(page))?.sectorCard === null, { timeout: 15_000 })
    .toBe(true);

  // Walk the new sector forward using the snapshot as the clock until a hostile is live.
  await expect
    .poll(
      async () => {
        await fastForward(page, 300);
        return (await readSnapshot(page)).enemies;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  const second = await readSnapshot(page);
  expect(second.hud.level).toBe(2);
  expect(second.lastSectorCard?.label).toBe('REDLINE CANYON');
  expect(second.hud.distance).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
