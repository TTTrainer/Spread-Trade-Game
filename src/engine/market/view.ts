/**
 * MarketView: the only way game systems read market data.
 *
 * It owns a clock over one window's trading days and fetches data day by day through a
 * gated source, so nothing dated after the current simulated day is ever requested, and
 * every read also checks the clock. Scheduled events (earnings dates, ex-dividend dates,
 * Fed and CPI days) are visible ahead of time; their outcomes appear only on the day.
 * All data leaves the view already blind-transformed.
 */

import { addDays, type ISODate } from '../calendar';
import { gateSource, DIVIDEND_DECLARE_DAYS } from './gate';
import {
  DataNotLoadedError,
  isClockAware,
  LookaheadError,
  type EarningsScheduleItem,
  type MarketDataSource,
} from './source';
import {
  toRealKey,
  transformBars,
  transformChain,
  transformDividend,
  transformEarnings,
  transformFundamentals,
  transformQuote,
  type BlindTransform,
} from './transform';
import {
  contractId,
  type Bar,
  type Chain,
  type ContractKey,
  type Dividend,
  type EarningsEvent,
  type Fundamentals,
  type MacroEvent,
  type OptionQuote,
  type RatePoint,
  type VixBar,
  type VolPoint,
  type WindowDef,
} from './types';

/** What the player may know about the window itself (no dealer-only regime tags). */
export interface PublicWindow {
  id: number;
  displaySymbol: string;
  historyStart: ISODate;
  entryDate: ISODate;
  endDate: ISODate;
  forwardDays: number;
}

export interface MarketViewOptions {
  source: MarketDataSource;
  window: WindowDef;
  transform: BlindTransform;
  /** Start later than the window's entry (the Time Skip memo). */
  startOffset?: number;
  benchmark?: string;
  /** How far ahead scheduled events are listed. */
  scheduleHorizonDays?: number;
}

export class MarketView {
  readonly transform: BlindTransform;
  readonly publicWindow: PublicWindow;
  private readonly win: WindowDef;
  private readonly src: MarketDataSource;
  private readonly benchmark: string | null;
  private days: ISODate[] = [];
  private idx = -1;
  private entryIdx = 0;
  private realBars: Bar[] = [];
  private benchBars: Bar[] = [];
  private chains = new Map<ISODate, Chain>();
  private tracked = new Map<string, ContractKey>(); // real keys by real id
  private quotesByDay = new Map<ISODate, Map<string, OptionQuote>>(); // real quotes by real id
  private earningsSched: EarningsScheduleItem[] = [];
  private earningsPast: EarningsEvent[] = [];
  private dividendList: Dividend[] = [];
  private macroList: MacroEvent[] = [];
  private vixBars: VixBar[] = [];
  private ratePts: RatePoint[] = [];
  private volPts: VolPoint[] = [];
  private fundamentalsList: Fundamentals[] = [];
  private flipAnchor: number | undefined;
  private readonly horizon: number;
  private readonly startOffset: number;

  private constructor(opts: MarketViewOptions) {
    this.win = opts.window;
    this.transform = opts.transform;
    this.benchmark = opts.benchmark ?? null;
    this.horizon = opts.scheduleHorizonDays ?? 90;
    this.startOffset = opts.startOffset ?? 0;
    // Every request is checked against the clock before it reaches the data.
    const clock = () => this.nowOrStart();
    const inner = isClockAware(opts.source) ? opts.source.withClock(clock) : opts.source;
    this.src = gateSource(inner, clock);
    this.publicWindow = {
      id: opts.window.id,
      displaySymbol: opts.transform.displaySymbol,
      historyStart: opts.window.historyStart,
      entryDate: opts.window.entryDate,
      endDate: opts.window.endDate,
      forwardDays: opts.window.forwardDays,
    };
  }

  static async open(opts: MarketViewOptions): Promise<MarketView> {
    const v = new MarketView(opts);
    await v.init();
    return v;
  }

  private nowOrStart(): ISODate {
    return this.idx >= 0 ? this.days[this.idx] : this.win.entryDate;
  }

