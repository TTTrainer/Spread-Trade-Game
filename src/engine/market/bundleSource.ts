/**
 * The Trade Builder's market: a few tickers loaded whole (two years of daily prices, today's
 * option chain, the volatility history), kept in memory. It answers the same questions as the game
 * database, so the regular MarketView, TradingSession, chart, studies and payoff tools run on it
 * unchanged. Every ticker's clock is its own newest day, so there is no future to see: nothing is
 * stored past it.
 */

import { macroCalendar } from './macroCalendar';
import type { EarningsScheduleItem, MarketDataSource, WindowFilter } from './source';
import type {
  Bar,
  Chain,
  ContractKey,
  DatasetMeta,
  Dividend,
  EarningsEvent,
  Fundamentals,
  ISODate,
  MacroEvent,
  OptionQuote,
  RatePoint,
  Split,
  SymbolInfo,
  VixBar,
  VolPoint,
  WindowDef,
} from './types';

export interface MarketBundle {
  symbol: string;
  name: string;
  sector: string;
  isEtf: boolean;
  /** Daily candles, oldest first, through `asOf`. */
  bars: Bar[];
  /** The newest option chain (dated `asOf`), or none when no chain could be had. */
  chain: Chain | null;
  /** The newest day the bundle knows. */
  asOf: ISODate;
  vol: VolPoint[];
  /** Announced report dates (public ahead of time). */
  earnings: EarningsScheduleItem[];
}

export class BundleSource implements MarketDataSource {
  private bundles = new Map<string, MarketBundle>();

  constructor(
    private rate = 0.04,
    private vixBars: VixBar[] = [],
    private benchmark = 'SPY',
  ) {}

  add(b: MarketBundle): void {
    this.bundles.set(b.symbol, b);
  }

  has(symbol: string): boolean {
    return this.bundles.has(symbol);
  }

  get(symbol: string): MarketBundle | undefined {
    return this.bundles.get(symbol);
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  setVix(vix: VixBar[]): void {
    this.vixBars = vix;
  }

  /** The newest day any loaded ticker knows. */
  lastDate(): ISODate | null {
    const ds = [...this.bundles.values()].map((b) => b.asOf).sort();
    return ds.at(-1) ?? null;
  }

  private must(symbol: string): MarketBundle {
    const b = this.bundles.get(symbol);
    if (!b) throw new Error(`${symbol} isn't loaded in the Trade Builder`);
    return b;
  }

  async meta(): Promise<DatasetMeta> {
    const all = [...this.bundles.values()];
    const first = all.flatMap((b) => b.bars.slice(0, 1).map((x) => x.date)).sort()[0];
    const last = this.lastDate();
    return {
      kind: 'real',
      version: 1,
      builtAt: new Date(0).toISOString(),
      firstDate: (first ?? last ?? '2000-01-03') as ISODate,
      lastDate: (last ?? '2000-01-03') as ISODate,
      benchmark: this.benchmark,
      context: [this.benchmark],
      notes: ['Trade Builder: tickers loaded on demand.'],
    };
  }

  async symbols(): Promise<SymbolInfo[]> {
    return [...this.bundles.values()].map((b) => ({
      symbol: b.symbol,
      name: b.name,
      sector: b.sector,
      sizeTier: b.isEtf ? 'etf' : 'large',
      kind: 'real',
      isEtf: b.isEtf,
      weeklies: true,
      firstDate: b.bars[0]?.date ?? b.asOf,
      lastDate: b.asOf,
      chainFirstDate: b.chain?.date ?? b.asOf,
      reason: 'Trade Builder',
      liquidity: null,
      ivLevel: null,
    }));
  }

  async tradingDays(from: ISODate, to: ISODate): Promise<ISODate[]> {
    const days = new Set<ISODate>();
    for (const b of this.bundles.values())
      for (const x of b.bars) if (x.date >= from && x.date <= to) days.add(x.date);
    return [...days].sort();
  }

  async bars(symbol: string, from: ISODate, to: ISODate): Promise<Bar[]> {
    const b = this.bundles.get(symbol);
    return b ? b.bars.filter((x) => x.date >= from && x.date <= to) : [];
  }

  async chain(symbol: string, date: ISODate): Promise<Chain | null> {
    const c = this.must(symbol).chain;
    return c && c.date === date ? c : null;
  }

  async quotes(
    symbol: string,
    keys: ContractKey[],
    from: ISODate,
    to: ISODate,
  ): Promise<(OptionQuote & { date: ISODate })[]> {
    const c = this.bundles.get(symbol)?.chain;
    if (!c || c.date < from || c.date > to) return [];
    return c.quotes
      .filter((q) =>
        keys.some((k) => k.expiration === q.expiration && k.strike === q.strike && k.right === q.right),
      )
      .map((q) => ({ ...q, date: c.date }));
  }

  async earnings(): Promise<EarningsEvent[]> {
    // Outcomes of past reports aren't carried; the schedule below is what the builder shows.
    return [];
  }

  async earningsSchedule(symbol: string, from: ISODate, to: ISODate): Promise<EarningsScheduleItem[]> {
    return (this.bundles.get(symbol)?.earnings ?? []).filter((e) => e.date >= from && e.date <= to);
  }

  async dividends(): Promise<Dividend[]> {
    return [];
  }

  async splits(): Promise<Split[]> {
    return [];
  }

  async vol(symbol: string, from: ISODate, to: ISODate): Promise<VolPoint[]> {
    return (this.bundles.get(symbol)?.vol ?? []).filter((v) => v.date >= from && v.date <= to);
  }

  async fundamentals(): Promise<Fundamentals[]> {
    return [];
  }

  async rates(from: ISODate, to: ISODate): Promise<RatePoint[]> {
    const days = await this.tradingDays(from, to);
    const r = this.rate;
    return days.map((date) => ({ date, r3m: r, r1y: r, r2y: r, r10y: r }));
  }

  async vix(from: ISODate, to: ISODate): Promise<VixBar[]> {
    return this.vixBars.filter((v) => v.date >= from && v.date <= to);
  }

  async macro(from: ISODate, to: ISODate): Promise<MacroEvent[]> {
    return macroCalendar().filter((m) => m.date >= from && m.date <= to);
  }

  async windows(filter: WindowFilter): Promise<WindowDef[]> {
    void filter;
    return [];
  }

  async window(): Promise<WindowDef | null> {
    return null;
  }
}
