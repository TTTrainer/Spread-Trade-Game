import { addDays, type ISODate } from '../calendar';
import { LookaheadError, type MarketDataSource } from './source';

/**
 * Dividends are declared (ex-date and amount) a few weeks before they go ex, so the
 * schedule may be known that far ahead. Everything else dated is gated to the clock.
 */
export const DIVIDEND_DECLARE_DAYS = 35;

export type SourceMethod = keyof MarketDataSource;

/**
 * For each source method: which argument positions hold dates that must not be after the clock,
 * and how far ahead (calendar days) they may reach. `null` means the method is not time-gated
 * (calendars, announced schedules, the dealer's window index).
 */
export const GATE_RULES: Record<SourceMethod, { dateArgs: number[]; aheadDays: number } | null> = {
  meta: null,
  symbols: null,
  tradingDays: null,
  earningsSchedule: null,
  macro: null,
  splits: null,
  windows: null,
  window: null,
  bars: { dateArgs: [2], aheadDays: 0 },
  chain: { dateArgs: [1], aheadDays: 0 },
  quotes: { dateArgs: [3], aheadDays: 0 },
  earnings: { dateArgs: [2], aheadDays: 0 },
  dividends: { dateArgs: [2], aheadDays: DIVIDEND_DECLARE_DAYS },
  vol: { dateArgs: [2], aheadDays: 0 },
  fundamentals: { dateArgs: [2], aheadDays: 0 },
  rates: { dateArgs: [1], aheadDays: 0 },
  vix: { dateArgs: [1], aheadDays: 0 },
};

/** Throws LookaheadError if a call would read data dated after `asOf`. */
export function checkGate(method: SourceMethod, args: unknown[], asOf: ISODate): void {
  const rule = GATE_RULES[method];
  if (!rule) return;
  const limit = rule.aheadDays > 0 ? addDays(asOf, rule.aheadDays) : asOf;
  for (const i of rule.dateArgs) {
    const d = args[i];
    if (typeof d === 'string' && d > limit) throw new LookaheadError(`${method}`, d, asOf);
  }
}

/** Wraps a source so every call is checked against the clock before it reaches the data. */
export function gateSource(src: MarketDataSource, clock: () => ISODate): MarketDataSource {
  return new Proxy(src, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function' || !(prop in GATE_RULES)) return value;
      const method = prop as SourceMethod;
      return (...args: unknown[]) => {
        checkGate(method, args, clock());
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
