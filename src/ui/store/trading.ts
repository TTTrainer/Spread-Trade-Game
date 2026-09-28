import { create } from 'zustand';
import type {
  TradingSession,
  SessionAction,
  SessionEvent,
  OrderSpec,
  PlaceResult,
} from '../../engine/trading/session';
import type { TradePlan } from '../../engine/trading/plan';
import { buildDebrief, type TradeDebrief } from '../../engine/trading/debrief';
import { computeFacts } from '../../engine/run/facts';
import { STRUCTURES, expirationsOf, reverseOf } from '../../engine/strategies/structures';
import type { Leg, OptionLeg, StructureId } from '../../engine/strategies/types';
import type { Bucket } from '../../engine/scoring/calls';
import type { DecisionAction } from '../../engine/lifecycle/types';
import { brier } from '../../engine/scoring/calls';
import { diffDays } from '../../engine/calendar';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { useApp } from './app';
import { checkAchievements } from '../achievements';
import type { TradeRow } from '../../shared/userData';

export interface BuilderState {
  structureId: StructureId;
  expiration: string | null;
  backExpiration: string | null;
  delta: number;
  width: number;
  anchor: number | null;
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
}

export type FFState = 'idle' | 'running' | 'paused' | 'decision' | 'done';
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
  /** The right panel: the news brief or the trade view (null follows the card: brief until a call). */
  rightTab: 'brief' | 'trade' | null;
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
    },
  ) => void;
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
  qty: 1,
  legs: null,
  orderType: 'limit',
  limitFrac: 0.5,
  autoSend: !useApp.getState().settings.game.confirmOrders,
  bracketsOn: true,
  targetPct: 0.5,
  stopMult: 2,
  earningsAck: false,
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

export const useTrading = create<TradingState>((set, get) => {
  const dispatch = async (a: SessionAction, quiet = false) => {
    const s = get().session;
    if (!s) return null;
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

  const handleEvents = (events: SessionEvent[]) => {
    const s = get().session;
    const day = s?.dayIndex ?? 0;
    const items: FeedItem[] = [];
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
          useApp.getState().toast(e.text, win ? 'good' : 'bad');
          break;
        }
        default:
          break;
      }
    }
    if (items.length) set({ feed: [...get().feed, ...items].slice(-60) });
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

  const loop = async (token: number) => {
    while (token === loopToken && get().ff === 'running') {
      const t0 = performance.now();
      await get().step();
      if (get().ff !== 'running') return;
      // Keep the pace the setting asks for: the time spent stepping and drawing counts.
      const secs = useApp.getState().settings.game.ffSecondsPerDay;
      await sleep(Math.max(16, secs * 1000 - (performance.now() - t0)));
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
      });
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
        builder: {
          ...get().builder,
          expiration: pick,
          backExpiration: back,
          legs: null,
          anchor: null,
          earningsAck: false,
        },
      });
    },
    selectPosition: (id) => set({ selectedPositionId: id }),
    setBuilder: (patch) => set({ builder: { ...get().builder, ...patch } }),
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
        },
      });
    },
    reverse: () => {
      const b = get().builder;
      const next = reverseOf(b.structureId);
      if (next !== b.structureId) {
        sfx('whoosh');
        set({ builder: { ...b, structureId: next, legs: null, anchor: null } });
      }
    },
    plan: () => {
      const { session, selectedCardId, builder, version } = get();
      if (!session || !selectedCardId || !builder.expiration) return null;
      const key = JSON.stringify([session.config.seed, version, selectedCardId, builder]);
      if (planCache.key === key) return planCache.value;
      try {
        const value = session.planFor(
          selectedCardId,
          builder.structureId,
          {
            expiration: builder.expiration,
            backExpiration: builder.backExpiration ?? undefined,
            delta: builder.delta,
            width: builder.width,
            anchor: builder.anchor ?? undefined,
          },
          builder.qty,
          builder.legs ?? undefined,
        );
        planCache = { key, value };
        return value;
      } catch {
        planCache = { key, value: null };
        return null;
      }
    },
    setCall: async (bucket) => {
      const { selectedCardId, confidence } = get();
      if (!selectedCardId) return;
      sfx('select', 0.8 + bucket * 0.1);
      await dispatch({ t: 'call', cardId: selectedCardId, bucket, confidence });
    },
    setConfidence: async (c) => {
      set({ confidence: c });
      const { selectedCardId, session } = get();
      const card = selectedCardId && session ? session.card(selectedCardId) : null;
      sfx('tick', 0.7 + c);
      if (card?.call) await dispatch({ t: 'call', cardId: card.id, bucket: card.call.bucket, confidence: c });
    },
    place: async (side) => {
      const { session, selectedCardId, builder } = get();
      if (!session || !selectedCardId || !builder.expiration) return false;
      const plan = get().plan();
      if (!plan || !plan.ok || plan.mid === null || plan.natural === null) {
        sfx('error');
        useApp.getState().toast(plan?.reason ?? 'Pick an expiration first.', 'warn');
        return false;
      }
      const isCredit = plan.mid < 0;
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
      const card = session.card(selectedCardId);
      if (!card.call) {
        useApp.getState().toast('Call your shot first: press 1-5 (and Shift+1-5 for confidence).', 'warn');
        sfx('error');
        return false;
      }
      const limit = plan.mid + (plan.natural - plan.mid) * builder.limitFrac;
      const d = session.config.bracketDefaults;
      const brackets = builder.bracketsOn
        ? isCredit
          ? {
              targetPl: -plan.mid * builder.targetPct,
              stopPl: -plan.mid * builder.stopMult,
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
        },
        legs: builder.legs ?? undefined,
        qty: builder.qty,
        order: { type: builder.orderType, limit: builder.orderType === 'limit' ? limit : undefined },
        brackets,
        earningsAck: builder.earningsAck,
      });
      if (r?.filled) sfx(isCredit ? 'fill' : 'buy');
      return !!r?.ok;
    },
    cancelOrder: async (id) => {
      await dispatch({ t: 'cancel', orderId: id });
    },

    start: () => {
      const s = get().session;
      if (!s) return;
      if (s.openPositions().length === 0 && s.orders.length === 0) {
        useApp.getState().toast('Place at least one trade before starting the clock.', 'warn');
        sfx('error');
        return;
      }
      if (get().ff === 'decision' || get().ff === 'done') return;
      sfx('whoosh');
      set({ ff: 'running', panel: 'positions' });
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
    step: async () => {
      const s = get().session;
      if (!s) return;
      if (!s.inDay && s.atLiveEdge()) {
        // Live mode: nothing after the latest close until the next sync.
        loopToken++;
        set({ ff: 'idle' });
        useApp.getState().toast('Caught up to the latest close. Sync data for new days.', 'info');
        return;
      }
      if (!s.inDay) {
        // One redraw per day: the begin only redraws by itself when a decision stops the clock.
        await dispatch({ t: 'begin' }, true);
        sfx('tick', 1 + Math.min(0.5, s.dayIndex / 60));
      }
      if (s.decisions.length > 0) {
        loopToken++;
        sfx('decision');
        set({ ff: 'decision' });
        return;
      }
      await dispatch({ t: 'end' });
      await finishIfDone();
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
