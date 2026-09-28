/**
 * Generates the SIM market: a GJR-GARCH market factor with fat tails and stress episodes,
 * stocks that load on it with their own GARCH noise and earnings jumps, an implied-vol
 * surface with a volatility risk premium, earnings premium (and crush), skew and smile,
 * plus dividends, a split, a VIX analog and a stylized rate path.
 * Deterministic from the seed. Nothing here is real data; every row is tagged 'synthetic'.
 */

import { Rng } from '../../rng';
import {
  listedExpirations,
  nextTradingDay,
  toDayNumber,
  tradingDaysBetween,
  type ISODate,
} from '../../calendar';
import { buildChain, strikeGrid, type SurfaceModel } from '../../pricing/chainModel';
import { historicalVol } from '../indicators';
import { macroCalendar } from '../macroCalendar';
import type {
  Bar,
  Chain,
  Dividend,
  EarningsEvent,
  Fundamentals,
  RatePoint,
  Split,
  VixBar,
  VolPoint,
} from '../types';
import { SYNTH_FIRST_BAR, SYNTH_LAST_DATE, SYNTH_SEED, SYNTH_UNIVERSE, type SynthSpec } from './universe';

const MKT_LR_VOL = 0.155;
const MKT_ALPHA = 0.03;
const MKT_GAMMA = 0.13;
const MKT_BETA = 0.875;
const IDIO_ALPHA = 0.06;
const IDIO_BETA = 0.9;
const KAPPA = 9; // mean reversion of variance, per year

export interface SynthEarnings {
  event: EarningsEvent;
  reactionIndex: number;
  impliedSd: number; // what the options market prices for the event (log-move sd)
}

export interface SymbolPath {
  spec: SynthSpec;
  bars: Bar[];
  varNext: Float64Array; // conditional daily variance for tomorrow (total)
  varLr: number; // long-run daily variance (total)
  ivNoise: Float64Array;
  earnings: SynthEarnings[];
  dividends: Dividend[];
  splits: Split[];
  fundamentals: Fundamentals[];
  indexOf: Map<ISODate, number>;
}

export interface MarketPath {
  days: ISODate[];
  indexOf: Map<ISODate, number>;
  varNext: Float64Array;
  vix: VixBar[];
  rates: RatePoint[];
}

// Stylized, SIM-only rate path (percent). Loosely shaped like the post-2018 cycle.
const RATE_KNOTS: [ISODate, number, number][] = [
  ['2018-01-02', 1.4, 2.45],
  ['2018-12-20', 2.4, 2.8],
  ['2019-07-31', 2.05, 2.0],
  ['2019-12-31', 1.55, 1.9],
  ['2020-03-02', 1.2, 1.1],
  ['2020-03-23', 0.05, 0.75],
  ['2021-12-31', 0.05, 1.5],
  ['2022-06-15', 1.6, 3.3],
  ['2022-12-30', 4.3, 3.85],
  ['2023-07-28', 5.3, 4.0],
  ['2023-10-19', 5.35, 4.95],
  ['2024-08-30', 5.2, 3.9],
  ['2024-12-31', 4.3, 4.55],
  ['2025-06-30', 4.3, 4.25],
  ['2025-12-31', 3.75, 4.15],
  ['2026-09-30', 3.65, 4.1],
];

function interpKnots(date: ISODate, col: 1 | 2): number {
  const n = toDayNumber(date);
  if (n <= toDayNumber(RATE_KNOTS[0][0])) return RATE_KNOTS[0][col];
  for (let i = 1; i < RATE_KNOTS.length; i++) {
    const a = RATE_KNOTS[i - 1];
    const b = RATE_KNOTS[i];
    const nb = toDayNumber(b[0]);
    if (n <= nb) {
      const na = toDayNumber(a[0]);
      const w = (n - na) / (nb - na);
      return a[col] + w * (b[col] - a[col]);
    }
  }
  return RATE_KNOTS[RATE_KNOTS.length - 1][col];
}

export class SynthMarket {
  readonly seed: string;
  readonly days: ISODate[];
  private market: MarketPath | null = null;
  private symbolPaths = new Map<string, SymbolPath>();
  private macroDays: Set<ISODate>;

