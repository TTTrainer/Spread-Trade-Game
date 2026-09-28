/**
 * Drills: short, focused reps on one skill each. Questions are dealt from real windows. The
 * question shows only data up to its date; the answer is revealed by advancing the same
 * time-gated MarketView after the player commits, so even the dealer never peeks early.
 * Only Drills adapt to the player's weak spots (Career never does).
 */

import { diffDays, type ISODate } from '../calendar';
import { bollinger, rsi, sma } from '../market/indicators';
import { asOf, type MarketDataSource } from '../market/source';
import { blindTransform } from '../market/transform';
import type { Bar, WindowDef } from '../market/types';
import { MarketView } from '../market/view';
import { bsm } from '../pricing/bsm';
import type { Rng } from '../rng';
import { brier, bucketOf, cutoffs, type Bucket } from '../scoring/calls';
import { expirationsOf, findQuote, nearestStrike } from '../strategies/structures';
import { expectedMove } from '../strategies/metrics';

export type DrillKind = 'blind_call' | 'guess_iv' | 'greeks' | 'setup' | 'em_darts';

export const DRILL_INFO: Record<DrillKind, { name: string; blurb: string; skill: string; seconds: number }> = {
  blind_call: { name: '60-Second Blind Call', blurb: 'A blind chart, a ticking clock. Call the next 10 days and how sure you are.', skill: 'Calling direction', seconds: 60 },
  guess_iv: { name: 'Guess the IV', blurb: 'Read the chart and the option prices. What implied volatility is the market charging?', skill: 'Volatility sense', seconds: 45 },
  greeks: { name: 'Greeks Speed Round', blurb: 'A position, a move, a few days. What is the P/L now?', skill: 'Greeks intuition', seconds: 25 },
  setup: { name: 'Spot the Setup', blurb: 'RSI divergence, Bollinger squeeze, trend break, or nothing at all?', skill: 'Reading charts', seconds: 40 },
  em_darts: { name: 'Expected Move Darts', blurb: 'Drag a range where the stock will finish. Tighter ranges score more, misses score nothing.', skill: 'Expected move', seconds: 45 },
};

export const DRILL_KINDS: DrillKind[] = ['blind_call', 'guess_iv', 'greeks', 'setup', 'em_darts'];
export const DRILL_HORIZON = 10;

interface Base {
  id: string;
  kind: DrillKind;
  windowId: number;
  displaySymbol: string;
  realSymbol: string;
  date: ISODate;
  bars: Bar[]; // what the player sees (transformed, maybe flipped)
  flipped: boolean;
}

export interface BlindCallQ extends Base {
  kind: 'blind_call';
  emPct: number; // expected move over the horizon
  regime: 'calm' | 'volatile' | 'trending' | 'choppy';
}
export interface GuessIvQ extends Base {
  kind: 'guess_iv';
  expiration: ISODate;
  dte: number;
  strike: number;
  callMid: number;
  putMid: number;
  hv20: number | null;
  answerIv: number;
}
export interface GreeksQ extends Base {
  kind: 'greeks';
  description: string;
  greeks: { delta: number; gamma: number; theta: number; vega: number };
  move: number; // $ move in the stock
  days: number;
  ivPts: number;
  choices: number[]; // dollars
  answerIndex: number;
}
export type SetupKind = 'rsi_bull_div' | 'rsi_bear_div' | 'bb_squeeze' | 'trend_break_down' | 'trend_break_up' | 'none';
export const SETUP_LABELS: Record<SetupKind, string> = {
  rsi_bull_div: 'Bullish RSI divergence',
  rsi_bear_div: 'Bearish RSI divergence',
  bb_squeeze: 'Bollinger squeeze',
  trend_break_down: 'Uptrend break (below the 50-day)',
  trend_break_up: 'Downtrend break (above the 50-day)',
  none: 'No clear setup',
};
export interface SetupQ extends Base {
  kind: 'setup';
  answer: SetupKind;
  choices: SetupKind[];
}
export interface DartsQ extends Base {
  kind: 'em_darts';
  expiration: ISODate;
  dte: number;
  em: number; // dollars, displayed scale
  spot: number;
}

