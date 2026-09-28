/**
 * Derived data computed offline by the pipeline. Everything here looks backward only:
 * IV rank uses trailing data, earnings stats are historical facts about each report,
 * and modeled days are built from the most recent real chain before them.
 */
import { diffDays, listedExpirations, nextTradingDay, type ISODate } from '../../src/engine/calendar';
import { bsm, forward, impliedVol } from '../../src/engine/pricing/bsm';
import { buildChain, gridSurface, type GridPoint } from '../../src/engine/pricing/chainModel';
import { historicalVol } from '../../src/engine/market/indicators';
import type {
  Bar,
  Chain,
  EarningsEvent,
  EarningsTiming,
  OptionQuote,
  VolPoint,
} from '../../src/engine/market/types';

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mid = (q: OptionQuote) => (q.bid + q.ask) / 2;

/** ATM implied vol for one expiration: average of call and put IV at the strike nearest the forward. */
export function atmIvForExpiration(
  chain: Chain,
  expiration: ISODate,
  rate: number,
  divYield: number,
): number | null {
  const qs = chain.quotes.filter((q) => q.expiration === expiration && q.iv > 0);
  if (qs.length === 0) return null;
  const t = Math.max(diffDays(chain.date, expiration), 0.5) / 365;
  const fwd = forward(chain.spot, t, rate, divYield);
  let best = Infinity;
  for (const q of qs) best = Math.min(best, Math.abs(q.strike - fwd));
  const atm = qs.filter((q) => Math.abs(Math.abs(q.strike - fwd) - best) < 1e-9);
  return atm.reduce((a, q) => a + q.iv, 0) / atm.length;
}

/** Constant-maturity ATM IV (default 30 days), interpolated in total variance between expirations. */
export function constantMaturityIv(chain: Chain, days = 30, rate = 0.02, divYield = 0): number | null {
  const exps = [...new Set(chain.quotes.map((q) => q.expiration))].sort();
  const pts: { dte: number; iv: number }[] = [];
  for (const e of exps) {
    const dte = diffDays(chain.date, e);
    if (dte < 1) continue;
    const iv = atmIvForExpiration(chain, e, rate, divYield);
    if (iv !== null) pts.push({ dte, iv });
  }
  if (pts.length === 0) return null;
  if (days <= pts[0].dte) return pts[0].iv;
  if (days >= pts[pts.length - 1].dte) return pts[pts.length - 1].iv;
  for (let i = 1; i < pts.length; i++) {
    if (days <= pts[i].dte) {
      const a = pts[i - 1];
      const b = pts[i];
      const va = a.iv * a.iv * a.dte;
      const vb = b.iv * b.iv * b.dte;
      const w = (days - a.dte) / (b.dte - a.dte);
      return Math.sqrt((va + w * (vb - va)) / days);
    }
  }
  return null;
}

/** IV30, HV20 and trailing-252 IV rank / percentile for every bar date that has an IV. */
export function volSeries(bars: Bar[], iv30ByDate: Map<ISODate, number>): VolPoint[] {
  const hv = historicalVol(
    bars.map((b) => b.close),
    20,
  );
  const history: number[] = [];
  return bars.map((b, i) => {
    const iv = iv30ByDate.get(b.date) ?? null;
    let ivr: number | null = null;
    let ivp: number | null = null;
    if (iv !== null) {
      history.push(iv);
      const window = history.slice(-252);
      if (window.length >= 60) {
        const lo = Math.min(...window);
        const hi = Math.max(...window);
        ivr = hi > lo ? Math.round(((iv - lo) / (hi - lo)) * 10000) / 100 : 50;
        ivp = Math.round((window.filter((x) => x < iv).length / window.length) * 10000) / 100;
      }
    }
    return {
      date: b.date,
      iv30: iv === null ? null : round4(iv),
      hv20: hv[i] === null ? null : round4(hv[i] as number),
      ivr,
      ivp,
    };
  });
}