  constructor(seed = SYNTH_SEED, lastDate: ISODate = SYNTH_LAST_DATE) {
    this.seed = seed;
    this.days = tradingDaysBetween(SYNTH_FIRST_BAR, lastDate);
    this.macroDays = new Set(macroCalendar().map((m) => m.date));
  }

  spec(symbol: string): SynthSpec {
    const s = SYNTH_UNIVERSE.find((u) => u.symbol === symbol);
    if (!s) throw new Error(`Unknown SIM symbol ${symbol}`);
    return s;
  }

  marketPath(): MarketPath {
    if (this.market) return this.market;
    const rng = new Rng(this.seed).fork('market');
    const n = this.days.length;
    const lr = (MKT_LR_VOL * MKT_LR_VOL) / 252;
    const persistence = MKT_ALPHA + MKT_GAMMA / 2 + MKT_BETA;
    const omega = lr * (1 - persistence);
    const varNext = new Float64Array(n);
    const ret = new Float64Array(n);
    let v = lr;
    let stress = 0;
    for (let i = 0; i < n; i++) {
      if (stress === 0 && rng.chance(0.0016)) stress = rng.int(8, 22);
      const macroBoost = this.macroDays.has(this.days[i]) ? 1.7 : 1;
      const stressBoost = stress > 0 ? 2.2 : 1;
      const sd = Math.sqrt(v) * Math.sqrt(macroBoost) * stressBoost;
      const drift = 0.085 / 252 - (stress > 0 ? 0.004 : 0);
      const e = sd * rng.studentT(5);
      ret[i] = drift + e;
      v = omega + (MKT_ALPHA + (e < 0 ? MKT_GAMMA : 0)) * e * e + MKT_BETA * v;
      v = Math.min(v, lr * 25);
      varNext[i] = v * (stress > 1 ? 2.2 * 2.2 : 1);
      if (stress > 0) stress--;
    }
    const vix: VixBar[] = [];
    let noise = 0;
    for (let i = 0; i < n; i++) {
      noise = 0.9 * noise + 0.04 * rng.normal();
      const avgVar = avgForwardVar(varNext[i], lr, 30 / 365);
      const close = Math.max(9, 100 * Math.sqrt(avgVar * 252) * 1.14 * Math.exp(noise));
      const prev = i > 0 ? vix[i - 1].close : close;
      const hi = Math.max(prev, close) * (1 + Math.abs(rng.normal()) * 0.03);
      const lo = Math.min(prev, close) * (1 - Math.abs(rng.normal()) * 0.03);
      vix.push({
        date: this.days[i],
        open: round2(prev),
        high: round2(hi),
        low: round2(lo),
        close: round2(close),
      });
    }
    const rates: RatePoint[] = this.days.map((d) => {
      const s = interpKnots(d, 1) / 100;
      const l = interpKnots(d, 2) / 100;
      return {
        date: d,
        r3m: round4(s),
        r1y: round4(s * 0.8 + l * 0.2),
        r2y: round4(s * 0.55 + l * 0.45),
        r10y: round4(l),
      };
    });
    const indexOf = new Map(this.days.map((d, i) => [d, i] as const));
    this.market = { days: this.days, indexOf, varNext, vix, rates };
    // keep the raw market returns for symbol generation
    this.marketReturns = ret;
    return this.market;
  }

  private marketReturns: Float64Array | null = null;