  private async init(): Promise<void> {
    const w = this.win;
    this.days = await this.src.tradingDays(w.historyStart, w.endDate);
    this.entryIdx = this.days.indexOf(w.entryDate);
    if (this.entryIdx < 0)
      throw new Error(`Window ${w.id}: entry ${w.entryDate} is not a trading day in range`);
    this.idx = Math.min(this.entryIdx + this.startOffset, this.days.length - 1);
    const now = this.now;
    const sym = this.transform.realSymbol;
    const [bars, sched, past, divs, macro, vix, rates, vol, fund, bench] = await Promise.all([
      this.src.bars(sym, w.historyStart, now),
      this.src.earningsSchedule(sym, addDays(w.historyStart, -400), addDays(now, this.horizon)),
      this.src.earnings(sym, addDays(w.historyStart, -800), now),
      this.src.dividends(sym, addDays(w.historyStart, -400), addDays(now, DIVIDEND_DECLARE_DAYS)),
      this.src.macro(w.historyStart, addDays(now, this.horizon)),
      this.src.vix(w.historyStart, now),
      this.src.rates(w.historyStart, now),
      this.src.vol(sym, w.historyStart, now),
      this.src.fundamentals(sym, addDays(w.historyStart, -800), now),
      this.benchmark ? this.src.bars(this.benchmark, w.historyStart, now) : Promise.resolve([] as Bar[]),
    ]);
    this.realBars = bars;
    this.flipAnchor = bars[0]?.close;
    this.earningsSched = sched;
    this.earningsPast = past.filter((e) => e.reactionDate <= now);
    this.dividendList = divs;
    this.macroList = macro;
    this.vixBars = vix;
    this.ratePts = rates;
    this.volPts = vol;
    this.fundamentalsList = fund;
    this.benchBars = bench;
  }

  // ---- clock ----

  get now(): ISODate {
    return this.days[this.idx];
  }

  /** Trading days since entry (0 on the entry day). */
  get dayIndex(): number {
    return this.idx - this.entryIdx;
  }

  get daysRemaining(): number {
    return this.days.length - 1 - this.idx;
  }

  get atEnd(): boolean {
    return this.idx >= this.days.length - 1;
  }

  /** Trading days of the window up to and including today (calendar only, no data). */
  pastDays(): ISODate[] {
    return this.days.slice(0, this.idx + 1);
  }

  /** The exchange calendar ahead is public; used for DTE math and scheduling. */
  upcomingTradingDays(): ISODate[] {
    return this.days.slice(this.idx + 1);
  }

  /** Advance one trading day and fetch that day's data. Returns false at the window's end. */
  async advance(): Promise<boolean> {
    if (this.atEnd) return false;
    this.idx++;
    const now = this.now;
    const sym = this.transform.realSymbol;
    const keys = [...this.tracked.values()].filter((k) => k.expiration >= now);
    const [bar, quotes, earn, divs, vix, rates, vol, fund, bench] = await Promise.all([
      this.src.bars(sym, now, now),
      keys.length ? this.src.quotes(sym, keys, now, now) : Promise.resolve([]),
      this.src.earnings(sym, addDays(now, -7), now),
      this.src.dividends(sym, addDays(now, 1), addDays(now, DIVIDEND_DECLARE_DAYS)),
      this.src.vix(now, now),
      this.src.rates(now, now),
      this.src.vol(sym, now, now),
      this.src.fundamentals(sym, now, now),
      this.benchmark ? this.src.bars(this.benchmark, now, now) : Promise.resolve([] as Bar[]),
    ]);
    this.realBars.push(...bar);
    this.benchBars.push(...bench);
    this.storeQuotes(now, quotes);
    for (const e of earn) {
      if (e.reactionDate <= now && !this.earningsPast.some((p) => p.date === e.date))
        this.earningsPast.push(e);
    }
    for (const d of divs)
      if (!this.dividendList.some((x) => x.exDate === d.exDate)) this.dividendList.push(d);
    this.vixBars.push(...vix);
    this.ratePts.push(...rates);
    this.volPts.push(...vol);
    for (const f of fund)
      if (!this.fundamentalsList.some((x) => x.reportDate === f.reportDate)) this.fundamentalsList.push(f);
    return true;
  }

  private storeQuotes(date: ISODate, quotes: (OptionQuote & { date: ISODate })[]): void {
    let day = this.quotesByDay.get(date);
    if (!day) {
      day = new Map();
      this.quotesByDay.set(date, day);
    }
    for (const q of quotes) day.set(contractId(q), q);
  }

  // ---- loading ----

  /** Fetch today's full chain (for building and rolling). */
  async loadChain(): Promise<Chain> {
    const now = this.now;
    if (this.transform.flipBars) throw new Error('Flipped charts have no option chain');
    let c = this.chains.get(now);
    if (!c) {
      const fetched = await this.src.chain(this.transform.realSymbol, now);
      if (!fetched) throw new DataNotLoadedError(`chain ${this.transform.realSymbol} ${now}`);
      c = fetched;
      this.chains.set(now, c);
      this.storeQuotes(
        now,
        c.quotes.map((q) => ({ ...q, date: now })),
      );
    }
    return transformChain(this.transform, c);
  }

