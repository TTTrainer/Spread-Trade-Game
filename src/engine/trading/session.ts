/**
 * TradingSession: cards (one window each), orders, positions and the synchronized clock.
 * Every player action is a serializable SessionAction, applied through dispatch() and appended
 * to the action log, so a session replays exactly from its seed plus its log. Sandbox, the
 * run loop, Live mode and the balance simulator all drive trading through this class.
 */

import { addDays, type ISODate } from '../calendar';
import { buildContext, type MarketContext } from '../market/context';
import { asOf, type MarketDataSource } from '../market/source';
import { blindTransform, codename, openTransform, type BlindTransform } from '../market/transform';
import type { Chain, WindowDef } from '../market/types';
import { MarketView } from '../market/view';
import type { Cents } from '../money';
import { BASE_EXECUTION, attemptFill, restingFill, type ExecutionMods, type OrderType } from '../orders/fill';
import { feesFor, pdtAllows } from '../orders/rules';
import { Rng } from '../rng';
import { STRUCTURES } from '../strategies/structures';
import type { BuildParams, Leg, OptionLeg, StructureId } from '../strategies/types';
import {
  adjustAction,
  closeAction,
  exerciseAction,
  forceCloseAtWindowEnd,
  rollAction,
  sellSharesAtOpen,
  type ActionEnv,
} from '../lifecycle/actions';
import {
  atClose,
  defaultPause,
  endOfDay,
  DEFAULT_REALISM,
  type DayContext,
  type RealismToggles,
} from '../lifecycle/daily';
import { defaultBrackets, lastMark, openPosition, optionLegsOf } from '../lifecycle/position';
import type {
  Brackets,
  DayBook,
  DecisionAction,
  DecisionKind,
  DecisionPoint,
  Position,
} from '../lifecycle/types';
import type { Bucket, Call } from '../scoring/calls';
import { dayBook } from './book';
import {
  earningsMagnitude,
  macroMagnitude,
  pctText,
  templateHeadlines,
  type HeadlineEvent,
  type HeadlineProvider,
} from '../../content/headlines';
import { planTrade, type TradePlan } from './plan';

export interface SessionConfig {
  seed: string;
  mode: 'sandbox' | 'run' | 'live' | 'tutorial' | 'sim';
  startEquityCents: Cents;
  riskCapPct: number;
  realism: RealismToggles;
  pause: Record<DecisionKind, boolean>;
  autoBrackets: boolean;
  suppressOnGap: boolean;
  execution: ExecutionMods;
  bracketDefaults: {
    creditTargetPct: number;
    creditStopMult: number;
    debitTargetPct: number;
    debitStopPct: number;
  };
  benchmark: string | null;
  callMode: 'em' | 'fixed';
  blind: boolean;
  rescale: boolean;
  /** Displayed prices aim for this range when rescaling (split-style). */
  priceRange: [number, number];
  /**
   * Live mode: the latest day with data. Cards stop there (nothing is force-closed) and wait for
   * the next sync, which moves the edge forward.
   */
  liveEdge: ISODate | null;
  /**
   * The player's "holding through earnings on purpose" tick also means "don't ask me the night
   * before". Off for the balance bots, which tick it only to be allowed to trade over a report.
   */
  trustEarningsAck: boolean;
  /**
   * Cards nobody has traded yet move with the clock too (with a fresh chain each day), so a trade
   * can start on a later day. Off in the sandbox and the balance simulator.
   */
  advanceIdle?: boolean;
}

export function defaultSessionConfig(over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    seed: 'sandbox',
    mode: 'sandbox',
    startEquityCents: 500_000,
    riskCapPct: 0.1,
    realism: { ...DEFAULT_REALISM },
    pause: defaultPause(),
    trustEarningsAck: false,
    autoBrackets: false,
    suppressOnGap: false,
    execution: { ...BASE_EXECUTION },
    bracketDefaults: { creditTargetPct: 0.5, creditStopMult: 2, debitTargetPct: 0.5, debitStopPct: 0.5 },
    benchmark: null,
    callMode: 'em',
    blind: false,
    rescale: false,
    priceRange: [20, 150],
    liveEdge: null,
    ...over,
  };
}

export interface OrderSpec {
  type: OrderType;
  limit?: number;
  atMid?: boolean;
  /** Risk-desk liquidation: fills at the natural price, ignoring PDT and disabled market orders. */
  forceNatural?: boolean;
}

/** Liquidity limits (a realism toggle): biggest order, and the widest leg market that trades. */
export const LIQUIDITY_MAX_CONTRACTS = 10;
export const LIQUIDITY_MAX_SPREAD = 0.5;
/** Approval levels (a realism toggle): spreads need a Level 3 margin account with this much equity. */
export const SPREAD_APPROVAL_MIN_CENTS = 200_000;

