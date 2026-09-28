import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchGame, shot } from './helpers';

const STRUCTS = ['bull_put', 'bear_call', 'iron_condor', 'bull_call'];
const SYMS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY'];
const TAGS = ['held_past_stop', 'oversized', 'low_ivr_premium', 'short_inside_em'];

test('stats dashboard aggregates the ledger and exports a CSV', async () => {
  const { app, page, exportDir } = await launchGame();
  // Seed a ledger of 40 closed trades through the real user.db channel.
  await page.evaluate(
    async ({ STRUCTS, SYMS, TAGS }) => {
      const stg = (window as unknown as { stg: { invoke: (c: string, ...a: unknown[]) => Promise<unknown> } }).stg;
      for (let i = 0; i < 40; i++) {
        const pl = Math.round((Math.sin(i * 1.7) * 30000 + 6000) / 1) ;
        await stg.invoke('user.recordTrade', {
          id: `seed-${i}`,
          mode: i % 3 === 0 ? 'sandbox' : 'career',
          runId: null,
          desk: 'verticals',
          closedOn: `2025-${String(1 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
          openedOn: '2025-01-01',
          symbol: SYMS[i % SYMS.length],
          displaySymbol: 'ZORK',
          structure: STRUCTS[i % STRUCTS.length],
          qty: 1,
          realizedCents: pl,
          riskCents: 40000,
          benchmarkCents: 800,
          alphaCents: pl - 800,
          exitReason: 'target',
          grade: 'ABCDF'[i % 5],
          tags: i % 4 === 0 ? [TAGS[i % TAGS.length]] : [],
          callBucket: 3,
          callConf: [0.5, 0.6, 0.7, 0.8, 0.9][i % 5],
          callActual: i % 3 === 0 ? 3 : 2,
          brier: null,
          regime: { vix: 12 + (i % 20), ivr: (i * 7) % 100, trend: i % 2 ? 0.1 : -0.1, adx: 20, earnings: i % 6 === 0 },
          recordedAt: new Date().toISOString(),
          data: {},
        });
      }
    },
    { STRUCTS, SYMS, TAGS },
  );
  await page.getByTestId('menu-stats').click();
  await expect(page.getByTestId('stats-screen')).toBeVisible();
  await expect(page.getByTestId('tile-trades')).toContainText('40');
  await expect(page.getByTestId('equity-chart')).toBeVisible();
  await page.getByTestId('equity-chart').hover({ position: { x: 300, y: 120 } });
  await expect(page.getByTestId('equity-tooltip')).toContainText('Trade');
  await shot(page, '05-stats-1920');
  await page.getByTestId('by-vix').click();
  await expect(page.getByTestId('breakdown-table')).toContainText('VIX');
  await page.getByTestId('mode-career').click();
  await expect(page.getByTestId('tile-trades')).toContainText('26');
  await shot(page, '05-stats-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByTestId('mode-all').click();
  await page.getByTestId('export-csv').click();
  await expect(page.getByTestId('toasts')).toContainText('Saved 40 trades');
  const file = readdirSync(exportDir).find((f) => f.endsWith('.csv'));
  expect(file).toBeDefined();
  const csv = readFileSync(join(exportDir, file as string), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trim().split('\r\n');
  expect(lines).toHaveLength(41);
  expect(lines[0]).toContain('P/L ($)');
  await app.close();
});

test('settings toggles persist across restarts and apply', async () => {
  const first = await launchGame();
  await first.page.getByTestId('menu-settings').click();
  await first.page.getByTestId('set-realism').click();
  await first.page.getByTestId('set-fees').check();
  await first.page.getByTestId('set-display').click();
  await first.page.getByTestId('set-colorblind').check();
  await expect(first.page.locator('html')).toHaveAttribute('data-palette', 'colorblind');
  await shot(first.page, '05-settings-display-1920');
  await first.page.getByTestId('set-hotkeys').click();
  await first.page.getByTestId('hk-sell').click();
  await first.page.keyboard.press('Alt+X');
  await expect(first.page.getByTestId('hk-sell')).toContainText('Alt+X');
  await shot(first.page, '05-settings-hotkeys-1920');
  await first.page.getByTestId('set-data').click();
  await expect(first.page.getByTestId('build-real')).toBeVisible();
  await shot(first.page, '05-settings-data-1920');
  await first.app.close();
  const second = await launchGame({ userData: first.userData });
  await expect(second.page.locator('html')).toHaveAttribute('data-palette', 'colorblind');
  await second.page.getByTestId('menu-settings').click();
  await second.page.getByTestId('set-hotkeys').click();
  await expect(second.page.getByTestId('hk-sell')).toContainText('Alt+X');
  await second.page.getByTestId('reset-hotkeys').click();
  await expect(second.page.getByTestId('hk-sell')).toContainText('Alt+S');
  await second.page.getByTestId('set-realism').click();
  await expect(second.page.getByTestId('set-fees')).toBeChecked();
  await second.app.close();
});
