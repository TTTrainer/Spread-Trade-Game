import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { schwabPull } from '../../data-pipeline/schwab/pull';
import { afterClose, fakeSchwab } from '../helpers/fakeSchwab';
import { launchGame, shot } from './helpers';

test('market data flows over IPC and the main process refuses the future', async () => {
  const { app, page } = await launchGame();
  await expect(page.getByTestId('data-status')).toContainText('MARKET: SIM');
  const ok = await page.evaluate(async () => {
    const stg = (window as unknown as { stg: { invoke: (...a: unknown[]) => Promise<unknown> } }).stg;
    const bars = (await stg.invoke(
      'market.call',
      'bars',
      ['HLXR', '2024-01-02', '2024-01-12'],
      '2024-01-12',
    )) as unknown[];
    let blocked = '';
    try {
      await stg.invoke('market.call', 'bars', ['HLXR', '2024-01-02', '2024-02-12'], '2024-01-12');
    } catch (e) {
      blocked = String(e);
    }
    let missingClock = '';
    try {
      await stg.invoke('market.call', 'chain', ['HLXR', '2024-01-12'], null);
    } catch (e) {
      missingClock = String(e);
    }
    return { n: bars.length, blocked, missingClock };
  });
  expect(ok.n).toBe(9);
  expect(ok.blocked).toContain('Lookahead');
  expect(ok.missingClock).toContain('current date');
  await app.close();
});

test('reads a built game.db through the main process', async () => {
  const built = join(homedir(), '.config', 'SpreadTradingGame', 'data', 'game.db');
  test.skip(!existsSync(built), 'no built game.db on this machine');
  const { app, page } = await launchGame({ env: { STG_GAME_DB: built } });
  await expect(page.getByTestId('data-status')).toContainText('tickers');
  const chainLen = await page.evaluate(async () => {
    const stg = (window as unknown as { stg: { invoke: (...a: unknown[]) => Promise<unknown> } }).stg;
    const wins = (await stg.invoke('market.call', 'windows', [{ symbols: ['HLXR'], limit: 1 }], null)) as {
      entryDate: string;
    }[];
    const chain = (await stg.invoke(
      'market.call',
      'chain',
      ['HLXR', wins[0].entryDate],
      wins[0].entryDate,
    )) as { quotes: unknown[] };
    return chain.quotes.length;
  });
  expect(chainLen).toBeGreaterThan(100);
  await app.close();
});

test('Schwab: a pulled schwab.db builds a playable real market (no DoltHub download)', async () => {
  // Stand in for PULL FROM SCHWAB (it needs a live login): the same pull code, against a fake.
  const userData = mkdtempSync(join(tmpdir(), 'stg-e2e-schwab-'));
  const src = new SyntheticSource({ lastDate: '2021-06-30', symbols: ['MKTX', 'HLXR'] });
  const last = '2021-06-29';
  const fake = fakeSchwab(src, () => last);
  await schwabPull({
    storePath: join(userData, 'data', 'schwab.db'),
    api: fake.api,
    symbols: ['SPY', 'AAPL'],
    now: afterClose(last),
  });
  const { app, page } = await launchGame({ userData });
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('set-data').click();
  await expect(page.getByTestId('schwab-store')).toContainText('2 tickers');
  await expect(page.getByTestId('schwab-store')).toContainText('real option chains on 1 close');
  await expect(page.getByTestId('schwab-pull')).toBeDisabled(); // not logged in
  await page.getByTestId('schwab-build').click();
  await expect(page.getByTestId('toasts')).toContainText('Game data built from schwab.db', {
    timeout: 60_000,
  });
  await expect(page.locator('.data-status')).toContainText('REAL');
  await expect(page.locator('.data-status')).toContainText(`2 tickers through ${last}`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByTestId('schwab-build').scrollIntoViewIfNeeded();
  await shot(page, '05-settings-schwab-built-1366');
  const chain = await page.evaluate(async (d) => {
    const stg = (window as unknown as { stg: { invoke: (...a: unknown[]) => Promise<unknown> } }).stg;
    const c = (await stg.invoke('market.call', 'chain', ['AAPL', d], d)) as {
      source: string;
      quotes: unknown[];
    };
    return { source: c.source, n: c.quotes.length };
  }, '2020-06-15');
  expect(chain.source).toBe('modeled');
  expect(chain.n).toBeGreaterThan(40);
  await app.close();
});
