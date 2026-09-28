/**
 * The news brief: a one-screen summary of where the market and the news stand on a card,
 * so a player can form a view without researching a made-up company.
 *
 * It is built only from what the MarketView has revealed (bars up to today, past earnings with
 * their outcomes, scheduled dates ahead, VIX and the benchmark up to today). Nothing here
 * predicts; the "street read" is the crowd's view from trend, momentum and recent news, and it
 * can be wrong exactly the way the crowd is. Headline wording is seeded per event, so the same
 * event always reads the same and no game randomness is consumed.
 */

import { diffDays, type ISODate } from '../calendar';
import { atr, rsi, sma } from '../market/indicators';
import type { EarningsScheduleItem } from '../market/source';
import type { Bar, Dividend, EarningsEvent, MacroEvent, VixBar, VolPoint } from '../market/types';
import type { MarketView } from '../market/view';
import { Rng } from '../rng';
import {
  earningsMagnitude,
  macroMagnitude,
  pctText,
  templateHeadlines,
  type HeadlineEvent,
  type HeadlineKind,
  type HeadlineProvider,
} from '../../content/headlines';

export type Lean = -2 | -1 | 0 | 1 | 2;

export const LEAN_LABEL: Record<Lean, string> = {
  2: 'BULLISH',
  1: 'LEANS BULLISH',
  0: 'MIXED',
  [-1]: 'LEANS BEARISH',
  [-2]: 'BEARISH',
};

export interface BriefReason {
  /** Positive pushes the read bullish, negative bearish. */
  weight: number;
  text: string;
}

export interface BriefHeadline {
  /** Trading days ago (0 = today). */
  ago: number;
  kind: HeadlineKind;
  text: string;
  tone: 'up' | 'down' | 'info';
}

export interface BriefEvent {
  kind: 'earnings' | 'exdiv' | 'FOMC' | 'CPI';
  /** Calendar days ahead. */
  inDays: number;
  text: string;
}

export interface NewsBrief {
  asOf: ISODate;
  symbol: string;
  street: { lean: Lean; label: string; score: number; reasons: BriefReason[] };
  market: { lean: Lean; text: string; spy20: number | null; vix: number | null };
  /** Short plain facts about the stock's own price action. */
  trend: string[];
  /** The options market in plain words (always the expected move; IV detail when unlocked). */
  options: string | null;
  upcoming: BriefEvent[];
  headlines: BriefHeadline[];
}

/** What this player may see. Sandbox shows everything; Career unlocks detail through analysts. */
export interface BriefAccess {
  /** The exact earnings date and last report's implied move (else "in about N weeks"). */
  earningsDetail: boolean;
  /** IV rank and IV against realized volatility. */
  ivDetail: boolean;
}

export const FULL_ACCESS: BriefAccess = { earningsDetail: true, ivDetail: true };

export interface BriefInput {
  now: ISODate;
  symbol: string;
  /** Display bars (blind-transformed), oldest first, the last one is today. */
  bars: Bar[];
  benchmark: Bar[];
  vix: VixBar[];
  vol: VolPoint[];
  upcomingEarnings: EarningsScheduleItem[];
  pastEarnings: EarningsEvent[];
  dividends: Dividend[];
  macro: MacroEvent[];
  /** Blind cards (and invented companies) get the satirical desk; real names get plain facts. */
  mode: 'blind' | 'open';
  /** The chart is mirrored (drills and modeled markets only). */
  flipped?: boolean;
  access?: BriefAccess;
  headlines?: HeadlineProvider;
}

/** How many trading days of news the brief looks back over. */
export const NEWS_LOOKBACK = 30;
const MAX_HEADLINES = 6;
const YEAR = 252;
const GAP_ATR = 2;
const VOLUME_SURGE = 2.5;
const STREAK = 5;

const PRIORITY: Record<HeadlineKind, number> = {
  earnings: 9,
  gap: 8,
  cross: 7,
  high: 6,
  low: 6,
  volume: 5,
  fomc: 4,
  cpi: 4,
  streak: 3,
  vix: 2,
  exdiv: 1,
};

