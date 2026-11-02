import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFromSchwab } from '../../data-pipeline/schwab/build';
import { schwabPull } from '../../data-pipeline/schwab/pull';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { afterClose, fakeSchwab } from '../helpers/fakeSchwab';
import { launchGame, shot } from './helpers';

/** Two published releases (the day before, and the latest), built the way the daily update builds them. */
async function release(dir: string, last: string): Promise<{ db: Buffer; manifest: object }> {
  const src = new SyntheticSource({ lastDate: '2021-06-30', symbols: ['MKTX', 'HLXR'] });
  const storePath = join(dir, `schwab-${last}.db`);
  await schwabPull({
    storePath,
    api: fakeSchwab(src, () => last).api,
    symbols: ['SPY', 'AAPL', 'QQQ'],
    now: afterClose(last),
  });
  const gameDbPath = join(dir, `game-${last}.db`);
  await buildFromSchwab({ storePath, gameDbPath });
  // A published game.db is one self-contained file (the publish step checkpoints it).
  const { openDb } = await import('../../data-pipeline/lib/sqlite');
  const db = openDb(gameDbPath);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
  db.close();
  const bytes = readFileSync(gameDbPath);
  return {
    db: bytes,
    manifest: {
      version: last.replaceAll('-', '.'),
      tag: `data-${last.replaceAll('-', '.')}`,
      buildDate: new Date().toISOString(),
      file: 'game.db',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      dateRange: { first: '2018-01-02', last },
    },
  };
}

let server: Server;
let base = '';
let current: { db: Buffer; manifest: object };
let older: { db: Buffer; manifest: object };
let newer: { db: Buffer; manifest: object };

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stg-e2e-optdb-'));
  older = await release(dir, '2021-06-28');
  newer = await release(dir, '2021-06-29');
  current = newer;
  server = createServer((req, res) => {
    if (req.url?.endsWith('/manifest.json')) return void res.end(JSON.stringify(current.manifest));
    if (req.url?.endsWith('/game.db')) return void res.end(current.db);
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases/latest/download`;
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

test('Options DB: a first launch with no data downloads the published game data by itself', async () => {
  current = newer;
  const { app, page } = await launchGame({ env: { STG_DATA_URL: base } });
  await expect(page.getByTestId('toasts')).toContainText('Market data 2021.06.29 loaded', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('data-status')).not.toContainText('SIM');
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('set-data').click();
  await expect(page.locator('.data-status')).toContainText('REAL');
  await expect(page.locator('.data-status')).toContainText('3 tickers through 2021-06-29');
  await expect(page.locator('.data-status')).toContainText('downloaded from the Options DB');
  await expect(page.getByTestId('options-db')).toContainText('2021.06.29 · through 2021-06-29');
  await shot(page, 'options-db-1920');
  // Asking again changes nothing: it's current.
  await page.getByTestId('download-data').click();
  await expect(page.getByTestId('toasts')).toContainText('Up to date');
  await shot(page, 'options-db-1366', { width: 1366, height: 768 });
  // Every ticker in the data can be dealt, the Trade Builder's QQQ included.
  const dealt = await page.evaluate(async () => {
    const stg = (window as unknown as { stg: { invoke: (...a: unknown[]) => Promise<unknown> } }).stg;
    const w = (await stg.invoke('market.call', 'windows', [{}], null)) as { symbol: string }[];
    return [...new Set(w.map((x) => x.symbol))].sort();
  });
  expect(dealt).toEqual(['AAPL', 'QQQ', 'SPY']);
  await app.close();
});

test('Options DB: newer data downloads in the background and loads with LOAD NOW or at the next launch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'stg-e2e-optdb-'));
  mkdirSync(join(userData, 'data'), { recursive: true });
  // Yesterday's release, downloaded earlier.
  writeFileSync(join(userData, 'data', 'game.db'), older.db);
  writeFileSync(join(userData, 'data', 'game.db.manifest.json'), JSON.stringify(older.manifest));
  current = newer;
  const first = await launchGame({ userData, env: { STG_DATA_URL: base } });
  await expect(first.page.getByTestId('toasts')).toContainText('New market data through 2021-06-29', {
    timeout: 30_000,
  });
  // Still yesterday's data: nothing changes under a round in progress.
  await first.page.getByTestId('menu-settings').click();
  await first.page.getByTestId('set-data').click();
  await expect(first.page.locator('.data-status')).toContainText('through 2021-06-28');
  await expect(first.page.getByTestId('apply-data')).toBeVisible();
  await shot(first.page, 'options-db-staged-1366', { width: 1366, height: 768 });
  await first.page.getByTestId('apply-data').click();
  await expect(first.page.locator('.data-status')).toContainText('through 2021-06-29');
  await expect(first.page.getByTestId('apply-data')).toHaveCount(0);
  await first.app.close();

  // The same again, but this time the game is closed before LOAD NOW: it loads at the next launch.
  writeFileSync(join(userData, 'data', 'game.db'), older.db);
  writeFileSync(join(userData, 'data', 'game.db.manifest.json'), JSON.stringify(older.manifest));
  const second = await launchGame({ userData, env: { STG_DATA_URL: base } });
  await expect(second.page.getByTestId('toasts')).toContainText('New market data through 2021-06-29', {
    timeout: 30_000,
  });
  await second.app.close();
  const third = await launchGame({ userData, env: { STG_NO_DATA_UPDATE: '1' } });
  await third.page.getByTestId('menu-settings').click();
  await third.page.getByTestId('set-data').click();
  await expect(third.page.locator('.data-status')).toContainText('through 2021-06-29');
  await third.app.close();
});
