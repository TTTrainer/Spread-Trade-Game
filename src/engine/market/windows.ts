/**
 * Windows are the dealable moments: one ticker, one entry day with a real chain,
 * at least a year of bars behind it and up to 50 trading days ahead.
 * Regime tags let Reviews deal matching setups. Some tags (gaps, earnings inside the
 * window) describe the future; only the dealer reads them, never the player.
 */

import { addDays, type ISODate } from '../calendar';
import { adx, atr, sma } from './indicators';
import type { Bar, MacroEvent, RegimeTags, Split, VolPoint, WindowDef } from './types';

export const WINDOW_FORWARD_DAYS = 50;
export const WINDOW_MIN_HISTORY = 252;

export interface WindowBuildInput {
  symbol: string;
  bars: Bar[];
  hasChain: (date: ISODate) => boolean;
  splits: Split[];
  earningsReactionDates: ISODate[];
  exDivDates: ISODate[];
  macro: MacroEvent[];
  vixClose: (date: ISODate) => number | null;
  vol: (date: ISODate) => VolPoint | null;
  spreadPct: (date: ISODate) => number | null;
  forwardDays?: number;
  minHistory?: number;
  step?: number;
}

export type RawWindow = Omit<WindowDef, 'id' | 'weight' | 'recent'> & { tags: RegimeTags };

export function buildSymbolWindows(inp: WindowBuildInput): RawWindow[] {
  const fwd = inp.forwardDays ?? WINDOW_FORWARD_DAYS;
  const hist = inp.minHistory ?? WINDOW_MIN_HISTORY;
  const step = inp.step ?? 1;
  const bars = inp.bars;
  const n = bars.length;
  if (n < hist + fwd + 1) return [];
  // Indicator values at index i depend only on bars 0..i, so computing them once is leak-free.
  const adxS = adx(bars, 14);
  const atrS = atr(bars, 14);
  const sma50 = sma(
    bars.map((b) => b.close),
    50,
  );
  const fomc = inp.macro.filter((m) => m.kind === 'FOMC').map((m) => m.date);
  const out: RawWindow[] = [];
  for (let i = hist; i + fwd < n; i += step) {
    const entry = bars[i].date;
    if (!inp.hasChain(entry)) continue;
    const start = bars[i - hist].date;
    const end = bars[i + fwd].date;
    // Prices and chains are unadjusted, so a split inside the window would look like a crash.
    if (inp.splits.some((s) => s.exDate > start && s.exDate <= end)) continue;
    let maxGap = 0;
    for (let j = i + 1; j <= i + fwd; j++) {
      const a = atrS[j - 1];
      if (a && a > 0) maxGap = Math.max(maxGap, Math.abs(bars[j].open - bars[j - 1].close) / a);
    }
    const vol = inp.vol(entry);
    const tags: RegimeTags = {
      adx: round2(adxS[i] ?? 20),
      trendSlope: round4(slopeAt(sma50, i, 10)),
      vix: round2(inp.vixClose(entry) ?? 20),
      ivr: round2(vol?.ivr ?? 50),
      hasEarnings: inp.earningsReactionDates.some((d) => d > entry && d <= end),
      hasExDiv: inp.exDivDates.some((d) => d > entry && d <= end),
      hasFomc: fomc.some((d) => d > entry && d <= end),
      maxGapAtr: round2(maxGap),
      spreadPct: round4(inp.spreadPct(entry) ?? 0.05),
      spreadDecile: 0,
    };
    out.push({
      symbol: inp.symbol,
      historyStart: start,
      entryDate: entry,
      endDate: end,
      forwardDays: fwd,
      tags,
    });
  }
  return out;
}

/** Assign ids, spread deciles across the whole set, and dealing weights (75% recent / 25% older). */
export function finalizeWindows(raw: RawWindow[], lastDate: ISODate, recentYears = 3): WindowDef[] {
  const recentFrom = addDays(lastDate, -Math.round(365.25 * recentYears));
  const spreads = raw.map((w) => w.tags.spreadPct).sort((a, b) => a - b);
  const decileOf = (x: number): number => {
    if (spreads.length === 0) return 0;
    let lo = 0;
    let hi = spreads.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (spreads[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(9, Math.floor((lo / spreads.length) * 10));
  };
  const nRecent = raw.filter((w) => w.entryDate >= recentFrom).length;
  const nOld = raw.length - nRecent;
  const recentShare = nOld === 0 ? 1 : nRecent === 0 ? 0 : 0.75;
  return raw.map((w, i) => {
    const recent = w.entryDate >= recentFrom;
    const weight = recent ? recentShare / Math.max(1, nRecent) : (1 - recentShare) / Math.max(1, nOld);
    return { ...w, id: i + 1, recent, weight, tags: { ...w.tags, spreadDecile: decileOf(w.tags.spreadPct) } };
  });
}

function slopeAt(s: (number | null)[], i: number, lookback: number): number {
  const a = s[i];
  const b = s[i - lookback];
  if (a === null || b === null || b === undefined || b === 0) return 0;
  return ((a - b) / b / lookback) * 100;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
