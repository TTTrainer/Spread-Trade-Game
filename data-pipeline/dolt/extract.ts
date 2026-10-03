/**
 * The real-data build: DoltHub clones -> game.db.
 * Runs on Jacob's PC (from `npm run data:build` or the in-game Build button). It could not be
 * run end to end in the cloud session that wrote it (DoltHub was unreachable there), so it
 * inspects every schema at runtime and fails with a plain explanation if something is off.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, diffDays, isTradingDay, tradingDaysBetween, type ISODate } from '../../src/engine/calendar';
import { macroCalendar } from '../../src/engine/market/macroCalendar';
import type {
  Bar,
  Chain,
  Dividend,
  Fundamentals,
  OptionQuote,
  RatePoint,
  Split,
  SymbolInfo,
  VixBar,
} from '../../src/engine/market/types';
import { buildSymbolWindows, finalizeWindows, type RawWindow } from '../../src/engine/market/windows';
import { GameDbWriter } from '../lib/gameDb';
import {
  constantMaturityIv,
  enrichEarnings,
  liquidityScore,
  median,
  modelMissingDay,
  normalizeQuote,
  volSeries,
  type RawEarnings,
} from '../lib/derived';
import { downloadVix } from '../vix';
import { introspect, q, from, WANTED, type TableMap } from './introspect';
import { startDoltServer, type DoltServer } from './server';
import { candidateInfo, CANDIDATES, selectTickers, type CandidateScore, type Selection } from './tickers';
import {
  cloneOrPull,
  doltPaths,
  ensureDolt,
  ensureDoltIdentity,
  freeBytes,
  type DoltRepoName,
} from './tooling';

export const MIN_FREE_GB = 40;
export const BARS_FROM = '2018-01-01';

export class LowDiskError extends Error {
  constructor(public freeGb: number) {
    super(
      `Only ${freeGb.toFixed(0)} GB free. The market data needs about ${MIN_FREE_GB} GB. Free up space or confirm to continue anyway.`,
    );
    this.name = 'LowDiskError';
  }
}

export interface RealBuildOptions {
  gameDbPath: string;
  doltRoot: string;
  port?: number;
  allowDownload?: boolean;
  confirmLowDisk?: boolean;
  skipClone?: boolean;
  tickers?: string[];
  /** Sync mode: only (re)extract days from this date on. */
  incrementalFrom?: ISODate;
  log: (m: string) => void;
  progress?: (stage: string, fraction: number) => void;
}

export interface BuildSummary {
  tickers: Selection[];
  scores: CandidateScore[];
  chainRows: number;
  modeledDays: number;
  realDays: number;
  windows: number;
  lastDate: ISODate;
}

interface Maps {
  chain: TableMap;
  ohlcv: TableMap;
  symbol: TableMap | null;
  dividend: TableMap;
  split: TableMap;
  earningsCalendar: TableMap;
  epsHistory: TableMap | null;
  income: TableMap | null;
  treasury: TableMap;
}

const toIso = (v: unknown): ISODate =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

async function mapTables(server: DoltServer): Promise<Maps> {
  const opt = async (k: string) => {
    try {
      return await introspect(server, WANTED[k]);
    } catch {
      return null;
    }
  };
  return {
    chain: await introspect(server, WANTED.chain),
    ohlcv: await introspect(server, WANTED.ohlcv),
    symbol: await opt('symbol'),
    dividend: await introspect(server, WANTED.dividend),
    split: await introspect(server, WANTED.split),
    earningsCalendar: await introspect(server, WANTED.earningsCalendar),
    epsHistory: await opt('epsHistory'),
    income: await opt('income'),
    treasury: await introspect(server, WANTED.treasury),
  };
}

function rightOf(v: unknown): 'C' | 'P' | null {
  const s = String(v).toUpperCase();
  if (s.startsWith('C')) return 'C';
  if (s.startsWith('P')) return 'P';
  return null;
}

