import { expect, test, type Page } from '@playwright/test';

/**
 * Production smoke test.
 *
 * The base-path assertion is the important one: a Vite game deployed to GitHub Pages with
 * the wrong `base` renders an empty canvas and logs nothing useful. This fails instead.
 */

const BASE = '/deadlane/';

/** Mirror of the read-only `window.__deadlane` snapshot the HUD installs at `?debug=1`. */
interface DeadlaneSnapshot {
  paused: boolean;
  pauseCard: boolean;
  muted: boolean;
  enemies: number;
  civilians: number;
  sectorCard: { level: number; label: string } | null;
  lastSectorCard: { level: number; label: string } | null;
  hud: { distance: number; speed: number; score: number; level: number };
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

test('boots from the production bundle under the GitHub Pages base path', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.goto(BASE);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  // Title scene renders text into the canvas; the DOM stays empty, so assert on the boot
  // overlay being hidden and the canvas having a real backing size.
  const size = await page.locator('#dl-root canvas').evaluate((el) => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));

  expect(size.width).toBe(640);
  expect(size.height).toBe(360);
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('enters a running game and holds frame rate', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);

  // Sample animation frames for two seconds and check the median delta.
  const median = await page.evaluate(async () => {
    const deltas: number[] = [];
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const tick = (now: number): void => {
        deltas.push(now - last);
        last = now;
        if (deltas.length < 120) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    deltas.sort((a, b) => a - b);
    return deltas[Math.floor(deltas.length / 2)] ?? 999;
  });

  expect(median).toBeLessThan(20);
  expect(errors).toEqual([]);
});

test('serves the asset manifest so the fallback art path is exercised', async ({ request }) => {
  const response = await request.get(`${BASE}assets/assets.json`);
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as { sprites: Record<string, unknown>; sheets: Record<string, unknown> };
  expect(manifest).toHaveProperty('sprites');
  expect(manifest).toHaveProperty('sheets');
});

test('Esc pauses the run, and Esc resumes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}?debug=1&seed=424242`);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  // The title scene only arms its Space listener once preload finishes, so press until the
  // HUD has installed the snapshot rather than racing the boot sequence.
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
      return snap !== undefined && snap.hud.distance > 0;
    },
    undefined,
    { timeout: 15_000 },
  );

  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane?.paused === true,
    undefined,
    { timeout: 5_000 },
  );

  const paused = await readSnapshot(page);
  expect(paused.pauseCard).toBe(true);

  // The world must be frozen: one second of real time changes nothing.
  await page.waitForTimeout(1_000);
  const stillPaused = await readSnapshot(page);
  expect(stillPaused.paused).toBe(true);
  expect(stillPaused.pauseCard).toBe(true);
  expect(stillPaused.hud.distance).toBe(paused.hud.distance);
  expect(stillPaused.enemies).toBe(paused.enemies);
  expect(stillPaused.civilians).toBe(paused.civilians);

  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane?.paused === false,
    undefined,
    { timeout: 5_000 },
  );

  const resumed = await readSnapshot(page);
  expect(resumed.pauseCard).toBe(false);

  // Input is live again: holding accelerate raises the recorded scroll speed.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  const boosting = await readSnapshot(page);
  await page.keyboard.up('ArrowUp');

  expect(boosting.hud.speed).toBeGreaterThan(resumed.hud.speed);
  expect(boosting.hud.distance).toBeGreaterThan(resumed.hud.distance);
  expect(errors).toEqual([]);
});

test('presents a sector card naming the sector and its road', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}?debug=1&seed=424242`);
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

  // Sector 1 is the highway, and the card names it before the road starts moving.
  await expect
    .poll(async () => (await readSnapshot(page)).lastSectorCard?.label ?? null)
    .toBe('INTERSTATE 9');

  const card = await readSnapshot(page);
  expect(card.lastSectorCard?.level).toBe(1);

  // The card clears on its own and the run resumes from a standing start.
  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 0;
    },
    undefined,
    { timeout: 15_000 },
  );

  expect(errors).toEqual([]);
});
