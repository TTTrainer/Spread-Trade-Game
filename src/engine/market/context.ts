/**
 * What the standard kit shows about a card at a decision point: trend, momentum, bands,
 * IV rank, events. Built only from what the MarketView has revealed so far.
 */

import { addDays, diffDays, type ISODate } from '../calendar';
import { atr, bollinger, lastMacdCross, macd, rsi, sma } from './indicators';
import type { Bar, Dividend, EarningsEvent, MacroEvent, VolPoint } from './types';
import type { EarningsScheduleItem } from './source';

export interface MarketContext {
  date: ISODate;
  spot: number;
  rsi: number | null;
  sma50Slope: number | null; // % per day over 10 days
  sma50: number | null;
  sma200: number | null;
  macdCrossDaysAgo: number | null;
  macdCrossDir: 'up' | 'down' | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  trend5d: number | null;
  atr: number | null;
  ivr: number | null;
  ivp: number | null;
  iv30: number | null;
  hv20: number | null;
  nextEarnings: EarningsScheduleItem | null;
  lastEarnings: EarningsEvent | null;
  nextExDiv: Dividend | null;
  divYield: number;
  macroAhead: MacroEvent[];
  vix: number | null;
}

export interface ContextInput {
  bars: Bar[];
  vol: VolPoint[];
  upcomingEarnings: EarningsScheduleItem[];
  pastEarnings: EarningsEvent[];
  dividends: Dividend[];
  macro: MacroEvent[];
  vix: number | null;
}

export function buildContext(i: ContextInput): MarketContext {
  const bars = i.bars;
  const last = bars[bars.length - 1];
  const closes = bars.map((b) => b.close);
  const r = rsi(closes, 14);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const n = closes.length;
  const slope = n > 60 && s50[n - 1] !== null && s50[n - 11] !== null ? (((s50[n - 1] as number) - (s50[n - 11] as number)) / (s50[n - 11] as number) / 10) * 100 : null;
  const m = macd(closes);
  const cross = lastMacdCross(m);
  const bb = bollinger(closes, 20, 2);
  const a = atr(bars, 14);
  const v = i.vol[i.vol.length - 1];
  const yearAgo = addDays(last.date, -365);
  const divs = i.dividends.filter((d) => d.exDate > yearAgo && d.exDate <= last.date);
  const divYield = last.close > 0 ? divs.reduce((s, d) => s + d.amount, 0) / last.close : 0;
  const nextExDiv = i.dividends.filter((d) => d.exDate > last.date).sort((x, y) => (x.exDate < y.exDate ? -1 : 1))[0] ?? null;
  return {
    date: last.date,
    spot: last.close,
    rsi: r[n - 1] ?? null,
    sma50Slope: slope,
    sma50: s50[n - 1] ?? null,
    sma200: s200[n - 1] ?? null,
    macdCrossDaysAgo: cross ? n - 1 - cross.index : null,
    macdCrossDir: cross ? cross.dir : null,
    bollingerUpper: bb[n - 1]?.upper ?? null,
    bollingerLower: bb[n - 1]?.lower ?? null,
    trend5d: n > 5 ? (closes[n - 1] / closes[n - 6] - 1) * 100 : null,
    atr: a[n - 1] ?? null,
    ivr: v?.ivr ?? null,
    ivp: v?.ivp ?? null,
    iv30: v?.iv30 ?? null,
    hv20: v?.hv20 ?? null,
    nextEarnings: i.upcomingEarnings.slice().sort((x, y) => (x.date < y.date ? -1 : 1))[0] ?? null,
    lastEarnings: i.pastEarnings.slice().sort((x, y) => (x.date < y.date ? 1 : -1))[0] ?? null,
    nextExDiv,
    divYield,
    macroAhead: i.macro.filter((mm) => mm.date > last.date && diffDays(last.date, mm.date) <= 70),
    vix: i.vix,
  };
}