/** Median relative bid/ask of 20-40 delta options at 7-45 DTE: the liquidity score. */
export function liquidityScore(chains: Chain[]): number | null {
  const rels: number[] = [];
  for (const c of chains) {
    for (const q of c.quotes) {
      const d = Math.abs(q.delta);
      const dte = diffDays(c.date, q.expiration);
      if (d < 0.2 || d > 0.4 || dte < 7 || dte > 45) continue;
      const m = mid(q);
      if (m > 0) rels.push((q.ask - q.bid) / m);
    }
  }
  const md = median(rels);
  return md === null ? null : round4(md);
}

export interface RawEarnings {
  symbol: string;
  date: ISODate;
  when: string | null; // "Before market open" / "After market close" / null
  estimate: number | null;
  actual: number | null;
}

export function parseTiming(when: string | null): EarningsTiming {
  const w = (when ?? '').toLowerCase();
  if (w.includes('before') || w.includes('bmo') || w.includes('pre')) return 'BMO';
  if (w.includes('after') || w.includes('amc') || w.includes('post')) return 'AMC';
  return 'UNK';
}

/**
 * Turns raw report rows into events with their historical reaction: the gap and move on the
 * reaction day, the implied move priced the day before, and the IV crush.
 * For unknown timing, the reaction day is whichever of the report day or the next session gapped more.
 */
export function enrichEarnings(
  raw: RawEarnings[],
  bars: Bar[],
  chainOn: (date: ISODate) => Chain | null,
  rateOn: (date: ISODate) => number,
): EarningsEvent[] {
  const idx = new Map(bars.map((b, i) => [b.date, i] as const));
  const out: EarningsEvent[] = [];
  for (const r of raw) {
    const timing = parseTiming(r.when);
    let reaction = timing === 'BMO' ? r.date : nextTradingDay(r.date);
    if (!idx.has(r.date) && timing === 'BMO') reaction = nextTradingDay(r.date);
    if (timing === 'UNK') {
      const a = idx.get(r.date);
      const b = idx.get(nextTradingDay(r.date));
      const gapAt = (i: number | undefined) =>
        i === undefined || i === 0 ? 0 : Math.abs(bars[i].open / bars[i - 1].close - 1);
      reaction = gapAt(a) > gapAt(b) ? r.date : nextTradingDay(r.date);
    }
    const k = idx.get(reaction);
    let gapPct: number | null = null;
    let movePct: number | null = null;
    let implied: number | null = null;
    let ivBefore: number | null = null;
    let ivAfter: number | null = null;
    if (k !== undefined && k > 0) {
      const prev = bars[k - 1];
      gapPct = round4((bars[k].open / prev.close - 1) * 100);
      movePct = round4((bars[k].close / prev.close - 1) * 100);
      const before = chainOn(prev.date);
      if (before) {
        const front = [...new Set(before.quotes.map((q) => q.expiration))].sort().find((e) => e >= reaction);
        if (front) {
          const strad = straddleMid(before, front);
          if (strad !== null) implied = round4((strad / before.spot) * 100);
          ivBefore = atmIvForExpiration(before, front, rateOn(prev.date), 0);
          const after = chainOn(reaction);
          if (after) ivAfter = atmIvForExpiration(after, front, rateOn(reaction), 0);
        }
      }
    }
    const surprise =
      r.actual !== null && r.estimate !== null && r.estimate !== 0
        ? round4(((r.actual - r.estimate) / Math.abs(r.estimate)) * 100)
        : null;
    out.push({
      symbol: r.symbol,
      date: r.date,
      timing,
      reactionDate: reaction,
      estimate: r.estimate,
      actual: r.actual,
      surprisePct: surprise,
      gapPct,
      movePct,
      impliedMovePct: implied,
      ivBefore: ivBefore === null ? null : round4(ivBefore),
      ivAfter: ivAfter === null ? null : round4(ivAfter),
    });
  }
  return out;
}

export function straddleMid(chain: Chain, expiration: ISODate): number | null {
  const qs = chain.quotes.filter((q) => q.expiration === expiration);
  if (qs.length === 0) return null;
  let best = Infinity;
  let strike = 0;
  for (const q of qs) {
    const d = Math.abs(q.strike - chain.spot);
    if (d < best) {
      best = d;
      strike = q.strike;
    }
  }
  const c = qs.find((q) => q.strike === strike && q.right === 'C');
  const p = qs.find((q) => q.strike === strike && q.right === 'P');
  if (!c || !p) return null;
  return mid(c) + mid(p);
}