const pct1 = (x: number): string => pctText(x);
const inDaysText = (d: number): string => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);

function leanOf(score: number): Lean {
  return score >= 2.5 ? 2 : score >= 1 ? 1 : score <= -2.5 ? -2 : score <= -1 ? -1 : 0;
}

function lastNum(s: (number | null)[], back = 0): number | null {
  return s[s.length - 1 - back] ?? null;
}

function ret(bars: Bar[], n: number): number | null {
  const k = bars.length - 1;
  return k - n >= 0 ? bars[k].close / bars[k - n].close - 1 : null;
}

// ---------------- the market backdrop ----------------

function marketRead(i: BriefInput): {
  lean: Lean;
  text: string;
  spy20: number | null;
  vix: number | null;
  reasons: BriefReason[];
} {
  const reasons: BriefReason[] = [];
  const spy20 = ret(i.benchmark, 20);
  const vix = i.vix.length ? i.vix[i.vix.length - 1].close : null;
  const parts: string[] = [];
  let score = 0;
  if (spy20 !== null) {
    const closes = i.benchmark.map((b) => b.close);
    const s50 = lastNum(sma(closes, 50));
    const above = s50 !== null ? closes[closes.length - 1] >= s50 : null;
    parts.push(
      `SPY ${pct1(spy20)} this month${above === null ? '' : above ? ', above its 50-day' : ', below its 50-day'}`,
    );
    if (spy20 > 0.03) {
      score += 0.5;
      reasons.push({ weight: 0.5, text: `The market is rising (SPY ${pct1(spy20)} this month)` });
    } else if (spy20 < -0.03) {
      score -= 0.5;
      reasons.push({ weight: -0.5, text: `The market is falling (SPY ${pct1(spy20)} this month)` });
    }
  }
  if (vix !== null) {
    const mood = vix < 15 ? 'calm' : vix < 20 ? 'normal' : vix < 30 ? 'nervous' : 'fearful';
    parts.push(`fear gauge ${mood} (VIX ${vix.toFixed(1)})`);
    if (vix >= 30) {
      score -= 0.5;
      reasons.push({ weight: -0.5, text: `Fear is high across the market (VIX ${vix.toFixed(0)})` });
    }
  }
  const text = parts.length ? `${parts.join('; ')}.` : 'No market data for this day.';
  return { lean: leanOf(score * 2), text: text[0].toUpperCase() + text.slice(1), spy20, vix, reasons };
}

// ---------------- the stock's own trend ----------------

