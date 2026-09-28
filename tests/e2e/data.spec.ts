import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { launchGame } from './helpers';

test('market data flows over IPC and the main process refuses the future', async () => {
  const { app, page } = await launchGame();
  await expect(page.getByTestId('data-status')).toContainText('MARKET: SIM');
  const ok = await page.evaluate(async () => {
    const stg = (window as unknown as { stg: { invoke: (...a: unknown[]) => Promise<unknown> } }).stg;
    const bars = (await stg.invoke('market.call', 'bars', ['HLXR', '2024-01-02', '2024-01-12'], '2024-01-12')) as unknown[];
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
    const wins = (await stg.invoke('market.call', 'windows', [{ symbols: ['HLXR'], limit: 1 }], null)) as { entryDate: string }[];
    const chain = (await stg.invoke('market.call', 'chain', ['HLXR', wins[0].entryDate], wins[0].entryDate)) as { quotes: unknown[] };
    return chain.quotes.length;
  });
  expect(chainLen).toBeGreaterThan(100);
  await app.close();
});