async function scoreCandidates(
  server: DoltServer,
  m: Maps,
  log: (s: string) => void,
): Promise<CandidateScore[]> {
  const out: CandidateScore[] = [];
  const cm = m.chain;
  for (const c of CANDIDATES) {
    const cov = await server.query<{ first: unknown; last: unknown; days: number }>(
      `SELECT MIN(${q(cm, 'date')}) AS first, MAX(${q(cm, 'date')}) AS last, COUNT(DISTINCT ${q(cm, 'date')}) AS days FROM ${from(cm)} WHERE ${q(cm, 'symbol')} = ?`,
      [c.symbol],
    );
    const bars = await server.query<{ first: unknown }>(
      `SELECT MIN(${q(m.ohlcv, 'date')}) AS first FROM ${from(m.ohlcv)} WHERE ${q(m.ohlcv, 'symbol')} = ?`,
      [c.symbol],
    );
    const row = cov[0];
    const present = !!row && row.days > 0;
    let liquidity: number | null = null;
    let ivLevel: number | null = null;
    if (present) {
      const last = toIso(row.last);
      const sampleDays = await server.query<{ d: unknown }>(
        `SELECT DISTINCT ${q(cm, 'date')} AS d FROM ${from(cm)} WHERE ${q(cm, 'symbol')} = ? AND ${q(cm, 'date')} > ? ORDER BY d`,
        [c.symbol, addDays(last, -365)],
      );
      const picks = sampleDays.filter((_, i) => i % 10 === 0).map((r) => toIso(r.d));
      const chains: Chain[] = [];
      const ivs: number[] = [];
      for (const d of picks) {
        const rows = await server.query<Record<string, unknown>>(
          `SELECT ${q(cm, 'expiration')} AS e, ${q(cm, 'strike')} AS k, ${q(cm, 'right')} AS r, ${q(cm, 'bid')} AS b, ${q(cm, 'ask')} AS a, ${q(cm, 'iv')} AS v, ${q(cm, 'delta')} AS dl
           FROM ${from(cm)} WHERE ${q(cm, 'symbol')} = ? AND ${q(cm, 'date')} = ?`,
          [c.symbol, d],
        );
        const spotRow = await server.query<{ c: number }>(
          `SELECT ${q(m.ohlcv, 'close')} AS c FROM ${from(m.ohlcv)} WHERE ${q(m.ohlcv, 'symbol')} = ? AND ${q(m.ohlcv, 'date')} = ?`,
          [c.symbol, d],
        );
        const spot = num(spotRow[0]?.c);
        if (!spot) continue;
        const quotes: OptionQuote[] = [];
        for (const r of rows) {
          const right = rightOf(r.r);
          if (!right) continue;
          quotes.push({
            expiration: toIso(r.e),
            strike: Number(r.k),
            right,
            bid: Number(r.b),
            ask: Number(r.a),
            iv: Number(r.v ?? 0),
            delta: Number(r.dl ?? 0),
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0,
            source: 'real',
          });
        }
        chains.push({ symbol: c.symbol, date: d, spot, source: 'real', quotes });
        const iv = constantMaturityIv({ symbol: c.symbol, date: d, spot, source: 'real', quotes }, 30);
        if (iv) ivs.push(iv);
      }
      liquidity = liquidityScore(chains);
      ivLevel = median(ivs);
    }
    out.push({
      symbol: c.symbol,
      present,
      chainFirst: present ? toIso(row.first) : null,
      chainLast: present ? toIso(row.last) : null,
      chainDays: row?.days ?? 0,
      barFirst: bars[0]?.first ? toIso(bars[0].first) : null,
      liquidity,
      ivLevel,
    });
    log(`scored ${c.symbol}: present=${present} liquidity=${liquidity ?? '-'} iv=${ivLevel ?? '-'}`);
  }
  return out;
}

function divYieldOn(divs: Dividend[], date: ISODate, spot: number): number {
  const lo = addDays(date, -365);
  const sum = divs.filter((d) => d.exDate > lo && d.exDate <= date).reduce((a, d) => a + d.amount, 0);
  return spot > 0 ? sum / spot : 0;
}

