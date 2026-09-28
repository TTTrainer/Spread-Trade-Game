import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { MarketView } from '../../src/engine/market/view';
import { openTransform } from '../../src/engine/market/transform';
import { SqliteSource } from '../../data-pipeline/lib/sqliteSource';
import { openDb } from '../../data-pipeline/lib/sqlite';
import { buildSyntheticDb } from '../../data-pipeline/synthetic';
import { validateGameDb } from '../../data-pipeline/validate';
import { writeReport } from '../../data-pipeline/report';

const dir = mkdtempSync(join(tmpdir(), 'stg-pipe-'));
const dbPath = join(dir, 'game.db');
const SYMBOLS = ['MKTX', 'HLXR', 'QSLC'];

describe('game.db build (SIM source through the real writer and reader)', () => {
  beforeAll(async () => {
    await buildSyntheticDb({ path: dbPath, symbols: SYMBOLS, chainDays: 80 });
  });

  it('passes validation', () => {
    const db = openDb(dbPath, { readOnly: true });
    const issues = validateGameDb(db, { dailyChainsFrom: '2026-06-01' });
    db.close();
    expect(issues).toEqual([]);
  });

  it('round-trips chains, bars and events through SQLite', async () => {
    const sql = new SqliteSource(dbPath);
    const sim = new SyntheticSource({ symbols: SYMBOLS });
    const wins = await sql.windows({ symbols: ['HLXR'] });
    expect(wins.length).toBeGreaterThan(0);
    const d = wins[0].entryDate;
    const a = await sql.chain('HLXR', d);
    const b = await sim.chain('HLXR', d);
    expect(a?.quotes.length).toBe(b?.quotes.length);
    const qa = a?.quotes[25];
    const qb = b?.quotes[25];
    expect(qa?.bid).toBeCloseTo(qb?.bid ?? 0, 2);
    expect(qa?.iv).toBeCloseTo(qb?.iv ?? 0, 3);
    expect(qa?.delta).toBeCloseTo(qb?.delta ?? 0, 3);
    expect(await sql.bars('HLXR', d, d)).toEqual(await sim.bars('HLXR', d, d));
    const quotes = await sql.quotes('HLXR', [qa as NonNullable<typeof qa>], d, d);
    expect(quotes).toHaveLength(1);
    expect((await sql.meta()).kind).toBe('synthetic');
    expect((await sql.symbols()).map((s) => s.symbol).sort()).toEqual(SYMBOLS.slice().sort());
    sql.close();
  });

  it('never stores a window across a split', async () => {
    const sql = new SqliteSource(dbPath);
    const splits = await sql.splits('QSLC');
    const wins = await sql.windows({ symbols: ['QSLC'] });
    for (const w of wins)
      for (const s of splits) expect(s.exDate > w.historyStart && s.exDate <= w.endDate).toBe(false);
    sql.close();
  });

  it('drives a MarketView end to end from the database', async () => {
    const sql = new SqliteSource(dbPath);
    const [w] = await sql.windows({ symbols: ['HLXR'], limit: 1 });
    const view = await MarketView.open({
      source: sql,
      window: w,
      transform: openTransform(w.symbol, w.entryDate),
      benchmark: 'MKTX',
    });
    const chain = await view.loadChain();
    await view.track([chain.quotes[10]]);
    for (let i = 0; i < 5; i++) await view.advance();
    expect(view.dayIndex).toBe(5);
    expect(view.benchmarkBars().at(-1)?.date).toBe(view.now);
    sql.close();
  });

  it('writes the report', () => {
    const out = join(dir, 'REPORT.md');
    writeReport(dbPath, out);
    const text = readFileSync(out, 'utf8');
    expect(text).toContain('## Tickers');
    expect(text).toContain('All checks passed.');
  });
});
