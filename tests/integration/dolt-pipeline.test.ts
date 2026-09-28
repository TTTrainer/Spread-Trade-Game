/**
 * End-to-end test of the real-data pipeline against a local Dolt server loaded with fixture
 * rows in DoltHub's table layout (prices borrowed from the SIM market, under real tickers).
 * Opt-in because it needs the Dolt binary: STG_DOLT_TEST=1 STG_DOLT_BIN=/path/to/dolt npm test
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRealDb } from '../../data-pipeline/dolt/extract';
import { startDoltServer } from '../../data-pipeline/dolt/server';
import { SqliteSource } from '../../data-pipeline/lib/sqliteSource';
import { openDb } from '../../data-pipeline/lib/sqlite';
import { validateGameDb } from '../../data-pipeline/validate';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';

const enabled = process.env.STG_DOLT_TEST === '1' && !!process.env.STG_DOLT_BIN;
const MAP: Record<string, string> = { AAPL: 'HLXR', SPY: 'MKTX', COST: 'LUXE' };
const CHAIN_FROM = '2025-11-03';
const LAST = '2026-03-31';

async function loadFixture(dolt: string, root: string): Promise<void> {
  const cloneDir = join(root, 'dolt');
  for (const name of ['options', 'stocks', 'earnings', 'rates']) {
    const dir = join(cloneDir, name);
    mkdirSync(dir, { recursive: true });
    const r = spawnSync(dolt, ['init'], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
  }
  const server = await startDoltServer(dolt, cloneDir, 3399, () => undefined);
  const sim = new SyntheticSource({ symbols: Object.values(MAP), lastDate: LAST });
  const insert = async (table: string, cols: string[], rows: unknown[][]) => {
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const ph = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
      await server.query(
        `INSERT INTO ${table} (${cols.map((c) => `\`${c}\``).join(',')}) VALUES ${ph}`,
        chunk.flat(),
      );
    }
  };
  await server.query(
    'CREATE TABLE options.option_chain (`date` DATE, act_symbol VARCHAR(16), expiration DATE, strike DECIMAL(12,2), call_put VARCHAR(4), bid DECIMAL(12,2), ask DECIMAL(12,2), vol DECIMAL(10,4), delta DECIMAL(10,4), gamma DECIMAL(10,4), theta DECIMAL(10,4), vega DECIMAL(10,4), rho DECIMAL(10,4), PRIMARY KEY (`date`, act_symbol, expiration, strike, call_put))',
  );
  await server.query(
    'CREATE TABLE stocks.ohlcv (`date` DATE, act_symbol VARCHAR(16), `open` DECIMAL(12,2), high DECIMAL(12,2), low DECIMAL(12,2), `close` DECIMAL(12,2), volume BIGINT, PRIMARY KEY (`date`, act_symbol))',
  );
  await server.query(
    'CREATE TABLE stocks.dividend (act_symbol VARCHAR(16), ex_date DATE, amount DECIMAL(10,4), PRIMARY KEY (act_symbol, ex_date))',
  );
  await server.query(
    'CREATE TABLE stocks.split (act_symbol VARCHAR(16), ex_date DATE, to_factor DECIMAL(10,4), for_factor DECIMAL(10,4), PRIMARY KEY (act_symbol, ex_date))',
  );
  await server.query(
    'CREATE TABLE earnings.earnings_calendar (act_symbol VARCHAR(16), `date` DATE, `when` VARCHAR(32), PRIMARY KEY (act_symbol, `date`))',
  );
  await server.query(
    'CREATE TABLE earnings.eps_history (act_symbol VARCHAR(16), period_end_date DATE, reported DECIMAL(10,4), estimate DECIMAL(10,4), PRIMARY KEY (act_symbol, period_end_date))',
  );
  await server.query(
    'CREATE TABLE rates.us_treasury (`date` DATE PRIMARY KEY, `1_month` DECIMAL(6,3), `3_month` DECIMAL(6,3), `1_year` DECIMAL(6,3), `2_year` DECIMAL(6,3), `10_year` DECIMAL(6,3))',
  );

  const rates = await sim.rates('2018-01-01', LAST);
  await insert(
    'rates.us_treasury',
    ['date', '1_month', '3_month', '1_year', '2_year', '10_year'],
    rates.map((r) => [r.date, r.r3m * 100, r.r3m * 100, r.r1y * 100, r.r2y * 100, r.r10y * 100]),
  );
  const days = (await sim.tradingDays(CHAIN_FROM, LAST)).filter((_, i) => i % 7 !== 3); // leave gaps to be modeled
  for (const [real, fake] of Object.entries(MAP)) {
    const bars = await sim.bars(fake, '2018-01-02', LAST);
    await insert(
      'stocks.ohlcv',
      ['date', 'act_symbol', 'open', 'high', 'low', 'close', 'volume'],
      bars.map((b) => [b.date, real, b.open, b.high, b.low, b.close, b.volume]),
    );
    const divs = await sim.dividends(fake, '2018-01-01', LAST);
    if (divs.length)
      await insert(
        'stocks.dividend',
        ['act_symbol', 'ex_date', 'amount'],
        divs.map((d) => [real, d.exDate, d.amount]),
      );
    const earn = await sim.earnings(fake, '2018-01-01', LAST);
    if (earn.length) {
      await insert(
        'earnings.earnings_calendar',
        ['act_symbol', 'date', 'when'],
        earn.map((e) => [real, e.date, e.timing === 'BMO' ? 'Before market open' : 'After market close']),
      );
      await insert(
        'earnings.eps_history',
        ['act_symbol', 'period_end_date', 'reported', 'estimate'],
        earn.map((e) => {
          const pe = new Date(Date.parse(e.date) - 25 * 86400000).toISOString().slice(0, 10);
          return [real, pe, e.actual, e.estimate];
        }),
      );
    }
    const rows: unknown[][] = [];
    for (const d of days) {
      const c = await sim.chain(fake, d);
      if (!c) continue;
      for (const q of c.quotes)
        rows.push([
          d,
          real,
          q.expiration,
          q.strike,
          q.right === 'C' ? 'Call' : 'Put',
          q.bid,
          q.ask,
          q.iv,
          q.delta,
          q.gamma,
          q.theta,
          q.vega,
          q.rho,
        ]);
    }
    await insert(
      'options.option_chain',
      [
        'date',
        'act_symbol',
        'expiration',
        'strike',
        'call_put',
        'bid',
        'ask',
        'vol',
        'delta',
        'gamma',
        'theta',
        'vega',
        'rho',
      ],
      rows,
    );
  }
  await server.stop();
}

describe.skipIf(!enabled)('real pipeline against a local Dolt server', () => {
  it('extracts, models gaps, enriches earnings and builds valid windows', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stg-dolt-'));
    const dolt = process.env.STG_DOLT_BIN as string;
    spawnSync(dolt, ['config', '--global', '--add', 'user.name', 'test'], { encoding: 'utf8' });
    spawnSync(dolt, ['config', '--global', '--add', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    mkdirSync(join(root, 'dolt-bin'), { recursive: true });
    copyFileSync(dolt, join(root, 'dolt-bin', 'dolt'));
    chmodSync(join(root, 'dolt-bin', 'dolt'), 0o755);
    await loadFixture(dolt, root);
    const dbPath = join(root, 'game.db');
    const logs: string[] = [];
    const summary = await buildRealDb({
      gameDbPath: dbPath,
      doltRoot: root,
      skipClone: true,
      tickers: Object.keys(MAP),
      port: 3398,
      log: (m) => logs.push(m),
    });
    expect(summary.realDays).toBeGreaterThan(100);
    expect(summary.modeledDays).toBeGreaterThan(10);
    expect(summary.windows).toBeGreaterThan(20);
    const db = openDb(dbPath, { readOnly: true });
    expect(validateGameDb(db)).toEqual([]);
    db.close();
    const src = new SqliteSource(dbPath);
    expect((await src.meta()).kind).toBe('real');
    expect((await src.meta()).benchmark).toBe('SPY');
    const wins = await src.windows({ symbols: ['AAPL'] });
    const chain = await src.chain('AAPL', wins[0].entryDate);
    expect(chain?.source).toBe('real');
    const events = await src.earnings('AAPL', CHAIN_FROM, LAST);
    expect(events.some((e) => e.impliedMovePct !== null && e.ivBefore !== null)).toBe(true);
    const vol = await src.vol('AAPL', '2026-03-01', LAST);
    expect(vol.some((v) => v.ivr !== null)).toBe(true);
    src.close();
  }, 600_000);
});
