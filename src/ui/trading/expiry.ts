import { addDays, diffDays, tradingDaysBetween } from '../../engine/calendar';

/** Bars from today's candle to an expiration: trading days on the daily chart, weeks on the weekly. */
export function barsAhead(now: string, exp: string, timeframe: string): number {
  if (exp <= now) return 0;
  return timeframe === 'W'
    ? Math.max(1, Math.round(diffDays(now, exp) / 7))
    : tradingDaysBetween(addDays(now, 1), exp).length;
}