  path(symbol: string): SymbolPath {
    const cached = this.symbolPaths.get(symbol);
    if (cached) return cached;
    const spec = this.spec(symbol);
    const mkt = this.marketPath();
    const mret = this.marketReturns as Float64Array;
    const rng = new Rng(this.seed).fork(`sym:${symbol}`);
    const n = this.days.length;
    const lrI = (spec.idioVol * spec.idioVol) / 252;
    const omegaI = lrI * (1 - IDIO_ALPHA - IDIO_BETA);
    const mLr = (MKT_LR_VOL * MKT_LR_VOL) / 252;
    const varLr = spec.beta * spec.beta * mLr + lrI;

    const earnings = this.scheduleEarnings(spec, rng.fork('earn'));
    const reactionAt = new Map<number, SynthEarnings>();
    for (const e of earnings) reactionAt.set(e.reactionIndex, e);
    const splitIdx = spec.split ? this.days.indexOf(spec.split.date) : -1;

    const bars: Bar[] = [];
    const varNext = new Float64Array(n);
    const ivNoise = new Float64Array(n);
    let vI = lrI;
    let close = spec.price0;
    let noise = 0;
    const baseVolume = { mega: 42e6, large: 11e6, mid: 6e6, small: 3e6, etf: 70e6 }[spec.sizeTier];
    for (let i = 0; i < n; i++) {
      const eI = Math.sqrt(vI) * rng.studentT(5);
      vI = Math.min(omegaI + IDIO_ALPHA * eI * eI + IDIO_BETA * vI, lrI * 30);
      const ev = reactionAt.get(i);
      let jump = 0;
      if (ev) {
        // Realized move is drawn around what the market priced, with fat tails either way.
        jump = spec.earnMove * rng.studentT(4) * (0.8 + 0.4 * rng.next());
        const surprise = Math.sign(jump || 1) * (0.02 + Math.abs(rng.normal()) * 0.06) + rng.normal() * 0.02;
        const est = ev.event.estimate ?? 1;
        ev.event.actual = round2(est * (1 + surprise));
        ev.event.surprisePct = round4(surprise * 100);
      }
      const floorDrift = close < 6 ? 0.006 : 0;
      const r = (spec.drift - spec.beta * 0.085) / 252 + floorDrift + spec.beta * mret[i] + eI + jump;
      const prevClose = close;
      close = prevClose * Math.exp(r);
      if (i === splitIdx && spec.split) close = close / spec.split.ratio;
      const refPrev = i === splitIdx && spec.split ? prevClose / spec.split.ratio : prevClose;
      const dailySd = Math.sqrt(spec.beta * spec.beta * mkt.varNext[Math.max(0, i - 1)] + vI);
      const overnight = jump + 0.3 * (r - jump) + dailySd * 0.15 * rng.normal();
      const open = refPrev * Math.exp(overnight);
      const high = Math.max(open, close) * Math.exp(Math.abs(rng.normal()) * dailySd * 0.55);
      const low = Math.min(open, close) * Math.exp(-Math.abs(rng.normal()) * dailySd * 0.55);
      const volMult =
        Math.exp(0.3 * rng.normal()) * (1 + (4 * Math.abs(r)) / Math.max(dailySd, 1e-4) / 3) * (ev ? 3 : 1);
      bars.push({
        date: this.days[i],
        open: round2(open),
        high: round2(Math.max(high, open, close)),
        low: round2(Math.min(low, open, close)),
        close: round2(close),
        volume: Math.round(
          baseVolume * volMult * (spec.split && i >= splitIdx && splitIdx >= 0 ? spec.split.ratio : 1),
        ),
        source: 'synthetic',
      });
      close = bars[i].close;
      varNext[i] = spec.beta * spec.beta * mkt.varNext[i] + vI;
      noise = 0.95 * noise + 0.035 * rng.normal() - 1.2 * (r - jump);
      noise = Math.max(-0.35, Math.min(0.5, noise));
      ivNoise[i] = noise;
    }

    // Earnings outcomes that depend on the path.
    for (const e of earnings) {
      const k = e.reactionIndex;
      if (k <= 0 || k >= n) continue;
      const pc = bars[k - 1].close;
      e.event.gapPct = round4(((bars[k].open - pc) / pc) * 100);
      e.event.movePct = round4(((bars[k].close - pc) / pc) * 100);
      // A straddle prices roughly 0.8 standard deviations of the move it covers.
      e.event.impliedMovePct = round4(e.impliedSd * 0.8 * 1.05 * 100);
    }

    const dividends = this.scheduleDividends(spec, bars);
    const fundamentals = this.fundamentals(spec, earnings, bars);
    const splits: Split[] = spec.split ? [{ symbol, exDate: spec.split.date, ratio: spec.split.ratio }] : [];
    const p: SymbolPath = {
      spec,
      bars,
      varNext,
      varLr,
      ivNoise,
      earnings,
      dividends,
      splits,
      fundamentals,
      indexOf: mkt.indexOf,
    };
    this.symbolPaths.set(symbol, p);

    // IV before/after for each event now that the surface can be evaluated.
    for (const e of earnings) {
      const k = e.reactionIndex;
      if (k <= 1 || k >= n) continue;
      e.event.ivBefore = round4(this.atmIv(symbol, k - 1, 30 / 365));
      e.event.ivAfter = round4(this.atmIv(symbol, k, 30 / 365));
    }
    return p;
  }