function trendRead(bars: Bar[]): { facts: string[]; reasons: BriefReason[] } {
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const facts: string[] = [];
  const reasons: BriefReason[] = [];
  const spot = closes[n - 1];
  const r5 = ret(bars, 5);
  const r20 = ret(bars, 20);
  if (r5 !== null && r20 !== null) facts.push(`${pct1(r5)} in 5 days, ${pct1(r20)} in a month`);
  if (r20 !== null) {
    if (r20 > 0.08) reasons.push({ weight: 1, text: `Strong month: ${pct1(r20)}` });
    else if (r20 > 0.03) reasons.push({ weight: 0.5, text: `Up ${pct1(r20).slice(1)} in a month` });
    else if (r20 < -0.08) reasons.push({ weight: -1, text: `Rough month: ${pct1(r20)}` });
    else if (r20 < -0.03) reasons.push({ weight: -0.5, text: `Down ${pct1(r20).slice(1)} in a month` });
  }
  const s50 = lastNum(sma(closes, 50));
  const s200 = lastNum(sma(closes, 200));
  if (s50 !== null && s200 !== null) {
    const a50 = spot >= s50;
    const up = s50 >= s200;
    if (a50 && up) {
      facts.push('Uptrend: above its 50- and 200-day averages');
      reasons.push({ weight: 1.5, text: 'Uptrend: above its 50- and 200-day averages' });
    } else if (!a50 && !up) {
      facts.push('Downtrend: below its 50- and 200-day averages');
      reasons.push({ weight: -1.5, text: 'Downtrend: below its 50- and 200-day averages' });
    } else if (a50) {
      facts.push('Back above its 50-day, still in a longer downtrend');
      reasons.push({ weight: 0.5, text: 'Bouncing above its 50-day average' });
    } else {
      facts.push('Dipped below its 50-day, still in a longer uptrend');
      reasons.push({ weight: -0.5, text: 'Pulling back below its 50-day average' });
    }
  } else if (s50 !== null) {
    const a50 = spot >= s50;
    facts.push(a50 ? 'Above its 50-day average' : 'Below its 50-day average');
    reasons.push({
      weight: a50 ? 1 : -1,
      text: a50 ? 'Above its 50-day average' : 'Below its 50-day average',
    });
  }
  const r = lastNum(rsi(closes, 14));
  if (r !== null) {
    if (r >= 70) {
      facts.push(`RSI ${r.toFixed(0)}: overbought, stretched`);
      reasons.push({ weight: -0.5, text: `Stretched: RSI ${r.toFixed(0)} is overbought` });
    } else if (r <= 30) {
      facts.push(`RSI ${r.toFixed(0)}: oversold, washed out`);
      reasons.push({ weight: 0.5, text: `Washed out: RSI ${r.toFixed(0)} is oversold` });
    } else facts.push(`RSI ${r.toFixed(0)}: neutral`);
  }
  if (n > YEAR) {
    const yr = closes.slice(n - YEAR);
    const hi = Math.max(...yr);
    const lo = Math.min(...yr);
    const pos = hi > lo ? (spot - lo) / (hi - lo) : 0.5;
    if (spot >= hi * 0.97) {
      facts.push('Near its 52-week high');
      reasons.push({ weight: 0.5, text: 'Trading near its 52-week high' });
    } else if (spot <= lo * 1.03) {
      facts.push('Near its 52-week low');
      reasons.push({ weight: -0.5, text: 'Trading near its 52-week low' });
    } else facts.push(`${Math.round(pos * 100)}% up its 52-week range`);
  }
  return { facts, reasons };
}

// ---------------- recent news ----------------

interface RawNews {
  index: number;
  event: HeadlineEvent;
  weight: number;
  reason: string | null;
}

