import { create } from 'zustand';
import type {
  TradingSession,
  SessionAction,
  SessionEvent,
  OrderSpec,
  PlaceResult,
} from '../../engine/trading/session';
import { maxQtyFor, premiumOf, type TradePlan } from '../../engine/trading/plan';
import { buildDebrief, type TradeDebrief } from '../../engine/trading/debrief';
import { computeFacts } from '../../engine/run/facts';
import { STRUCTURES, expirationsOf, reverseOf, stepStrike } from '../../engine/strategies/structures';
import type { Leg, OptionLeg, StructureId } from '../../engine/strategies/types';
import type { Bucket } from '../../engine/scoring/calls';
import type { DecisionAction, Position } from '../../engine/lifecycle/types';
import { brier } from '../../engine/scoring/calls';
import { diffDays } from '../../engine/calendar';
import { sfx } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { fitStructure } from '../../engine/strategies/fit';
import { convictionQty, CONVICTION, impliedBucket } from '../../engine/trading/conviction';
import { bridge, hasBridge } from '../bridge';
import { useApp } from './app';
import { checkAchievements } from '../achievements';
import type { TradeRow } from '../../shared/userData';
import type { DayPace } from '../../shared/settings';
import { lastMark, optionLegsOf } from '../../engine/lifecycle/position';
import { intradayPath, strikeTension, type OHLC } from '../trading/dayPath';
import { crumb } from '../trail';

export interface BuilderState {
  structureId: StructureId;
  expiration: string | null;
  backExpiration: string | null;
  delta: number;
  width: number;
  anchor: number | null;
  /** A condor's short call strike (dragged on the chart). */
  callAnchor: number | null;
  qty: number;
  legs: Leg[] | null;
  orderType: 'limit' | 'market';
  /** 0 = limit at mid, 1 = at natural. */
  limitFrac: number;
  autoSend: boolean;
  bracketsOn: boolean;
  targetPct: number;
  stopMult: number;
  earningsAck: boolean;
  /** Long straddles and strangles: call the big move down instead of up. */
  flipVol: boolean;
}

export type FFState = 'idle' | 'running' | 'paused' | 'decision' | 'done';

/** One trading day being played back on screen (the engine has already settled it). */
export interface DayAnim {
  id: number;
  startedAt: number;
  /** Playback length; 0 shows the finished day at once. */
  ms: number;
  /** The day's highest strike tension (1 = traded through a short strike). */
  tension: number;
  cards: Record<string, { date: string; bar: OHLC; prevClose: number; path: number[]; tension: number }>;
  positions: Record<
    string,
    {
      cardId: string;
      prevCents: number;
      finalCents: number;
      deltaDollars: number;
      thetaDollars: number;
      prevClose: number;
    }
  >;
}

/** The end-of-day report: what each trade did, what happened, and the news. */
export interface DayRecap {
  /** Cards with no trade yet: how each moved today (they move with the clock in a Career round). */
  watch: { cardId: string; movePct: number }[];
  id: number;
  day: number;
  spyPct: number | null;
  trades: {
    positionId: string;
    cardId: string;
    prevCents: number;
    finalCents: number;
    closed: boolean;
    tension: number;
    movePct: number;
  }[];
  news: { text: string; tone: 'good' | 'bad' | 'warn' | 'info'; cardId: string }[];
}

/** "+$18" rising off a position when its day settles. */
export interface DayFloat {
  id: number;
  positionId: string;
  cents: number;
  thetaCents: number;
}

const PACES: DayPace[] = ['step', '1', '2', '4'];
export type Panel = 'builder' | 'positions' | 'analyze' | 'lineup';

export interface FeedItem {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
  day: number;
  kind: SessionEvent['kind'];
  cardId: string;
}

export interface Drawing {
  kind: 'trend' | 'hline';
  points: { time: number; price: number }[];
}

/** Career routes every session action through the run engine (tickets, the Max-Loss Line...). */
export type ExternalDispatch = (
  a: SessionAction,
) => Promise<{ result: PlaceResult | null; events: SessionEvent[] }>;

export type StudyId =
  | 'bb'
  | 'rsi'
  | 'macd'
  | 'vol'
  | 'sma20'
  | 'sma50'
  | 'sma200'
  | 'ema9'
  | 'ema21'
  | 'keltner'
  | 'atr'
  | 'sr'
  | 'relvol'
  | 'em';

