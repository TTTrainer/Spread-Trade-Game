/**
 * The course's replay: a sold option on real past days. The lesson cuts the ticker's history at a
 * day a few weeks back, the player sets a strike from what the chart showed up to then, and the
 * days after it play out one candle at a time. A day is safe when no part of its candle touches
 * the strike: above it for a sold put, below it for a sold call. Everything shown comes from the
 * same bars the chart has, cut at the entry day, so the strike is chosen without seeing the days
 * it is tested on.
 */

import type { Bar } from '../market/types';
import { strikeIncrement } from '../pricing/chainModel';
import { practiceLevel, type PracticeLevel } from './practice';

export type ReplaySide = 'put' | 'call';

export interface ReplayWindow {
  /** The chart up to and including the entry day. */
  history: Bar[];
  /** The days that play out after it, oldest first. */
  play: Bar[];
  /** The floor (put) or ceiling (call) on the chart as of the entry day, if it has one. */
  level: PracticeLevel | null;
  /** The entry day's close. */
  spot: number;
}

/** About a month of trading days: a 30-day option sold on the entry day expires near the end. */
export const REPLAY_DAYS = 21;

/**
 * Cut `bars` so the last `days` of them play out after the entry day, with `lookback` days of
 * chart before it. Null when there isn't enough history.
 */
export function replayWindow(
  bars: Bar[],
  side: ReplaySide,
  days = REPLAY_DAYS,
  lookback = 60,
): ReplayWindow | null {
  const entry = bars.length - 1 - days;
  if (entry < lookback) return null;
  const history = bars.slice(entry - lookback + 1, entry + 1);
  const play = bars.slice(entry + 1, entry + 1 + days);
  const spot = history[history.length - 1].close;
  return { history, play, level: practiceLevel(history, side === 'put' ? 'up' : 'down'), spot };
}

/** The listed strike nearest a price. */
export function snapStrike(price: number, spot: number): number {
  const inc = strikeIncrement(spot);
  return Math.round(Math.round(price / inc) * inc * 100) / 100;
}

/** Whether the strike sits past the level: under a floor for a put, over a ceiling for a call. */
export function pastLevel(strike: number, side: ReplaySide, level: PracticeLevel | null): boolean {
  if (!level) return false;
  return side === 'put' ? strike < level.price : strike > level.price;
}

/** A day is safe when its candle stays clear of the strike. */
export function safeDay(bar: Bar, strike: number, side: ReplaySide): boolean {
  return side === 'put' ? bar.low > strike : bar.high < strike;
}

export interface ReplayResult {
  safeDays: number;
  /** The first day (1-based) a candle touched the strike, or null when none did. */
  touchedOn: number | null;
  /** Whether the last close finished past the strike (the option would end in the money). */
  endedPast: boolean;
}

export function replayResult(play: Bar[], strike: number, side: ReplaySide): ReplayResult {
  let safeDays = 0;
  let touchedOn: number | null = null;
  play.forEach((b, i) => {
    if (safeDay(b, strike, side)) safeDays++;
    else if (touchedOn === null) touchedOn = i + 1;
  });
  const last = play.at(-1);
  const endedPast = !!last && (side === 'put' ? last.close < strike : last.close > strike);
  return { safeDays, touchedOn, endedPast };
}

/**
 * The same distance from the price, moved to the entry day: a strike set 8% under today's price
 * becomes the strike 8% under the entry day's close, so "how would this setup have done last
 * month" tests the setup and not one price.
 */
export function strikeAtEntry(strikeToday: number, spotToday: number, spotEntry: number): number {
  return snapStrike((strikeToday / spotToday) * spotEntry, spotEntry);
}
