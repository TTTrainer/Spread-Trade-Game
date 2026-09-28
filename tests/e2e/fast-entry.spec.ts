import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const builder = (page: Page) =>
  page.evaluate(() => {
    const t = (window as Any).__stg.trading.getState();
    const now = t.session.view(t.selectedCardId).now as string;
    const dte = t.builder.expiration
      ? Math.round((Date.parse(t.builder.expiration) - Date.parse(now)) / 86400000)
      : null;
    return {
      structure: t.builder.structureId as string,
      anchor: t.builder.anchor as number | null,
      delta: t.builder.delta as number,
      qty: t.builder.qty as number,
      dte,
    };
  });

test('fast trade entry: call picks the structure, presets, nudges, risk sizing, drag and stamp', async () => {
  const { app, page } = await launchGame();
  await page.waitForFunction(() => (window as Any).__stg !== undefined);
  await page.getByTestId('menu-sandboxSetup').click();
  await page.getByTestId('sym-ORGR').click();
  await expect(page.getByTestId('date-label')).toContainText('20');
  await page.locator('input.capital').fill('50000');
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible();

  // Calling "down" switches the bull put to a bear call; "up" switches it back.
  await page.keyboard.press('2');
  await expect.poll(async () => (await builder(page)).structure).toBe('bear_call');
  await page.keyboard.press('4');
  await expect.poll(async () => (await builder(page)).structure).toBe('bull_put');

  // Presets: a weekly, then a swing.
  await page.keyboard.press('w');
  await expect.poll(async () => (await builder(page)).dte ?? 99).toBeLessThanOrEqual(10);
  await page.keyboard.press('m');
  await expect.poll(async () => (await builder(page)).dte ?? 0).toBeGreaterThanOrEqual(25);
  expect((await builder(page)).delta).toBeCloseTo(0.3, 5);

  // Delta chip, then one strike up with the arrow key.
  await page.getByTestId('delta-20').click();
  expect((await builder(page)).delta).toBeCloseTo(0.2, 5);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await builder(page)).anchor).not.toBeNull();
  const k1 = (await builder(page)).anchor as number;

  // Drag the strike handle down the chart: the short strike moves lower.
  const handle = page.getByTestId('strike-handle');
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await builder(page)).anchor as number).toBeLessThan(k1);
  await shot(page, '13-fast-entry-1920');
  await page.setViewportSize({ width: 1366, height: 768 });
  await shot(page, '13-fast-entry-1366');
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Size to 2% of equity.
  await page.getByTestId('risk-0.02').click();
  const risk = await page.evaluate(() => (window as Any).__stg.trading.getState().plan()?.riskPct as number);
  expect(risk).toBeGreaterThan(0.005);
  expect(risk).toBeLessThanOrEqual(0.021);

  // Save it as MY SETUP, change things, and bring it back with one key.
  await page.getByTestId('preset-save').click();
  await expect(page.getByTestId('toasts')).toContainText('Saved MY SETUP');
  const saved = await builder(page);
  await page.keyboard.press('w');
  await page.keyboard.press('y');
  await expect.poll(async () => (await builder(page)).delta).toBeCloseTo(saved.delta, 5);
  await expect.poll(async () => (await builder(page)).qty).toBe(saved.qty);

  // Selling slams the ticket onto the chart.
  await page.getByTestId('order-market').click();
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('fill-stamp')).toBeVisible();
  await expect(page.getByTestId('fill-stamp')).toContainText('SOLD');
  await shot(page, '13-fill-stamp-1920');
  await app.close();
});