export type DrillQuestion = BlindCallQ | GuessIvQ | GreeksQ | SetupQ | DartsQ;

export type DrillAnswer =
  | { kind: 'blind_call'; bucket: Bucket | null; confidence: number }
  | { kind: 'guess_iv'; iv: number }
  | { kind: 'greeks'; index: number | null }
  | { kind: 'setup'; choice: SetupKind | null }
  | { kind: 'em_darts'; low: number; high: number };

export interface DrillResult {
  questionId: string;
  kind: DrillKind;
  correct: boolean;
  score: number; // 0..100
  detail: Record<string, number | string | boolean | null>;
  revealBars: Bar[];
  explanation: string;
  brier?: number;
}

// ---------- detectors (used to find Spot-the-Setup questions; all backward-looking) ----------

export function detectSetup(bars: Bar[]): SetupKind {
  const n = bars.length;
  if (n < 130) return 'none';
  const closes = bars.map((b) => b.close);
  const band = bollinger(closes, 20, 2);
  const widths = band.map((b) => (b.upper !== null && b.lower !== null && b.mid ? (b.upper - b.lower) / b.mid : null));
  const recent = widths.slice(-120).filter((x): x is number => x !== null);
  const w = widths[n - 1];
  if (w !== null && recent.length > 60 && recent.filter((x) => x < w).length / recent.length <= 0.04) return 'bb_squeeze';
  const s50 = sma(closes, 50);
  const slopeUp = (s50[n - 2] ?? 0) > (s50[n - 22] ?? Infinity);
  const slopeDown = (s50[n - 2] ?? Infinity) < (s50[n - 22] ?? 0);
  if (slopeUp && closes[n - 2] > (s50[n - 2] ?? 0) && closes[n - 1] < (s50[n - 1] ?? 0)) return 'trend_break_down';
  if (slopeDown && closes[n - 2] < (s50[n - 2] ?? Infinity) && closes[n - 1] > (s50[n - 1] ?? Infinity)) return 'trend_break_up';
  const r = rsi(closes, 14);
  // Divergence: the last 10 days vs the 10-30 days before.
  const a = { from: n - 30, to: n - 11 };
  const b = { from: n - 10, to: n - 1 };
  const maxIdx = (lo: number, hi: number) => {
    let k = lo;
    for (let i = lo; i <= hi; i++) if (closes[i] > closes[k]) k = i;
    return k;
  };
  const minIdx = (lo: number, hi: number) => {
    let k = lo;
    for (let i = lo; i <= hi; i++) if (closes[i] < closes[k]) k = i;
    return k;
  };
  const h1 = maxIdx(a.from, a.to);
  const h2 = maxIdx(b.from, b.to);
  if (closes[h2] > closes[h1] * 1.005 && (r[h2] ?? 50) < (r[h1] ?? 50) - 4 && (r[h1] ?? 0) > 60) return 'rsi_bear_div';
  const l1 = minIdx(a.from, a.to);
  const l2 = minIdx(b.from, b.to);
  if (closes[l2] < closes[l1] * 0.995 && (r[l2] ?? 50) > (r[l1] ?? 50) + 4 && (r[l1] ?? 100) < 40) return 'rsi_bull_div';
  return 'none';
}

// ---------- adaptation ----------

export interface DrillHistoryItem {
  kind: DrillKind;
  score: number;
  regime?: string;
}

/**
 * Weights for a mixed session: kinds with lower recent scores come up more often.
 * A kind never seen gets a neutral weight so everything is tried.
 */
export function adaptiveWeights(history: DrillHistoryItem[], window = 30): Record<DrillKind, number> {
  const out = {} as Record<DrillKind, number>;
  for (const k of DRILL_KINDS) {
    const recent = history.filter((h) => h.kind === k).slice(-window);
    const avg = recent.length ? recent.reduce((a, h) => a + h.score, 0) / recent.length : 50;
    out[k] = 0.4 + (100 - avg) / 100; // 0.4 .. 1.4
  }
  return out;
}

