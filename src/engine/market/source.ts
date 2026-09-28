import type {
  Bar,
  Chain,
  ContractKey,
  DatasetMeta,
  Dividend,
  EarningsEvent,
  Fundamentals,
  ISODate,
  MacroEvent,
  OptionQuote,
  RatePoint,
  Split,
  SymbolInfo,
  VixBar,
  VolPoint,
  WindowDef,
} from './types';

export type EarningsScheduleItem = Pick<EarningsEvent, 'symbol' | 'date' | 'timing' | 'reactionDate'>;

export interface WindowFilter {
  symbols?: string[];
  recent?: boolean;
  minAdx?: number;
  maxAdx?: number;
  minVix?: number;
  maxIvr?: number;
  minIvr?: number;
  hasEarnings?: boolean;
  hasExDiv?: boolean;
  hasFomc?: boolean;
  minGapAtr?: number;
  minSpreadDecile?: number;
  entryFrom?: ISODate;
  entryTo?: ISODate;
  limit?: number;
}

/**
 * Raw market data access. Implementations: the SQLite game database (main process),
 * the synthetic SIM market (anywhere), and the IPC proxy in the renderer.
 * Nothing here knows about the game clock: all time-gating happens in MarketView,
 * and the IPC layer re-checks every request against the caller's `asOf`.
 */
export interface MarketDataSource {
  meta(): Promise<DatasetMeta>;
  symbols(): Promise<SymbolInfo[]>;
  tradingDays(from: ISODate, to: ISODate): Promise<ISODate[]>;
  bars(symbol: string, from: ISODate, to: ISODate): Promise<Bar[]>;
  chain(symbol: string, date: ISODate): Promise<Chain | null>;
  /** Quotes for specific contracts on specific days (used to mark open positions). */
  quotes(
    symbol: string,
    keys: ContractKey[],
    from: ISODate,
    to: ISODate,
  ): Promise<(OptionQuote & { date: ISODate })[]>;
  earnings(symbol: string, from: ISODate, to: ISODate): Promise<EarningsEvent[]>;
  /** Announced dates only (no outcomes). Allowed to look ahead: report dates are public. */
  earningsSchedule(symbol: string, from: ISODate, to: ISODate): Promise<EarningsScheduleItem[]>;
  dividends(symbol: string, from: ISODate, to: ISODate): Promise<Dividend[]>;
  splits(symbol: string): Promise<Split[]>;
  vol(symbol: string, from: ISODate, to: ISODate): Promise<VolPoint[]>;
  fundamentals(symbol: string, from: ISODate, to: ISODate): Promise<Fundamentals[]>;
  rates(from: ISODate, to: ISODate): Promise<RatePoint[]>;
  vix(from: ISODate, to: ISODate): Promise<VixBar[]>;
  macro(from: ISODate, to: ISODate): Promise<MacroEvent[]>;
  windows(filter: WindowFilter): Promise<WindowDef[]>;
  window(id: number): Promise<WindowDef | null>;
}

/** A source that can forward the caller's clock (the IPC proxy uses it so the main process re-checks). */
export interface ClockAwareSource extends MarketDataSource {
  withClock(clock: () => ISODate): MarketDataSource;
}

export function isClockAware(s: MarketDataSource): s is ClockAwareSource {
  return typeof (s as Partial<ClockAwareSource>).withClock === 'function';
}

/** Thrown whenever anything asks for data dated after the current simulated day. */
export class LookaheadError extends Error {
  constructor(what: string, requested: ISODate, now: ISODate) {
    super(`Lookahead blocked: ${what} for ${requested} requested at ${now}`);
    this.name = 'LookaheadError';
  }
}

export class DataNotLoadedError extends Error {
  constructor(what: string) {
    super(`Market data not loaded: ${what}`);
    this.name = 'DataNotLoadedError';
  }
}

/**
 * Which dated fields of each request must be on or before `asOf`. The IPC layer calls this
 * before touching the database so a renderer bug cannot leak the future either.
 */
export function assertRequestNotAfter(asOf: ISODate, dates: (ISODate | undefined)[], what: string): void {
  for (const d of dates) {
    if (d !== undefined && d > asOf) throw new LookaheadError(what, d, asOf);
  }
}