function newsEvents(i: BriefInput): RawNews[] {
  const bars = i.bars;
  const n = bars.length;
  if (n < 2) return [];
  const closes = bars.map((b) => b.close);
  const ranges = atr(bars, 14);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const from = Math.max(1, n - NEWS_LOOKBACK);
  const out: RawNews[] = [];
  const earningsByReaction = new Map(i.pastEarnings.map((e) => [e.reactionDate, e] as const));
  const macroByDate = new Map(i.macro.filter((m) => m.date <= i.now).map((m) => [m.date, m] as const));
  let lastHigh = -99;
  let lastLow = -99;
  for (let k = from; k < n; k++) {
    const b = bars[k];
    const prev = bars[k - 1];
    const move = b.close / prev.close - 1;
    const dir = move >= 0 ? 'up' : 'down';
    const base = { sym: i.symbol, move: pctText(move), absmove: pctText(Math.abs(move), false) };
    const recent = k >= n - 10;
    const ern = earningsByReaction.get(b.date);
    const a = ranges[k - 1];
    const gap = a && a > 0 ? Math.abs(b.open - prev.close) / a : 0;
    if (ern) {
      // A mirrored chart (drills) reports the move it shows, not the real one.
      const mv = i.flipped || ern.movePct === null ? move * 100 : ern.movePct;
      const implied = ern.impliedMovePct;
      const mag = earningsMagnitude(mv, implied);
      // News outweighs the chart: a reaction beyond the priced move is the loudest signal there
      // is, while a small one inside it says little either way.
      const big = mag === 'blowout' ? 2 : mag === 'beyond' ? 1.5 : Math.abs(mv) >= 2 ? 0.5 : 0;
      out.push({
        index: k,
        event: {
          kind: 'earnings',
          magnitude: mag,
          direction: mv >= 0 ? 'up' : 'down',
          vars: {
            ...base,
            move: pctText(mv / 100),
            absmove: pctText(Math.abs(mv) / 100, false),
            implied: implied ? `±${implied.toFixed(1)}%` : 'an unknown amount',
            ratio: implied ? `${(Math.abs(mv) / implied).toFixed(1)}x` : 'several times',
          },
        },
        weight: mv >= 0 ? big : -big,
        reason:
          mag === 'inside'
            ? `${mv >= 0 ? 'Rose' : 'Fell'} ${pctText(Math.abs(mv) / 100, false)} on its last earnings`
            : `${mv >= 0 ? 'Rallied' : 'Sold off'} ${pctText(Math.abs(mv) / 100, false)} on its last earnings, more than the options priced`,
      });
    } else if (gap > GAP_ATR) {
      out.push({
        index: k,
        event: {
          kind: 'gap',
          magnitude: gap > 3 ? 'huge' : 'big',
          direction: b.open >= prev.close ? 'up' : 'down',
          vars: { ...base, gap: gap.toFixed(1) },
        },
        weight: recent ? (b.open >= prev.close ? 0.5 : -0.5) : 0,
        reason: recent ? `Gapped ${b.open >= prev.close ? 'up' : 'down'} hard without scheduled news` : null,
      });
    } else if (k >= 20 && Math.abs(move) >= 0.015) {
      const avgVol = bars.slice(k - 20, k).reduce((s, x) => s + x.volume, 0) / 20;
      const x = avgVol > 0 ? b.volume / avgVol : 0;
      if (x >= VOLUME_SURGE)
        out.push({
          index: k,
          event: {
            kind: 'volume',
            magnitude: 'surge',
            direction: dir,
            vars: { ...base, volx: `${x.toFixed(1)}x` },
          },
          weight: recent ? (dir === 'up' ? 0.5 : -0.5) : 0,
          reason: recent
            ? `Heavy ${dir === 'up' ? 'buying' : 'selling'}: ${x.toFixed(1)}x normal volume`
            : null,
        });
    }
    const macro = macroByDate.get(b.date);
    if (macro && Math.abs(move) >= 0.01)
      out.push({
        index: k,
        event: {
          kind: macro.kind === 'FOMC' ? 'fomc' : 'cpi',
          magnitude: macroMagnitude(move),
          direction: dir,
          vars: { ...base, event: macro.kind },
        },
        weight: 0,
        reason: null,
      });
    if (k > YEAR) {
      const yr = closes.slice(k - YEAR, k);
      if (b.close > Math.max(...yr)) {
        if (k - lastHigh > 10)
          out.push({
            index: k,
            event: { kind: 'high', magnitude: 'new', direction: 'up', vars: base },
            weight: 0,
            reason: null,
          });
        lastHigh = k;
      } else if (b.close < Math.min(...yr)) {
        if (k - lastLow > 10)
          out.push({
            index: k,
            event: { kind: 'low', magnitude: 'new', direction: 'down', vars: base },
            weight: 0,
            reason: null,
          });
        lastLow = k;
      }
    }
    const f0 = s50[k - 1];
    const t0 = s200[k - 1];
    const f1 = s50[k];
    const t1 = s200[k];
    if (f0 !== null && t0 !== null && f1 !== null && t1 !== null && f0 - t0 < 0 !== f1 - t1 < 0) {
      const up = f1 >= t1;
      out.push({
        index: k,
        event: {
          kind: 'cross',
          magnitude: up ? 'golden' : 'death',
          direction: up ? 'up' : 'down',
          vars: { ...base, side: up ? 'above' : 'below' },
        },
        weight: up ? 0.5 : -0.5,
        reason: up
          ? 'Golden cross: the 50-day just crossed above the 200-day'
          : 'Death cross: the 50-day just crossed below the 200-day',
      });
    }
    // A streak is reported where it ends (or today, if it is still running).
    const upDay = (j: number): boolean => bars[j].close > bars[j - 1].close;
    const sameAsNext = k + 1 < n && upDay(k + 1) === upDay(k) && bars[k + 1].close !== bars[k].close;
    if (!sameAsNext) {
      let len = 0;
      for (let j = k; j >= 1 && upDay(j) === upDay(k) && bars[j].close !== bars[j - 1].close; j--) len++;
      if (len >= STREAK) {
        const start = bars[k - len].close;
        const runMove = b.close / start - 1;
        out.push({
          index: k,
          event: {
            kind: 'streak',
            magnitude: 'run',
            direction: upDay(k) ? 'up' : 'down',
            vars: {
              ...base,
              days: String(len),
              move: pctText(runMove),
              absmove: pctText(Math.abs(runMove), false),
            },
          },
          weight: k === n - 1 ? (upDay(k) ? 0.5 : -0.5) : 0,
          reason: k === n - 1 ? `${upDay(k) ? 'Up' : 'Down'} ${len} days in a row` : null,
        });
      }
    }
  }
  // A VIX spike is market-wide news; report the latest one in the window.
  const vix = i.vix;
  const start = bars[from]?.date ?? i.now;
  for (let k = vix.length - 1; k >= 7 && vix[k].date >= start; k--) {
    const chg = vix[k].close / vix[k - 5].close - 1;
    const prevChg = vix[k - 1].close / vix[k - 6].close - 1;
    if (chg >= 0.2 && prevChg < 0.2) {
      const idx = bars.findIndex((b) => b.date === vix[k].date);
      if (idx >= 0)
        out.push({
          index: idx,
          event: {
            kind: 'vix',
            magnitude: vix[k].close >= 35 ? 'panic' : 'spike',
            direction: 'up',
            vars: {
              sym: i.symbol,
              move: '',
              absmove: '',
              vix: vix[k].close.toFixed(1),
              vixchg: pctText(chg),
            },
          },
          weight: 0,
          reason: null,
        });
      break;
    }
  }
  return out;
}