export async function buildRealDb(opts: RealBuildOptions): Promise<BuildSummary> {
  const log = opts.log;
  const progress = opts.progress ?? (() => undefined);
  const paths = doltPaths(opts.doltRoot);
  const dolt = await ensureDolt(paths, { allowDownload: opts.allowDownload ?? false, log });
  ensureDoltIdentity(dolt);

  if (!opts.skipClone) {
    const alreadyCloned = existsSync(join(paths.cloneDir, 'options', '.dolt'));
    const freeGb = freeBytes(paths.root) / 1e9;
    if (!alreadyCloned && freeGb < MIN_FREE_GB && !opts.confirmLowDisk) throw new LowDiskError(freeGb);
    const repos: DoltRepoName[] = ['rates', 'earnings', 'stocks', 'options'];
    for (let i = 0; i < repos.length; i++) {
      progress(`Downloading ${repos[i]} data`, i / repos.length);
      await cloneOrPull(dolt, paths, repos[i], log);
    }
  }

  progress('Downloading VIX history', 0);
  let vix: VixBar[] = [];
  try {
    vix = await downloadVix();
  } catch (e) {
    log(`VIX download failed (${(e as Error).message}); VIX-based Reviews will use a fallback.`);
  }

  const server = await startDoltServer(dolt, paths.cloneDir, opts.port ?? 3307, log);
  try {
    const m = await mapTables(server);
    progress('Choosing tickers', 0);
    const scores = opts.tickers ? [] : await scoreCandidates(server, m, log);
    const selection: Selection[] = opts.tickers
      ? opts.tickers.map((s) => ({ symbol: s, reason: 'Chosen manually' }))
      : selectTickers(scores);
    if (selection.length === 0)
      throw new Error('None of the candidate tickers were found in the options data.');
    const tickers = selection.map((s) => s.symbol);

    const writer = new GameDbWriter(opts.gameDbPath);
    const lastRow = await server.query<{ d: unknown }>(
      `SELECT MAX(${q(m.chain, 'date')}) AS d FROM ${from(m.chain)} WHERE ${q(m.chain, 'symbol')} = ?`,
      [tickers[0]],
    );
    const lastDate = toIso(lastRow[0].d);
    const startDate = opts.incrementalFrom ?? BARS_FROM;
    const days = tradingDaysBetween(BARS_FROM, lastDate);
    writer.putTradingDays(days);

    // Rates.
    const tm = m.treasury;
    const rateRows = await server.query<Record<string, unknown>>(
      `SELECT ${q(tm, 'date')} AS d, ${q(tm, 'm3')} AS m3, ${q(tm, 'y1')} AS y1, ${q(tm, 'y2')} AS y2, ${q(tm, 'y10')} AS y10 FROM ${from(tm)} WHERE ${q(tm, 'date')} >= ? ORDER BY d`,
      [BARS_FROM],
    );
    const rates: RatePoint[] = rateRows
      .map((r) => ({
        date: toIso(r.d),
        r3m: (num(r.m3) ?? 0) / 100,
        r1y: (num(r.y1) ?? 0) / 100,
        r2y: (num(r.y2) ?? 0) / 100,
        r10y: (num(r.y10) ?? 0) / 100,
      }))
      .filter((r) => isTradingDay(r.date));
    writer.putRates(rates);
    const rateOn = (d: ISODate): number => {
      let lo = 0;
      let hi = rates.length - 1;
      let best = rates[0]?.r3m ?? 0.02;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rates[mid].date <= d) {
          best = rates[mid].r3m;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return best;
    };
    writer.putVix(vix);
    const macro = macroCalendar();
    writer.putMacro(macro);

    // Bars, dividends, splits, earnings schedule for every ticker.
    const barsBy = new Map<string, Bar[]>();
    const divsBy = new Map<string, Dividend[]>();
    const splitsBy = new Map<string, Split[]>();
    const rawEarnBy = new Map<string, RawEarnings[]>();
    for (const t of tickers) {
      const om = m.ohlcv;
      const rows = await server.query<Record<string, unknown>>(
        `SELECT ${q(om, 'date')} AS d, ${q(om, 'open')} AS o, ${q(om, 'high')} AS h, ${q(om, 'low')} AS l, ${q(om, 'close')} AS c, ${q(om, 'volume')} AS v
         FROM ${from(om)} WHERE ${q(om, 'symbol')} = ? AND ${q(om, 'date')} >= ? ORDER BY d`,
        [t, BARS_FROM],
      );
      const bars: Bar[] = rows
        .map((r) => ({
          date: toIso(r.d),
          open: Number(r.o),
          high: Number(r.h),
          low: Number(r.l),
          close: Number(r.c),
          volume: Number(r.v ?? 0),
          source: 'real' as const,
        }))
        .filter((b) => isTradingDay(b.date) && b.close > 0 && b.low > 0);
      barsBy.set(t, bars);
      writer.putBars(
        t,
        bars.filter((b) => b.date >= startDate),
      );

      const dm = m.dividend;
      const divs: Dividend[] = (
        await server.query<Record<string, unknown>>(
          `SELECT ${q(dm, 'exDate')} AS d, ${q(dm, 'amount')} AS a FROM ${from(dm)} WHERE ${q(dm, 'symbol')} = ? ORDER BY d`,
          [t],
        )
      ).map((r) => ({ symbol: t, exDate: toIso(r.d), amount: Number(r.a) }));
      divsBy.set(t, divs);
      writer.putDividends(divs);

      const sm = m.split;
      const splits: Split[] = (
        await server.query<Record<string, unknown>>(
          `SELECT ${q(sm, 'exDate')} AS d, ${q(sm, 'to')} AS t, ${q(sm, 'for')} AS f FROM ${from(sm)} WHERE ${q(sm, 'symbol')} = ? ORDER BY d`,
          [t],
        )
      )
        .map((r) => ({ symbol: t, exDate: toIso(r.d), ratio: Number(r.t) / Number(r.f || 1) }))
        .filter((s) => Number.isFinite(s.ratio) && s.ratio > 0 && s.ratio !== 1);
      splitsBy.set(t, splits);
      writer.putSplits(splits);

      const ecm = m.earningsCalendar;
      const cal = await server.query<Record<string, unknown>>(
        `SELECT ${q(ecm, 'date')} AS d, ${q(ecm, 'when')} AS w FROM ${from(ecm)} WHERE ${q(ecm, 'symbol')} = ? AND ${q(ecm, 'date')} >= ? ORDER BY d`,
        [t, BARS_FROM],
      );
      const eps = m.epsHistory
        ? await server.query<Record<string, unknown>>(
            `SELECT ${q(m.epsHistory, 'periodEnd')} AS p, ${q(m.epsHistory, 'reported')} AS r, ${q(m.epsHistory, 'estimate')} AS e FROM ${from(m.epsHistory)} WHERE ${q(m.epsHistory, 'symbol')} = ? ORDER BY p`,
            [t],
          )
        : [];
      // Point in time: each report is matched to the latest fiscal period that ended before it.
      rawEarnBy.set(
        t,
        cal.map((c) => {
          const d = toIso(c.d);
          const period = eps.filter((e) => toIso(e.p) < d && diffDays(toIso(e.p), d) < 120).pop();
          return {
            symbol: t,
            date: d,
            when: c.w === null || c.w === undefined ? null : String(c.w),
            estimate: num(period?.e),
            actual: num(period?.r),
          };
        }),
      );
    }

    // Chains, streamed week by week for all tickers at once (one scan of the big table per week).
    const needForEarnings = new Map<string, Set<ISODate>>();
    for (const [t, list] of rawEarnBy) {
      const s = new Set<ISODate>();
      const bars = barsBy.get(t) ?? [];
      const idx = new Map(bars.map((b, i) => [b.date, i] as const));
      for (const e of list) {
        const i = idx.get(e.date);
        if (i === undefined) continue;
        for (let k = Math.max(0, i - 1); k <= Math.min(bars.length - 1, i + 2); k++) s.add(bars[k].date);
      }
      needForEarnings.set(t, s);
    }
    const kept = new Map<string, Map<ISODate, Chain>>(tickers.map((t) => [t, new Map()]));
    // A sync starts from what is already in game.db so IV rank and windows keep their history.
    const existing = new Map(
      tickers.map((t) => [t, opts.incrementalFrom ? writer.existingHistory(t) : null] as const),
    );
    const iv30By = new Map<string, Map<ISODate, number>>(
      tickers.map((t) => [t, new Map(existing.get(t)?.iv30 ?? [])]),
    );
    const spreadBy = new Map<string, Map<ISODate, number>>(
      tickers.map((t) => [t, new Map(existing.get(t)?.spreads ?? [])]),
    );
    const realDaysBy = new Map<string, Set<ISODate>>(
      tickers.map((t) => [t, new Set(existing.get(t)?.realDays ?? [])]),
    );
    const lastChain = new Map<string, Chain>();
    const firstChain = new Map<string, ISODate>();
    const liqSamples = new Map<string, Chain[]>(tickers.map((t) => [t, []]));
    let chainRows = 0;
    let modeledDays = 0;
    let realDays = 0;
    const cm = m.chain;
    const chainDays = days.filter((d) => d >= '2019-01-01' && d >= addDays(startDate, -10));
    for (let w = 0; w < chainDays.length; w += 5) {
      const batchDays = chainDays.slice(w, w + 5);
      progress('Extracting option chains', w / chainDays.length);
      const rows = await server.query<Record<string, unknown>>(
        `SELECT ${q(cm, 'date')} AS d, ${q(cm, 'symbol')} AS s, ${q(cm, 'expiration')} AS e, ${q(cm, 'strike')} AS k, ${q(cm, 'right')} AS r,
                ${q(cm, 'bid')} AS b, ${q(cm, 'ask')} AS a, ${q(cm, 'iv')} AS v
         FROM ${from(cm)} WHERE ${q(cm, 'date')} BETWEEN ? AND ? AND ${q(cm, 'symbol')} IN (${tickers.map(() => '?').join(',')})`,
        [batchDays[0], batchDays[batchDays.length - 1], ...tickers],
      );
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const r of rows) {
        const key = `${r.s}|${toIso(r.d)}`;
        const list = grouped.get(key) ?? [];
        list.push(r);
        grouped.set(key, list);
      }
      const toWrite: Chain[] = [];
      for (const d of batchDays) {
        for (const t of tickers) {
          const bars = barsBy.get(t) ?? [];
          const bar = bars.find((b) => b.date === d);
          if (!bar) continue;
          const spot = bar.close;
          const rate = rateOn(d);
          const dy = divYieldOn(divsBy.get(t) ?? [], d, spot);
          const raw = grouped.get(`${t}|${d}`);
          let chain: Chain | null = null;
          if (raw && raw.length > 0) {
            const quotes: OptionQuote[] = [];
            for (const r of raw) {
              const right = rightOf(r.r);
              const exp = toIso(r.e);
              const dte = diffDays(d, exp);
              const k = Number(r.k);
              if (!right || dte < 0 || dte > 70 || Math.abs(k / spot - 1) > 0.3) continue;
              const base: OptionQuote = {
                expiration: exp,
                strike: k,
                right,
                bid: Number(r.b),
                ask: Number(r.a),
                iv: Number(r.v ?? 0),
                delta: 0,
                gamma: 0,
                theta: 0,
                vega: 0,
                rho: 0,
                source: 'real',
              };
              const nq = normalizeQuote(base, d, spot, rate, dy);
              if (nq) quotes.push(nq);
            }
            if (quotes.length > 0) {
              chain = { symbol: t, date: d, spot, source: 'real', quotes };
              realDays++;
              realDaysBy.get(t)?.add(d);
              if (!firstChain.has(t)) firstChain.set(t, d);
            }
          }
          if (!chain && lastChain.has(t)) {
            chain = modelMissingDay({
              symbol: t,
              date: d,
              spot,
              prior: lastChain.get(t) as Chain,
              rate,
              divYield: dy,
              weeklies: true,
            });
            modeledDays++;
          }
          if (!chain) continue;
          if (chain.source === 'real') lastChain.set(t, chain);
          const iv = constantMaturityIv(chain, 30, rate, dy);
          if (iv) iv30By.get(t)?.set(d, iv);
          const liq = liquidityScore([chain]);
          if (liq !== null) spreadBy.get(t)?.set(d, liq);
          if (needForEarnings.get(t)?.has(d)) kept.get(t)?.set(d, chain);
          if (d >= addDays(lastDate, -365) && chain.source === 'real' && realDaysBy.get(t)!.size % 10 === 0)
            liqSamples.get(t)?.push(chain);
          if (d >= startDate) {
            toWrite.push(chain);
            chainRows += chain.quotes.length;
          }
        }
      }
      writer.putChains(toWrite);
    }

    // Vol, earnings, fundamentals, symbols, windows.
    const symbols: SymbolInfo[] = [];
    const rawWindows: RawWindow[] = [];
    const vixMap = new Map(vix.map((v) => [v.date, v.close] as const));
    for (const t of tickers) {
      const bars = barsBy.get(t) ?? [];
      const vol = volSeries(bars, iv30By.get(t) ?? new Map());
      writer.putVol(
        t,
        vol.filter((v) => v.date >= startDate),
      );
      const chainsKept = kept.get(t) ?? new Map();
      const events = enrichEarnings(rawEarnBy.get(t) ?? [], bars, (d) => chainsKept.get(d) ?? null, rateOn);
      // In a sync, older reports keep the implied moves computed by the full build.
      writer.putEarnings(
        opts.incrementalFrom ? events.filter((e) => e.reactionDate >= addDays(startDate, -5)) : events,
      );
      const fundamentals: Fundamentals[] = events.map((e) => ({
        symbol: t,
        reportDate: e.date,
        periodEnd: addDays(e.date, -30),
        eps: e.actual,
        epsEstimate: e.estimate,
        revenue: null,
        netIncome: null,
        sharesOut: null,
      }));
      if (m.income) {
        const im = m.income;
        const inc = await server.query<Record<string, unknown>>(
          `SELECT ${q(im, 'date')} AS d, ${q(im, 'period')} AS p, ${q(im, 'revenue')} AS rev, ${q(im, 'netIncome')} AS ni, ${q(im, 'shares')} AS sh FROM ${from(im)} WHERE ${q(im, 'symbol')} = ? ORDER BY d`,
          [t],
        );
        for (const f of fundamentals) {
          // The latest quarter that ended before the report date: no restatements from later filings.
          const row = inc
            .filter(
              (r) =>
                toIso(r.d) < f.reportDate &&
                diffDays(toIso(r.d), f.reportDate) < 120 &&
                String(r.p ?? 'Quarter')
                  .toLowerCase()
                  .startsWith('q'),
            )
            .pop();
          if (row) {
            f.periodEnd = toIso(row.d);
            f.revenue = num(row.rev);
            f.netIncome = num(row.ni);
            f.sharesOut = num(row.sh);
          }
        }
      }
      writer.putFundamentals(fundamentals);
      const info = candidateInfo(t);
      const sel = selection.find((s) => s.symbol === t);
      const ivs = [...(iv30By.get(t)?.values() ?? [])].slice(-252);
      symbols.push({
        symbol: t,
        name: info?.name ?? t,
        sector: info?.sector ?? 'Unknown',
        sizeTier: info?.group === 'context' ? 'etf' : info?.group === 'mag7' ? 'mega' : 'large',
        kind: 'real',
        isEtf: info?.group === 'context',
        weeklies: true,
        firstDate: bars[0]?.date ?? BARS_FROM,
        lastDate: bars[bars.length - 1]?.date ?? lastDate,
        chainFirstDate: firstChain.get(t) ?? '2019-02-01',
        reason: sel?.reason ?? '',
        liquidity: liquidityScore(liqSamples.get(t) ?? []),
        ivLevel: median(ivs),
      });
      const volMap = new Map(vol.map((v) => [v.date, v] as const));
      const real = realDaysBy.get(t) ?? new Set();
      rawWindows.push(
        ...buildSymbolWindows({
          symbol: t,
          bars,
          hasChain: (d) => real.has(d),
          splits: splitsBy.get(t) ?? [],
          earningsReactionDates: events.map((e) => e.reactionDate),
          exDivDates: (divsBy.get(t) ?? []).map((d) => d.exDate),
          macro,
          vixClose: (d) => vixMap.get(d) ?? null,
          vol: (d) => volMap.get(d) ?? null,
          spreadPct: (d) => spreadBy.get(t)?.get(d) ?? null,
        }),
      );
    }
    writer.putSymbols(symbols);
    const windows = finalizeWindows(rawWindows, lastDate);
    writer.replaceWindows(windows);
    writer.setMeta({
      kind: 'real',
      version: 1,
      builtAt: new Date().toISOString(),
      firstDate: BARS_FROM,
      lastDate,
      benchmark: tickers.includes('SPY') ? 'SPY' : tickers[0],
      context: ['SPY', 'DIA'].filter((s) => tickers.includes(s)),
      notes: [
        'Options data: DoltHub post-no-preference/options (CC BY-SA 4.0).',
        'Missing chain days are modeled from the prior real chain and labeled MODEL.',
        'FOMC/CPI dates compiled offline; see data/REPORT.md.',
      ],
    });
    writer.close();
    progress('Done', 1);
    return {
      tickers: selection,
      scores,
      chainRows,
      modeledDays,
      realDays,
      windows: windows.length,
      lastDate,
    };
  } finally {
    await server.stop();
  }
}
