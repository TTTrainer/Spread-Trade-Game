import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

test('changing studies rebuilds the chart with its candles (playtest bug)', async () => {
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('menu-sandboxSetup').click();
  await page.getByTestId('sym-ORGR').click();
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible();
  const bars = () => page.evaluate(() => (window as Any).__stg.chart.barCount() as number);
  await expect.poll(bars).toBeGreaterThan(50);
  await page.keyboard.press('Control+E');
  await expect(page.getByTestId('study-picker')).toBeVisible();
  for (const label of ['MACD', 'SMA 20', 'Volume', 'RSI (14)']) {
    await page.getByText(label, { exact: true }).click();
    await expect.poll(bars).toBeGreaterThan(50);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('study-picker')).toBeHidden();
  // Weekly and back.
  await page.keyboard.press('Control+T');
  await expect.poll(bars).toBeGreaterThan(10);
  await page.keyboard.press('Control+T');
  await expect.poll(bars).toBeGreaterThan(50);
  expect(errors).toEqual([]);
  await app.close();
});

test('the option chain tab opens on Ctrl+5 and a bid click sets up a credit spread', async () => {
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('menu-sandboxSetup').click();
  await page.getByTestId('sym-ORGR').click();
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible();
  await page.keyboard.press('Control+5');
  const chain = page.getByTestId('chain-screen');
  await expect(chain).toBeVisible();
  await expect(chain.locator('tr.spot-row')).toHaveCount(1);
  await shot(page, 'chain-screen');
  await shot(page, 'chain-screen-1366', { width: 1366, height: 768 });
  // The first put bid below the price: a bull put anchored there.
  const row = chain.locator('tr.spot-row').locator('xpath=preceding-sibling::tr[1]');
  const strike = Number((await row.locator('td.strike').innerText()).replace(/[^0-9.]/g, ''));
  await row.locator('td.cb').last().click();
  const b = await page.evaluate(() => (window as Any).__stg.trading.getState().builder);
  expect(b.structureId).toBe('bull_put');
  expect(b.anchor).toBe(strike);
  await expect(row.locator('td.strike i.leg-s')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chain).toBeHidden();
  // It's a tab over the chart: the CHAIN tab opens it too.
  await page.getByTestId('ctab-chain').click();
  await expect(chain).toBeVisible();
  await page.keyboard.press('Control+5');
  await expect(chain).toBeHidden();
  expect(errors).toEqual([]);
  await app.close();
});