/** Blind calls lean toward the market regimes the player reads worst. */
export function adaptiveRegimeWeights(history: DrillHistoryItem[]): Record<BlindCallQ['regime'], number> {
  const regimes: BlindCallQ['regime'][] = ['calm', 'volatile', 'trending', 'choppy'];
  const out = {} as Record<BlindCallQ['regime'], number>;
  for (const r of regimes) {
    const xs = history.filter((h) => h.kind === 'blind_call' && h.regime === r).slice(-20);
    const avg = xs.length ? xs.reduce((a, h) => a + h.score, 0) / xs.length : 50;
    out[r] = 0.5 + (100 - avg) / 100;
  }
  return out;
}

export function regimeOf(w: WindowDef): BlindCallQ['regime'] {
  if (w.tags.adx >= 28) return 'trending';
  if (w.tags.adx < 18) return 'choppy';
  return w.tags.vix >= 22 || w.tags.ivr >= 60 ? 'volatile' : 'calm';
}

// ---------- the dealer ----------

export interface DrillDeps {
  source: MarketDataSource;
  windows: WindowDef[];
  rng: Rng;
  allowFlip: boolean;
  history: DrillHistoryItem[];
}

const views = new Map<string, MarketView>();

async function openView(d: DrillDeps, w: WindowDef, id: string, flip: boolean, rescale = true): Promise<MarketView> {
  const probe = await asOf(d.source, w.entryDate).bars(w.symbol, w.entryDate, w.entryDate);
  const t = { ...blindTransform(w.symbol, w.entryDate, probe[0]?.close ?? 100, d.rng.fork(`t:${id}`), rescale), flipBars: flip };
  const v = await MarketView.open({ source: d.source, window: w, transform: t, scheduleHorizonDays: 1 });
  views.set(id, v);
  return v;
}

function pickWindow(d: DrillDeps, weight?: (w: WindowDef) => number): WindowDef {
  return d.rng.weighted(d.windows, (w) => w.weight * (weight ? weight(w) : 1));
}

let qCounter = 0;