interface TradingState {
  session: TradingSession | null;
  version: number;
  selectedCardId: string | null;
  selectedPositionId: string | null;
  builder: BuilderState;
  ff: FFState;
  panel: Panel;
  /** The right panel: the news brief or the trade view (null follows the card: brief until you build). */
  rightTab: 'brief' | 'trade' | null;
  /** The player has started shaping a trade on this card (the right panel flips to TRADE). */
  touched: boolean;
  /** The call this build makes (read from the structure and strikes). */
  impliedCall: () => { bucket: Bucket; confidence: number } | null;
  feed: FeedItem[];
  whatIf: { pricePct: number; days: number; ivPts: number };
  studies: StudyId[];
  lockedStudies: StudyId[];
  timeframe: 'D' | 'W';
  drawings: Record<string, Drawing[]>;
  drawTool: 'none' | 'trend' | 'hline';
  debriefs: TradeDebrief[];
  shake: number;
  confidence: number;
  recordMode: TradeRow['mode'];
  runId: string | null;
  deskId: string | null;
  onSessionEnd: (() => void) | null;
  external: ExternalDispatch | null;
  /** Contracts allow one trade. */
  maxPositions: number | null;
  /** Called after every session action (Live mode saves its log). */
  onChange: (() => void) | null;
  pace: DayPace;
  dayAnim: DayAnim | null;
  floats: DayFloat[];
  /** Why the clock paused itself (a short strike being tested), shown on the chart. */
  testNote: string | null;
  recap: DayRecap | null;
  /** The last day had news worth reading: the clock waits (auto paces only). */
  recapHold: boolean;
  dismissRecap: () => void;
  /** A strike handle is being dragged: the chart hides everything but the trade being shaped. */
  dragging: boolean;
  setDragging: (v: boolean) => void;
  /** The tutorial keeps the clock locked during a lesson; this is what it says if you try. */
  clockHold: string | null;
  /** The tutorial keeps the planned trade off the chart until it has explained the chart itself. */
  planHidden: boolean;
  /** A decision is tucked into a bar so the full chart can be reviewed. */
  reviewChart: boolean;
  setReviewChart: (v: boolean) => void;
  /** The option chain tab replaces the chart. */
  chainOpen: boolean;
  setChainOpen: (v: boolean) => void;
  setPace: (p: DayPace) => void;
  /** The order stamp slammed onto the chart after a fill. */
  stamp: { id: number; title: string; text: string; credit: boolean; plan?: boolean } | null;
  /**
   * Money landing: a credit flies into the BALANCE readout; a profit taken flies into the round
   * meter (or EQUITY outside a run).
   */
  deposit: { id: number; cents: number; label?: string; to?: string; profit?: boolean } | null;
  /** The structures this screen allows (a desk's playbook); null = all. */
  allowed: StructureId[] | null;
  setAllowed: (ids: StructureId[] | null) => void;
  /** Move the anchor strike one listed strike up (+1) or down (-1). */
  nudgeStrike: (dir: 1 | -1) => void;
  /** Move to the next (+1) or previous (-1) listed expiration. */
  nudgeExpiration: (dir: 1 | -1) => void;
  /** Size the trade so its max loss is about this share of equity ('max' = the risk cap). */
  sizeToRisk: (pct: number | 'max') => void;
  applyPreset: (p: 'weekly' | 'swing' | 'mine') => void;
  saveMySetup: () => void;
  /** Play exactly one day, then wait. */
  nextDay: () => void;
  init: (
    s: TradingSession,
    opts?: {
      recordMode?: TradeRow['mode'];
      runId?: string | null;
      deskId?: string | null;
      lockedStudies?: StudyId[];
      onSessionEnd?: (() => void) | null;
      external?: ExternalDispatch | null;
      maxPositions?: number | null;
      onChange?: (() => void) | null;
      blockReason?: ((cardId: string, structureId: StructureId) => string | null) | null;
    },
  ) => void;
  /** Rules outside the market that stop a trade (a Career round's tickets, window, sit-out). */
  blockReason: ((cardId: string, structureId: StructureId) => string | null) | null;
  reset: () => void;
  bump: () => void;
  select: (cardId: string) => void;
  selectPosition: (id: string | null) => void;
  setBuilder: (patch: Partial<BuilderState>) => void;
  setStructure: (id: StructureId) => void;
  reverse: () => void;
  plan: () => TradePlan | null;
  setCall: (bucket: Bucket) => Promise<void>;
  setConfidence: (c: number) => Promise<void>;
  place: (side: 'buy' | 'sell') => Promise<boolean>;
  cancelOrder: (id: string) => Promise<void>;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  step: () => Promise<void>;
  decide: (dpId: string, action: DecisionAction, legs?: OptionLeg[]) => Promise<void>;
  closePosition: (id: string, order?: OrderSpec) => Promise<void>;
  rollPosition: (id: string, legs: OptionLeg[], order?: OrderSpec) => Promise<void>;
  setPanel: (p: Panel) => void;
  setRightTab: (t: 'brief' | 'trade' | null) => void;
  setWhatIf: (patch: Partial<TradingState['whatIf']>) => void;
  toggleStudy: (s: StudyId) => void;
  setTimeframe: (t: 'D' | 'W') => void;
  setDrawTool: (t: TradingState['drawTool']) => void;
  addDrawing: (d: Drawing) => void;
  undoDrawing: () => void;
}

const defaultBuilder = (): BuilderState => ({
  structureId: 'bull_put',
  expiration: null,
  backExpiration: null,
  delta: useApp.getState().settings.game.shortDelta,
  width: 2,
  anchor: null,
  callAnchor: null,
  qty: 1,
  legs: null,
  // Market by default: it fills now at the price you see. Limits are an option you choose.
  orderType: 'market',
  limitFrac: 0.5,
  autoSend: !useApp.getState().settings.game.confirmOrders,
  bracketsOn: true,
  // The plan is set once (Settings, or when starting a run), not per ticket.
  targetPct: useApp.getState().settings.game.planTargetPct,
  stopMult: useApp.getState().settings.game.planStopMult,
  earningsAck: false,
  flipVol: false,
});

/** One ledger row for a closed trade. Used by every mode that records to Stats. */
export function tradeRow(
  s: TradingSession,
  d: TradeDebrief,
  mode: TradeRow['mode'],
  runId: string | null,
  desk: string | null,
): TradeRow | null {
  const pos = s.position(d.positionId);
  if (!pos) return null;
  const card = s.card(d.cardId);
  const w = s.window(d.cardId);
  const facts = computeFacts(s, pos, { thetaChips: 0, straddlesBefore: 0, portfolioDelta: 0 });
  return {
    id: `${s.config.seed}:${d.positionId}`,
    mode,
    runId,
    desk,
    closedOn: d.exitDate,
    openedOn: d.entryDate,
    symbol: d.realSymbol,
    displaySymbol: d.displaySymbol,
    structure: pos.structureId,
    qty: pos.qty,
    realizedCents: d.realizedCents,
    riskCents: d.riskCents,
    benchmarkCents: d.benchmarkCents,
    alphaCents: d.alphaCents,
    exitReason: d.exitReason,
    grade: d.grade.grade,
    tags: d.tags,
    callBucket: card.call?.bucket ?? null,
    callConf: card.call?.confidence ?? null,
    callActual: d.call?.actual ?? null,
    brier: card.call && d.call ? brier(card.call, d.call.actual) : null,
    regime: {
      vix: w?.tags.vix ?? null,
      ivr: pos.entry.ivr,
      trend: pos.entry.sma50Slope,
      adx: w?.tags.adx ?? null,
      earnings: pos.entry.earningsInside,
    },
    recordedAt: new Date().toISOString(),
    data: {
      attribution: d.attribution,
      pop: pos.entry.pop,
      edge: pos.entry.edgePercentile,
      dte: pos.entry.dte,
      riskPct: pos.entry.riskPct,
      process: d.grade.score,
      pctMax: facts.pctOfMaxProfit,
      ivCrushWin: facts.ivCrushWin,
      closedAtPlan: facts.closedAtPlan,
    },
  };
}

