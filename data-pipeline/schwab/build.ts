/**
 * BUILD GAME DATA FROM SCHWAB: turns schwab.db into a playable game.db with no DoltHub download.
 *
 * What's real: every daily candle, the VIX and the T-bill rate, and each option chain pulled
 * after a close. What's modeled (labeled MODEL): every other day's chain, from the stock's own
 * trailing volatility (see historyModel.ts), and the few days after a real chain, carried on its
 * real surface. Schwab's market data has no earnings or dividend history, so this market has no
 * earnings events or ex-dividend days; the DoltHub build is the one with those.
 *
 * Chains that are modeled from history aren't stored: the game models them when it reads them,
 * so the build takes seconds and the file stays small.
 */

import { addDays, diffDays, isTradingDay, type ISODate } from '../../src/engine/calendar';
import { macroCalendar } from '../../src/engine/market/macroCalendar';
import type { Chain, RatePoint, SymbolInfo, VixBar } from '../../src/engine/market/types';
import { buildSymbolWindows, finalizeWindows, type RawWindow } from '../../src/engine/market/windows';
import { CANDIDATES, candidateInfo } from '../dolt/tickers';
import {
  constantMaturityIv,
  liquidityScore,
  median,
  modelMissingDay,
  normalizeQuote,
  volSeries,
} from '../lib/derived';
import { GameDbWriter } from '../lib/gameDb';
import { HISTORY_DEPTH, historyChain, historySurface } from '../lib/historyModel';
import { tbillToRate } from './pull';
import { SchwabStore, TBILL_SYMBOL, VIX_SYMBOL } from './store';

export interface SchwabBuildSummary {
  tickers: string[];
  firstDate: ISODate;
  lastDate: ISODate;
  realChains: number;
  windows: number;
  message: string;
}

/** Enough history for the volatility estimates before a day gets a chain. */
const CHAIN_WARMUP_BARS = 64;
/** A real chain's surface is carried this many calendar days before the history model takes over. */
const CARRY_REAL_DAYS = 7;

export const SCHWAB_BUILD_NOTES = [
  'Prices, the VIX and the T-bill rate: Schwab market data (read-only), pulled on this computer into schwab.db.',
  "Option chains are real on the closes they were pulled after. Every other day's chain is modeled from the stock's trailing volatility and labeled MODEL.",
  "Schwab's market data has no earnings or dividend history, so this market has no earnings events or ex-dividend days (the DoltHub build has them).",
];