export async function dealQuestion(kind: DrillKind, d: DrillDeps): Promise<DrillQuestion> {
  const id = `q${++qCounter}-${kind}`;
  switch (kind) {
    case 'blind_call': {
      const rw = adaptiveRegimeWeights(d.history);
      const w = pickWindow(d, (x) => rw[regimeOf(x)]);
      const flip = d.allowFlip && d.rng.chance(0.4);
      const v = await openView(d, w, id, flip);
      const vol = v.vol();
      const iv = vol[vol.length - 1]?.iv30 ?? 0.3;
      return { id, kind, windowId: w.id, displaySymbol: v.publicWindow.displaySymbol, realSymbol: w.symbol, date: v.now, bars: v.bars().slice(-130), flipped: flip, emPct: iv * Math.sqrt(DRILL_HORIZON / 252) * 0.8, regime: regimeOf(w) };
    }
    case 'guess_iv': {
      const w = pickWindow(d);
      const v = await openView(d, w, id, false);
      const chain = await v.loadChain();
      const exp = expirationsOf(chain).find((e) => diffDays(chain.date, e) >= 25) ?? expirationsOf(chain).at(-1) ?? chain.date;
      const atm = nearestStrike(chain, exp, 'C', chain.spot);
      const c = atm ? findQuote(chain, { expiration: exp, strike: atm.strike, right: 'C' }) : undefined;
      const p = atm ? findQuote(chain, { expiration: exp, strike: atm.strike, right: 'P' }) : undefined;
      const vol = v.vol();
      return {
        id,
        kind,
        windowId: w.id,
        displaySymbol: v.publicWindow.displaySymbol,
        realSymbol: w.symbol,
        date: v.now,
        bars: v.bars().slice(-130),
        flipped: false,
        expiration: exp,
        dte: diffDays(chain.date, exp),
        strike: atm?.strike ?? chain.spot,
        callMid: c ? (c.bid + c.ask) / 2 : 0,
        putMid: p ? (p.bid + p.ask) / 2 : 0,
        hv20: vol[vol.length - 1]?.hv20 ?? null,
        answerIv: c && p ? (c.iv + p.iv) / 2 : 0.3,
      };
    }
    case 'greeks': {
      // A made-up but realistic position: the answer is a clean BSM reprice, no market data needed.
      const r = d.rng;
      const spot = Math.round(r.range(40, 300));
      const vol = r.pick([0.2, 0.3, 0.45, 0.6]);
      const dte = r.pick([10, 21, 35, 45]);
      const width = spot < 100 ? 5 : 10;
      const short = Math.round((spot * (1 - vol * Math.sqrt(dte / 365) * 0.5)) / width) * width;
      const long = short - width;
      const t = dte / 365;
      const price = (s: number, k: number, tt: number, v: number) => bsm({ right: 'P', spot: s, strike: k, t: tt, vol: v, rate: 0.04, divYield: 0 });
      const p0 = { s: price(spot, short, t, vol), l: price(spot, long, t, vol) };
      const greeks = {
        delta: (-p0.s.delta + p0.l.delta) * 100,
        gamma: (-p0.s.gamma + p0.l.gamma) * 100,
        theta: (-p0.s.theta + p0.l.theta) * 100,
        vega: (-p0.s.vega + p0.l.vega) * 100,
      };
      const move = Math.round(r.range(-0.07, 0.05) * spot * 2) / 2;
      const days = r.pick([1, 3, 5, 7]);
      const ivPts = r.pick([-8, -4, 0, 0, 4, 8]);
      const t1 = Math.max(0.5, dte - days) / 365;
      const v1 = Math.max(0.05, vol + ivPts / 100);
      const value0 = (p0.s.price - p0.l.price) * 100;
      const value1 = (price(spot + move, short, t1, v1).price - price(spot + move, long, t1, v1).price) * 100;
      const answer = Math.round(value0 - value1); // short the spread: gain when it gets cheaper
      const deltaOnly = Math.round(greeks.delta * move);
      const noTheta = Math.round(greeks.delta * move + 0.5 * greeks.gamma * move * move + greeks.vega * ivPts);
      const flipped = -answer;
      const set = new Set<number>([answer]);
      for (const x of [deltaOnly, noTheta, flipped, answer + Math.round(greeks.theta * days * 2) + 7, Math.round(answer * 1.6) + 11]) {
        if (set.size >= 4) break;
        if (!set.has(x) && Math.abs(x - answer) >= 5) set.add(x);
      }
      while (set.size < 4) set.add(answer + (set.size * 17 + 9) * (r.chance(0.5) ? 1 : -1));
      const choices = r.shuffle([...set]);
      return {
        id,
        kind,
        windowId: 0,
        displaySymbol: 'DRILL',
        realSymbol: 'DRILL',
        date: '',
        bars: [],
        flipped: false,
        description: `Short 1 ${short}/${long} bull put spread, stock at ${spot}, ${dte} DTE, IV ${Math.round(vol * 100)}%.`,
        greeks,
        move,
        days,
        ivPts,
        choices,
        answerIndex: choices.indexOf(answer),
      };
    }
    case 'setup': {
      // Look for a window whose entry shows a setup; about a quarter of questions have none.
      const wantNone = d.rng.chance(0.2);
      for (let attempt = 0; attempt < 60; attempt++) {
        const w = pickWindow(d);
        const hist = await asOf(d.source, w.entryDate).bars(w.symbol, w.historyStart, w.entryDate);
        const found = detectSetup(hist);
        if ((found === 'none') !== wantNone && attempt < 50) continue;
        const v = await openView(d, w, id, false);
        const others = (Object.keys(SETUP_LABELS) as SetupKind[]).filter((k) => k !== found);
        const choices = d.rng.shuffle([found, ...d.rng.shuffle(others).slice(0, 3)]);
        if (!choices.includes('none') && found !== 'none') choices[choices.length - 1] = 'none';
        return { id, kind, windowId: w.id, displaySymbol: v.publicWindow.displaySymbol, realSymbol: w.symbol, date: v.now, bars: v.bars().slice(-130), flipped: false, answer: found, choices: d.rng.shuffle(choices) };
      }
      throw new Error('No setup found');
    }
    case 'em_darts': {
      const w = pickWindow(d);
      const v = await openView(d, w, id, false);
      const chain = await v.loadChain();
      const exp = expirationsOf(chain).find((e) => diffDays(chain.date, e) >= 7 && diffDays(chain.date, e) <= 21) ?? expirationsOf(chain)[0];
      const em = expectedMove(chain, exp) ?? chain.spot * 0.05;
      return { id, kind, windowId: w.id, displaySymbol: v.publicWindow.displaySymbol, realSymbol: w.symbol, date: v.now, bars: v.bars().slice(-130), flipped: false, expiration: exp, dte: diffDays(chain.date, exp), em, spot: chain.spot };
    }
  }
}