/**
 * Model a missing day from the most recent real chain before it. IVs are carried on a
 * (log-moneyness, expiry) grid: the same expiration keeps its smile; new expirations use the
 * nearest days-to-expiry. Bid/ask widths follow the prior day's typical relative spread.
 */
export function modelMissingDay(opts: {
  symbol: string;
  date: ISODate;
  spot: number;
  prior: Chain;
  rate: number;
  divYield: number;
  weeklies: boolean;
}): Chain {
  const { prior } = opts;
  const points: GridPoint[] = [];
  const byExp = new Map<ISODate, GridPoint[]>();
  const tPrior = (e: ISODate) => Math.max(diffDays(prior.date, e), 0.5) / 365;
  for (const q of prior.quotes) {
    if (!(q.iv > 0)) continue;
    const fwd = forward(prior.spot, tPrior(q.expiration), opts.rate, opts.divYield);
    const gp = { dte: diffDays(prior.date, q.expiration), logMoneyness: Math.log(q.strike / fwd), iv: q.iv };
    points.push(gp);
    const list = byExp.get(q.expiration) ?? [];
    list.push(gp);
    byExp.set(q.expiration, list);
  }
  const rels: number[] = [];
  for (const q of prior.quotes) {
    const m = mid(q);
    if (m > 0.05) rels.push((q.ask - q.bid) / m);
  }
  const rel = median(rels) ?? 0.06;
  const halfSpread = (price: number) => Math.max(0.005, (rel * price) / 2);
  const byDte = gridSurface(points, halfSpread);
  const sameExp = new Map<ISODate, ReturnType<typeof gridSurface>>();
  for (const [e, pts] of byExp)
    sameExp.set(
      e,
      gridSurface(
        pts.map((p) => ({ ...p, dte: 0 })),
        halfSpread,
      ),
    );
  const model = {
    iv: (exp: ISODate, strike: number, t: number, fwd: number) => {
      const s = sameExp.get(exp);
      return s ? s.iv(exp, strike, 0, fwd) : byDte.iv(exp, strike, t, fwd);
    },
    halfSpread,
  };
  const expirations = listedExpirations(opts.date, 1, 70, opts.weeklies);
  const strikesByExp = new Map<ISODate, number[]>();
  for (const q of prior.quotes) {
    const list = strikesByExp.get(q.expiration) ?? [];
    if (!list.includes(q.strike)) list.push(q.strike);
    strikesByExp.set(q.expiration, list);
  }
  const allStrikes = [...new Set(prior.quotes.map((q) => q.strike))].sort((a, b) => a - b);
  return buildChain({
    symbol: opts.symbol,
    date: opts.date,
    spot: opts.spot,
    rate: opts.rate,
    divYield: opts.divYield,
    expirations,
    strikes: (e) => (strikesByExp.get(e) ?? allStrikes).filter((k) => Math.abs(k / opts.spot - 1) <= 0.3),
    model,
    source: 'modeled',
  });
}

/**
 * Recompute greeks from each quote's own IV (or its mid when IV is missing) so every row
 * uses the same units regardless of the source's conventions.
 */
export function normalizeQuote(
  q: OptionQuote,
  date: ISODate,
  spot: number,
  rate: number,
  divYield: number,
): OptionQuote | null {
  if (!(q.ask >= q.bid) || q.bid < 0) return null;
  const t = Math.max(diffDays(date, q.expiration), 0.5) / 365;
  let iv = q.iv;
  if (!(iv > 0 && iv < 5)) {
    const m = mid(q);
    const solved =
      m > 0 ? impliedVol(m, { right: q.right, spot, strike: q.strike, t, rate, divYield }) : null;
    if (solved === null) return null;
    iv = solved;
  }
  const g = bsm({ right: q.right, spot, strike: q.strike, t, vol: iv, rate, divYield });
  return { ...q, iv: round4(iv), delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, rho: g.rho };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
