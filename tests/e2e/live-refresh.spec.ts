import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { addDays, isTradingDay, prevTradingDay, type ISODate } from '../../src/engine/calendar';
import { launchGame, shot } from './helpers';

/**
 * REFRESH without Schwab: the Trade Builder takes the market as of now from Cboe's delayed quotes
 * (a local stand-in here), says plainly that it is 15 minutes behind, and keeps the trade being
 * built when the prices are refreshed.
 */

const nyToday = (): ISODate => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return p as ISODate;
};
/** The market's latest session: today on a weekday, else the last trading day. */
const session = (): ISODate => {
  const t = nyToday();
  return isTradingDay(t) ? t : prevTradingDay(t);
};

let server: Server;
let base = '';
let price = 100;

function fakeOptions(symbol: string, day: ISODate, px: number) {
  const occ = (exp: string, right: 'C' | 'P', k: number) =>
    `${symbol}${exp.slice(2).replaceAll('-', '')}${right}${String(k * 1000).padStart(8, '0')}`;
  const exps: ISODate[] = [];
  for (let d = addDays(day, 1); exps.length < 4; d = addDays(d, 1))
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 5 && isTradingDay(d)) exps.push(d);
  const options = [];
  for (const [i, exp] of exps.entries())
    for (let k = Math.round(px * 0.8); k <= Math.round(px * 1.2); k++) {
      const t = (7 * (i + 1)) / 365;
      const tv = 0.3 * px * Math.sqrt(t) * 0.4 * Math.exp(-(((k - px) / (0.3 * px * Math.sqrt(t))) ** 2) / 2);
      for (const right of ['C', 'P'] as const) {
        const mid = Math.max(right === 'C' ? px - k : k - px, 0) + tv;
        if (mid < 0.05) continue;
        options.push({
          option: occ(exp, right, k),
          bid: +(mid * 0.98).toFixed(2),
          ask: +(mid * 1.02).toFixed(2),
          iv: 0.3,
        });
      }
    }
  return options;
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const day = session();
    if (req.url?.includes('/charts/historical/')) {
      const data = [];
      let d = prevTradingDay(day);
      let c = price;
      for (let i = 0; i < 300; i++, d = prevTradingDay(d)) {
        data.unshift({
          date: d,
          open: String(c),
          high: String(c * 1.01),
          low: String(c * 0.99),
          close: String(c),
          volume: '1000000',
        });
        c *= 1 + 0.01 * Math.sin(i);
      }
      return void res.end(JSON.stringify({ data }));
    }
    if (req.url?.includes('/options/'))
      return void res.end(
        JSON.stringify({
          data: {
            current_price: price,
            open: 99,
            high: Math.max(101, price),
            low: 98,
            volume: 5000,
            last_trade_time: `${day}T13:45:00`,
            options: fakeOptions(
              decodeURIComponent(/\/options\/([^/]+)\.json/.exec(req.url)?.[1] ?? ''),
              day,
              price,
            ),
          },
        }),
      );
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/global/delayed_quotes`;
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

test('REFRESH without Schwab: the market as of now from Cboe, 15 minutes behind, and the trade stays', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchGame({ env: { STG_CBOE_URL: base } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('menu-builder').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  const fresh = page.getByTestId('builder-fresh');
  await expect(fresh).toHaveAttribute('data-state', 'live');
  await expect(fresh).toHaveAttribute('data-delayed', '15');
  await expect(fresh).toContainText('LIVE · 15 MIN DELAY');
  await expect(fresh).toContainText('1:45 pm ET');
  await expect(fresh).toContainText('1:45 pm ET · Cboe');
  await expect(fresh).toHaveAttribute('data-tip-body', /about 15 minutes behind the market/);
  await shot(page, 'builder-cboe-1920');

  // Build something other than the default, then refresh: it stays, priced on the new chain.
  await page.getByTestId('structure-bear_call').click();
  await expect(page.getByTestId('builder-order')).toContainText('VERTICAL');
  const before = await page.getByTestId('builder-order').textContent();
  price = 103;
  await page.keyboard.press('F5');
  await expect(page.getByTestId('chart-symbol')).toContainText('103', { timeout: 30_000 });
  await expect(page.getByTestId('builder-order')).toContainText('CALL');
  await expect.poll(() => page.getByTestId('builder-order').textContent()).not.toBe(before);
  await expect(fresh).toContainText('15 MIN DELAY');
  await shot(page, 'builder-cboe-1366', { width: 1366, height: 768 });
  expect(errors).toEqual([]);
  await app.close();
});
