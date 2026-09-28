import { tradingDaysBetween, type ISODate } from '../../calendar';
import { quoteOption } from '../../pricing/chainModel';
import { macroCalendar } from '../macroCalendar';
import { filterWindows } from '../filter';
import type { EarningsScheduleItem, MarketDataSource, WindowFilter } from '../source';
import type {
  Bar,
  Chain,
  ContractKey,
  DatasetMeta,
  Dividend,
  EarningsEvent,
  Fundamentals,
  MacroEvent,
  OptionQuote,
  RatePoint,
  Split,
  SymbolInfo,
  VixBar,
  VolPoint,
  WindowDef,
} from '../types';
import { buildSymbolWindows, finalizeWindows } from '../windows';
import { SynthMarket } from './generator';
import {
  SYNTH_BENCHMARK,
  SYNTH_CONTEXT,
  SYNTH_FIRST_BAR,
  SYNTH_FIRST_CHAIN,
  SYNTH_LAST_DATE,
  SYNTH_SEED,
  SYNTH_UNIVERSE,
} from './universe';

const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to;

/** The SIM market behind the same interface as the real database. */
export class SyntheticSource implements MarketDataSource {
  readonly market: SynthMarket;
  private windowCache: WindowDef[] | null = null;
  private volCache = new Map<string, VolPoint[]>();
  private readonly lastDate: ISODate;
  private readonly symbolsList: string[];

  constructor(opts: { seed?: string; lastDate?: ISODate; symbols?: string[] } = {}) {
    this.lastDate = opts.lastDate ?? SYNTH_LAST_DATE;
    this.market = new SynthMarket(opts.seed ?? SYNTH_SEED, this.lastDate);
    this.symbolsList = opts.symbols ?? SYNTH_UNIVERSE.map((u) => u.symbol);
  }

  async meta(): Promise<DatasetMeta> {
    return {
      kind: 'synthetic',
      version: 1,
      builtAt: 'generated',
      firstDate: SYNTH_FIRST_BAR,
      lastDate: this.lastDate,
      benchmark: SYNTH_BENCHMARK,
      context: SYNTH_CONTEXT,
      notes: ['SIM market: fictional companies and invented prices. Build real data in Settings > Data.'],
    };
  }

  async symbols(): Promise<SymbolInfo[]> {
    return this.symbolsList.map((sym) => {
      const spec = this.market.spec(sym);
      const vol = this.volSeries(sym);
      const lastYear = vol.slice(-252).map((v) => v.iv30 ?? 0);
      const sorted = lastYear.slice().sort((a, b) => a - b);
      return {
        symbol: sym,
        name: spec.name,
        sector: spec.sector,
        sizeTier: spec.sizeTier,
        kind: 'synthetic',
        isEtf: spec.isEtf,
        weeklies: spec.weeklies,
        firstDate: SYNTH_FIRST_BAR,
        lastDate: this.lastDate,
        chainFirstDate: SYNTH_FIRST_CHAIN,
        reason: spec.reason,
        liquidity: this.spreadPct(sym, this.lastDate),
        ivLevel: sorted[sorted.length >> 1] ?? null,
      };
    });
  }

  async tradingDays(from: ISODate, to: ISODate): Promise<ISODate[]> {
    return tradingDaysBetween(
      from < SYNTH_FIRST_BAR ? SYNTH_FIRST_BAR : from,
      to > this.lastDate ? this.lastDate : to,
    );
  }

  async bars(symbol: string, from: ISODate, to: ISODate): Promise<Bar[]> {
    return this.market.path(symbol).bars.filter((b) => inRange(b.date, from, to));
  }

  async chain(symbol: string, date: ISODate): Promise<Chain | null> {
    if (date < SYNTH_FIRST_CHAIN) return null;
    return this.market.chain(symbol, date);
  }

  async quotes(
    symbol: string,
    keys: ContractKey[],
    from: ISODate,
    to: ISODate,
  ): Promise<(OptionQuote & { date: ISODate })[]> {
    const p = this.market.path(symbol);
    const out: (OptionQuote & { date: ISODate })[] = [];
    for (const b of p.bars) {
      if (!inRange(b.date, from, to) || b.date < SYNTH_FIRST_CHAIN) continue;
      const idx = p.indexOf.get(b.date) as number;
      const model = this.market.surface(symbol, idx);
      for (const k of keys) {
        if (k.expiration < b.date) continue;
        const q = quoteOption(k.right, k.expiration, k.strike, {
          date: b.date,
          spot: b.close,
          rate: this.market.rate(idx),
          divYield: p.spec.divYield,
          model,
          source: 'synthetic',
        });
        out.push({ ...q, date: b.date });
      }
    }
    return out;
  }