export type SessionAction =
  | { t: 'addCard'; cardId: string; windowId: number; timeSkip?: number }
  /** Live mode: a card on a symbol from a given day up to the live edge (no dealt window). */
  | { t: 'addLive'; cardId: string; symbol: string; entryDate: ISODate }
  | { t: 'removeCard'; cardId: string }
  | { t: 'call'; cardId: string; bucket: Bucket; confidence: number }
  | {
      t: 'place';
      cardId: string;
      structureId: StructureId;
      params: BuildParams;
      legs?: Leg[];
      qty: number;
      order: OrderSpec;
      brackets?: Brackets | null;
      earningsAck: boolean;
    }
  | { t: 'cancel'; orderId: string }
  | { t: 'begin' }
  | { t: 'decide'; dpId: string; action: DecisionAction; legs?: OptionLeg[]; order?: OrderSpec }
  | { t: 'end' }
  | { t: 'close'; positionId: string; order: OrderSpec }
  | { t: 'roll'; positionId: string; legs: OptionLeg[]; order: OrderSpec }
  | { t: 'adjust'; positionId: string; add: Leg[]; remove: Leg[]; order: OrderSpec }
  | { t: 'exercise'; positionId: string; leg: OptionLeg }
  | { t: 'brackets'; positionId: string; brackets: Brackets };

export interface CardInfo {
  id: string;
  windowId: number;
  displaySymbol: string;
  realSymbol: string;
  call: Call | null;
  positionIds: string[];
  orderIds: string[];
  earningsAck: boolean;
  timeSkip: number;
}

export interface RestingOrder {
  id: string;
  cardId: string;
  structureId: StructureId;
  legs: Leg[];
  qty: number;
  limit: number;
  placedOn: ISODate;
  /** undefined = desk defaults, null = no brackets. */
  brackets: Brackets | null | undefined;
  plan: TradePlan;
}

export interface PlaceResult {
  ok: boolean;
  filled: boolean;
  reason: string | null;
  positionId: string | null;
  orderId: string | null;
  probability: number;
  price: number | null;
}

export interface DecisionRecord {
  dp: DecisionPoint;
  action: DecisionAction;
}

export interface SessionEvent {
  kind:
    'fill' | 'rest' | 'close' | 'decision' | 'expired' | 'assigned' | 'headline' | 'gap' | 'reject' | 'alert';
  cardId: string;
  positionId?: string;
  text: string;
  cents?: Cents;
}

export class TradingSession {
  readonly config: SessionConfig;
  readonly log: SessionAction[] = [];
  cards: CardInfo[] = [];
  positions: Position[] = [];
  orders: RestingOrder[] = [];
  decisions: DecisionPoint[] = [];
  decisionHistory: DecisionRecord[] = [];
  /** Events produced by the last action (UI turns these into toasts, sounds and headlines). */
  lastEvents: SessionEvent[] = [];
  dayIndex = 0;
  clockStarted = false;
  /** Set by the run while the round still has days to trade: the session is not done yet. */
  holdOpen = false;
  inDay = false;
  realizedCents: Cents = 0;
  dayTrades: ISODate[] = [];
  private views = new Map<string, MarketView>();
  private chains = new Map<string, Chain>();
  private contexts = new Map<string, MarketContext>();
  private books = new Map<string, DayBook>();
  private windows = new Map<string, WindowDef>();
  private counter = 0;
  /** Swappable, so a live writer can replace the template library later. */
  headlines: HeadlineProvider = templateHeadlines;
  private readonly source: MarketDataSource;
  private readonly rng: Rng;

  constructor(source: MarketDataSource, config: SessionConfig) {
    this.source = source;
    this.config = config;
    this.rng = new Rng(config.seed);
  }

  // ---------- queries ----------

  view(cardId: string): MarketView {
    const v = this.views.get(cardId);
    if (!v) throw new Error(`No card ${cardId}`);
    return v;
  }

  card(cardId: string): CardInfo {
    const c = this.cards.find((x) => x.id === cardId);
    if (!c) throw new Error(`No card ${cardId}`);
    return c;
  }

  window(cardId: string): WindowDef | undefined {
    return this.windows.get(cardId);
  }

  chain(cardId: string): Chain | null {
    return this.chains.get(cardId) ?? null;
  }

  context(cardId: string): MarketContext {
    const c = this.contexts.get(cardId);
    if (!c) throw new Error(`No context for ${cardId}`);
    return c;
  }

  position(id: string): Position | undefined {
    return this.positions.find((p) => p.id === id);
  }

  openPositions(): Position[] {
    return this.positions.filter((p) => p.status === 'open');
  }

  reservedCents(): Cents {
    return (
      this.openPositions().reduce((a, p) => a + p.collateralCents, 0) +
      this.orders.reduce((a, o) => a + o.plan.collateralCents, 0)
    );
  }

  /** Equity for sizing: start plus realized P/L of closed trades. */
  equityCents(): Cents {
    return this.config.startEquityCents + this.realizedCents;
  }

  /**
   * Cash in the account: closed P/L plus the premium every open trade collected (or paid). A
   * credit spread puts cash in right away; equity only moves as the spread's value changes.
   */
  cashCents(): Cents {
    return this.equityCents() + this.openPositions().reduce((a, p) => a + p.cashCents - p.feesCents, 0);
  }