async function advanceTo(v: MarketView, until: (v: MarketView) => boolean, max = 60): Promise<void> {
  for (let i = 0; i < max && !until(v); i++) if (!(await v.advance())) break;
}

/** Grade an answer. Answers that need the future advance the question's own view first. */
export async function gradeAnswer(q: DrillQuestion, a: DrillAnswer): Promise<DrillResult> {
  const v = views.get(q.id);
  switch (q.kind) {
    case 'blind_call': {
      const ans = a as Extract<DrillAnswer, { kind: 'blind_call' }>;
      if (!v) throw new Error('question view missing');
      const start = v.spot();
      await advanceTo(v, (x) => x.dayIndex >= DRILL_HORIZON);
      const end = v.spot();
      const move = end / start - 1;
      const actual = bucketOf(move, cutoffs({ emPct: q.emPct, mode: 'em' }));
      const bucket = ans.bucket;
      const exact = bucket !== null && bucket === actual;
      const adjacent = bucket !== null && Math.abs(bucket - actual) === 1;
      const b = bucket === null ? 1.2 : brier({ bucket, confidence: ans.confidence }, actual);
      const score = bucket === null ? 0 : Math.round(Math.max(0, 100 * (1 - b / 1.25)));
      return {
        questionId: q.id,
        kind: q.kind,
        correct: exact,
        score,
        brier: b,
        detail: { bucket, confidence: ans.confidence, actual, movePct: move, adjacent, regime: q.regime },
        revealBars: v.bars().slice(-(130 + DRILL_HORIZON)),
        explanation: `${q.flipped ? 'The chart was flipped. ' : ''}It moved ${(move * 100).toFixed(1)}% in ${DRILL_HORIZON} days against an expected move of ±${(q.emPct * 100).toFixed(1)}%.`,
      };
    }
    case 'guess_iv': {
      const ans = a as Extract<DrillAnswer, { kind: 'guess_iv' }>;
      const err = Math.abs(ans.iv - q.answerIv) * 100;
      const score = Math.round(Math.max(0, 100 - err * 5));
      const straddle = q.callMid + q.putMid;
      const spot = q.bars[q.bars.length - 1]?.close ?? q.strike;
      const rule = straddle / (0.8 * spot * Math.sqrt(q.dte / 365));
      return {
        questionId: q.id,
        kind: q.kind,
        correct: err <= 3,
        score,
        detail: { guess: ans.iv, answer: q.answerIv, errorPts: err },
        revealBars: q.bars,
        explanation: `The market was charging ${(q.answerIv * 100).toFixed(1)}% (you said ${(ans.iv * 100).toFixed(0)}%). Rule of thumb: IV ≈ straddle ÷ (0.8 × price × √(days/365)) = ${(rule * 100).toFixed(1)}%.`,
      };
    }
    case 'greeks': {
      const ans = a as Extract<DrillAnswer, { kind: 'greeks' }>;
      const correct = ans.index === q.answerIndex;
      const g = q.greeks;
      return {
        questionId: q.id,
        kind: q.kind,
        correct,
        score: correct ? 100 : 0,
        detail: { chosen: ans.index === null ? null : q.choices[ans.index], answer: q.choices[q.answerIndex] },
        revealBars: [],
        explanation: `Δ ${g.delta.toFixed(1)} × ${q.move.toFixed(2)} ≈ ${(g.delta * q.move).toFixed(0)}, Γ adds ${(0.5 * g.gamma * q.move * q.move).toFixed(0)}, Θ adds ${(g.theta * q.days).toFixed(0)} over ${q.days}d, vega ${(g.vega * q.ivPts).toFixed(0)} for ${q.ivPts > 0 ? '+' : ''}${q.ivPts} IV. Exact reprice: ${q.choices[q.answerIndex] >= 0 ? '+' : ''}$${q.choices[q.answerIndex]}.`,
      };
    }
    case 'setup': {
      const ans = a as Extract<DrillAnswer, { kind: 'setup' }>;
      const correct = ans.choice === q.answer;
      let after = '';
      let reveal = q.bars;
      if (v) {
        const s = v.spot();
        await advanceTo(v, (x) => x.dayIndex >= DRILL_HORIZON);
        after = ` Over the next ${DRILL_HORIZON} days it moved ${((v.spot() / s - 1) * 100).toFixed(1)}%.`;
        reveal = v.bars().slice(-(130 + DRILL_HORIZON));
      }
      return {
        questionId: q.id,
        kind: q.kind,
        correct,
        score: correct ? 100 : 0,
        detail: { chosen: ans.choice, answer: q.answer },
        revealBars: reveal,
        explanation: `It was: ${SETUP_LABELS[q.answer]}.${after}`,
      };
    }
    case 'em_darts': {
      const ans = a as Extract<DrillAnswer, { kind: 'em_darts' }>;
      if (!v) throw new Error('question view missing');
      await advanceTo(v, (x) => x.now >= q.expiration);
      const finish = v.spot();
      const lo = Math.min(ans.low, ans.high);
      const hi = Math.max(ans.low, ans.high);
      const inside = finish >= lo && finish <= hi;
      const width = Math.max(1e-6, hi - lo);
      const score = inside ? Math.round(Math.min(100, (100 * (2 * q.em)) / width)) : 0;
      return {
        questionId: q.id,
        kind: q.kind,
        correct: inside,
        score,
        detail: { low: lo, high: hi, finish, em: q.em },
        revealBars: v.bars().slice(-(130 + q.dte)),
        explanation: `It finished at ${finish.toFixed(2)}. The ±1 expected move was ${(q.spot - q.em).toFixed(2)}–${(q.spot + q.em).toFixed(2)}, which holds the price about two times in three.`,
      };
    }
  }
}