export async function buildFromSchwab(opts: {
  storePath: string;
  gameDbPath: string;
  /** VIX history when the store has none (the game downloads Cboe's free file). */
  vixFallback?: () => Promise<VixBar[]>;
  log?: (m: string) => void;
  progress?: (stage: string, f: number) => void;
}): Promise<SchwabBuildSummary> {
  const log = opts.log ?? (() => undefined);
  const progress = opts.progress ?? (() => undefined);
  const store = new SchwabStore(opts.storePath, { readOnly: true });
  try {
    // The game's own tickers only: schwab.db also holds the Trade Builder's (and any it used to
    // list), which the lineups never deal (two years of history, no earnings, cash-settled indexes).
    const game = new Set(CANDIDATES.filter((c) => c.group !== 'builder').map((c) => c.symbol));
    const tickers = store
      .symbols()
      .filter((s) => game.has(s) && store.candles(s).length > CHAIN_WARMUP_BARS + 20);
    if (!tickers.length) throw new Error('schwab.db has no price history yet. Pull from Schwab first.');
    const barsBy = new Map(tickers.map((t) => [t, store.candles(t).filter((b) => isTradingDay(b.date))]));
    const lastOf = (t: string) => barsBy.get(t)?.at(-1)?.date as ISODate;
    // The market's last day: the benchmark's, so every ticker is on the same calendar.
    const lastDate = tickers.includes('SPY')
      ? lastOf('SPY')
      : ([...tickers].map(lastOf).sort().at(-1) as ISODate);
    const days = [...new Set(tickers.flatMap((t) => (barsBy.get(t) ?? []).map((b) => b.date)))]
      .filter((d) => d <= lastDate)
      .sort();
    const firstDate = days[0];

    const tb = store.candles(TBILL_SYMBOL);
    const toRate = tbillToRate(tb.map((b) => b.close));
    // Only the 3-month rate is known; the game reads no other tenor.
    const rates: RatePoint[] = tb
      .filter((b) => b.date <= lastDate)
      .map((b) => {
        const r = toRate(b.close);
        return { date: b.date, r3m: r, r1y: r, r2y: r, r10y: r };
      });
    const rateOn = (d: ISODate): number => {
      let best = rates[0]?.r3m ?? 0.03;
      for (const r of rates) {
        if (r.date > d) break;
        best = r.r3m;
      }
      return best;
    };
    let vix: VixBar[] = store
      .candles(VIX_SYMBOL)
      .filter((b) => b.date <= lastDate)
      .map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
    if (!vix.length && opts.vixFallback) {
      try {
        vix = (await opts.vixFallback()).filter((v) => v.date >= firstDate && v.date <= lastDate);
      } catch (e) {
        log(`VIX download failed (${(e as Error).message}); VIX-based Reviews use a fallback.`);
      }
    }
    const vixMap = new Map(vix.map((v) => [v.date, v.close] as const));
    const vixOn = (d: ISODate): number | null => {
      let best: number | null = null;
      for (let k = 0; k < 7 && best === null; k++) best = vixMap.get(addDays(d, -k)) ?? null;
      return best;
    };

    const writer = new GameDbWriter(opts.gameDbPath);
    let realChains = 0;
    let windowsCount = 0;
    try {
      writer.putTradingDays(days);
      writer.putRates(rates);
      writer.putVix(vix);
      const macro = macroCalendar().filter((m) => m.date >= firstDate);
      writer.putMacro(macro);
      const symbols: SymbolInfo[] = [];
      const rawWindows: RawWindow[] = [];
      for (const [ti, t] of tickers.entries()) {
        progress('Building game data from schwab.db', ti / tickers.length);
        const info = candidateInfo(t);
        const isEtf = info?.group === 'context' || /ETF/i.test(info?.sector ?? '');
        const bars = (barsBy.get(t) ?? []).filter((b) => b.date <= lastDate);
        writer.putBars(t, bars);
        const closes = bars.map((b) => b.close);
        const real = new Map<ISODate, Chain>();
        for (const c of store.chains(t, firstDate, lastDate)) {
          const rate = rateOn(c.date);
          const quotes = c.quotes
            .map((q) => normalizeQuote(q, c.date, c.spot, rate, 0))
            .filter((q): q is NonNullable<typeof q> => q !== null);
          if (quotes.length) real.set(c.date, { ...c, quotes });
        }
        const iv30 = new Map<ISODate, number>();
        const spread = new Map<ISODate, number>();
        const stored: Chain[] = [];
        const modeledDays: { symbol: string; date: ISODate; spot: number; spread: number | null }[] = [];
        let lastReal: Chain | null = null;
        let lastSpread: number | null = null;
        const chainStart = bars[Math.min(CHAIN_WARMUP_BARS, bars.length - 1)].date;
        for (let i = CHAIN_WARMUP_BARS; i < bars.length; i++) {
          const b = bars[i];
          const rate = rateOn(b.date);
          const r = real.get(b.date);
          let chain: Chain | null = null;
          if (r) {
            chain = r;
            lastReal = r;
            realChains++;
          } else if (lastReal && diffDays(lastReal.date, b.date) <= CARRY_REAL_DAYS) {
            chain = modelMissingDay({
              symbol: t,
              date: b.date,
              spot: b.close,
              prior: lastReal,
              rate,
              divYield: 0,
              weeklies: true,
            });
          }
          if (chain) {
            stored.push(chain);
            const iv = constantMaturityIv(chain, 30, rate, 0);
            if (iv) iv30.set(b.date, iv);
            const liq = liquidityScore([chain]);
            if (liq !== null) spread.set(b.date, liq);
            continue;
          }
          const input = {
            closes: closes.slice(Math.max(0, i - HISTORY_DEPTH), i + 1),
            vix: vixOn(b.date),
            isEtf,
          };
          iv30.set(b.date, Math.round(historySurface(input).atm(30 / 365) * 10000) / 10000);
          // The spread doesn't move much day to day: sample it weekly (a whole modeled chain).
          if (lastSpread === null || i % 5 === 0)
            lastSpread = liquidityScore([
              historyChain({ ...input, symbol: t, date: b.date, rate, divYield: 0 }),
            ]);
          if (lastSpread !== null) spread.set(b.date, lastSpread);
          modeledDays.push({ symbol: t, date: b.date, spot: b.close, spread: lastSpread });
        }
        writer.putChains(stored);
        writer.putChainDays(modeledDays);
        const vol = volSeries(bars, iv30);
        writer.putVol(t, vol);
        const volMap = new Map(vol.map((v) => [v.date, v] as const));
        const ivs = [...iv30.values()].slice(-252);
        symbols.push({
          symbol: t,
          name: info?.name ?? t,
          sector: info?.sector ?? 'Unknown',
          sizeTier: isEtf ? 'etf' : info?.group === 'mag7' ? 'mega' : 'large',
          kind: 'real',
          isEtf,
          weeklies: true,
          firstDate: bars[0].date,
          lastDate: bars[bars.length - 1].date,
          chainFirstDate: chainStart,
          reason: 'Pulled from Schwab',
          liquidity: median([...spread.values()].slice(-252)),
          ivLevel: median(ivs),
        });
        rawWindows.push(
          ...buildSymbolWindows({
            symbol: t,
            bars,
            hasChain: (d) => d >= chainStart,
            // Schwab's candles and the stored chains are both split-adjusted: no jumps to avoid.
            splits: [],
            earningsReactionDates: [],
            exDivDates: [],
            macro,
            vixClose: (d) => vixMap.get(d) ?? null,
            vol: (d) => volMap.get(d) ?? null,
            spreadPct: (d) => spread.get(d) ?? null,
          }),
        );
      }
      writer.putSymbols(symbols);
      const windows = finalizeWindows(rawWindows, lastDate);
      windowsCount = windows.length;
      writer.replaceWindows(windows);
      writer.setMeta({
        kind: 'real',
        version: 1,
        builtAt: new Date().toISOString(),
        firstDate,
        lastDate,
        benchmark: tickers.includes('SPY') ? 'SPY' : tickers[0],
        context: ['SPY', 'DIA'].filter((s) => tickers.includes(s)),
        notes: [...SCHWAB_BUILD_NOTES, 'FOMC/CPI dates compiled offline; see data/REPORT.md.'],
        chainModel: 'history',
      });
    } finally {
      writer.close();
    }
    progress('Done', 1);
    return {
      tickers,
      firstDate,
      lastDate,
      realChains,
      windows: windowsCount,
      message: `Game data built from schwab.db: ${tickers.length} tickers, ${firstDate} to ${lastDate}, ${realChains} real option chain${realChains === 1 ? '' : 's'} (other days modeled, labeled MODEL).`,
    };
  } finally {
    store.close();
  }
}