  /** Mark-to-market equity at the last close (for the Max-Loss Line). */
  markedEquityCents(): Cents {
    const open = this.openPositions().reduce((a, p) => a + (lastMark(p)?.plCents ?? 0), 0);
    return this.equityCents() + open;
  }

  runningCardIds(): string[] {
    return this.cards
      .filter(
        (c) => c.positionIds.some((id) => this.position(id)?.status === 'open') || c.orderIds.length > 0,
      )
      .map((c) => c.id);
  }

  /** Cards still waiting for their first trade (they only move with the clock when advanceIdle). */
  idleCardIds(): string[] {
    if (!this.config.advanceIdle) return [];
    return this.cards.filter((c) => c.positionIds.length === 0 && c.orderIds.length === 0).map((c) => c.id);
  }

  /**
   * Cards whose trade has already closed. They keep moving with the clock (when advanceIdle) so
   * their charts stay current while the round runs on; before, they froze on the closing day.
   */
  settledCardIds(): string[] {
    if (!this.config.advanceIdle) return [];
    return this.cards
      .filter(
        (c) =>
          c.positionIds.length > 0 &&
          c.orderIds.length === 0 &&
          c.positionIds.every((id) => this.position(id)?.status !== 'open'),
      )
      .map((c) => c.id);
  }

  /** Every card the next day moves: running trades plus, when enabled, untraded and settled cards. */
  advancingCardIds(): string[] {
    return [...this.runningCardIds(), ...this.idleCardIds(), ...this.settledCardIds()];
  }

  isDone(): boolean {
    return (
      this.clockStarted &&
      !this.holdOpen &&
      this.openPositions().length === 0 &&
      this.orders.length === 0 &&
      this.decisions.length === 0 &&
      !this.inDay
    );
  }

  planFor(
    cardId: string,
    structureId: StructureId,
    params: BuildParams,
    qty: number,
    legs?: Leg[],
  ): TradePlan {
    const chain = this.chains.get(cardId);
    const ctx = this.contexts.get(cardId);
    if (!chain || !ctx) throw new Error('Card has no chain loaded');
    return planTrade({
      structureId,
      params,
      chain,
      qty,
      ctx,
      equityCents: this.equityCents(),
      riskCapPct: this.config.riskCapPct,
      reservedCents: this.reservedCents(),
      rate: this.view(cardId).rate(),
      legs,
    });
  }

  // ---------- actions ----------

  async dispatch(a: SessionAction): Promise<PlaceResult | null> {
    this.lastEvents = [];
    // At the live edge there is no next day yet. The request is not logged, so a replay after the
    // next sync (when the edge has moved) cannot turn it into a real day.
    if (a.t === 'begin' && !this.inDay && this.atLiveEdge()) {
      this.lastEvents.push({
        kind: 'reject',
        cardId: '',
        text: 'You are at the latest close. Sync for new data.',
      });
      return null;
    }
    this.log.push(a);
    switch (a.t) {
      case 'addCard':
        await this.addCard(a.cardId, a.windowId, a.timeSkip ?? 0);
        return null;
      case 'addLive':
        await this.addLiveCard(a.cardId, a.symbol, a.entryDate);
        return null;
      case 'removeCard':
        this.removeCard(a.cardId);
        return null;
      case 'call': {
        const card = this.card(a.cardId);
        card.call = {
          bucket: a.bucket,
          confidence: a.confidence,
          emPct: this.emPct(a.cardId),
          horizonDays: 30,
          mode: this.config.callMode,
        };
        return null;
      }
      case 'place':
        return this.place(a);
      case 'cancel':
        this.cancel(a.orderId);
        return null;
      case 'begin':
        await this.beginDay();
        return null;
      case 'decide':
        await this.decide(a);
        return null;
      case 'end':
        await this.endDay();
        return null;
      case 'close': {
        const p = this.mustOpen(a.positionId);
        this.applyClose(p, a.order, a.order.forceNatural ? 'liquidated' : 'manual');
        return null;
      }
      case 'roll': {
        const p = this.mustOpen(a.positionId);
        const r = rollAction(p, a.legs, a.order, this.actionEnv(p.cardId));
        this.replace(r.pos);
        this.pushEvent(
          p,
          r.fill.filled ? 'fill' : 'reject',
          r.fill.filled
            ? `Rolled for ${r.fill.price < 0 ? 'a credit' : 'a debit'} of ${Math.abs(r.fill.price).toFixed(2)}`
            : (r.fill.reason ?? 'Roll did not fill'),
        );
        if (r.fill.filled) await this.view(p.cardId).track(a.legs);
        return null;
      }
      case 'adjust': {
        const p = this.mustOpen(a.positionId);
        const r = adjustAction(p, a.add, a.remove, a.order, this.actionEnv(p.cardId));
        this.replace(r.pos);
        if (r.pos.status === 'closed') this.onClosed(r.pos);
        const adds = a.add.filter((l): l is OptionLeg => l.kind === 'option');
        if (r.fill.filled && adds.length) await this.view(p.cardId).track(adds);
        return null;
      }
      case 'exercise': {
        const p = this.mustOpen(a.positionId);
        const book = this.bookFor(p.cardId);
        this.replace(exerciseAction(p, a.leg, book.date, book));
        return null;
      }
      case 'brackets': {
        const p = this.mustOpen(a.positionId);
        this.replace({ ...p, brackets: a.brackets });
        return null;
      }
    }
  }

