/**
 * schwab.db: everything pulled from Schwab's read-only market data, kept in its own file on this
 * computer (next to game.db). It only grows: daily candles for every ticker (plus the VIX and the
 * 13-week T-bill index), and a real option chain for each close it was pulled after. Schwab
 * serves no option history, so those snapshots are the only real chains it can ever give; the
 * store keeps every one so a later build can use them.
 *
 * Plain SQLite with readable ISO dates, so it can be opened with any SQLite viewer.
 */

import type { ISODate } from '../../src/engine/calendar';
import type { Bar, Chain, OptionQuote } from '../../src/engine/market/types';
import { all, get, openDb, tx, type Db } from '../lib/sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candles (
  symbol TEXT NOT NULL, date TEXT NOT NULL,
  open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume INTEGER NOT NULL,
  PRIMARY KEY (symbol, date)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS chains (
  symbol TEXT NOT NULL, date TEXT NOT NULL, spot REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  -- [expiration, strike, "C"|"P", bid, ask, iv] per contract, as JSON
  quotes TEXT NOT NULL,
  PRIMARY KEY (symbol, date)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS splits (
  symbol TEXT NOT NULL, date TEXT NOT NULL, ratio REAL NOT NULL,
  PRIMARY KEY (symbol, date)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS pulls (
  at TEXT NOT NULL, closed_through TEXT NOT NULL, symbols INTEGER NOT NULL,
  new_candles INTEGER NOT NULL, chains INTEGER NOT NULL, note TEXT NOT NULL
);
`;

type QuoteRow = [string, number, 'C' | 'P', number, number, number];

export interface StoreSummary {
  path: string;
  /** Stock and ETF tickers with candles (the VIX and T-bill series aren't counted). */
  symbols: number;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
  /** Closes with a real chain for at least one ticker. */
  chainDays: number;
  chains: number;
  lastPullAt: string | null;
}

/** Index series pulled alongside the tickers (Schwab names indexes with a leading $). */
export const VIX_SYMBOL = '$VIX';
export const TBILL_SYMBOL = '$IRX';
export const isIndexSeries = (s: string) => s.startsWith('$');

export class SchwabStore {
  readonly db: Db;

  constructor(
    readonly path: string,
    opts: { readOnly?: boolean } = {},
  ) {
    this.db = openDb(path, opts);
    if (!opts.readOnly) this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  putCandles(symbol: string, bars: Bar[]): number {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO candles(symbol,date,open,high,low,close,volume) VALUES (?,?,?,?,?,?,?)',
    );
    const had = new Set(this.candles(symbol).map((b) => b.date));
    tx(this.db, () => {
      for (const b of bars) st.run(symbol, b.date, b.open, b.high, b.low, b.close, Math.round(b.volume));
    });
    return bars.filter((b) => !had.has(b.date)).length;
  }

  /** Replace a ticker's whole history (after a split, Schwab re-adjusts every older candle). */
  replaceCandles(symbol: string, bars: Bar[]): void {
    tx(this.db, () => {
      this.db.prepare('DELETE FROM candles WHERE symbol = ?').run(symbol);
    });
    this.putCandles(symbol, bars);
  }

  candles(symbol: string, from: ISODate = '1900-01-01', to: ISODate = '2999-12-31'): Bar[] {
    return all<{ date: string; open: number; high: number; low: number; close: number; volume: number }>(
      this.db.prepare(
        'SELECT date, open, high, low, close, volume FROM candles WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date',
      ),
      symbol,
      from,
      to,
    ).map((r) => ({ ...r, date: r.date as ISODate, source: 'real' as const }));
  }

  lastCandleDate(symbol: string): ISODate | null {
    const r = get<{ d: string | null }>(
      this.db.prepare('SELECT MAX(date) AS d FROM candles WHERE symbol = ?'),
      symbol,
    );
    return (r?.d as ISODate | null) ?? null;
  }

  /** Stock and ETF tickers in the store (index series left out). */
  symbols(): string[] {
    return all<{ symbol: string }>(this.db.prepare('SELECT DISTINCT symbol FROM candles ORDER BY symbol'))
      .map((r) => r.symbol)
      .filter((s) => !isIndexSeries(s));
  }

  putChain(chain: Chain, fetchedAt: string): void {
    const rows: QuoteRow[] = chain.quotes.map((q) => [q.expiration, q.strike, q.right, q.bid, q.ask, q.iv]);
    this.db
      .prepare('INSERT OR REPLACE INTO chains(symbol,date,spot,fetched_at,quotes) VALUES (?,?,?,?,?)')
      .run(chain.symbol, chain.date, chain.spot, fetchedAt, JSON.stringify(rows));
  }

  hasChain(symbol: string, date: ISODate): boolean {
    return !!get(this.db.prepare('SELECT 1 AS x FROM chains WHERE symbol = ? AND date = ?'), symbol, date);
  }

  /**
   * Real chains for a ticker, by date. Quotes carry bid, ask and IV only; the greeks are
   * recomputed by whoever builds game data from them (the same way for every source).
   */
  chains(symbol: string, from: ISODate = '1900-01-01', to: ISODate = '2999-12-31'): Chain[] {
    return all<{ date: string; spot: number; quotes: string }>(
      this.db.prepare(
        'SELECT date, spot, quotes FROM chains WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date',
      ),
      symbol,
      from,
      to,
    ).map((r) => ({
      symbol,
      date: r.date as ISODate,
      spot: r.spot,
      source: 'real' as const,
      quotes: (JSON.parse(r.quotes) as QuoteRow[]).map(
        ([expiration, strike, right, bid, ask, iv]): OptionQuote => ({
          expiration: expiration as ISODate,
          strike,
          right,
          bid,
          ask,
          iv,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0,
          source: 'real',
        }),
      ),
    }));
  }

  /**
   * A split re-adjusts Schwab's candle history, so older chain snapshots are adjusted the same
   * way (strikes and prices divided by the ratio), keeping every stored price on one scale.
   */
  recordSplit(symbol: string, date: ISODate, ratio: number): void {
    tx(this.db, () => {
      this.db
        .prepare('INSERT OR REPLACE INTO splits(symbol,date,ratio) VALUES (?,?,?)')
        .run(symbol, date, ratio);
    });
    const older = this.chains(symbol, '1900-01-01', date).filter((c) => c.date < date);
    for (const c of older) {
      const fetched = get<{ f: string }>(
        this.db.prepare('SELECT fetched_at AS f FROM chains WHERE symbol = ? AND date = ?'),
        symbol,
        c.date,
      );
      this.putChain(
        {
          ...c,
          spot: c.spot / ratio,
          quotes: c.quotes.map((q) => ({
            ...q,
            strike: Math.round((q.strike / ratio) * 1000) / 1000,
            bid: Math.round((q.bid / ratio) * 10000) / 10000,
            ask: Math.round((q.ask / ratio) * 10000) / 10000,
          })),
        },
        fetched?.f ?? new Date().toISOString(),
      );
    }
  }

  splits(symbol: string): { date: ISODate; ratio: number }[] {
    return all<{ date: string; ratio: number }>(
      this.db.prepare('SELECT date, ratio FROM splits WHERE symbol = ? ORDER BY date'),
      symbol,
    ).map((r) => ({ date: r.date as ISODate, ratio: r.ratio }));
  }

  logPull(p: {
    at: string;
    closedThrough: ISODate;
    symbols: number;
    newCandles: number;
    chains: number;
    note: string;
  }): void {
    this.db
      .prepare('INSERT INTO pulls(at,closed_through,symbols,new_candles,chains,note) VALUES (?,?,?,?,?,?)')
      .run(p.at, p.closedThrough, p.symbols, p.newCandles, p.chains, p.note);
  }

  summary(): StoreSummary {
    const syms = this.symbols();
    const range = get<{ lo: string | null; hi: string | null }>(
      this.db.prepare("SELECT MIN(date) AS lo, MAX(date) AS hi FROM candles WHERE symbol NOT LIKE '$%'"),
    );
    const ch = get<{ n: number; d: number }>(
      this.db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT date) AS d FROM chains'),
    );
    const pull = get<{ at: string | null }>(this.db.prepare('SELECT MAX(at) AS at FROM pulls'));
    return {
      path: this.path,
      symbols: syms.length,
      firstDate: (range?.lo as ISODate | null) ?? null,
      lastDate: (range?.hi as ISODate | null) ?? null,
      chainDays: ch?.d ?? 0,
      chains: ch?.n ?? 0,
      lastPullAt: pull?.at ?? null,
    };
  }
}
