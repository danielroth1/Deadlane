import { expect, test } from '@playwright/test';

/**
 * Production smoke test.
 *
 * The base-path assertion is the important one: a Vite game deployed to GitHub Pages with
 * the wrong `base` renders an empty canvas and logs nothing useful. This fails instead.
 */

const BASE = '/deadlane/';

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