export function releaseQuestion(id: string): void {
  views.delete(id);
}

export interface DrillSummary {
  questions: number;
  correct: number;
  avgScore: number;
  bestStreak: number;
  meanBrier: number | null;
  byKind: Partial<Record<DrillKind, { n: number; avg: number }>>;
  calibration: { confidence: number; n: number; hitRate: number }[];
}

export function summarize(results: DrillResult[]): DrillSummary {
  let streak = 0;
  let best = 0;
  for (const r of results) {
    streak = r.correct ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  const briers = results.filter((r) => r.brier !== undefined).map((r) => r.brier as number);
  const byKind: DrillSummary['byKind'] = {};
  for (const r of results) {
    const cur = byKind[r.kind] ?? { n: 0, avg: 0 };
    byKind[r.kind] = { n: cur.n + 1, avg: (cur.avg * cur.n + r.score) / (cur.n + 1) };
  }
  const calls = results.filter((r) => r.kind === 'blind_call' && r.detail.bucket !== null);
  const calibration = [0.5, 0.6, 0.7, 0.8, 0.9].map((c) => {
    const xs = calls.filter((r) => Math.abs(Number(r.detail.confidence) - c) < 1e-6);
    return { confidence: c, n: xs.length, hitRate: xs.length ? xs.filter((r) => r.correct).length / xs.length : 0 };
  });
  return {
    questions: results.length,
    correct: results.filter((r) => r.correct).length,
    avgScore: results.length ? results.reduce((a, r) => a + r.score, 0) / results.length : 0,
    bestStreak: best,
    meanBrier: briers.length ? briers.reduce((a, b) => a + b, 0) / briers.length : null,
    byKind,
    calibration,
  };
}
