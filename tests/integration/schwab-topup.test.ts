import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { nextTradingDay, type ISODate } from '../../src/engine/calendar';
import type { Chain } from '../../src/engine/market/types';
import { buildSyntheticDb } from '../../data-pipeline/synthetic';
import { openDb } from '../../data-pipeline/lib/sqlite';
import { SqliteSource } from '../../data-pipeline/lib/sqliteSource';
import { keepLaterDays, schwabTopUp, type SchwabMarketApi } from '../../data-pipeline/schwab/topup';

const SYMBOLS = ['MKTX', 'HLXR'];

/** New York midnight of a day, the way Schwab stamps daily candles (UTC-4 in these months). */
const nyMidnight = (d: ISODate) => Date.parse(`${d}T04:00:00Z`);

/** A Schwab-shaped chain JSON made from a chain (IV in percent). */
function schwabChainJson(c: Chain) {
  const maps: Record<'callExpDateMap' | 'putExpDateMap', Record<string, Record<string, unknown[]>>> = {
    callExpDateMap: {},
    putExpDateMap: {},
  };
  for (const q of c.quotes) {
    const m = q.right === 'C' ? maps.callExpDateMap : maps.putExpDateMap;
    const key = `${q.expiration}:0`;
    m[key] ??= {};
    m[key][q.strike.toFixed(1)] = [
      {
        putCall: q.right === 'C' ? 'CALL' : 'PUT',
        bid: q.bid,
        ask: q.ask,
        volatility: q.iv * 100,
        strikePrice: q.strike,
        expirationDate: `${q.expiration}T20:00:00.000+00:00`,
      },
    ];
  }
  return maps;
}

describe('Schwab top-up of game.db (read-only market data, faked)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stg-schwab-'));
  const dbPath = join(dir, 'game.db');
  let last: ISODate;
  let days: ISODate[];
  const calls: string[] = [];
  let api: SchwabMarketApi;

  beforeAll(async () => {
    await buildSyntheticDb({ path: dbPath, symbols: SYMBOLS, chainDays: 60 });
    // Pretend it's the real-data build; the top-up refuses to touch the SIM market.
    const db = openDb(dbPath);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'dataset'").get() as { value: string };
    const meta = JSON.parse(row.value);
    db.prepare("UPDATE meta SET value = ? WHERE key = 'dataset'").run(
      JSON.stringify({ ...meta, kind: 'real' }),
    );
    db.close();
    last = meta.lastDate;
    days = [nextTradingDay(last)];
    days.push(nextTradingDay(days[0]), nextTradingDay(nextTradingDay(days[0])));
    const src = new SqliteSource(dbPath);
    const lastChain = new Map<string, Chain>();
    const lastClose = new Map<string, number>();
    for (const s of SYMBOLS) {
      lastChain.set(s, (await src.chain(s, last)) as Chain);
      lastClose.set(s, (await src.bars(s, last, last))[0].close);
    }
    src.close();
    api = {
      priceHistory: async (symbol) => {
        calls.push(`history:${symbol}`);
        const c0 = lastClose.get(symbol) as number;
        return {
          candles: days.map((d, i) => ({
            open: c0 * (1 + i * 0.004),
            high: c0 * (1 + i * 0.004 + 0.01),
            low: c0 * (1 + i * 0.004 - 0.01),
            close: c0 * (1 + (i + 1) * 0.004),
            volume: 1_000_000,
            datetime: nyMidnight(d),
          })),
        };
      },
      chain: async (symbol) => {
        calls.push(`chain:${symbol}`);
        return schwabChainJson(lastChain.get(symbol) as Chain);
      },
    };
  });

  it('during market hours: only finished days, and no chain taken (it would be intraday)', async () => {
    // 11:00 in New York on the third new day.
    const now = new Date(`${days[2]}T15:00:00Z`);
    const r = await schwabTopUp({ gameDbPath: dbPath, api, now });
    expect(r.ok).toBe(true);
    expect(r.newDays).toEqual(days.slice(0, 2));
    expect(r.realChains).toBe(0);
    expect(calls.some((c) => c.startsWith('chain:'))).toBe(false);
    const src = new SqliteSource(dbPath);
    expect((await src.meta()).lastDate).toBe(days[1]);
    expect((await src.chain('HLXR', days[1]))?.source).toBe('modeled');
    src.close();
  });

  it("after the close: the day's candles and a real chain; the game reads them like any day", async () => {
    const now = new Date(`${days[2]}T21:30:00Z`); // 5:30 pm in New York
    const r = await schwabTopUp({ gameDbPath: dbPath, api, now });
    expect(r.newDays).toEqual([days[2]]);
    expect(r.realChains).toBe(SYMBOLS.length);
    const src = new SqliteSource(dbPath);
    const meta = await src.meta();
    expect(meta.lastDate).toBe(days[2]);
    expect(meta.notes.join(' ')).toContain('Schwab');
    expect(await src.tradingDays(days[0], days[2])).toEqual(days);
    const chain = await src.chain('HLXR', days[2]);
    expect(chain?.source).toBe('real');
    expect(chain?.quotes.length).toBeGreaterThan(20);
    const bars = await src.bars('HLXR', days[0], days[2]);
    expect(bars.map((b) => b.date)).toEqual(days);
    const vol = await src.vol('HLXR', days[2], days[2]);
    expect(vol[0]?.iv30).toBeGreaterThan(0);
    expect((await src.symbols()).find((s) => s.symbol === 'HLXR')?.lastDate).toBe(days[2]);
    src.close();
    // Nothing new: nothing written.
    const again = await schwabTopUp({ gameDbPath: dbPath, api, now });
    expect(again.newDays).toEqual([]);
    expect(again.message).toContain('up to date');
  });

  it('a later DoltHub sync never moves the calendar back behind the Schwab days', async () => {
    // A DoltHub sync writes its own (older) last date into the metadata.
    const db = openDb(dbPath);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'dataset'").get() as { value: string };
    db.prepare("UPDATE meta SET value = ? WHERE key = 'dataset'").run(
      JSON.stringify({ ...JSON.parse(row.value), lastDate: last }),
    );
    db.prepare('UPDATE symbols SET last_date = ?').run(last);
    db.close();
    keepLaterDays(dbPath, days[2]);
    const src = new SqliteSource(dbPath);
    expect((await src.meta()).lastDate).toBe(days[2]);
    expect((await src.symbols()).every((s) => s.lastDate === days[2])).toBe(true);
    src.close();
  });
});