// ---------------- scheduled events ahead ----------------

function upcoming(i: BriefInput, access: BriefAccess, spot: number): BriefEvent[] {
  const out: BriefEvent[] = [];
  const next = i.upcomingEarnings
    .filter((e) => e.reactionDate > i.now)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (next) {
    const d = Math.max(0, diffDays(i.now, next.date));
    if (d <= 60) {
      const when = next.timing === 'BMO' ? 'before the open' : next.timing === 'AMC' ? 'after the close' : '';
      out.push({
        kind: 'earnings',
        inDays: d,
        text: access.earningsDetail
          ? `Earnings ${inDaysText(d)}${when ? `, ${when}` : ''}`
          : d < 7
            ? 'Earnings within a week'
            : `Earnings in about ${Math.round(d / 7)} week${Math.round(d / 7) === 1 ? '' : 's'}`,
      });
    }
  }
  const div = i.dividends.filter((x) => x.exDate > i.now).sort((a, b) => (a.exDate < b.exDate ? -1 : 1))[0];
  if (div) {
    const d = diffDays(i.now, div.exDate);
    if (d <= 45)
      out.push({
        kind: 'exdiv',
        inDays: d,
        text: `Ex-dividend ${inDaysText(d)} (${pctText(spot > 0 ? div.amount / spot : 0, false)} of the price)`,
      });
  }
  for (const kind of ['FOMC', 'CPI'] as const) {
    const m = i.macro
      .filter((x) => x.kind === kind && x.date > i.now)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (!m) continue;
    const d = diffDays(i.now, m.date);
    if (d <= 30)
      out.push({
        kind,
        inDays: d,
        text: `${kind === 'FOMC' ? 'Fed decision' : 'CPI inflation report'} ${inDaysText(d)}`,
      });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

function optionsRead(i: BriefInput, access: BriefAccess): string | null {
  const v = i.vol[i.vol.length - 1];
  if (!v?.iv30) return null;
  const em = v.iv30 * Math.sqrt(30 / 365);
  let s = `Options price about a ±${(em * 100).toFixed(1)}% move over the next month`;
  if (access.ivDetail) {
    if (v.ivr !== null)
      s += `; IV rank ${v.ivr.toFixed(0)} (${v.ivr >= 50 ? 'premium is expensive' : v.ivr <= 20 ? 'premium is cheap' : 'middling premium'})`;
    if (v.hv20 !== null)
      s += `; ${v.iv30 > v.hv20 * 1.1 ? 'richer than' : v.iv30 < v.hv20 * 0.9 ? 'cheaper than' : 'in line with'} how much it has actually moved`;
  }
  return `${s}.`;
}

/** Build the brief from data already visible on the clock. Pure and deterministic. */
export function buildBrief(i: BriefInput): NewsBrief {
  const access = i.access ?? FULL_ACCESS;
  const provider = i.headlines ?? templateHeadlines;
  const bars = i.bars;
  const n = bars.length;
  const spot = bars[n - 1]?.close ?? 0;
  const market = marketRead(i);
  const trend = trendRead(bars);
  const news = newsEvents(i);
  const reasons: BriefReason[] = [
    ...trend.reasons,
    ...market.reasons,
    ...news
      .filter((x) => x.reason && x.weight !== 0)
      .map((x) => ({ weight: x.weight, text: x.reason as string })),
  ];
  const score = reasons.reduce((s, r) => s + r.weight, 0);
  const lean = leanOf(score);
  // Lead with what drives the read; a mixed read shows both sides.
  const ranked = reasons.slice().sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const top =
    lean === 0
      ? [...ranked.filter((r) => r.weight > 0).slice(0, 2), ...ranked.filter((r) => r.weight < 0).slice(0, 2)]
          .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
          .slice(0, 3)
      : [
          ...ranked.filter((r) => Math.sign(r.weight) === Math.sign(lean)).slice(0, 2),
          ...ranked.filter((r) => Math.sign(r.weight) !== Math.sign(lean)).slice(0, 1),
        ].slice(0, 3);
  const chosen = news
    .slice()
    .sort((a, b) => PRIORITY[b.event.kind] - PRIORITY[a.event.kind] || b.index - a.index)
    .slice(0, MAX_HEADLINES)
    .sort((a, b) => b.index - a.index);
  const headlines: BriefHeadline[] = chosen.map((x) => ({
    ago: n - 1 - x.index,
    kind: x.event.kind,
    tone: x.event.direction === 'up' ? 'up' : x.event.direction === 'down' ? 'down' : 'info',
    text: provider.headline(
      x.event,
      new Rng(`brief:${i.symbol}:${bars[x.index].date}:${x.event.kind}`),
      i.mode,
    ),
  }));
  return {
    asOf: i.now,
    symbol: i.symbol,
    street: { lean, label: LEAN_LABEL[lean], score: Math.round(score * 10) / 10, reasons: top },
    market: { lean: market.lean, text: market.text, spy20: market.spy20, vix: market.vix },
    trend: trend.facts,
    options: optionsRead(i, access),
    upcoming: upcoming(i, access, spot),
    headlines,
  };
}

/** The brief for a card, read through its time-gated view. */
export function briefFromView(
  view: MarketView,
  opts: { mode: 'blind' | 'open'; access?: BriefAccess; headlines?: HeadlineProvider },
): NewsBrief {
  const e = view.earnings();
  return buildBrief({
    now: view.now,
    symbol: view.transform.displaySymbol,
    bars: view.bars(),
    benchmark: view.benchmarkBars(),
    vix: view.vix(),
    vol: view.vol(),
    upcomingEarnings: e.upcoming,
    pastEarnings: e.past,
    dividends: view.dividends(),
    macro: view.macro(),
    mode: opts.mode,
    flipped: view.transform.flipBars,
    access: opts.access,
    headlines: opts.headlines,
  });
}
