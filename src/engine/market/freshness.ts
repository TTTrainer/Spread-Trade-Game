/**
 * How current the Trade Builder's data is. The builder's job is today's trade, so stale data must
 * say so plainly: live (fetched from Schwab today), current (through the latest close), or so many
 * trading days out of date.
 */

import { addDays, isTradingDay, tradingDaysBetween, type ISODate } from '../calendar';

export interface Freshness {
  state: 'live' | 'current' | 'stale';
  /** Completed trading days since the data's last day. */
  daysOld: number;
  text: string;
}

/**
 * `today` is the New York calendar date; `afterClose` whether today's session has finished
 * (after 4:00 pm New York). `live`: the data was fetched from Schwab just now, so a chain dated
 * today is today's market.
 */
export function freshness(asOf: ISODate, today: ISODate, afterClose: boolean, live: boolean): Freshness {
  if (live && asOf === today && isTradingDay(today))
    return { state: 'live', daysOld: 0, text: `Live: today's market (${today}).` };
  // The newest trading day whose close is in: today after the close, else the day before.
  const lastClose =
    isTradingDay(today) && afterClose
      ? today
      : (tradingDaysBetween(addDays(today, -10), addDays(today, -1)).at(-1) ?? today);
  const daysOld = asOf >= lastClose ? 0 : tradingDaysBetween(addDays(asOf, 1), lastClose).length;
  if (daysOld === 0)
    return {
      state: 'current',
      daysOld: 0,
      text: `Current through the latest close (${asOf}).`,
    };
  return {
    state: 'stale',
    daysOld,
    text: `Out of date: this data ends ${asOf}, ${daysOld} trading day${daysOld === 1 ? '' : 's'} behind the market.`,
  };
}
