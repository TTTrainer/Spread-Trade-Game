import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

test('polish: animated backdrop, adaptive music, particles, reduced motion', async () => {
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
  await page.waitForFunction(() => (window as Any).__stg !== undefined);
  // The title's drifting candles render into a canvas.
  await expect(page.getByTestId('backdrop').locator('canvas')).toHaveCount(1, { timeout: 15_000 });
  // Music starts on the first key press (browsers need a gesture) and follows the scene.
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => {
    const m = (window as Any).__stg.music.getState();
    return m.playing || !m.available;
  });
  const m1 = await page.evaluate(() => (window as Any).__stg.music.getState());
  console.log(
    'music',
    JSON.stringify({ available: m1.available, playing: m1.playing, scene: m1.scene, bpm: m1.bpm }),
  );
  expect(m1.scene).toBe('title');
  await page.getByTestId('menu-career').click();
  await page.waitForFunction(() => (window as Any).__stg.music.getState().scene === 'menu');
  // Particles: a burst spawns sprites on the overlay.
  const before = await page.evaluate(() => (window as Any).__stg.fx.spawned);
  await page.evaluate(() => (window as Any).__stg.fx.celebrate());
  await page.waitForTimeout(700);
  await expect(page.getByTestId('fx-overlay')).toHaveCount(1);
  const after = await page.evaluate(() => (window as Any).__stg.fx.spawned);
  expect(after).toBeGreaterThan(before);
  await shot(page, '10-celebrate-1920');
  // Reduced motion turns celebrations off.
  await page.evaluate(() =>
    (window as Any).__stg.app
      .getState()
      .updateSettings((s: Any) => ({ ...s, display: { ...s.display, reducedMotion: true } })),
  );
  const n = await page.evaluate(() => (window as Any).__stg.fx.spawned);
  await page.evaluate(() => (window as Any).__stg.fx.burst('confetti', 300, 300));
  expect(await page.evaluate(() => (window as Any).__stg.fx.spawned)).toBe(n);
  await page.evaluate(() =>
    (window as Any).__stg.app
      .getState()
      .updateSettings((s: Any) => ({ ...s, display: { ...s.display, reducedMotion: false } })),
  );
  await page.getByRole('button', { name: 'BACK' }).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '10-title-1920');
  await shot(page, '10-title-1366', { width: 1366, height: 768 });
  // Music, particles and the backdrop run without a single page error (e.g. a blocked audio worklet).
  expect(errors).toEqual([]);
  await app.close();
});