  /** Start following contracts (display keys) so each day's quotes are fetched. */
  async track(displayKeys: ContractKey[]): Promise<void> {
    const real = displayKeys.map((k) => toRealKey(this.transform, k));
    const fresh = real.filter((k) => !this.tracked.has(contractId(k)));
    for (const k of real) this.tracked.set(contractId(k), k);
    const now = this.now;
    const need = fresh.filter((k) => !this.quotesByDay.get(now)?.has(contractId(k)) && k.expiration >= now);
    if (need.length) this.storeQuotes(now, await this.src.quotes(this.transform.realSymbol, need, now, now));
  }

  untrack(displayKeys: ContractKey[]): void {
    for (const k of displayKeys) this.tracked.delete(contractId(toRealKey(this.transform, k)));
  }

  /** Quotes for one contract over past days, e.g. for debrief alternates. */
  async history(
    displayKey: ContractKey,
    from: ISODate,
    to: ISODate = this.now,
  ): Promise<(OptionQuote & { date: ISODate })[]> {
    this.assertNotFuture(to, 'contract history');
    const real = toRealKey(this.transform, displayKey);
    const rows = await this.src.quotes(this.transform.realSymbol, [real], from, to);
    return rows.map((q) => ({ ...transformQuote(this.transform, q), date: q.date }));
  }

  // ---- reads (all clock-checked) ----

  private assertNotFuture(date: ISODate, what: string): void {
    if (date > this.now) throw new LookaheadError(what, date, this.now);
  }

  bars(): Bar[] {
    return transformBars(this.transform, this.realBars, this.flipAnchor);
  }

  lastBar(): Bar {
    const b = this.bars();
    return b[b.length - 1];
  }

  spot(): number {
    return this.lastBar().close;
  }

  benchmarkBars(): Bar[] {
    return this.benchBars.slice();
  }

  hasChain(date: ISODate = this.now): boolean {
    this.assertNotFuture(date, 'chain');
    return this.chains.has(date);
  }

  chain(): Chain {
    return this.chainAt(this.now);
  }

  chainAt(date: ISODate): Chain {
    this.assertNotFuture(date, 'chain');
    if (this.transform.flipBars) throw new Error('Flipped charts have no option chain');
    const c = this.chains.get(date);
    if (!c) throw new DataNotLoadedError(`chain ${date}`);
    return transformChain(this.transform, c);
  }

  quote(displayKey: ContractKey, date: ISODate = this.now): OptionQuote | null {
    this.assertNotFuture(date, 'quote');
    const q = this.quotesByDay.get(date)?.get(contractId(toRealKey(this.transform, displayKey)));
    return q ? transformQuote(this.transform, q) : null;
  }

  /** Scheduled reports ahead (dates only) and past reports with their outcomes. */
  earnings(): { upcoming: EarningsScheduleItem[]; past: EarningsEvent[] } {
    const now = this.now;
    const upcoming = this.earningsSched
      .filter((e) => e.reactionDate > now && e.date <= addDays(now, this.horizon))
      .map((e) => ({ ...e, symbol: this.transform.displaySymbol }));
    const past = this.earningsPast
      .filter((e) => e.reactionDate <= now)
      .map((e) => transformEarnings(this.transform, e));
    return { upcoming, past };
  }

  /** Earnings whose announcement is on or before today but whose reaction session is tomorrow. */
  earningsPending(): EarningsScheduleItem | null {
    const now = this.now;
    return this.earningsSched.find((e) => e.date <= now && e.reactionDate > now) ?? null;
  }

  dividends(): Dividend[] {
    const limit = addDays(this.now, DIVIDEND_DECLARE_DAYS);
    return this.dividendList
      .filter((d) => d.exDate <= limit)
      .map((d) => transformDividend(this.transform, d));
  }

  macro(): MacroEvent[] {
    return this.macroList.filter((m) => m.date <= addDays(this.now, this.horizon));
  }

  vix(): VixBar[] {
    return this.vixBars.filter((v) => v.date <= this.now);
  }

  rate(): number {
    const r = this.ratePts.filter((x) => x.date <= this.now);
    return r.length ? r[r.length - 1].r3m : 0.02;
  }

  vol(): VolPoint[] {
    return this.volPts.filter((v) => v.date <= this.now);
  }

  fundamentals(): Fundamentals[] {
    return this.fundamentalsList
      .filter((f) => f.reportDate <= this.now)
      .map((f) => transformFundamentals(this.transform, f));
  }

  /** "Day 1" is the entry day in blind mode; the real date otherwise. */
  dayLabel(date: ISODate = this.now): string {
    if (!this.transform.hideDates) return date;
    const i = this.days.indexOf(date);
    const n = i - this.entryIdx;
    return n >= 0 ? `Day ${n + 1}` : `Day ${n}`;
  }
}