  private emPct(cardId: string): number {
    const ctx = this.context(cardId);
    const iv = ctx.iv30 ?? 0.3;
    // Until a trade picks an expiration, use a 30-day one-sigma move from IV30.
    return iv * Math.sqrt(30 / 365) * 0.8;
  }

  /** Live mode: is every card the clock moves at the latest day with data? */
  atLiveEdge(): boolean {
    const edge = this.config.liveEdge;
    if (!edge) return false;
    const moving = this.advancingCardIds();
    return moving.length > 0 && moving.every((id) => this.view(id).now >= edge);
  }

  private async addLiveCard(cardId: string, symbol: string, entryDate: ISODate): Promise<void> {
    const edge = this.config.liveEdge;
    if (!edge) throw new Error('Live cards need a live edge');
    const w: WindowDef = {
      id: -1 - this.cards.length,
      symbol,
      historyStart: addDays(entryDate, -420),
      entryDate,
      endDate: edge,
      forwardDays: 0,
      recent: true,
      weight: 0,
      tags: {
        adx: 0,
        trendSlope: 0,
        vix: 0,
        ivr: 0,
        hasEarnings: false,
        hasExDiv: false,
        hasFomc: false,
        maxGapAtr: 0,
        spreadPct: 0,
        spreadDecile: 0,
      },
    };
    await this.addCardFrom(cardId, w, 0);
  }

  private async addCard(cardId: string, windowId: number, timeSkip: number): Promise<void> {
    const w = await this.source.window(windowId);
    if (!w) throw new Error(`Window ${windowId} not found`);
    await this.addCardFrom(cardId, w, timeSkip);
  }

  private async addCardFrom(cardId: string, w: WindowDef, timeSkip: number): Promise<void> {
    const windowId = w.id;
    let t: BlindTransform = openTransform(w.symbol, w.entryDate);
    if (this.config.blind) {
      const probe = await asOf(this.source, w.entryDate).bars(w.symbol, w.entryDate, w.entryDate);
      const r = this.rng.fork(`card:${cardId}:${windowId}`);
      t = blindTransform(w.symbol, w.entryDate, probe[0]?.close ?? 100, r, this.config.rescale);
      if (this.config.rescale) {
        const [lo, hi] = this.config.priceRange;
        const px = probe[0]?.close ?? 100;
        const fits = [0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5, 10].filter(
          (f) => px * f >= lo && px * f <= hi && f !== 1,
        );
        t = { ...t, scale: fits.length ? r.pick(fits) : t.scale };
      }
    } else if (this.config.mode === 'sandbox' || this.config.mode === 'live') {
      t = { ...t, displaySymbol: w.symbol };
    }
    if (this.cards.some((c) => c.displaySymbol === t.displaySymbol))
      t = { ...t, displaySymbol: codename(this.rng.fork(`dup:${cardId}`)) };
    const view = await MarketView.open({
      source: this.source,
      window: w,
      transform: t,
      benchmark: this.config.benchmark ?? undefined,
      startOffset: timeSkip,
    });
    this.views.set(cardId, view);
    this.windows.set(cardId, w);
    const chain = await view.loadChain();
    this.chains.set(cardId, chain);
    this.contexts.set(cardId, this.buildCtx(view));
    this.cards.push({
      id: cardId,
      windowId,
      displaySymbol: t.displaySymbol,
      realSymbol: w.symbol,
      call: null,
      positionIds: [],
      orderIds: [],
      earningsAck: false,
      timeSkip,
    });
  }