  private scheduleEarnings(spec: SynthSpec, rng: Rng): SynthEarnings[] {
    if (spec.earnMove <= 0) return [];
    const out: SynthEarnings[] = [];
    const firstYear = Number(this.days[0].slice(0, 4));
    const lastYear = Number(this.days[this.days.length - 1].slice(0, 4));
    let eps = 0.8 + rng.next() * 2.5;
    for (let y = firstYear; y <= lastYear; y++) {
      for (const qm of [1, 4, 7, 10]) {
        const month = qm + spec.earnMonth;
        const day = Math.min(28, Math.max(1, spec.earnDay + rng.int(-3, 3)));
        let date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const idx0 = this.days.findIndex((d) => d >= date);
        if (idx0 < 0) continue;
        date = this.days[idx0];
        const timing = spec.timing === 'UNK' ? 'AMC' : spec.timing;
        const reactionDate = timing === 'BMO' ? date : nextTradingDay(date);
        const reactionIndex = this.days.indexOf(reactionDate);
        if (reactionIndex < 0) continue;
        eps *= 1 + 0.02 + rng.normal() * 0.05;
        const impliedSd = spec.earnMove * Math.exp(0.18 * rng.normal());
        out.push({
          reactionIndex,
          impliedSd,
          event: {
            symbol: spec.symbol,
            date,
            timing,
            reactionDate,
            estimate: round2(eps),
            actual: null,
            surprisePct: null,
            gapPct: null,
            movePct: null,
            impliedMovePct: null,
            ivBefore: null,
            ivAfter: null,
          },
        });
      }
    }
    return out;
  }

  private scheduleDividends(spec: SynthSpec, bars: Bar[]): Dividend[] {
    if (spec.divYield <= 0) return [];
    const out: Dividend[] = [];
    let amount = 0;
    for (
      let y = Number(this.days[0].slice(0, 4));
      y <= Number(this.days[this.days.length - 1].slice(0, 4));
      y++
    ) {
      for (const m of [2, 5, 8, 11]) {
        const target = `${y}-${String(m).padStart(2, '0')}-10`;
        const idx = this.days.findIndex((d) => d >= target);
        if (idx < 0) continue;
        if (m === 2 || amount === 0) amount = round2((bars[idx].close * spec.divYield) / 4);
        out.push({ symbol: spec.symbol, exDate: this.days[idx], amount });
      }
    }
    return out;
  }

  private fundamentals(spec: SynthSpec, earnings: SynthEarnings[], bars: Bar[]): Fundamentals[] {
    const shares = Math.round(
      (spec.sizeTier === 'mega' ? 3e9 : spec.sizeTier === 'large' ? 8e8 : 2e8) *
        (1 + (spec.symbol.charCodeAt(0) % 5) / 10),
    );
    return earnings
      .filter((e) => e.event.estimate !== null)
      .map((e) => {
        const d = e.event.date;
        const pe = toDayNumber(d) - 25;
        const periodEnd = new Date(pe * 86400000).toISOString().slice(0, 10);
        const eps = e.event.actual ?? e.event.estimate;
        const idx = Math.min(bars.length - 1, Math.max(0, e.reactionIndex));
        return {
          symbol: spec.symbol,
          reportDate: d,
          periodEnd,
          eps,
          epsEstimate: e.event.estimate,
          revenue: Math.round((eps ?? 1) * shares * 6.5),
          netIncome: Math.round((eps ?? 1) * shares),
          sharesOut: shares * (spec.split && bars[idx].date >= spec.split.date ? spec.split.ratio : 1),
        };
      });
  }

