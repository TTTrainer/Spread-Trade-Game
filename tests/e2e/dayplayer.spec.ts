import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const state = (page: Page) =>
  page.evaluate(() => {
    const t = (window as Any).__stg.trading.getState();
    return {
      ff: t.ff as string,
      day: t.session.dayIndex as number,
      anim: t.dayAnim !== null,
      pace: t.pace as string,
    };
  });

test('day player: candles form day by day, the trade card tracks P/L, pace and close work', async () => {
  const { app, page } = await launchGame();
  await page.waitForFunction(() => (window as Any).__stg !== undefined);
  // Slow days so the forming candle can be caught mid-way; no stops, so the trade stays open.
  await page.evaluate(() =>
    (window as Any).__stg.app.getState().updateSettings((s: Any) => ({
      ...s,
      game: {
        ...s.game,
        ffSecondsPerDay: 2.5,
        pauseOnTest: false,
        pause: Object.fromEntries(Object.keys(s.game.pause).map((k) => [k, false])),
      },
    })),
  );
  await page.getByTestId('menu-sandboxSetup').click();
  await page.getByTestId('sym-ORGR').click();
  await expect(page.getByTestId('date-label')).toContainText('20');
  await page.locator('input.capital').fill('20000');
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible();
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+3');
  await page.getByTestId('order-market').click();
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');

  // Day by day: Space plays exactly one candle, then waits.
  await page.getByTestId('pace-step').click();
  await expect(page.getByTestId('play-button')).toContainText('START CLOCK');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const mid = await state(page);
  expect(mid.anim).toBe(true);
  await expect(page.getByTestId('pos-hud')).toBeVisible();
  await shot(page, '12-candle-forming-1920');
  await expect.poll(async () => (await state(page)).ff, { timeout: 10_000 }).toBe('paused');
  expect((await state(page)).day).toBe(1);
  await expect(page.getByTestId('play-button')).toContainText('NEXT DAY');
  await shot(page, '12-day-settled-1920');

  // N plays the next one.
  await page.keyboard.press('n');
  await expect.poll(async () => (await state(page)).day, { timeout: 10_000 }).toBe(2);
  await expect.poll(async () => (await state(page)).ff, { timeout: 10_000 }).toBe('paused');

  // Each day ends with a recap: the trade's candles, its status and a way to close it.
  await expect(page.getByTestId('day-recap')).toBeVisible();
  await expect(page.locator('.recap-trade .mini-candles')).toBeVisible();
  await shot(page, '14-day-recap-1920');
  // Hiding the recap shows the trade card with its stop-vs-target meter and a close button.
  await page.locator('.dr-x').click();
  await expect(page.locator('.tug')).toBeVisible();
  await expect(page.getByTestId('hud-close')).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  await shot(page, '12-day-settled-1366');
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Pace chips: 4x runs on its own until paused.
  await page.keyboard.press('.');
  await page.keyboard.press('.');
  await page.keyboard.press('.');
  expect((await state(page)).pace).toBe('4');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).day, { timeout: 15_000 }).toBeGreaterThan(3);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => ['paused', 'done', 'decision'].includes((await state(page)).ff), { timeout: 10_000 })
    .toBe(true);

  // Closing from the trade card ends the session (the only trade).
  if ((await state(page)).ff === 'paused') {
    await page.getByTestId('hud-close').click();
    await expect(page.getByTestId('toasts')).toContainText(/Closed|closed/);
  }
  await app.close();
});