  async earnings(symbol: string, from: ISODate, to: ISODate): Promise<EarningsEvent[]> {
    return this.market
      .path(symbol)
      .earnings.map((e) => e.event)
      .filter((e) => inRange(e.date, from, to))
      .map((e) => ({ ...e }));
  }

  async earningsSchedule(symbol: string, from: ISODate, to: ISODate): Promise<EarningsScheduleItem[]> {
    return (await this.earnings(symbol, from, to)).map((e) => ({
      symbol: e.symbol,
      date: e.date,
      timing: e.timing,
      reactionDate: e.reactionDate,
    }));
  }

  async dividends(symbol: string, from: ISODate, to: ISODate): Promise<Dividend[]> {
    return this.market.path(symbol).dividends.filter((d) => inRange(d.exDate, from, to));
  }

  async splits(symbol: string): Promise<Split[]> {
    return this.market.path(symbol).splits;
  }

  async vol(symbol: string, from: ISODate, to: ISODate): Promise<VolPoint[]> {
    return this.volSeries(symbol).filter((v) => inRange(v.date, from, to));
  }

  async fundamentals(symbol: string, from: ISODate, to: ISODate): Promise<Fundamentals[]> {
    return this.market.path(symbol).fundamentals.filter((f) => inRange(f.reportDate, from, to));
  }

  async rates(from: ISODate, to: ISODate): Promise<RatePoint[]> {
    return this.market.marketPath().rates.filter((r) => inRange(r.date, from, to));
  }

  async vix(from: ISODate, to: ISODate): Promise<VixBar[]> {
    return this.market.marketPath().vix.filter((v) => inRange(v.date, from, to));
  }

  async macro(from: ISODate, to: ISODate): Promise<MacroEvent[]> {
    return macroCalendar().filter((m) => inRange(m.date, from, to));
  }

  async windows(filter: WindowFilter): Promise<WindowDef[]> {
    return filterWindows(this.allWindows(), filter);
  }

  async window(id: number): Promise<WindowDef | null> {
    return this.allWindows().find((w) => w.id === id) ?? null;
  }

  allWindows(): WindowDef[] {
    if (this.windowCache) return this.windowCache;
    const mkt = this.market.marketPath();
    const macro = macroCalendar();
    const raw = this.symbolsList.flatMap((sym) => {
      const p = this.market.path(sym);
      const vol = new Map(this.volSeries(sym).map((v) => [v.date, v] as const));
      return buildSymbolWindows({
        symbol: sym,
        bars: p.bars,
        hasChain: (d) => d >= SYNTH_FIRST_CHAIN,
        splits: p.splits,
        earningsReactionDates: p.earnings.map((e) => e.event.reactionDate),
        exDivDates: p.dividends.map((d) => d.exDate),
        macro,
        vixClose: (d) => {
          const i = mkt.indexOf.get(d);
          return i === undefined ? null : mkt.vix[i].close;
        },
        vol: (d) => vol.get(d) ?? null,
        spreadPct: (d) => this.spreadPct(sym, d),
      });
    });
    this.windowCache = finalizeWindows(raw, this.lastDate);
    return this.windowCache;
  }

  private volSeries(symbol: string): VolPoint[] {
    let v = this.volCache.get(symbol);
    if (!v) {
      v = this.market.vol(symbol);
      this.volCache.set(symbol, v);
    }
    return v;
  }

  /** Median relative bid/ask of ~25-delta options near 30 DTE: the liquidity score. */
  private spreadPct(symbol: string, date: ISODate): number | null {
    const p = this.market.path(symbol);
    const idx = p.indexOf.get(date);
    if (idx === undefined) return null;
    const spot = p.bars[idx].close;
    const model = this.market.surface(symbol, idx);
    const t = 30 / 365;
    const iv = this.market.atmIv(symbol, idx, t);
    const exp = new Date(Date.parse(date) + 30 * 86400000).toISOString().slice(0, 10);
    const rels: number[] = [];
    for (const [right, z] of [
      ['P', -0.67],
      ['C', 0.67],
    ] as const) {
      const k = spot * Math.exp(z * iv * Math.sqrt(t));
      const q = quoteOption(right, exp, Math.round(k * 2) / 2, {
        date,
        spot,
        rate: this.market.rate(idx),
        divYield: p.spec.divYield,
        model,
        source: 'synthetic',
      });
      const mid = (q.bid + q.ask) / 2;
      if (mid > 0) rels.push((q.ask - q.bid) / mid);
    }
    return rels.length ? Math.round((rels.reduce((a, b) => a + b, 0) / rels.length) * 10000) / 10000 : null;
  }
}