let feedId = 0;
let loopToken = 0;
// Planning runs Edge Rank over the whole chain; cache it per (session state, builder).
let planCache: { key: string; value: TradePlan | null } = { key: '', value: null };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Whether a trade can be shaped and sent right now: before the clock, or between days while it is
 * paused (a Career round lets new trades start on a later day). Never while a day is playing.
 */
/**
 * The selected card, but only while it is still on the table. A reroll swaps cards before the
 * store hears about it, and components that redraw on a timer must not ask for a removed card.
 */
export function liveCardId(t: Pick<TradingState, 'session' | 'selectedCardId'>): string | null {
  const id = t.selectedCardId;
  return id && t.session?.cards.some((c) => c.id === id) ? id : null;
}

export function tradeOpen(t: Pick<TradingState, 'ff' | 'dayAnim' | 'session'>): boolean {
  return (t.ff === 'idle' || t.ff === 'paused') && !t.dayAnim && !t.session?.inDay;
}

export const useTrading = create<TradingState>((set, get) => {
  /** A tutorial lesson is up that the clock must wait for: say so and stay put. */
  const holdClock = (): boolean => {
    const why = get().clockHold;
    if (!why) return false;
    useApp.getState().toast(why, 'info');
    sfx('error');
    return true;
  };
  const dispatch = async (a: SessionAction, quiet = false) => {
    const s = get().session;
    if (!s) return null;
    crumb(`trade ${a.t}`);
    const ext = get().external;
    const bump = () => {
      if (!quiet || s.decisions.length > 0) set({ version: get().version + 1 });
    };
    if (ext) {
      const { result, events } = await ext(a);
      handleEvents(events);
      bump();
      return result;
    }
    const r = await s.dispatch(a);
    handleEvents(s.lastEvents);
    bump();
    get().onChange?.();
    return r;
  };

  /** Run an action but hold its events (fills, closes, headlines) until the day has played out. */
  const dispatchHeld = async (a: SessionAction): Promise<SessionEvent[]> => {
    const s = get().session;
    if (!s) return [];
    crumb(`trade ${a.t}`);
    const ext = get().external;
    if (ext) return (await ext(a)).events;
    await s.dispatch(a);
    const events = s.lastEvents.slice();
    get().onChange?.();
    return events;
  };

  /** How long a day takes at the current pace (the candle plays for most of it). */
  const dayMs = (): number => {
    const base = useApp.getState().settings.game.ffSecondsPerDay * 1000;
    const p = get().pace;
    return p === '4' ? base / 4 : p === '2' ? base / 2 : base;
  };

  /** Strike tension already reported per position, so a test pauses the clock once, not daily. */
  let tested: Record<string, boolean> = {};

  /** Snapshot before a day, then build its playback from what the engine settled. */
  const buildDay = (
    s: TradingSession,
    before: Map<string, { cents: number; delta: number; theta: number; cardId: string }>,
    prevClose: Map<string, number>,
  ): DayAnim => {
    const cards: DayAnim['cards'] = {};
    let tension = 0;
    for (const [cardId, pc] of prevClose) {
      const view = s.view(cardId);
      const bar = view.lastBar();
      if (!bar || view.now === undefined) continue;
      const shorts = s.positions
        .filter((p) => p.cardId === cardId && before.has(p.id))
        .flatMap((p) =>
          optionLegsOf(p.legs)
            .filter((l) => l.ratio < 0)
            .map((l) => ({ strike: l.strike, right: l.right })),
        );
      const t = strikeTension(shorts, bar);
      tension = Math.max(tension, t);
      cards[cardId] = {
        date: view.now,
        bar,
        prevClose: pc,
        path: intradayPath(bar, `${cardId}:${view.now}`),
        tension: t,
      };
    }
    const positions: DayAnim['positions'] = {};
    for (const [id, b] of before) {
      const p = s.position(id);
      if (!p || !cards[b.cardId]) continue;
      positions[id] = {
        cardId: b.cardId,
        prevCents: b.cents,
        finalCents: p.status === 'open' ? (lastMark(p)?.plCents ?? b.cents) : (p.realizedCents ?? b.cents),
        deltaDollars: b.delta,
        thetaDollars: b.theta,
        prevClose: cards[b.cardId].prevClose,
      };
    }
    const reduced = useApp.getState().settings.display.reducedMotion;
    const pace = get().pace;
    // Near a short strike the day plays in slow motion (except at 4x).
    const slow = tension >= 0.7 && pace !== '4' ? 1.7 : 1;
    // Day by day plays each candle over a few seconds; the auto paces use most of the day's time.
    const base = pace === 'step' ? Math.min(3200, dayMs() * 0.8) : dayMs() * 0.8;
    const ms = reduced || get().timeframe === 'W' ? 0 : Math.round(base * slow);
    return { id: ++feedId, startedAt: performance.now(), ms, tension, cards, positions };
  };

  const handleEvents = (events: SessionEvent[]) => {
    const s = get().session;
    const day = s?.dayIndex ?? 0;
    const items: FeedItem[] = [];
    const banked = { cents: 0, n: 0, expired: 0, positionId: undefined as string | undefined };
    let keptPlan: Position | undefined;
    for (const e of events) {
      const tone: FeedItem['tone'] =
        e.kind === 'reject' || e.kind === 'alert'
          ? 'warn'
          : e.kind === 'gap'
            ? 'warn'
            : e.cents !== undefined
              ? e.cents >= 0
                ? 'good'
                : 'bad'
              : 'info';
      items.push({ id: ++feedId, text: e.text, tone, day, kind: e.kind, cardId: e.cardId });
      switch (e.kind) {
        case 'fill':
          sfx('stamp');
          useApp.getState().toast(e.text, 'good');
          break;
        case 'rest':
          sfx('click');
          break;
        case 'headline':
          sfx('reveal', 1.2);
          break;
        case 'reject':
          sfx('error');
          useApp.getState().toast(e.text, 'warn');
          break;
        case 'alert':
          sfx('decision', 1.3, 0.5);
          useApp.getState().toast(e.text, 'info');
          break;
        case 'gap':
          sfx('boom');
          if (useApp.getState().settings.display.shake) set({ shake: get().shake + 1 });
          break;
        case 'close':
        case 'expired':
        case 'assigned': {
          const win = (e.cents ?? 0) >= 0;
          const pos = e.positionId ? s?.position(e.positionId) : undefined;
          if (pos?.exitReason === 'stop') sfx('stop');
          else sfx(win ? 'win' : 'loss');
          if (win && (e.cents ?? 0) > 0) {
            banked.cents += e.cents ?? 0;
            banked.n++;
            if (e.kind === 'expired') banked.expired++;
            banked.positionId = e.positionId;
          } else if (!win && pos) keptPlan = pos;
          // The celebration says it louder; the corner note stays for the record.
          useApp.getState().toast(e.text, win ? 'good' : 'bad');
          break;
        }
        default:
          break;
      }
    }
    if (items.length) set({ feed: [...get().feed, ...items].slice(-60) });
    if (banked.n) celebrateProfit(banked);
    else if (keptPlan) celebratePlan(keptPlan);
  };

  /** Winners closed: a big "+$ PROFIT TAKEN" with coins that flies into the score (or equity). */
  const celebrateProfit = (b: { cents: number; n: number; expired: number; positionId?: string }) => {
    const id = ++feedId;
    const toMeter = !!document.querySelector('[data-testid="round-meter"]');
    const label = b.n > 1 ? `${b.n} WINS BANKED` : b.expired ? 'EXPIRED WORTHLESS · KEPT IT' : 'PROFIT TAKEN';
    set({
      deposit: {
        id,
        cents: b.cents,
        label,
        profit: true,
        to: toMeter ? '[data-testid="round-meter"]' : '[data-testid="equity"]',
      },
    });
    setTimeout(() => get().deposit?.id === id && set({ deposit: null }), 1900);
    const from =
      (b.positionId && document.querySelector(`[data-testid="hud-${b.positionId}"]`)) ||
      document.querySelector('[data-testid="pos-hud"]') ||
      document.querySelector('[data-testid="chart-panel"]');
    burstAt(from, 'coins', Math.min(60, 18 + Math.round(b.cents / 1500)));
  };

  /**
   * A loser closed by the plan: taking the stop (or cutting before it) gets its own stamp, so the
   * disciplined exit feels like a move, not a defeat.
   */
  const celebratePlan = (p: Position) => {
    const realized = p.realizedCents ?? 0;
    const stopCents = p.brackets.stopPl !== null ? p.brackets.stopPl * 100 * 100 * p.qty : null;
    const atStop = p.flags.closedAtPlan === 'stop';
    const early = !atStop && !p.flags.stopDeclined && stopCents !== null && -realized < stopCents * 0.98;
    if (!atStop && !early) return;
    const id = ++feedId;
    set({
      stamp: {
        id,
        title: atStop ? 'PLAN KEPT' : 'LOSS CUT',
        text: `${atStop ? 'Stop taken' : 'Out before the stop'} −$${(Math.abs(realized) / 100).toFixed(0)}`,
        credit: false,
        plan: true,
      },
    });
    setTimeout(() => get().stamp?.id === id && set({ stamp: null }), 1500);
    setTimeout(() => sfx('stamp'), 120);
  };

  const finishIfDone = async () => {
    const s = get().session;
    if (!s || !s.isDone()) return false;
    set({ ff: 'done' });
    if (get().external) {
      // The run engine builds the debriefs and the Career screen records the ledger.
      get().onSessionEnd?.();
      return true;
    }
    const debriefs: TradeDebrief[] = [];
    for (const p of s.positions.filter((x) => x.status === 'closed')) {
      try {
        const d = await buildDebrief(s, p.id);
        debriefs.push(d);
        await recordTrade(s, d);
      } catch (err) {
        console.error('debrief failed', err);
      }
    }
    set({ debriefs, version: get().version + 1 });
    void checkAchievements();
    get().onSessionEnd?.();
    return true;
  };

  const recordTrade = async (s: TradingSession, d: TradeDebrief) => {
    if (!hasBridge()) return;
    const row = tradeRow(s, d, get().recordMode, get().runId, get().deskId);
    if (row) await bridge().invoke('user.recordTrade', row);
  };

  let stepping = false;

  /** Settle one day in the engine, play it back as a candle, then finish it. */
  const playDay = async (s: TradingSession): Promise<void> => {
    if (!s.inDay && s.atLiveEdge()) {
      // Live mode: nothing after the latest close until the next sync.
      loopToken++;
      set({ ff: 'idle' });
      useApp
        .getState()
        .toast(
          'Caught up to the latest close. Open trades wait here for the next day of data (◀ LIVE › CHECK FOR NEW DAYS).',
          'info',
        );
      return;
    }
    if (!s.inDay) {
      set({ recap: null, recapHold: false });
      // Remember where every open trade stood, settle the day, then play it back as a candle.
      const before = new Map<string, { cents: number; delta: number; theta: number; cardId: string }>();
      for (const p of s.openPositions()) {
        const m = lastMark(p);
        before.set(p.id, {
          cents: m?.plCents ?? 0,
          delta: (m?.greeks.delta ?? 0) * p.qty,
          theta: (m?.greeks.theta ?? 0) * p.qty,
          cardId: p.cardId,
        });
      }
      const prevClose = new Map(s.advancingCardIds().map((id) => [id, s.view(id).spot()] as const));
      const events = await dispatchHeld({ t: 'begin' });
      const anim = buildDay(s, before, prevClose);
      set({ dayAnim: anim, version: get().version + 1 });
      if (anim.ms > 0) {
        sfx('tick', 1 + Math.min(0.5, s.dayIndex / 60), 0.6);
        if (anim.tension >= 0.7) {
          // A heartbeat while price leans on a short strike.
          for (let k = 0; k < 3; k++)
            for (const beat of [0, 170])
              setTimeout(() => sfx('heartbeat', beat ? 0.9 : 1), (anim.ms * k) / 3 + beat);
        }
        await sleep(anim.ms);
      }
      // The day is done: reveal it, its news and what it did to each trade.
      const floats: DayFloat[] = Object.entries(anim.positions).map(([positionId, x]) => ({
        id: ++feedId,
        positionId,
        cents: x.finalCents - x.prevCents,
        thetaCents: Math.round(x.thetaDollars * 100),
      }));
      const total = floats.reduce((a, f) => a + f.cents, 0);
      let note: string | null = null;
      if (useApp.getState().settings.game.pauseOnTest && get().pace !== 'step')
        for (const [id, x] of Object.entries(anim.positions)) {
          const c = anim.cards[x.cardId];
          const open = s.position(id)?.status === 'open';
          if (open && c.tension >= 0.8 && !tested[id]) {
            tested[id] = true;
            note = `${s.card(x.cardId).displaySymbol} ${c.tension >= 1 ? 'traded through' : 'is testing'} your short strike.`;
          } else if (c.tension < 0.5) tested[id] = false;
        }
      // The day's report. Days with news (headlines, alerts, gaps, closes) hold the clock so
      // there is time to read them.
      const news: DayRecap['news'] = events
        .filter((e) => ['headline', 'alert', 'gap', 'close', 'expired', 'assigned'].includes(e.kind))
        .map((e) => ({
          text: e.text,
          cardId: e.cardId,
          tone:
            e.kind === 'close' || e.kind === 'expired'
              ? (e.cents ?? 0) >= 0
                ? 'good'
                : 'bad'
              : e.kind === 'headline'
                ? 'info'
                : 'warn',
        }));
      const firstCard = Object.keys(anim.cards)[0];
      const bench = firstCard ? s.view(firstCard).benchmarkBars() : [];
      const watch = Object.entries(anim.cards)
        .filter(([cardId]) => !Object.values(anim.positions).some((x) => x.cardId === cardId))
        .map(([cardId, c]) => ({ cardId, movePct: c.bar.close / c.prevClose - 1 }));
      const recap: DayRecap | null =
        Object.keys(anim.positions).length || watch.length
          ? {
              id: ++feedId,
              day: s.dayIndex,
              spyPct:
                bench.length > 1 ? bench[bench.length - 1].close / bench[bench.length - 2].close - 1 : null,
              news,
              watch,
              trades: Object.entries(anim.positions).map(([positionId, x]) => ({
                positionId,
                cardId: x.cardId,
                prevCents: x.prevCents,
                finalCents: x.finalCents,
                closed: s.position(positionId)?.status === 'closed',
                tension: anim.cards[x.cardId]?.tension ?? 0,
                movePct: anim.cards[x.cardId]
                  ? anim.cards[x.cardId].bar.close / anim.cards[x.cardId].prevClose - 1
                  : 0,
              })),
            }
          : null;
      set({
        dayAnim: null,
        floats: floats.filter((f) => f.cents !== 0),
        testNote: note,
        recap,
        recapHold: get().pace !== 'step' && news.length > 0,
        version: get().version + 1,
      });
      handleEvents(events);
      // An untraded card moved to a new day: keep the builder on an expiration it still lists.
      const sel = get().selectedCardId;
      const exp = get().builder.expiration;
      if (sel && s.idleCardIds().includes(sel)) {
        const ch = s.chain(sel);
        if (ch && (!exp || !expirationsOf(ch).includes(exp) || diffDays(s.view(sel).now, exp) < 1)) {
          const touched = get().touched;
          get().select(sel);
          set({ touched });
        }
      }
      // Money is only won when a trade closes; a day's paper gain or loss gets a quiet tick.
      if (anim.ms > 0 && floats.length) sfx('tick', total >= 0 ? 1.2 : 0.7, 0.4);
      if (note) sfx('decision', 0.9, 0.6);
    }
    if (s.decisions.length > 0) {
      loopToken++;
      sfx('decision');
      set({ ff: 'decision' });
      return;
    }
    await dispatch({ t: 'end' });
    await finishIfDone();
  };

  const loop = async (token: number) => {
    while (token === loopToken && get().ff === 'running') {
      const t0 = performance.now();
      await get().step();
      if (token !== loopToken || get().ff !== 'running') return;
      // Day by day: wait for the player after each day. A tested strike or a day with news waits too.
      if (get().pace === 'step' || get().testNote || get().recapHold) {
        loopToken++;
        set({ ff: 'paused' });
        return;
      }
      // Keep the pace: the time spent playing the day counts.
      await sleep(Math.max(16, dayMs() - (performance.now() - t0)));
    }
  };

  return {
    session: null,
    version: 0,
    selectedCardId: null,
    selectedPositionId: null,
    builder: defaultBuilder(),
    ff: 'idle',
    panel: 'builder',
    rightTab: null,
    touched: false,
    feed: [],
    whatIf: { pricePct: 0, days: 0, ivPts: 0 },
    // MACD is one click away in Studies; by default the chart keeps to what a spread seller reads.
    studies: ['bb', 'rsi', 'vol', 'em'],
    lockedStudies: [],
    timeframe: 'D',
    drawings: {},
    drawTool: 'none',
    debriefs: [],
    shake: 0,
    confidence: 0.7,
    recordMode: 'sandbox',
    runId: null,
    deskId: null,
    onSessionEnd: null,
    external: null,
    maxPositions: null,
    onChange: null,
    pace: useApp.getState().settings.game.dayPace,
    dayAnim: null,
    floats: [],
    testNote: null,
    allowed: null,
    stamp: null,
    deposit: null,
    blockReason: null,
    recap: null,
    recapHold: false,
    dismissRecap: () => set({ recap: null }),
    clockHold: null,
    planHidden: false,
    dragging: false,
    setDragging: (v) => {
      if (get().dragging !== v) set({ dragging: v });
    },
    reviewChart: false,
    setReviewChart: (v) => set({ reviewChart: v }),
    chainOpen: false,
    setChainOpen: (v) => {
      if (v !== get().chainOpen) sfx(v ? 'select' : 'click');
      set({ chainOpen: v });
    },

    init: (s, opts = {}) => {
      loopToken++;
      const first = s.cards[0]?.id ?? null;
      set({
        session: s,
        version: 0,
        selectedCardId: first,
        selectedPositionId: null,
        builder: defaultBuilder(),
        ff: 'idle',
        panel: 'builder',
        rightTab: null,
        feed: [],
        debriefs: [],
        drawings: {},
        whatIf: { pricePct: 0, days: 0, ivPts: 0 },
        recordMode: opts.recordMode ?? 'sandbox',
        runId: opts.runId ?? null,
        deskId: opts.deskId ?? null,
        lockedStudies: opts.lockedStudies ?? [],
        onSessionEnd: opts.onSessionEnd ?? null,
        external: opts.external ?? null,
        maxPositions: opts.maxPositions ?? null,
        onChange: opts.onChange ?? null,
        blockReason: opts.blockReason ?? null,
        pace: useApp.getState().settings.game.dayPace,
        dayAnim: null,
        floats: [],
        testNote: null,
        recap: null,
        recapHold: false,
      });
      tested = {};
      if (first) get().select(first);
    },
    reset: () => {
      loopToken++;
      set({
        session: null,
        ff: 'idle',
        debriefs: [],
        feed: [],
        external: null,
        onSessionEnd: null,
        maxPositions: null,
        onChange: null,
      });
    },
    bump: () => set({ version: get().version + 1 }),

    select: (cardId) => {
      const s = get().session;
      if (!s) return;
      const chain = s.chain(cardId);
      const exps = chain ? expirationsOf(chain) : [];
      const now = s.view(cardId).now;
      // Default: the first monthly-ish expiration 30-45 days out, else the nearest available.
      const pick =
        exps.find((e) => diffDays(now, e) >= 28 && diffDays(now, e) <= 45) ??
        exps.find((e) => diffDays(now, e) >= 7) ??
        exps[0] ??
        null;
      const back = exps.find((e) => pick !== null && diffDays(pick, e) >= 21) ?? null;
      sfx('select');
      set({
        selectedCardId: cardId,
        rightTab: null,
        touched: false,
        builder: {
          ...get().builder,
          expiration: pick,
          backExpiration: back,
          legs: null,
          anchor: null,
          callAnchor: null,
          earningsAck: false,
        },
      });
    },
    selectPosition: (id) => set({ selectedPositionId: id }),
    setBuilder: (patch) => set({ builder: { ...get().builder, ...patch }, touched: true }),
    setStructure: (id) => {
      const def = STRUCTURES[id];
      sfx('deal');
      set({
        builder: {
          ...get().builder,
          structureId: id,
          delta:
            id === 'bull_put' || id === 'bear_call'
              ? useApp.getState().settings.game.shortDelta
              : def.defaults.delta,
          width: def.defaults.width || get().builder.width,
          legs: null,
          anchor: null,
          callAnchor: null,
        },
      });
    },
    reverse: () => {
      const b = get().builder;
      const next = reverseOf(b.structureId);
      if (next !== b.structureId) {
        sfx('whoosh');
        set({ builder: { ...b, structureId: next, legs: null, anchor: null, callAnchor: null } });
      }
    },
    plan: () => {
      const { session, builder, version, confidence } = get();
      const selectedCardId = liveCardId(get());
      if (!session || !selectedCardId || !builder.expiration) return null;
      const key = JSON.stringify([session.config.seed, version, selectedCardId, builder, confidence]);
      if (planCache.key === key) return planCache.value;
      try {
        const params = {
          expiration: builder.expiration,
          backExpiration: builder.backExpiration ?? undefined,
          delta: builder.delta,
          width: builder.width,
          anchor: builder.anchor ?? undefined,
          callAnchor: builder.callAnchor ?? undefined,
        };
        // Size by conviction: price one contract, then fill that share of the risk cap.
        const one = session.planFor(
          selectedCardId,
          builder.structureId,
          params,
          1,
          builder.legs ?? undefined,
        );
        const qty = one.ok
          ? Math.min(
              maxQtyFor(builder.structureId),
              convictionQty(
                one.maxLossCents,
                session.markedEquityCents(),
                session.config.riskCapPct,
                confidence,
              ),
            )
          : 1;
        const value =
          qty === 1
            ? one
            : session.planFor(selectedCardId, builder.structureId, params, qty, builder.legs ?? undefined);
        planCache = { key, value };
        return value;
      } catch {
        planCache = { key, value: null };
        return null;
      }
    },
    impliedCall: () => {
      const { session, builder, confidence } = get();
      const selectedCardId = liveCardId(get());
      const plan = get().plan();
      if (!session || !selectedCardId || !plan?.ok) return null;
      const spot = session.view(selectedCardId).spot();
      const em =
        plan.entry?.expectedMovePct ?? (plan.metrics?.expectedMove ? plan.metrics.expectedMove / spot : 0.05);
      return { bucket: impliedBucket(builder.structureId, plan.legs, spot, em, builder.flipVol), confidence };
    },
    setCall: async (bucket) => {
      // The number keys pick a structure by view (4 = up: a bull put); the call itself is read
      // from the trade when it is placed.
      if (!get().selectedCardId || !tradeOpen(get())) return;
      sfx('select', 0.8 + bucket * 0.1);
      if (get().panel !== 'builder') set({ panel: 'builder' });
      const fit = fitStructure(get().builder.structureId, bucket, get().allowed);
      if (fit !== get().builder.structureId) get().setStructure(fit);
      if (STRUCTURES[fit].bias === 'long_vol') get().setBuilder({ flipVol: bucket < 2 });
      set({ touched: true });
    },
    setAllowed: (ids) => set({ allowed: ids }),
    nudgeStrike: (dir) => {
      const { session, builder } = get();
      const selectedCardId = liveCardId(get());
      const plan = get().plan();
      const chain = session && selectedCardId ? session.chain(selectedCardId) : null;
      if (!chain || !builder.expiration || !tradeOpen(get())) return;
      // Condors build both sides from delta; everything else moves its anchor strike.
      if (['iron_condor', 'bwb_condor'].includes(builder.structureId)) {
        get().setBuilder({ delta: Math.max(0.05, Math.min(0.5, builder.delta - dir * 0.02)), legs: null });
        sfx('tick', 1 + dir * 0.1);
        return;
      }
      const lead = plan?.legs.find((l): l is OptionLeg => l.kind === 'option');
      if (!lead) return;
      const from = builder.anchor ?? lead.strike;
      const next = stepStrike(chain, lead.expiration, lead.right, from, dir);
      if (next === null) return;
      sfx('tick', 1 + dir * 0.1);
      get().setBuilder({ anchor: next, legs: null });
    },
    nudgeExpiration: (dir) => {
      const { session, builder } = get();
      const selectedCardId = liveCardId(get());
      const chain = session && selectedCardId ? session.chain(selectedCardId) : null;
      if (!chain || !tradeOpen(get())) return;
      const now = session!.view(selectedCardId!).now;
      const exps = expirationsOf(chain).filter((e) => diffDays(now, e) >= 1);
      const i = builder.expiration ? exps.indexOf(builder.expiration) : -1;
      const e = exps[Math.max(0, Math.min(exps.length - 1, i + dir))];
      if (!e || e === builder.expiration) return;
      sfx('click');
      get().setBuilder({
        expiration: e,
        legs: null,
        backExpiration: exps.find((x) => diffDays(e, x) >= 21) ?? null,
      });
    },
    sizeToRisk: (target) => {
      // Older saved setups stored a risk share; map it onto the nearest conviction step.
      const session = get().session;
      if (!session) return;
      const share = target === 'max' ? 1 : target / session.config.riskCapPct;
      const step = CONVICTION.reduce((b, c) =>
        Math.abs(c.capShare - share) < Math.abs(b.capShare - share) ? c : b,
      );
      void get().setConfidence(step.confidence);
    },
    applyPreset: (p) => {
      const { session, builder } = get();
      const selectedCardId = liveCardId(get());
      const chain = session && selectedCardId ? session.chain(selectedCardId) : null;
      if (!chain || !session || !tradeOpen(get())) return;
      const now = session.view(selectedCardId!).now;
      const exps = expirationsOf(chain).filter((e) => diffDays(now, e) >= 1);
      const near = (lo: number, hi: number, aim: number) =>
        exps.find((e) => diffDays(now, e) >= lo && diffDays(now, e) <= hi) ??
        exps.reduce(
          (a, e) => (Math.abs(diffDays(now, e) - aim) < Math.abs(diffDays(now, a) - aim) ? e : a),
          exps[0],
        );
      const mine = useApp.getState().settings.game.mySetup;
      if (p === 'mine' && !mine) {
        useApp
          .getState()
          .toast('Save a setup first: build a trade the way you like it, then SAVE MINE.', 'info');
        sfx('error');
        return;
      }
      const allowed = get().allowed;
      const sid =
        p === 'mine' && mine && (!allowed || allowed.includes(mine.structureId as StructureId))
          ? (mine.structureId as StructureId)
          : builder.structureId;
      const setup =
        p === 'weekly'
          ? { dte: 7, lo: 3, hi: 10, delta: 0.2 }
          : p === 'swing'
            ? { dte: 38, lo: 30, hi: 45, delta: 0.3 }
            : { dte: mine!.dte, lo: mine!.dte - 5, hi: mine!.dte + 5, delta: mine!.delta };
      const e = near(setup.lo, setup.hi, setup.dte);
      if (sid !== builder.structureId) get().setStructure(sid);
      sfx('deal', 1.2);
      get().setBuilder({
        expiration: e,
        backExpiration: exps.find((x) => diffDays(e, x) >= 21) ?? null,
        delta: setup.delta,
        anchor: null,
        callAnchor: null,
        legs: null,
        ...(p === 'mine' && mine
          ? { width: mine.width, targetPct: mine.targetPct, stopMult: mine.stopMult }
          : {}),
      });
      if (p === 'mine' && mine)
        setTimeout(
          () =>
            mine.conviction ? void get().setConfidence(mine.conviction) : get().sizeToRisk(mine.riskPct),
          0,
        );
    },
    saveMySetup: () => {
      const { session, builder } = get();
      const selectedCardId = liveCardId(get());
      const plan = get().plan();
      if (!session || !selectedCardId || !builder.expiration) return;
      const setup = {
        structureId: builder.structureId,
        dte: diffDays(session.view(selectedCardId).now, builder.expiration),
        delta: builder.delta,
        width: builder.width,
        riskPct: plan?.riskPct ?? 0.02,
        conviction: get().confidence,
        targetPct: builder.targetPct,
        stopMult: builder.stopMult,
      };
      useApp.getState().updateSettings((st) => ({ ...st, game: { ...st.game, mySetup: setup } }));
      sfx('coin');
      useApp
        .getState()
        .toast(
          `Saved MY SETUP: ${STRUCTURES[builder.structureId].short}, ~${setup.dte} days, ${Math.round(setup.delta * 100)}Δ, conviction ${Math.round(setup.conviction * 100)}%. Press Y to use it.`,
          'good',
        );
    },
    setConfidence: async (c) => {
      // Conviction: the confidence behind the call and how much of the risk cap the trade uses.
      set({ confidence: c, touched: true });
      sfx('multPop', 0.6 + c * 0.6);
    },
    place: async (side) => {
      const { session, builder } = get();
      const selectedCardId = liveCardId(get());
      if (!session || !selectedCardId || !builder.expiration) return false;
      const plan = get().plan();
      if (!plan || !plan.ok || plan.mid === null || plan.natural === null) {
        sfx('error');
        useApp.getState().toast(plan?.reason ?? 'Pick an expiration first.', 'warn');
        return false;
      }
      // A covered call is a premium sale even though buying the shares makes its net a debit.
      const spot = plan.entry?.spot ?? null;
      const premium = premiumOf(plan.mid, plan.legs, spot);
      const isCredit = premium !== null;
      if (side === 'sell' && !isCredit) {
        useApp.getState().toast('This build is a debit: use Buy (Alt+B).', 'warn');
        sfx('error');
        return false;
      }
      if (side === 'buy' && isCredit) {
        useApp.getState().toast('This build collects a credit: use Sell (Alt+S).', 'warn');
        sfx('error');
        return false;
      }
      const max = get().maxPositions;
      if (max !== null && session.positions.length + session.orders.length >= max) {
        useApp
          .getState()
          .toast(`This one allows ${max} trade${max > 1 ? 's' : ''}. Manage the one you have.`, 'warn');
        sfx('error');
        return false;
      }
      // The call is the trade's own view, at the conviction you sized it with.
      const call = get().impliedCall();
      if (call)
        await dispatch(
          { t: 'call', cardId: selectedCardId, bucket: call.bucket, confidence: call.confidence },
          true,
        );
      const limit = plan.mid + (plan.natural - plan.mid) * builder.limitFrac;
      const d = session.config.bracketDefaults;
      const brackets = builder.bracketsOn
        ? premium !== null
          ? {
              targetPl: premium * builder.targetPct,
              stopPl: premium * builder.stopMult,
              targetPct: builder.targetPct,
              stopMult: builder.stopMult,
            }
          : {
              targetPl: plan.mid * d.debitTargetPct,
              stopPl: plan.mid * d.debitStopPct,
              targetPct: d.debitTargetPct,
              stopMult: null,
            }
        : null;
      const r = await dispatch({
        t: 'place',
        cardId: selectedCardId,
        structureId: builder.structureId,
        params: {
          expiration: builder.expiration,
          backExpiration: builder.backExpiration ?? undefined,
          delta: builder.delta,
          width: builder.width,
          anchor: builder.anchor ?? undefined,
          callAnchor: builder.callAnchor ?? undefined,
        },
        legs: builder.legs ?? undefined,
        qty: plan.qty,
        order: { type: builder.orderType, limit: builder.orderType === 'limit' ? limit : undefined },
        brackets,
        earningsAck: builder.earningsAck,
      });
      if (r?.filled) {
        sfx(isCredit ? 'fill' : 'buy');
        // The ticket slams onto the chart and coins fly off the button.
        const st = STRUCTURES[builder.structureId];
        const fillNet = plan.natural !== null && builder.orderType === 'market' ? plan.natural : limit;
        const net = isCredit ? (premiumOf(fillNet, plan.legs, spot) ?? premium ?? 0) : Math.abs(fillNet);
        set({
          stamp: {
            id: ++feedId,
            title: isCredit ? 'SOLD' : 'BOUGHT',
            text: `${plan.qty > 1 ? `${plan.qty}× ` : ''}${st.short} ${isCredit ? '+' : '−'}${net.toFixed(2)}`,
            credit: isCredit,
          },
        });
        burstAt(
          document.querySelector(isCredit ? '[data-testid="sell-button"]' : '[data-testid="buy-button"]'),
          'coins',
          isCredit ? 26 : 14,
        );
        setTimeout(() => set({ stamp: null }), 1300);
        if (isCredit) {
          const cents = Math.round(net * 100 * 100 * plan.qty);
          const id = ++feedId;
          set({ deposit: { id, cents } });
          setTimeout(() => get().deposit?.id === id && set({ deposit: null }), 1900);
        }
      }
      return !!r?.ok;
    },
    cancelOrder: async (id) => {
      await dispatch({ t: 'cancel', orderId: id });
    },

    start: () => {
      const s = get().session;
      if (!s) return;
      if (holdClock()) return;
      // A desk whose cards all move with the clock (Career, a Live month) may watch days pass untraded.
      const watchable = get().external || s.config.advanceIdle;
      if (!watchable && s.openPositions().length === 0 && s.orders.length === 0) {
        useApp.getState().toast('Place at least one trade before starting the clock.', 'warn');
        sfx('error');
        return;
      }
      if (get().ff === 'decision' || get().ff === 'done') return;
      if (get().ff === 'running') return;
      sfx('whoosh');
      // The tray shows your positions while the clock runs (the builder stays up if nothing is open).
      set({ ff: 'running', panel: s.openPositions().length ? 'positions' : get().panel, testNote: null });
      const token = ++loopToken;
      void loop(token);
    },
    pause: () => {
      if (get().ff === 'running') {
        loopToken++;
        set({ ff: 'paused' });
      }
    },
    toggle: () => (get().ff === 'running' ? get().pause() : get().start()),
    nextDay: () => {
      const ff = get().ff;
      if (ff === 'running' || ff === 'decision' || ff === 'done' || get().dayAnim) return;
      const s = get().session;
      if (!s) return;
      if (holdClock()) return;
      const watchable = get().external || s.config.advanceIdle;
      if (!watchable && !s.clockStarted && s.openPositions().length === 0 && s.orders.length === 0) {
        useApp.getState().toast('Place at least one trade before starting the clock.', 'warn');
        sfx('error');
        return;
      }
      // The tray shows your positions while the clock runs (the builder stays up if nothing is open).
      set({ ff: 'running', panel: s.openPositions().length ? 'positions' : get().panel, testNote: null });
      const token = ++loopToken;
      void (async () => {
        await get().step();
        if (token === loopToken && get().ff === 'running') {
          loopToken++;
          set({ ff: 'paused' });
        }
      })();
    },
    setPace: (p) => {
      set({ pace: p });
      sfx('select', p === 'step' ? 0.8 : 1 + PACES.indexOf(p) * 0.15);
      useApp.getState().updateSettings((st) => ({ ...st, game: { ...st.game, dayPace: p } }));
    },
    step: async () => {
      const s = get().session;
      if (!s || stepping) return;
      stepping = true;
      try {
        await playDay(s);
      } finally {
        stepping = false;
      }
    },
    decide: async (dpId, action, legs) => {
      const s = get().session;
      if (!s) return;
      const dp = s.decisions.find((d) => d.id === dpId);
      await dispatch({ t: 'decide', dpId, action, legs });
      if (dp?.kind === 'stop_hit' && action === 'hold')
        useApp.getState().toast('You declined your own stop.', 'bad');
      if (s.decisions.length === 0) {
        await dispatch({ t: 'end' });
        if (await finishIfDone()) return;
        // Day by day waits for the next press; otherwise the clock picks up where it stopped.
        if (get().pace === 'step') {
          set({ ff: 'paused' });
          return;
        }
        set({ ff: 'running' });
        const token = ++loopToken;
        void loop(token);
      }
    },
    closePosition: async (id, order = { type: 'market' }) => {
      await dispatch({ t: 'close', positionId: id, order });
      const s = get().session;
      if (s && !s.inDay && s.clockStarted) await finishIfDone();
    },
    rollPosition: async (id, legs, order = { type: 'market' }) => {
      await dispatch({ t: 'roll', positionId: id, legs, order });
    },
    setPanel: (p) => set({ panel: p }),
    setRightTab: (t) => set({ rightTab: t }),
    setWhatIf: (patch) => set({ whatIf: { ...get().whatIf, ...patch } }),
    toggleStudy: (st) => {
      if (get().lockedStudies.includes(st)) {
        useApp.getState().toast('Hire the Chartist to unlock this study.', 'warn');
        return;
      }
      const cur = get().studies;
      set({ studies: cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st] });
    },
    setTimeframe: (t) => set({ timeframe: t }),
    setDrawTool: (t) => set({ drawTool: t }),
    addDrawing: (d) => {
      const id = get().selectedCardId;
      if (!id) return;
      const cur = get().drawings[id] ?? [];
      set({ drawings: { ...get().drawings, [id]: [...cur, d] }, drawTool: 'none' });
    },
    undoDrawing: () => {
      const id = get().selectedCardId;
      if (!id) return;
      const cur = get().drawings[id] ?? [];
      set({ drawings: { ...get().drawings, [id]: cur.slice(0, -1) } });
    },
  };
});