  /** Take an untraded card off the table (lineup rerolls and Time Skip). */
  private removeCard(cardId: string): void {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card || card.positionIds.length || card.orderIds.length) return;
    this.cards = this.cards.filter((c) => c.id !== cardId);
    this.views.delete(cardId);
    this.chains.delete(cardId);
    this.contexts.delete(cardId);
    this.books.delete(cardId);
    this.windows.delete(cardId);
  }

  private buildCtx(view: MarketView): MarketContext {
    const e = view.earnings();
    const vix = view.vix();
    return buildContext({
      bars: view.bars(),
      vol: view.vol(),
      upcomingEarnings: e.upcoming,
      pastEarnings: e.past,
      dividends: view.dividends(),
      macro: view.macro(),
      vix: vix.length ? vix[vix.length - 1].close : null,
    });
  }

  private nextId(prefix: string): string {
    this.counter++;
    return `${prefix}${this.counter}`;
  }

  private brackets(openNet: number, override?: Brackets | null): Brackets {
    if (override) return override;
    if (override === null) return { targetPl: null, stopPl: null, targetPct: null, stopMult: null };
    const d = this.config.bracketDefaults;
    return defaultBrackets(openNet, d.creditTargetPct, d.creditStopMult, d.debitTargetPct, d.debitStopPct);
  }

  private async place(a: Extract<SessionAction, { t: 'place' }>): Promise<PlaceResult> {
    const card = this.card(a.cardId);
    const view = this.view(a.cardId);
    const plan = this.planFor(a.cardId, a.structureId, a.params, a.qty, a.legs);
    const fail = (reason: string): PlaceResult => {
      this.lastEvents.push({ kind: 'reject', cardId: a.cardId, text: reason });
      return {
        ok: false,
        filled: false,
        reason,
        positionId: null,
        orderId: null,
        probability: 0,
        price: null,
      };
    };
    if (!plan.ok || plan.mid === null || plan.natural === null || !plan.entry)
      return fail(plan.reason ?? 'This trade cannot be placed.');
    const realism = this.config.realism;
    if (realism.approvalLevels && isSpread(plan.legs) && this.equityCents() < SPREAD_APPROVAL_MIN_CENTS)
      return fail(
        'Approval levels: your broker requires a Level 3 margin account with at least $2,000 for spreads.',
      );
    if (realism.liquidityLimits) {
      if (a.qty > LIQUIDITY_MAX_CONTRACTS)
        return fail(`Liquidity limits: at most ${LIQUIDITY_MAX_CONTRACTS} contracts per order.`);
      const chain = this.chains.get(a.cardId);
      const wide = optionLegsOf(plan.legs).some((l) => {
        const q = chain?.quotes.find(
          (x) => x.right === l.right && x.strike === l.strike && x.expiration === l.expiration,
        );
        const mid = q ? (q.bid + q.ask) / 2 : 0;
        return !q || mid <= 0 || (q.ask - q.bid) / mid > LIQUIDITY_MAX_SPREAD;
      });
      if (wide)
        return fail(
          'Liquidity limits: one of the legs has a market too wide to trade (bid/ask over 50% of mid).',
        );
    }
    const bidAsk = this.config.realism.bidAsk;
    const q = { mid: plan.mid, natural: bidAsk ? plan.natural : plan.mid };
    const fill = attemptFill(
      q,
      { type: a.order.type, limit: a.order.limit, atMid: a.order.atMid },
      this.rng.fork(`fill:${this.log.length}`),
      this.config.execution,
    );
    card.earningsAck = a.earningsAck;
    if (a.params.expiration && card.call) {
      const horizon = Math.max(
        1,
        Math.round((Date.parse(a.params.expiration) - Date.parse(view.now)) / 86400000),
      );
      card.call = {
        ...card.call,
        emPct: plan.entry.expectedMovePct ?? card.call.emPct,
        horizonDays: horizon,
      };
    }
    if (!fill.filled) {
      if (fill.reason) return fail(fill.reason);
      const orderId = this.nextId('o');
      this.orders.push({
        id: orderId,
        cardId: a.cardId,
        structureId: a.structureId,
        legs: plan.legs,
        qty: a.qty,
        limit: a.order.limit ?? plan.mid,
        placedOn: view.now,
        brackets: a.brackets,
        plan,
      });
      card.orderIds.push(orderId);
      await view.track(optionLegsOf(plan.legs));
      this.lastEvents.push({
        kind: 'rest',
        cardId: a.cardId,
        text: `Limit resting (${Math.round(fill.probability * 100)}% chance missed). It fills if the market comes to you.`,
      });
      return {
        ok: true,
        filled: false,
        reason: null,
        positionId: null,
        orderId,
        probability: fill.probability,
        price: null,
      };
    }
    const pos = this.openFrom(a.cardId, a.structureId, plan, a.qty, fill.price, a.brackets);
    await view.track(optionLegsOf(plan.legs));
    this.lastEvents.push({
      kind: 'fill',
      cardId: a.cardId,
      positionId: pos.id,
      text: `Filled ${a.qty} ${STRUCTURES[a.structureId].short} at ${fill.price < 0 ? 'a credit of ' : 'a debit of '}${Math.abs(fill.price).toFixed(2)}`,
    });
    return {
      ok: true,
      filled: true,
      reason: null,
      positionId: pos.id,
      orderId: null,
      probability: fill.probability,
      price: fill.price,
    };
  }

  private openFrom(
    cardId: string,
    structureId: StructureId,
    plan: TradePlan,
    qty: number,
    price: number,
    br?: Brackets | null,
  ): Position {
    const view = this.view(cardId);
    const card = this.card(cardId);
    const entry = plan.entry as NonNullable<TradePlan['entry']>;
    const pos = openPosition({
      id: this.nextId('p'),
      cardId,
      windowId: card.windowId,
      symbol: card.displaySymbol,
      structureId,
      legs: plan.legs,
      qty,
      date: view.now,
      fillNet: price,
      midNet: plan.mid as number,
      feesCents: feesFor(plan.legs, qty, this.config.realism.fees),
      collateralCents: plan.collateralCents,
      brackets: this.brackets(price, br),
      entry: { ...entry, fillVsMidCents: Math.round(((plan.mid as number) - price) * 10000 * qty) },
      book: this.bookFor(cardId),
    });
    this.positions.push(pos);
    card.positionIds.push(pos.id);
    return pos;
  }

  private cancel(orderId: string): void {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return;
    this.orders = this.orders.filter((x) => x.id !== orderId);
    const card = this.card(o.cardId);
    card.orderIds = card.orderIds.filter((x) => x !== orderId);
  }

  private bookFor(cardId: string): DayBook {
    const cached = this.books.get(cardId);
    const view = this.view(cardId);
    if (cached && cached.date === view.now) return cached;
    const b = dayBook(view, this.contexts.get(cardId)?.divYield ?? 0);
    this.books.set(cardId, b);
    return b;
  }

  private dayCtx(cardId: string): DayContext {
    return {
      realism: this.config.realism,
      pause: this.config.pause,
      autoBrackets: this.config.autoBrackets,
      suppressOnGap: this.config.suppressOnGap,
      rng: this.rng.fork(`day:${this.dayIndex}:${cardId}`),
    };
  }

  private actionEnv(cardId: string): ActionEnv {
    return {
      book: this.bookFor(cardId),
      rng: this.rng.fork(`act:${this.log.length}:${cardId}`),
      mods: this.config.execution,
      feesOn: this.config.realism.fees,
      bidAsk: this.config.realism.bidAsk,
    };
  }

  private replace(p: Position): void {
    this.positions = this.positions.map((x) => (x.id === p.id ? p : x));
  }

  private mustOpen(id: string): Position {
    const p = this.position(id);
    if (!p || p.status !== 'open') throw new Error(`Position ${id} is not open`);
    return p;
  }

  private pushEvent(p: Position, kind: SessionEvent['kind'], text: string, cents?: Cents): void {
    this.lastEvents.push({ kind, cardId: p.cardId, positionId: p.id, text, cents });
  }

  private onClosed(p: Position): void {
    this.realizedCents += p.realizedCents ?? 0;
    if (p.openedOn === p.closedOn && p.closedOn) this.dayTrades.push(p.closedOn);
    this.decisions = this.decisions.filter((d) => d.positionId !== p.id);
    this.pushEvent(
      p,
      p.exitReason === 'expired' ? 'expired' : p.exitReason === 'assigned' ? 'assigned' : 'close',
      closeText(p),
      p.realizedCents ?? 0,
    );
  }

  private applyClose(p: Position, order: OrderSpec, reason: Position['exitReason']): boolean {
    if (order.forceNatural) {
      const env = this.actionEnv(p.cardId);
      const r = closeAction(
        p,
        { type: 'market' },
        { ...env, mods: { ...env.mods, marketImprove: 0, marketOrdersDisabled: false } as ExecutionMods },
        'liquidated',
      );
      this.replace(r.pos);
      this.onClosed(r.pos);
      return true;
    }
    // Pattern day trader rule: closing on the day you opened is a day trade.
    if (p.openedOn === this.bookFor(p.cardId).date) {
      const allowed = pdtAllows({
        enabled: this.config.realism.pdt,
        equityCents: this.equityCents(),
        recentDayTrades: this.dayTrades,
        tradingDaysBack: this.view(p.cardId).pastDays(),
      });
      if (!allowed) {
        this.pushEvent(p, 'reject', 'Pattern day trader rule: no more day trades this week under $25k.');
        return false;
      }
    }
    const r = closeAction(
      p,
      { type: order.type, limit: order.limit, atMid: order.atMid },
      this.actionEnv(p.cardId),
      reason ?? 'manual',
    );
    if (!r.fill.filled) {
      this.pushEvent(
        p,
        'reject',
        r.fill.reason ?? `Close did not fill (${Math.round(r.fill.probability * 100)}% chance).`,
      );
      return false;
    }
    this.replace(r.pos);
    this.onClosed(r.pos);
    return true;
  }

  // ---------- the clock ----------

  private async beginDay(): Promise<void> {
    if (this.inDay) return;
    this.clockStarted = true;
    this.dayIndex++;
    this.inDay = true;
    // Cards that aren't trading today; read before the running cards, whose trades may close today.
    const idle = [...this.idleCardIds(), ...this.settledCardIds()];
    for (const cardId of this.runningCardIds()) {
      const view = this.view(cardId);
      const moved = await view.advance();
      const book = this.bookFor(cardId);
      if (book.gapDay)
        this.lastEvents.push({
          kind: 'gap',
          cardId,
          text: `${this.card(cardId).displaySymbol} gapped ${book.open > (view.bars().at(-2)?.close ?? book.open) ? 'up' : 'down'} hard at the open.`,
        });
      if (moved)
        for (const h of this.headlinesFor(cardId, book))
          this.lastEvents.push({ kind: 'headline', cardId, text: h });
      this.contexts.set(cardId, this.buildCtx(view));
      // Resting limits fill only if today's market crosses them.
      for (const o of this.orders.filter((x) => x.cardId === cardId)) {
        const q = this.restingQuote(o, book);
        if (q && restingFill(q, o.limit).filled) {
          this.cancel(o.id);
          const pos = this.openFrom(
            cardId,
            o.structureId,
            { ...o.plan, mid: q.mid },
            o.qty,
            o.limit,
            o.brackets,
          );
          this.pushEvent(pos, 'fill', `Resting limit filled at ${Math.abs(o.limit).toFixed(2)}`);
        } else if (!moved && !this.config.liveEdge) this.cancel(o.id);
      }
      for (const p of this.openPositions().filter((x) => x.cardId === cardId)) {
        if (!moved && this.config.liveEdge) continue;
        if (!moved) {
          const closed = forceCloseAtWindowEnd(p, this.actionEnv(cardId));
          this.replace(closed);
          this.onClosed(closed);
          continue;
        }
        const r = atClose(p, book, this.dayCtx(cardId));
        this.replace(r.pos);
        if (r.pos.status === 'closed') this.onClosed(r.pos);
        // Moments that don't stop the clock become short notices instead of pop-ups.
        const sym = this.card(cardId).displaySymbol;
        if (!p.flags.shortTouched && r.pos.flags.shortTouched && !this.config.pause.short_touched)
          this.lastEvents.push({
            kind: 'alert',
            cardId,
            positionId: p.id,
            text: `${sym}: the stock touched your short strike.`,
          });
        if (!p.flags.dte21 && r.pos.flags.dte21 && !this.config.pause.dte21)
          this.lastEvents.push({
            kind: 'alert',
            cardId,
            positionId: p.id,
            text: `${sym}: 21 days to expiration.`,
          });
        // You already said you're holding through earnings on purpose: no need to ask again.
        const acked = this.config.trustEarningsAck && this.card(cardId).earningsAck;
        this.decisions.push(...r.decisions.filter((d) => !(acked && d.kind === 'earnings_tomorrow')));
      }
    }
    // Untraded and settled cards move too: a new day of bars, today's chain (so a trade can start
    // today) and today's news. Nothing past today is read.
    for (const cardId of idle) {
      const view = this.view(cardId);
      if (!(await view.advance())) continue;
      this.chains.set(cardId, await view.loadChain());
      this.contexts.set(cardId, this.buildCtx(view));
      for (const h of this.headlinesFor(cardId, this.bookFor(cardId)))
        this.lastEvents.push({ kind: 'headline', cardId, text: h });
    }
  }

  /**
   * Headlines for what happened on this card today, from its own visible data: an earnings
   * reaction, an unscheduled gap, an ex-dividend date, an FOMC or CPI day, or a VIX spike.
   * Outcomes only appear on the day they happen.
   */
  private headlinesFor(cardId: string, book: DayBook): string[] {
    const view = this.view(cardId);
    const card = this.card(cardId);
    const now = view.now;
    const bars = view.bars();
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    if (!last || !prev) return [];
    const dayMove = last.close / prev.close - 1;
    const dir = dayMove >= 0 ? 'up' : 'down';
    const synthetic = last.source === 'synthetic';
    const mode = this.config.blind || synthetic ? 'blind' : 'open';
    const base = {
      sym: card.displaySymbol,
      move: pctText(dayMove),
      absmove: pctText(Math.abs(dayMove), false),
    };
    const out: HeadlineEvent[] = [];
    const ern = view.earnings().past.find((e) => e.reactionDate === now);
    if (ern) {
      const mv = ern.movePct ?? dayMove * 100;
      const implied = ern.impliedMovePct;
      out.push({
        kind: 'earnings',
        magnitude: earningsMagnitude(mv, implied),
        direction: mv >= 0 ? 'up' : 'down',
        vars: {
          ...base,
          move: pctText(mv / 100),
          absmove: pctText(Math.abs(mv) / 100, false),
          implied: implied ? `±${implied.toFixed(1)}%` : 'an unknown amount',
          ratio: implied ? `${(Math.abs(mv) / implied).toFixed(1)}x` : 'several times',
        },
      });
    } else if (book.gapDay && book.atr) {
      const g = Math.abs(last.open - prev.close) / book.atr;
      out.push({
        kind: 'gap',
        magnitude: g > 3 ? 'huge' : 'big',
        direction: last.open >= prev.close ? 'up' : 'down',
        vars: { ...base, gap: g.toFixed(1) },
      });
    }
    if (book.exDivToday && book.spot > 0) {
      const y = book.exDivToday.amount / book.spot;
      out.push({
        kind: 'exdiv',
        magnitude: y > 0.01 ? 'rich' : 'regular',
        direction: 'none',
        vars: { ...base, yield: pctText(y, false) },
      });
    }
    const macro = view.macro().find((m) => m.date === now);
    if (macro)
      out.push({
        kind: macro.kind === 'FOMC' ? 'fomc' : 'cpi',
        magnitude: macroMagnitude(dayMove),
        direction: dir,
        vars: { ...base, event: macro.kind },
      });
    const vix = view.vix();
    if (vix.length > 7) {
      const v = vix[vix.length - 1].close;
      const chg = v / vix[vix.length - 6].close - 1;
      const prevChg = vix[vix.length - 2].close / vix[vix.length - 7].close - 1;
      if (chg >= 0.2 && prevChg < 0.2)
        out.push({
          kind: 'vix',
          magnitude: v >= 35 ? 'panic' : 'spike',
          direction: 'up',
          vars: { ...base, vix: v.toFixed(1), vixchg: pctText(chg) },
        });
    }
    return out.map((e, i) =>
      this.headlines.headline(e, this.rng.fork(`news:${this.dayIndex}:${cardId}:${i}`), mode),
    );
  }

  private restingQuote(o: RestingOrder, book: DayBook): { mid: number; natural: number } | null {
    let mid = 0;
    let nat = 0;
    for (const l of o.legs) {
      if (l.kind === 'stock') {
        mid += l.ratio * book.spot;
        nat += l.ratio * book.spot;
        continue;
      }
      const q = book.quote(l);
      if (!q) return null;
      mid += l.ratio * ((q.bid + q.ask) / 2);
      nat += l.ratio * (l.ratio > 0 ? q.ask : q.bid);
    }
    return { mid, natural: nat };
  }

  private async decide(a: Extract<SessionAction, { t: 'decide' }>): Promise<void> {
    const dp = this.decisions.find((d) => d.id === a.dpId);
    if (!dp) return;
    this.decisions = this.decisions.filter((d) => d.id !== a.dpId);
    this.decisionHistory.push({ dp, action: a.action });
    const p = this.position(dp.positionId);
    if (!p || p.status !== 'open') return;
    const order = a.order ?? { type: 'market' as const };
    switch (a.action) {
      case 'hold': {
        if (dp.kind === 'stop_hit')
          this.replace({
            ...p,
            brackets: { ...p.brackets, stopPl: null },
            flags: { ...p.flags, stopDeclined: true },
          });
        if (dp.kind === 'target_hit')
          this.replace({
            ...p,
            brackets: { ...p.brackets, targetPl: null },
            flags: { ...p.flags, targetDeclined: true },
          });
        break;
      }
      case 'close': {
        const reason = dp.kind === 'target_hit' ? 'target' : dp.kind === 'stop_hit' ? 'stop' : 'decision';
        this.applyClose(p, order, reason);
        break;
      }
      case 'roll':
        if (a.legs) {
          const r = rollAction(p, a.legs, order, this.actionEnv(p.cardId));
          this.replace(r.pos);
          if (r.fill.filled) await this.view(p.cardId).track(a.legs);
        }
        break;
      case 'sell_shares': {
        const r = sellSharesAtOpen(p, this.actionEnv(p.cardId));
        this.replace(r.pos);
        if (r.pos.status === 'closed') this.onClosed(r.pos);
        break;
      }
      case 'exercise': {
        const leg = optionLegsOf(p.legs).find((l) => l.ratio > 0);
        if (leg) this.replace(exerciseAction(p, leg, this.bookFor(p.cardId).date, this.bookFor(p.cardId)));
        break;
      }
      case 'adjust':
        break;
    }
  }

  private async endDay(): Promise<void> {
    if (!this.inDay) return;
    // Unanswered decisions default to holding (the fast-forward never answers for you silently).
    for (const d of this.decisions.slice()) await this.decide({ t: 'decide', dpId: d.id, action: 'hold' });
    for (const cardId of this.runningCardIds()) {
      const book = this.bookFor(cardId);
      for (const p of this.openPositions().filter((x) => x.cardId === cardId)) {
        const r = endOfDay(p, book, this.dayCtx(cardId));
        this.replace(r.pos);
        if (r.pos.status === 'closed') this.onClosed(r.pos);
        else if (r.assignedToday) this.pushEvent(r.pos, 'assigned', 'Assigned: you now hold shares.');
      }
    }
    this.inDay = false;
  }
}

function closeText(p: Position): string {
  const pl = p.realizedCents ?? 0;
  const sign = pl >= 0 ? '▲ +' : '▼ −';
  const amt = `$${(Math.abs(pl) / 100).toFixed(2)}`;
  const why: Record<string, string> = {
    target: 'Profit taken',
    stop: 'Stopped out',
    manual: 'Closed',
    decision: 'Closed',
    expired: 'Expired',
    assigned: 'Assignment settled',
    window_end: 'Closed at window end',
    liquidated: 'Liquidated by the risk desk',
  };
  return `${p.symbol} · ${why[p.exitReason ?? 'manual']}: ${sign}${amt}`;
}

function isSpread(legs: Leg[]): boolean {
  const opts = optionLegsOf(legs);
  return opts.some((l) => l.ratio < 0) && opts.some((l) => l.ratio > 0);
}

export type { Bucket };