  /** ATM implied vol for a horizon, from the variance forecast, the premium and any earnings inside it. */
  atmIv(symbol: string, index: number, t: number, expiration?: ISODate): number {
    const p = this.path(symbol);
    const tt = Math.max(t, 1 / 365);
    const avgVar = avgForwardVar(p.varNext[index], p.varLr, tt);
    const diff = Math.sqrt(avgVar * 252) * p.spec.vrp * Math.exp(p.ivNoise[index]);
    let eVar = 0;
    const day = this.days[index];
    const horizonEnd = expiration ?? addCalendar(day, Math.round(tt * 365));
    for (const e of p.earnings) {
      if (e.event.reactionDate > day && e.event.reactionDate <= horizonEnd) eVar += e.impliedSd * e.impliedSd;
    }
    return Math.sqrt((diff * diff * tt + eVar) / tt);
  }

  surface(symbol: string, index: number): SurfaceModel {
    const p = this.path(symbol);
    const vix = this.marketPath().vix[index].close;
    const widen = Math.min(2, Math.max(0.85, 1 + (vix - 20) / 45));
    return {
      iv: (expiration, strike, t, fwd) => {
        const atm = this.atmIv(symbol, index, t, expiration);
        const m = Math.log(strike / fwd) / (atm * Math.sqrt(t));
        const mm = Math.max(-4, Math.min(4, m));
        const f = 1 + p.spec.skew * mm + p.spec.smile * mm * mm;
        return atm * Math.max(0.55, Math.min(2.6, f));
      },
      halfSpread: (price, absDelta) => {
        const deep = absDelta > 0.85 ? 1.6 : 1;
        return p.spec.spreadFactor * (0.004 + 0.016 * Math.pow(Math.max(price, 0), 0.72)) * widen * deep;
      },
    };
  }

  rate(index: number): number {
    return this.marketPath().rates[index].r3m;
  }

  chain(symbol: string, date: ISODate): Chain | null {
    const p = this.path(symbol);
    const idx = p.indexOf.get(date);
    if (idx === undefined) return null;
    const spot = p.bars[idx].close;
    const expirations = listedExpirations(date, 1, 70, p.spec.weeklies);
    return buildChain({
      symbol,
      date,
      spot,
      rate: this.rate(idx),
      divYield: p.spec.divYield,
      expirations,
      strikes: () => strikeGrid(spot, 0.3),
      model: this.surface(symbol, idx),
      source: 'synthetic',
    });
  }

  vol(symbol: string): VolPoint[] {
    const p = this.path(symbol);
    const closes = p.bars.map((b) => b.close);
    const hv = historicalVol(closes, 20);
    const iv30 = p.bars.map((_, i) => this.atmIv(symbol, i, 30 / 365));
    return p.bars.map((b, i) => {
      const lo = Math.max(0, i - 251);
      let min = Infinity;
      let max = -Infinity;
      let below = 0;
      for (let j = lo; j <= i; j++) {
        min = Math.min(min, iv30[j]);
        max = Math.max(max, iv30[j]);
        if (iv30[j] < iv30[i]) below++;
      }
      const count = i - lo + 1;
      const enough = count >= 60;
      return {
        date: b.date,
        iv30: round4(iv30[i]),
        hv20: hv[i] === null ? null : round4(hv[i] as number),
        ivr: enough && max > min ? round2(((iv30[i] - min) / (max - min)) * 100) : null,
        ivp: enough ? round2((below / count) * 100) : null,
      };
    });
  }
}

function avgForwardVar(current: number, lr: number, t: number): number {
  const kt = KAPPA * t;
  const w = kt < 1e-6 ? 1 : (1 - Math.exp(-kt)) / kt;
  return lr + (current - lr) * w;
}

function addCalendar(d: ISODate, n: number): ISODate {
  return new Date((toDayNumber(d) + n) * 86400000).toISOString().slice(0, 10);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
