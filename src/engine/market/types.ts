import type { ISODate } from '../calendar';

export type { ISODate };

/** Where a row came from. Modeled rows fill gaps in real data; synthetic rows come from the SIM market. */
export type RowSource = 'real' | 'modeled' | 'synthetic';

export type OptionRight = 'C' | 'P';

export interface Bar {
  date: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: RowSource;
}

/** One option quote on one day. Prices are dollars per share; greeks are per share. */
export interface OptionQuote {
  expiration: ISODate;
  strike: number;
  right: OptionRight;
  bid: number;
  ask: number;
  iv: number; // decimal, e.g. 0.32
  delta: number;
  gamma: number;
  theta: number; // dollars per share per calendar day
  vega: number; // dollars per share per 1 vol point (0.01)
  rho: number;
  source: RowSource;
}

export interface ContractKey {
  expiration: ISODate;
  strike: number;
  right: OptionRight;
}

export function contractId(k: ContractKey): string {
  return `${k.expiration}|${k.strike.toFixed(3)}|${k.right}`;
}

export interface Chain {
  symbol: string;
  date: ISODate;
  spot: number;
  source: RowSource;
  quotes: OptionQuote[];
}

export type EarningsTiming = 'BMO' | 'AMC' | 'UNK';

/**
 * An earnings report. The schedule (date, timing) is public ahead of time; everything
 * about the outcome is only visible on or after the reaction day.
 */
export interface EarningsEvent {
  symbol: string;
  date: ISODate; // announcement date
  timing: EarningsTiming;
  reactionDate: ISODate; // first session that trades on the news
  estimate: number | null;
  actual: number | null;
  surprisePct: number | null;
  gapPct: number | null; // reaction-day open vs prior close
  movePct: number | null; // reaction-day close vs prior close
  impliedMovePct: number | null; // from the front ATM straddle the day before
  ivBefore: number | null;
  ivAfter: number | null;
}

export interface Dividend {
  symbol: string;
  exDate: ISODate;
  amount: number;
}

export interface Split {
  symbol: string;
  exDate: ISODate;
  ratio: number; // new shares per old share (4 = 4-for-1)
}

export interface RatePoint {
  date: ISODate;
  r3m: number; // decimals
  r1y: number;
  r2y: number;
  r10y: number;
}

export interface VixBar {
  date: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type MacroKind = 'FOMC' | 'CPI';

export interface MacroEvent {
  date: ISODate;
  kind: MacroKind;
  label: string;
  verified: boolean;
}

export interface VolPoint {
  date: ISODate;
  iv30: number | null;
  hv20: number | null;
  ivr: number | null; // 0..100, from trailing 252 days only
  ivp: number | null; // 0..100
}

/** Point-in-time fundamentals, keyed by the date they were reported (never later restatements). */
export interface Fundamentals {
  symbol: string;
  reportDate: ISODate;
  periodEnd: ISODate;
  eps: number | null;
  epsEstimate: number | null;
  revenue: number | null; // dollars
  netIncome: number | null;
  sharesOut: number | null;
}

export type SizeTier = 'mega' | 'large' | 'mid' | 'small' | 'etf';

export interface SymbolInfo {
  symbol: string;
  name: string;
  sector: string;
  sizeTier: SizeTier;
  kind: 'real' | 'synthetic';
  isEtf: boolean;
  weeklies: boolean;
  firstDate: ISODate;
  lastDate: ISODate;
  chainFirstDate: ISODate;
  reason: string;
  liquidity: number | null; // median (ask-bid)/mid of 20-40 delta options
  ivLevel: number | null; // median ATM IV
}

export interface RegimeTags {
  adx: number;
  trendSlope: number; // 50-day SMA slope, % per day
  vix: number;
  ivr: number;
  hasEarnings: boolean;
  hasExDiv: boolean;
  hasFomc: boolean;
  maxGapAtr: number; // largest |gap| in ATR units inside the forward window (dealer-only tag)
  spreadPct: number; // median relative bid/ask of 20-40 delta options at entry
  spreadDecile: number; // 0..9 across all windows
}

export interface WindowDef {
  id: number;
  symbol: string;
  historyStart: ISODate;
  entryDate: ISODate;
  endDate: ISODate;
  forwardDays: number;
  recent: boolean;
  weight: number;
  tags: RegimeTags;
}

export interface DatasetMeta {
  kind: 'real' | 'synthetic' | 'mixed';
  version: number;
  builtAt: string;
  firstDate: ISODate;
  lastDate: ISODate;
  benchmark: string; // SPY in real data
  context: string[]; // SPY, DIA
  notes: string[];
}
