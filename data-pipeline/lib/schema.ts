import { fromYyyymmdd, toYyyymmdd, type ISODate } from '../../src/engine/calendar';
import type { OptionQuote, RowSource } from '../../src/engine/market/types';

export const SCHEMA_VERSION = 1;

/**
 * game.db layout. Chains dominate the size, so their rows are stored as small integers:
 * dates as YYYYMMDD, strikes in thousandths, prices in cents, greeks scaled (see ENCODING).
 */
export const GAME_DB_DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS symbols (
  symbol TEXT PRIMARY KEY, name TEXT NOT NULL, sector TEXT NOT NULL, size_tier TEXT NOT NULL,
  kind TEXT NOT NULL, is_etf INTEGER NOT NULL, weeklies INTEGER NOT NULL,
  first_date TEXT NOT NULL, last_date TEXT NOT NULL, chain_first_date TEXT NOT NULL,
  reason TEXT NOT NULL, liquidity REAL, iv_level REAL
);
CREATE TABLE IF NOT EXISTS trading_days (date INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS bars (
  symbol TEXT NOT NULL, date INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
  close REAL NOT NULL, volume INTEGER NOT NULL, src INTEGER NOT NULL,
  PRIMARY KEY (symbol, date)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS chains (
  symbol TEXT NOT NULL, date INTEGER NOT NULL, expiration INTEGER NOT NULL, strike INTEGER NOT NULL, cp TEXT NOT NULL,
  bid INTEGER NOT NULL, ask INTEGER NOT NULL, iv INTEGER NOT NULL, delta INTEGER NOT NULL, gamma INTEGER NOT NULL,
  theta INTEGER NOT NULL, vega INTEGER NOT NULL, rho INTEGER NOT NULL, src INTEGER NOT NULL,
  PRIMARY KEY (symbol, date, expiration, strike, cp)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS chain_days (symbol TEXT NOT NULL, date INTEGER NOT NULL, spot REAL NOT NULL, src INTEGER NOT NULL, spread REAL, PRIMARY KEY (symbol, date)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS vol (
  symbol TEXT NOT NULL, date INTEGER NOT NULL, iv30 REAL, hv20 REAL, ivr REAL, ivp REAL,
  PRIMARY KEY (symbol, date)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS earnings (
  symbol TEXT NOT NULL, date TEXT NOT NULL, timing TEXT NOT NULL, reaction_date TEXT NOT NULL,
  estimate REAL, actual REAL, surprise_pct REAL, gap_pct REAL, move_pct REAL, implied_move_pct REAL,
  iv_before REAL, iv_after REAL,
  PRIMARY KEY (symbol, date)
);
CREATE TABLE IF NOT EXISTS dividends (symbol TEXT NOT NULL, ex_date TEXT NOT NULL, amount REAL NOT NULL, PRIMARY KEY (symbol, ex_date));
CREATE TABLE IF NOT EXISTS splits (symbol TEXT NOT NULL, ex_date TEXT NOT NULL, ratio REAL NOT NULL, PRIMARY KEY (symbol, ex_date));
CREATE TABLE IF NOT EXISTS rates (date TEXT PRIMARY KEY, r3m REAL NOT NULL, r1y REAL NOT NULL, r2y REAL NOT NULL, r10y REAL NOT NULL);
CREATE TABLE IF NOT EXISTS vix (date TEXT PRIMARY KEY, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL);
CREATE TABLE IF NOT EXISTS macro_events (date TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, verified INTEGER NOT NULL, PRIMARY KEY (date, kind));
CREATE TABLE IF NOT EXISTS fundamentals (
  symbol TEXT NOT NULL, report_date TEXT NOT NULL, period_end TEXT NOT NULL, eps REAL, eps_estimate REAL,
  revenue REAL, net_income REAL, shares_out REAL,
  PRIMARY KEY (symbol, report_date)
);
CREATE TABLE IF NOT EXISTS windows (
  id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, history_start TEXT NOT NULL, entry_date TEXT NOT NULL,
  end_date TEXT NOT NULL, forward_days INTEGER NOT NULL, recent INTEGER NOT NULL, weight REAL NOT NULL,
  adx REAL NOT NULL, trend_slope REAL NOT NULL, vix REAL NOT NULL, ivr REAL NOT NULL,
  has_earnings INTEGER NOT NULL, has_exdiv INTEGER NOT NULL, has_fomc INTEGER NOT NULL,
  max_gap_atr REAL NOT NULL, spread_pct REAL NOT NULL, spread_decile INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS windows_symbol ON windows(symbol, entry_date);
`;

export const ENCODING = {
  date: 'YYYYMMDD integer',
  strike: 'thousandths of a dollar',
  price: 'cents',
  iv: 'decimal x 1e4',
  delta: 'x 1e4',
  gamma: 'x 1e6',
  theta: 'dollars/day x 1e4',
  vega: 'dollars/vol-point x 1e4',
  rho: 'x 1e4',
};

const SRC_CODE: Record<RowSource, number> = { real: 0, modeled: 1, synthetic: 2 };
const SRC_NAME: RowSource[] = ['real', 'modeled', 'synthetic'];

export const srcCode = (s: RowSource): number => SRC_CODE[s];
export const srcName = (n: number): RowSource => SRC_NAME[n] ?? 'real';
export const encDate = (d: ISODate): number => toYyyymmdd(d);
export const decDate = (n: number): ISODate => fromYyyymmdd(n);

export interface ChainRowEnc {
  expiration: number;
  strike: number;
  cp: string;
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  src: number;
}

export function encodeQuote(q: OptionQuote): Omit<ChainRowEnc, never> {
  return {
    expiration: encDate(q.expiration),
    strike: Math.round(q.strike * 1000),
    cp: q.right,
    bid: Math.round(q.bid * 100),
    ask: Math.round(q.ask * 100),
    iv: Math.round(q.iv * 1e4),
    delta: Math.round(q.delta * 1e4),
    gamma: Math.round(q.gamma * 1e6),
    theta: Math.round(q.theta * 1e4),
    vega: Math.round(q.vega * 1e4),
    rho: Math.round(q.rho * 1e4),
    src: srcCode(q.source),
  };
}

export function decodeQuote(r: ChainRowEnc): OptionQuote {
  return {
    expiration: decDate(r.expiration),
    strike: r.strike / 1000,
    right: r.cp === 'C' ? 'C' : 'P',
    bid: r.bid / 100,
    ask: r.ask / 100,
    iv: r.iv / 1e4,
    delta: r.delta / 1e4,
    gamma: r.gamma / 1e6,
    theta: r.theta / 1e4,
    vega: r.vega / 1e4,
    rho: r.rho / 1e4,
    source: srcName(r.src),
  };
}
