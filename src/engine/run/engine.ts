/**
 * RunEngine: one Career run (a fiscal year of 4 quarters x 3 rounds). It owns the run state,
 * deals each round's lineup into a TradingSession, enforces tickets, the Max-Loss Line and the
 * desk's playbook, scores closed trades through the chips x mult pipeline, tracks stress, runs
 * the shop, the Reviews and the ending.
 *
 * Every player action is a RunAction appended to the log. The engine checkpoints its state
 * whenever no trading session is mid-flight, so a save is (checkpoint + actions since), and a
 * resume replays only the current round. The whole run replays from its seed and the full log.
 * Nothing here alters market data: cartridges act on the meter, cash, stress and shop only.
 */

import { ANALYSTS } from '../../content/analysts';
import { BALANCE } from '../../content/balance';
import { CARTRIDGE_BY_ID, CARTRIDGES } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import { emptyFamilies, familyPassives } from '../../content/families';
import { MEMOS, TAG_IDS, VOUCHERS } from '../../content/items';
import { ANNUAL_MIX, REVIEWS } from '../../content/reviews';
import { BOSSES, quarterBossPool, showdownTier, type BossId } from '../../content/bosses';
import { BOSS_TROPHIES } from '../../content/trophies';
import { roundRule, type RoundRule } from './rules';
import { raceNow, type RacePoint } from './race';
import { Rival, type RivalTrade } from './rival';
import {
  STYLE_TEXT,
  styleState,
  structureTypes,
  type StyleId,
  type StyleState,
  type StyleTrade,
} from './style';
import { tierMods } from '../../content/tiers';
import { complianceMods } from '../../content/meta';
import { pickLine, type CharacterId, type Trigger } from '../../content/characters';
import type {
  AnalystId,
  CartState,
  Family,
  MemoId,
  ReviewId,
  RunView,
  TagId,
  VoucherDef,
} from '../../content/types';
import { lastMark } from '../lifecycle/position';
import { testedShort } from './collector';
import { exitKind, recordExit } from './exits';
import type { Position } from '../lifecycle/types';
import type { MarketDataSource } from '../market/source';
import type { WindowDef } from '../market/types';
import { formatCents, type Cents } from '../money';
import { BASE_EXECUTION, combineImprove, type ExecutionMods } from '../orders/fill';
import { streamFor, type Rng } from '../rng';
import { brier, calibrationGrade, meanBrier } from '../scoring/calls';
import { pnlChips, runScore, winQuality } from '../scoring/mult';
import { STRUCTURES } from '../strategies/structures';
import type { StructureId } from '../strategies/types';
import { buildDebrief } from '../trading/debrief';
import {
  defaultSessionConfig,
  TradingSession,
  type PlaceResult,
  type SessionAction,
  type SessionConfig,
  type SessionEvent,
} from '../trading/session';
import { dealWindows, isFlat } from './deal';
import { computeFacts } from './facts';
import { scoreSteps } from './score';
import {
  cartridgePool,
  cartridgePrice,
  generateShop,
  interestFor,
  pickCartridge,
  rerollCost,
  sellPrice,
} from './shop';
import type {
  DevOp,
  ExitPlan,
  InterestItem,
  RoundState,
  RunAction,
  RunConfig,
  RunEvent,
  RunResult,
  RunSave,
  RunState,
  RunStats,
} from './types';
import { CLIENTS, CLIENT_BY_ID } from '../../content/clients';
import { clientChecks, clientFitsDesk } from './clients';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// The dealable windows and index symbols, loaded once per data source (tens of thousands of rows).
const windowCache = new WeakMap<MarketDataSource, Promise<{ windows: WindowDef[]; index: string[] }>>();

export const ROUND_NAMES = ['Month 1', 'Month 2', 'Review'] as const;

export function roundLabel(quarter: number, index: number): string {
  return yearLabel(quarter, index);
}

export function computeTarget(
  quarter: number,
  index: number,
  reviewId: ReviewId | null,
  cfg: Pick<RunConfig, 'tier'> & Partial<Pick<RunConfig, 'compliance' | 'quarters' | 'deskId'>>,
  /** The quarter already has a written-up Month: its Review asks for more. */
  writtenUp = false,
  /** The boss running this Review (its own target share). */
  bossId: BossId | null = null,
): number {
  const t = BALANCE.targets;
  const rule = reviewId ? REVIEWS[reviewId].rule : {};
  // Past the year (Endless), targets grow faster every quarter.
  const yearEnd = Math.max(1, cfg.quarters ?? 4);
  const growth =
    t.quarterGrowth ** (Math.min(quarter, yearEnd) - 1) * t.endlessGrowth ** Math.max(0, quarter - yearEnd);
  const raw =
    t.q1[index] *
    growth *
    (rule.targetMult ?? 1) *
    tierMods(cfg.tier).targetMult *
    complianceMods(cfg.compliance).targetMult *
    ((cfg.deskId && DESKS[cfg.deskId].targetMult) || 1) *
    (writtenUp && index === 2 ? t.writeUpReviewMult : 1) *
    (bossId ? (BALANCE.bossTargets[bossId] ?? 1) : 1);
  return Math.round(raw / 10) * 10;
}

/** "Q2 Month 1" in the first year, "Y2 Q1 Review" in Endless. */
export function yearLabel(quarter: number, index: number): string {
  return `${quarterLabel(quarter)} ${ROUND_NAMES[index]}`;
}

/** "Q3", or "Y2 Q1" once Endless passes the first year. */
export function quarterLabel(quarter: number): string {
  const y = Math.floor((quarter - 1) / 4) + 1;
  return `${y > 1 ? `Y${y} ` : ''}Q${((quarter - 1) % 4) + 1}`;
}

function emptyRound(): RoundState {
  return {
    quarter: 1,
    index: 0,
    reviewId: null,
    target: 0,
    meter: 0,
    startEquityCents: 0,
    maxLossLinePct: BALANCE.risk.maxLossLinePct,
    tickets: 0,
    ticketsUsed: 0,
    rerolls: 0,
    rerollsUsed: 0,
    cards: [],
    cardCounter: 0,
    sessionSeed: '',
    clockStarted: false,
    drawdownHit: false,
    breached: false,
    status: 'playing',
    tallies: [],
    debriefs: [],
    thetaChips: {},
    straddlesBefore: {},
    straddlesOpened: 0,
    doubleDownFor: null,
    memo: {
      doubleDown: false,
      hedge: false,
      rollAtMid: false,
      waiver: false,
      lens: false,
      dueDiligence: [],
      loan: null,
    },
    burnout: false,
    silentAnalyst: null,
    deltaNeutralOk: true,
    gapInsuranceUsed: false,
    ghostScore: 0,
    skipTag: null,
    payouts: [],
    taxCents: 0,
    filterRelaxed: false,
    scored: [],
    client: null,
  };
}

export function emptyStats(): RunStats {
  return {
    cartTriggers: {},
    maxStress: 0,
    stopDeclines: 0,
    burnouts: 0,
    skips: 0,
    reviewsPassed: [],
    maxMult: 0,
    maxPoints: 0,
    maxCartridges: 0,
    maxAnalysts: 0,
    ladderBest: 0,
    clientsFilled: 0,
    wheel: 0,
    cspAssigned: false,
    ivCrushWins: 0,
    closes50: 0,
    plannedStops: 0,
    edgeTop10: 0,
    duoOwned: false,
    parachuteSaves: 0,
    owned: [],
    ownedAt: {},
  };
}

export function initialState(config: RunConfig, startedAt = ''): RunState {
  const desk = DESKS[config.deskId];
  return {
    version: 1,
    id: `run-${config.seed}`,
    config,
    phase: 'round',
    quarter: 1,
    roundIndex: 0,
    equityCents: config.startEquityCents,
    cash: BALANCE.cash.startingCash + (config.perks?.startCash ?? 0),
    stress: Math.max(0, Math.min(99, config.startingStress + complianceMods(config.compliance).startStress)),
    stressLog: [],
    cartridges: desk.startingCartridges.filter(
      (id) => !(config.pureMarket && CARTRIDGE_BY_ID[id]?.tag === 'ARCADE'),
    ),
    cartState: {},
    analysts: desk.startingAnalysts.map((id) => ({ id, level: 1 })),
    memos: [],
    vouchers: [],
    levels: {},
    pendingTags: [],
    tagEffects: {
      freeAnalyst: 0,
      freeUncommon: 0,
      freeRerolls: 0,
      investment: 0,
      calm: 0,
      doubleNext: false,
    },
    reviewsSeen: [],
    nextReview: null,
    round: emptyRound(),
    shop: null,
    history: [],
    brierScores: [],
    totals: { realizedCents: 0, alphaCents: 0, benchmarkCents: 0, points: 0, trades: 0, wins: 0 },
    patienceStacks: 0,
    parachuteUsed: false,
    burnoutNext: false,
    usedWindows: [],
    result: null,
    startedAt,
    reputation: 0,
    stats: {
      ...emptyStats(),
      maxCartridges: desk.startingCartridges.length,
      maxAnalysts: desk.startingAnalysts.length,
      owned: [...desk.startingCartridges],
      ownedAt: Object.fromEntries(desk.startingCartridges.map((c) => [c, 0])),
      year: 1,
    },
    endless: false,
  };
}

export interface GoalOutlook {
  meter: number;
  target: number;
  toGo: number;
  openCount: number;
  openPlCents: number;
  /** P/L chips of the open trades if closed now (a floor for winners). */
  openPoints: number;
}

export interface Passives {
  execution: ExecutionMods;
  riskCapMult: number;
  interestCapAdd: number;
  rerollCostDelta: number;
  stressGainMult: number;
  stressFromLossesMult: number;
  maxLossLineDelta: number;
  shopSlotsAdd: number;
  freeFirstShopReroll: boolean;
  losersLocked: boolean;
  autoBrackets: boolean;
  lineupAdd: number;
  analystSeatsAdd: number;
  cartridgeSlotsAdd: number;
  analystOffersAdd: number;
  priceMult: number;
}

export class RunEngine {
  state: RunState;
  session: TradingSession | null = null;
  /** The session of the round that just settled (the UI records its trades and debriefs). */
  finishedSession: TradingSession | null = null;
  /** The Early Retiree's book in a duel round (rebuilt from the round's actions on resume). */
  private rival: Rival | null = null;
  readonly log: RunAction[] = [];
  /** Engine messages from the last action (toasts, meter pops, stress changes). */
  events: RunEvent[] = [];
  /** Session events from the last action, including any the engine triggered itself. */
  sessionEvents: SessionEvent[] = [];
  private pending: RunAction[] = [];
  private checkpointState: RunState;
  private speech: {
    trigger: Trigger;
    pri: number;
    vars: Record<string, string | number>;
    who?: CharacterId;
  } | null = null;
  private sessionDirty = false;
  private allWindows: WindowDef[] | null = null;
  private windowById = new Map<number, WindowDef>();
  private indexSymbols = new Set<string>();
  private readonly source: MarketDataSource;

  private constructor(source: MarketDataSource, state: RunState) {
    this.source = source;
    this.state = state;
    this.checkpointState = clone(state);
  }

  static async create(source: MarketDataSource, config: RunConfig, startedAt = ''): Promise<RunEngine> {
    const e = new RunEngine(source, initialState(config, startedAt));
    await e.enterRound(null);
    e.events = e.events.filter((x) => x.kind !== 'say');
    e.speech = null;
    e.say('run_start', 3, { desk: DESKS[config.deskId].name, target: e.state.round.target });
    e.flushSpeech('boot');
    e.checkpoint();
    return e;
  }

  static async resume(source: MarketDataSource, save: RunSave): Promise<RunEngine> {
    const e = new RunEngine(source, clone(save.checkpoint));
    e.log.push(...save.log.slice(0, save.log.length - save.pending.length));
    if (e.state.phase === 'round') await e.openSession();
    e.checkpoint();
    for (const a of save.pending) await e.dispatch(a);
    e.events = [];
    e.sessionEvents = [];
    return e;
  }

  save(): RunSave {
    return {
      version: 1,
      checkpoint: clone(this.checkpointState),
      pending: clone(this.pending),
      log: clone(this.log),
    };
  }

  get over(): boolean {
    return this.state.phase === 'victory' || this.state.phase === 'defeat';
  }

  // ---------- derived views ----------

  activeCartridges(): string[] {
    const inert = this.state.config.inert;
    // The Bursar holds the leftmost cartridge for the round.
    const held = this.state.phase === 'round' && this.rule().leftCartOff ? this.state.cartridges[0] : null;
    return this.state.cartridges.filter(
      (id) =>
        id !== held &&
        !(this.state.config.pureMarket && CARTRIDGE_BY_ID[id]?.tag === 'ARCADE') &&
        !inert?.includes(id),
    );
  }

  /** The rules in force this round: the boss's one twist, or a Month's none. */
  rule(): RoundRule {
    const r = this.state.round;
    return roundRule(r.reviewId, r.bossId, r.showdown ?? 0);
  }

  /** Where new trades take profit and stop: the run's plan, else the desk's defaults. */
  exitPlan(): ExitPlan {
    const desk = DESKS[this.state.config.deskId];
    return (
      this.state.plan ?? {
        creditTargetPct: BALANCE.brackets.creditTargetPct,
        creditStopMult: BALANCE.brackets.creditStopMult,
        debitTargetPct: BALANCE.brackets.debitTargetPct,
        debitStopPct: BALANCE.brackets.debitStopPct,
        ...desk.brackets,
      }
    );
  }

  /** Change the run's exit plan (new trades use it; open ones keep theirs). */
  private setPlan(p: Partial<ExitPlan>): void {
    const clamp = (x: number | undefined, lo: number, hi: number, d: number) =>
      x === undefined || !Number.isFinite(x) ? d : Math.max(lo, Math.min(hi, x));
    const cur = this.exitPlan();
    const next: ExitPlan = {
      creditTargetPct: clamp(p.creditTargetPct, 0.2, 0.9, cur.creditTargetPct),
      creditStopMult: clamp(p.creditStopMult, 1, 4, cur.creditStopMult),
      debitTargetPct: clamp(p.debitTargetPct, 0.1, 1.5, cur.debitTargetPct),
      debitStopPct: clamp(p.debitStopPct, 0.2, 0.9, cur.debitStopPct),
    };
    this.state.plan = next;
    if (this.session) this.session.config.bracketDefaults = { ...next };
  }

  /** The quarter whose boss is the next one up (after a Review, the next quarter's). */
  upcomingBossQuarter(): number {
    const st = this.state;
    return st.roundIndex === 2 && (st.phase === 'tally' || st.phase === 'shop') ? st.quarter + 1 : st.quarter;
  }

  /** What rerolling the upcoming boss costs, or why it can't be rerolled now. */
  bossReroll(): { cost: number } | { blocked: string; cost?: number } {
    const st = this.state;
    const q = this.upcomingBossQuarter();
    const boss = this.knownBoss(q);
    if (st.phase !== 'round' && st.phase !== 'shop' && st.phase !== 'tally')
      return { blocked: 'Bosses can be rerolled from the month menu or the shop.' };
    if (st.phase === 'round' && (st.roundIndex === 2 || st.round.clockStarted))
      return { blocked: 'This boss is already under way.' };
    if (!boss) return { blocked: 'The next boss is not known yet.' };
    if (boss === 'rebalancer') return { blocked: 'The year-end Rebalancer cannot be rerolled.' };
    if ((st.bossRerolled ?? []).includes(q)) return { blocked: 'This boss has already been rerolled once.' };
    const costs = BALANCE.run.bossRerollCosts;
    const cost = costs[Math.min(costs.length - 1, Math.max(0, q - 1))];
    if (st.cash < cost) return { blocked: `Rerolling this boss costs $${cost}.`, cost };
    return { cost };
  }

  private rerollBoss(): void {
    const st = this.state;
    const r = this.bossReroll();
    if ('blocked' in r) return this.warn(r.blocked);
    const q = this.upcomingBossQuarter();
    const year = Math.floor((q - 1) / 4);
    const thisYear = (st.bosses ?? [])
      .filter((b) => Math.floor((b.quarter - 1) / 4) === year)
      .map((b) => b.id);
    const pool = quarterBossPool().filter((x) => !thisYear.includes(x));
    if (!pool.length) return this.warn('No other boss is left for this year.');
    const id = this.rng(`bossReroll:q${q}`).pick(pool);
    st.bosses = (st.bosses ?? []).map((b) => (b.quarter === q ? { quarter: q, id } : b));
    st.bossRerolled = [...(st.bossRerolled ?? []), q];
    st.cash -= r.cost;
    this.events.push({
      kind: 'good',
      text: `Boss rerolled for $${r.cost}: ${BOSSES[id].name} runs the Review now.`,
    });
  }

  /** A quarter's boss if it has been picked already (never picks one). */
  knownBoss(quarter: number): BossId | null {
    return this.state.bosses?.find((b) => b.quarter === quarter)?.id ?? null;
  }

  /** A round's target as the player will meet it: a Review's includes its boss's share. */
  upcomingTarget(quarter: number, index: number): number {
    const st = this.state;
    const boss = index === 2 ? this.knownBoss(quarter) : null;
    const review = index === 2 ? (boss ? BOSSES[boss].market : null) : null;
    return computeTarget(quarter, index, review, st.config, this.writtenUp(quarter), boss);
  }

  /** This quarter's boss, picked the first time it's asked for and remembered. */
  bossFor(quarter: number): BossId {
    const st = this.state;
    st.bosses ??= [];
    const known = st.bosses.find((b) => b.quarter === quarter);
    if (known) return known.id;
    // The year ends with the Rebalancer; in Endless every fourth quarter is another year end.
    const last = st.endless ? quarter % 4 === 0 : quarter >= st.config.quarters;
    let id: BossId = 'rebalancer';
    if (!last) {
      const year = Math.floor((quarter - 1) / 4);
      const thisYear = st.bosses.filter((b) => Math.floor((b.quarter - 1) / 4) === year).map((b) => b.id);
      const pool = quarterBossPool().filter((x) => !thisYear.includes(x));
      id = this.rng(`boss:q${quarter}`).pick(pool.length ? pool : quarterBossPool());
    }
    st.bosses.push({ quarter, id });
    return id;
  }

  families(): Record<Family, number> {
    const n = emptyFamilies();
    for (const id of this.activeCartridges()) for (const f of CARTRIDGE_BY_ID[id]?.families ?? []) n[f]++;
    return n;
  }

  passives(): Passives {
    const carts = this.activeCartridges().map((id) => CARTRIDGE_BY_ID[id]?.passive ?? {});
    const fam = familyPassives(this.families());
    const vouchers = this.state.vouchers.map((v) => VOUCHERS[v].passive);
    const trophies = (this.state.trophies ?? []).map((b) => BOSS_TROPHIES[b].passive);
    const all: VoucherDef['passive'][] = [...carts, fam, ...vouchers, ...trophies];
    const execParts = all.map((p) => p.execution ?? {});
    const rollSlip = execParts.map((e) => e.rollSlippage).filter((x): x is number => x !== undefined);
    const sum = (f: (p: VoucherDef['passive']) => number | undefined) =>
      all.reduce((a, p) => a + (f(p) ?? 0), 0);
    const prod = (f: (p: VoucherDef['passive']) => number | undefined) =>
      all.reduce((a, p) => a * (f(p) ?? 1), 1);
    return {
      execution: {
        ...BASE_EXECUTION,
        marketImprove: combineImprove(execParts.map((e) => e.marketImprove ?? 0)),
        limitBoost: combineImprove(execParts.map((e) => e.limitBoost ?? 0)),
        rollSlippage: Math.min(BASE_EXECUTION.rollSlippage, ...rollSlip),
      },
      riskCapMult: prod((p) => p.riskCapMult),
      interestCapAdd: sum((p) => p.interestCapAdd),
      rerollCostDelta: sum((p) => p.rerollCostDelta),
      stressGainMult: prod((p) => p.stressGainMult),
      stressFromLossesMult: fam.stressFromLossesMult ?? 1,
      maxLossLineDelta: sum((p) => p.maxLossLineDelta),
      shopSlotsAdd: sum((p) => p.shopSlotsAdd),
      freeFirstShopReroll: all.some((p) => p.freeFirstShopReroll),
      losersLocked: all.some((p) => p.losersLocked),
      autoBrackets: all.some((p) => p.autoBrackets),
      lineupAdd: sum((p) => p.lineupAdd),
      analystSeatsAdd: sum((p) => p.analystSeatsAdd),
      cartridgeSlotsAdd: sum((p) => p.cartridgeSlotsAdd),
      analystOffersAdd: sum((p) => p.analystOffersAdd),
      priceMult: prod((p) => p.priceMult),
    };
  }

  /** The Max-Loss Line a plain round opens with: tier, Compliance and buffs (no boss twist or tag). */
  baseLossLinePct(): number {
    const cfg = this.state.config;
    return (
      BALANCE.risk.maxLossLinePct +
      tierMods(cfg.tier).lineDelta +
      complianceMods(cfg.compliance).lineDelta +
      this.passives().maxLossLineDelta
    );
  }

  cartridgeSlots(): number {
    return BALANCE.shop.cartridgeSlots + this.passives().cartridgeSlotsAdd;
  }

  analystSeats(): number {
    return BALANCE.shop.analystSeats + this.passives().analystSeatsAdd;
  }

  /** Analysts working this round: hired ones (minus one silenced by burnout) plus a loan. */
  activeAnalysts(): { id: AnalystId; level: number }[] {
    const r = this.state.round;
    const out = this.state.analysts.filter((a) => a.id !== r.silentAnalyst);
    if (r.memo.loan && !out.some((a) => a.id === r.memo.loan)) out.push({ id: r.memo.loan, level: 1 });
    return out;
  }

  hasAnalyst(id: AnalystId): boolean {
    return this.activeAnalysts().some((a) => a.id === id);
  }

  runView(): RunView {
    const st = this.state;
    const r = st.round;
    const rolls = this.session ? this.session.positions.reduce((a, p) => a + p.flags.rollsForCredit, 0) : 0;
    return {
      quarter: st.quarter,
      roundIndex: st.roundIndex,
      reviewId: r.reviewId,
      deskId: st.config.deskId,
      families: this.families(),
      ownedCartridges: this.activeCartridges(),
      patienceStacks: st.patienceStacks,
      rollArtistStacks: rolls,
      deltaNeutralOk: r.deltaNeutralOk,
      gapInsuranceUsed: r.gapInsuranceUsed,
      ghostScore: r.ghostScore,
    };
  }

  /** The line in equity cents; crossing it at a close ends the round. */
  maxLossFloorCents(): number {
    const r = this.state.round;
    return Math.round(r.startEquityCents * (1 - r.maxLossLinePct));
  }

  isLastRound(): boolean {
    if (this.state.endless) return false;
    return this.state.quarter >= this.state.config.quarters && this.state.roundIndex === 2;
  }

  /** This quarter already used its one missed Month target. */
  writtenUp(quarter = this.state.quarter): boolean {
    return (this.state.writeUps ?? []).includes(quarter);
  }

  canSkip(): boolean {
    const r = this.state.round;
    return (
      this.state.phase === 'round' &&
      !complianceMods(this.state.config.compliance).noSkips &&
      r.index < 2 &&
      !r.clockStarted &&
      !r.sitOut &&
      !!this.session &&
      this.session.positions.length === 0 &&
      this.session.orders.length === 0
    );
  }

  /**
   * Whether the round still has days to trade: tickets left, an untraded card on the table and the
   * trading window open. While it does, a day with nothing open doesn't end the round. A sit-out
   * holds until its days run out. The balance simulator keeps the old rule (trades up front only).
   */
  holdOpen(): boolean {
    const s = this.session;
    const r = this.state.round;
    if (!s || this.state.config.mode === 'sim') return false;
    if (r.sitOut) return s.dayIndex < r.sitOut.days;
    if (r.ticketsUsed >= r.tickets) return false;
    if (s.clockStarted && s.dayIndex >= BALANCE.run.tradeWindowDays) return false;
    return s.cards.some((c) => c.positionIds.length === 0 && c.orderIds.length === 0);
  }

  /** Trading days left in the window for new trades (null when the round takes none). */
  tradeDaysLeft(): number | null {
    const s = this.session;
    const r = this.state.round;
    if (!s || r.sitOut || this.state.config.mode === 'sim') return null;
    return Math.max(0, BALANCE.run.tradeWindowDays - s.dayIndex);
  }

  /**
   * Distance to the round's target, plus what the open trades would score if closed now. Only the
   * P/L chips are counted for them: multipliers can only raise a winner, so for winners this is a
   * floor, and for losers it is the scaled-down penalty they would take.
   */
  goalOutlook(): GoalOutlook {
    const r = this.state.round;
    const open = this.session?.openPositions() ?? [];
    let openPlCents = 0;
    let openPoints = 0;
    for (const p of open) {
      const pl = lastMark(p)?.plCents ?? 0;
      openPlCents += pl;
      openPoints += runScore(pl, r.startEquityCents, []).points;
    }
    return {
      meter: r.meter,
      target: r.target,
      toGo: Math.max(0, r.target - r.meter),
      openCount: open.length,
      openPlCents,
      openPoints,
    };
  }

  /** The round's trades as the style and second-goal checks see them, in the order they closed. */
  private styleTrades(): StyleTrade[] {
    const s = this.session ?? this.finishedSession;
    if (!s) return [];
    const order = this.state.round.tallies.map((t) => t.positionId);
    const rank = (id: string) => {
      const i = order.indexOf(id);
      return i < 0 ? order.length : i;
    };
    return s.positions
      .slice()
      .sort((a, b) => rank(a.id) - rank(b.id))
      .map((p) => ({
        structureId: p.structureId,
        open: p.status === 'open',
        realizedCents: p.realizedCents ?? 0,
        exitReason: p.exitReason ?? null,
        daysHeld: Math.max(0, p.marks.length - 1),
        interestDays: this.state.round.interestDays?.[p.id] ?? 0,
      }));
  }

  /** The Allocator's second goal: how many structure types, of how many needed. */
  secondGoal(): { need: number; have: number; met: boolean } | null {
    const st = this.state;
    const want = st.round.bossId ? this.rule().variety : undefined;
    if (!want) return null;
    const need = Math.min(want, DESKS[st.config.deskId].structures.length);
    const have = structureTypes(this.styleTrades()).length;
    return { need, have, met: have >= need };
  }

  /** This boss round's style bonus and where it stands. */
  bossStyle(): { id: StyleId; text: string; cash: number; state: StyleState } | null {
    const st = this.state;
    const id = st.round.bossId;
    if (!id || (st.phase !== 'round' && st.phase !== 'tally')) return null;
    const style = BOSSES[id].style;
    const state =
      st.phase === 'tally'
        ? st.round.styleMet
          ? 'met'
          : 'broken'
        : styleState(style, this.styleTrades(), false);
    return { id: style, text: STYLE_TEXT[style], cash: BALANCE.run.styleCash, state };
  }

  /** The duel right now: your P/L (realized plus open marks), Chad's, and his trades. */
  duelNow(): { you: Cents; rival: Cents; trades: RivalTrade[]; started: boolean } | null {
    const r = this.state.round;
    if (!this.session || !r.bossId || !this.rule().duel) return null;
    if (!this.rival) return { you: 0, rival: 0, trades: [], started: false };
    return {
      you: raceNow(this.session).you,
      rival: this.rival.pl(),
      trades: this.rival.trades(),
      started: true,
    };
  }

  /** The Rebalancer's race right now (null outside its round). */
  race(): RacePoint | null {
    if (!this.session || !this.state.round.bossId || !this.rule().beatSpy) return null;
    return raceNow(this.session);
  }

  // ---------- actions ----------

  async dispatch(a: RunAction): Promise<PlaceResult | null> {
    this.events = [];
    this.sessionEvents = [];
    this.log.push(a);
    this.pending.push(a);
    let out: PlaceResult | null = null;
    if (a.t === 'endless') this.enterEndless();
    else if (this.over && a.t !== 'move') this.warn('The run is over.');
    else
      switch (a.t) {
        case 's':
          out = await this.sessionAction(a.a);
          break;
        case 'reroll':
          await this.rerollLineup(false);
          break;
        case 'skip':
          await this.skipRound();
          break;
        case 'endRound':
          await this.endRoundEarly();
          break;
        case 'memo':
          await this.useMemo(a.id, a.cardId, a.analyst);
          break;
        case 'finishTally':
          await this.finishTally();
          break;
        case 'buy':
          this.buy(a.index);
          break;
        case 'sell':
          this.sell(a.cartridgeId);
          break;
        case 'fire':
          this.fire(a.analyst);
          break;
        case 'move':
          this.move(a.from, a.to);
          break;
        case 'rerollShop':
          this.rerollShop();
          break;
        case 'leaveShop':
          await this.leaveShop();
          break;
        case 'startReview':
          await this.startReview();
          break;
        case 'boardDone':
          if (this.state.phase === 'round') this.state.round.boardSeen = true;
          break;
        case 'rerollBoss':
          this.rerollBoss();
          break;
        case 'setPlan':
          this.setPlan(a.plan);
          break;
        case 'takeSpoil':
          this.takeSpoil(a.id);
          break;
        case 'setPause': {
          // The run's own copy (a run keeps the settings it started with, so a replay matches).
          const pause = { ...this.state.config.pause, [a.kind]: a.on };
          this.state.config = { ...this.state.config, pause };
          if (this.session) this.session.config.pause = { ...pause };
          break;
        }
        case 'forfeit':
          this.finishRun('forfeit', 'You walked away from the desk.');
          break;
        case 'dev':
          if (a.op.k === 'boss') await this.devBoss(a.op.id);
          else this.devOp(a.op);
          break;
      }
    this.flushSpeech(String(this.log.length));
    if (!this.session || !this.sessionDirty) this.checkpoint();
    return out;
  }

  /** Queue a line; only the highest-priority line of an action is spoken. */
  private say(
    trigger: Trigger,
    pri: number,
    vars: Record<string, string | number> = {},
    who?: CharacterId,
  ): void {
    if (!this.speech || pri > this.speech.pri) this.speech = { trigger, pri, vars, who };
  }

  /** A coworker tip, spoken once per key (a first-time tip once a run, a nudge once a round). */
  private tip(trigger: Trigger, pri: number, key: string = trigger): void {
    const st = this.state;
    if (st.config.mode === 'sim') return;
    const seen = (st.stats.tipsSeen ??= []);
    if (seen.includes(key)) return;
    seen.push(key);
    this.say(trigger, pri);
  }

  private flushSpeech(label: string): void {
    const s = this.speech;
    this.speech = null;
    if (!s) return;
    const line = pickLine(s.trigger, this.rng(`line:${label}:${s.trigger}`), s.vars, s.who);
    this.events.push({ kind: 'say', text: line.text, line });
  }

  private checkpoint(): void {
    this.checkpointState = clone(this.state);
    this.pending = [];
  }

  private rng(label: string): Rng {
    return streamFor(this.state.config.seed, label);
  }

  private warn(text: string): void {
    this.events.push({ kind: 'warn', text });
  }

  private async sdispatch(a: SessionAction): Promise<PlaceResult | null> {
    const s = this.session as TradingSession;
    this.sessionDirty = true;
    const r = await s.dispatch(a);
    this.sessionEvents.push(...s.lastEvents);
    return r;
  }

  /**
   * Why a new trade can't go on this card right now, in words the order ticket can show (null
   * when it can). The call itself is read from the trade when it's placed, so it isn't checked.
   */
  tradeBlock(cardId: string, structureId: StructureId): string | null {
    const s = this.session;
    const r = this.state.round;
    if (!s || this.state.phase !== 'round') return 'No round is in progress.';
    const desk = DESKS[this.state.config.deskId];
    if (r.sitOut) return 'You are sitting this round out: no new trades until it ends.';
    if (s.inDay) return 'Wait for the close.';
    if (this.state.config.mode === 'sim' && (r.clockStarted || s.clockStarted))
      return 'The clock is running: new trades wait for the next round.';
    if (s.clockStarted && s.dayIndex >= BALANCE.run.tradeWindowDays)
      return `The trading window closed after day ${BALANCE.run.tradeWindowDays}: new trades wait for the next round.`;
    if (r.ticketsUsed >= r.tickets)
      return 'No tickets left this round: manage your open trades or end the round.';
    if (!desk.structures.includes(structureId))
      return `${STRUCTURES[structureId].name} is not in the ${desk.name} desk's playbook.`;
    const card = s.cards.find((c) => c.id === cardId);
    if (!card) return 'That card is not on the table.';
    if (card.orderIds.length || card.positionIds.some((id) => s.position(id)?.status === 'open'))
      return 'One trade per card: manage this one in Positions (Ctrl+1).';
    if (card.positionIds.length) return 'This card already had its trade this round: pick another card.';
    return null;
  }

  private placeBlock(a: Extract<SessionAction, { t: 'place' }>): string | null {
    const why = this.tradeBlock(a.cardId, a.structureId);
    if (why) return why;
    const card = this.session?.cards.find((c) => c.id === a.cardId);
    if (!card?.call) return 'Call your shot first: press 1-5 (and Shift+1-5 for confidence).';
    return null;
  }

  private lockedLoser(positionId: string): boolean {
    if (!this.passives().losersLocked) return false;
    const p = this.session?.position(positionId);
    return !!p && p.status === 'open' && (lastMark(p)?.plCents ?? 0) < 0;
  }

  private async sessionAction(sa: SessionAction): Promise<PlaceResult | null> {
    const s = this.session;
    const st = this.state;
    const r = st.round;
    const fail = (reason: string): PlaceResult => {
      this.warn(reason);
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
    if (!s || st.phase !== 'round') return fail('No round is in progress.');
    let action: SessionAction = sa;
    switch (sa.t) {
      case 'addCard':
      case 'removeCard':
        return fail('Cards are dealt by the desk.');
      case 'place': {
        const why = this.placeBlock(sa);
        if (why) return fail(why);
        break;
      }
      case 'begin':
        r.clockStarted = true;
        break;
      case 'close':
        if (this.lockedLoser(sa.positionId))
          return fail('Bag Holder: losers cannot be closed before expiration.');
        break;
      case 'roll':
        if (this.lockedLoser(sa.positionId))
          return fail('Bag Holder: losers cannot be rolled before expiration.');
        if (r.memo.rollAtMid) {
          action = { ...sa, order: { ...sa.order, atMid: true } };
          r.memo.rollAtMid = false;
          this.events.push({ kind: 'info', text: 'Roll Voucher: this roll fills at mid.' });
        }
        break;
      case 'decide': {
        const dp = s.decisions.find((d) => d.id === sa.dpId);
        if (!dp) break;
        let act = sa.action;
        if ((act === 'close' || act === 'roll') && this.lockedLoser(dp.positionId)) {
          act = 'hold';
          this.warn('Bag Holder: this loser has to ride to expiration.');
        }
        let order = sa.order;
        if (act === 'roll' && r.memo.rollAtMid) {
          order = { ...(order ?? { type: 'market' }), atMid: true };
          r.memo.rollAtMid = false;
        }
        action = { ...sa, action: act, order };
        if (dp.kind === 'stop_hit' && act === 'hold')
          this.addStress(BALANCE.stress.declineStop, 'Declined your own stop');
        if (dp.kind === 'stop_hit' && act === 'hold') {
          this.say('decline_stop', 7);
          this.state.stats.stopDeclines++;
        }
        for (const id of this.activeCartridges()) {
          const eff = CARTRIDGE_BY_ID[id]?.onDecisionPoint?.({
            kind: dp.kind,
            action: act,
            run: this.runView(),
            state: this.cartState(id),
          });
          if (eff?.stress) this.addStress(eff.stress, `${CARTRIDGE_BY_ID[id].name}: declined a stop`);
        }
        break;
      }
      default:
        break;
    }
    const before = new Set(s.positions.map((p) => p.id));
    const hadOrder = sa.t === 'cancel' && s.orders.some((o) => o.id === sa.orderId);
    // The duel: Chad opens his book on the cards as they stand when the clock first starts.
    const duel = !!r.bossId && !!this.rule().duel;
    if (duel && sa.t === 'begin' && !this.rival)
      this.rival = await Rival.start(this.source, this.sessionConfig(), r.cards);
    const res = await this.sdispatch(action);
    if (duel && sa.t === 'begin' && this.rival) await this.rival.day();
    for (const p of s.positions) if (!before.has(p.id)) this.onOpened(p);
    if (sa.t === 'place' && res?.ok) r.ticketsUsed++;
    if (sa.t === 'begin') {
      for (const d of s.decisions) {
        if (d.kind === 'stop_hit') this.tip('tip_stop', 5);
        if (d.kind === 'earnings_tomorrow') this.tip('tip_earnings', 5);
      }
      if (s.dayIndex === 1 && s.positions.length === 0 && !r.sitOut) this.tip('tip_wait', 2);
    }
    if (sa.t === 'roll' || (sa.t === 'decide' && action.t === 'decide' && action.action === 'roll'))
      this.tip('tip_roll', 3);
    if (sa.t === 'end' && !r.sitOut) {
      const left = this.tradeDaysLeft();
      if (left === 2 && r.ticketsUsed < r.tickets && this.holdOpen())
        this.tip('tip_window', 3, `tip_window:${st.quarter}:${r.index}`);
    }
    if (hadOrder) r.ticketsUsed = Math.max(0, r.ticketsUsed - 1);
    if (sa.t === 'end') this.afterDayClose();
    if (sa.t === 'end' && r.bossId) this.chargeInterest(s);
    if (sa.t === 'end' && r.bossId && this.rule().beatSpy) r.race = [...(r.race ?? []), raceNow(s)];
    if (sa.t === 'end' && duel && this.rival)
      r.duelRace = [...(r.duelRace ?? []), { you: raceNow(s).you, rival: this.rival.pl() }];
    this.scoreClosed();
    if (sa.t === 'end' || sa.t === 'close' || sa.t === 'decide') await this.checkLine();
    if (this.session !== s) return res;
    if (r.sitOut && r.clockStarted && !s.inDay && s.dayIndex >= r.sitOut.days) {
      await this.finishSitOut();
      return res;
    }
    s.holdOpen = this.holdOpen();
    if (r.clockStarted && s.isDone()) await this.settleRound();
    return res;
  }

  /**
   * The Collector: at each close, every losing trade whose price sits at or past a strike you sold
   * (or within half a percent of it) is charged interest on its risk, taken off the score. Game
   * layer only: the trade, its P/L and the ledger are untouched.
   */
  private chargeInterest(s: TradingSession): void {
    const rate = this.rule().interestRate;
    if (!rate) return;
    const r = this.state.round;
    const items: InterestItem[] = [];
    for (const p of s.openPositions()) {
      const m = lastMark(p);
      if (!m || m.plCents >= 0) continue;
      const hit = testedShort(p.legs, m.spot);
      if (!hit) continue;
      const points = Math.round(pnlChips(rate * p.entry.maxLossCents, r.startEquityCents));
      if (points <= 0) continue;
      r.interestDays = { ...(r.interestDays ?? {}), [p.id]: (r.interestDays?.[p.id] ?? 0) + 1 };
      r.interest = (r.interest ?? 0) + points;
      r.meter -= points;
      items.push({
        positionId: p.id,
        symbol: p.symbol,
        strike: hit.strike,
        right: hit.right,
        spot: m.spot,
        plCents: m.plCents,
        riskCents: p.entry.maxLossCents,
        points,
        days: r.interestDays[p.id],
      });
    }
    if (!items.length) return;
    const total = items.reduce((a, x) => a + x.points, 0);
    this.events.push({
      kind: 'interest',
      text: `The Collector: −${total} points of interest.`,
      points: -total,
      interest: { items, rate, day: s.dayIndex },
    });
  }

  private cartState(id: string): CartState {
    const st = this.state;
    if (!st.cartState[id]) st.cartState[id] = {};
    return st.cartState[id];
  }

  private onOpened(p: Position): void {
    const r = this.state.round;
    const isStraddle = p.structureId === 'long_straddle' || p.structureId === 'long_strangle';
    r.straddlesBefore[p.id] = r.straddlesOpened;
    if (isStraddle) r.straddlesOpened++;
    if (r.memo.doubleDown) {
      r.doubleDownFor = p.id;
      r.memo.doubleDown = false;
    }
    const cl = r.client;
    if (cl && cl.status === 'open') {
      const def = CLIENT_BY_ID[cl.id];
      const checks = clientChecks(
        def.request,
        {
          structureId: p.structureId,
          maxLossCents: p.entry.maxLossCents,
          pop: p.entry.pop,
          dte: p.entry.dte,
          credit: p.openNet < 0,
          rewardToRisk: p.entry.rewardToRisk,
          edgeTier: p.entry.edgeTier,
        },
        r.startEquityCents,
      );
      if (checks.every((c) => c.pass)) {
        cl.status = 'filled';
        this.state.stats.clientsFilled++;
        this.events.push({
          kind: 'good',
          text: `${def.name}: request filled. +$${def.cash} and reputation at round end.`,
        });
      }
    }
    for (const id of this.activeCartridges()) {
      const eff = CARTRIDGE_BY_ID[id]?.onEntry?.({
        structureId: p.structureId,
        highIv: p.entry.iv > 0.6,
        run: this.runView(),
        state: this.cartState(id),
      });
      if (eff?.stress) this.addStress(eff.stress, `${CARTRIDGE_BY_ID[id].name}: new trade`);
    }
  }

  private portfolioDelta(): number {
    return (this.session?.openPositions() ?? []).reduce(
      (a, p) => a + (lastMark(p)?.greeks.delta ?? 0) * p.qty,
      0,
    );
  }

  private afterDayClose(): void {
    const s = this.session as TradingSession;
    const r = this.state.round;
    const open = s.openPositions();
    const positions = open.map((p) => ({
      id: p.id,
      shortPremium: STRUCTURES[p.structureId].credit,
      inProfit: (lastMark(p)?.plCents ?? 0) > 0,
    }));
    for (const id of this.activeCartridges()) {
      const c = CARTRIDGE_BY_ID[id];
      if (!c?.onDayClose || !positions.length) continue;
      c.onDayClose({
        run: this.runView(),
        state: this.cartState(id),
        positions,
        addChips: (pid, chips) => {
          r.thetaChips[pid] = (r.thetaChips[pid] ?? 0) + chips;
        },
      });
    }
    if (
      !r.drawdownHit &&
      s.markedEquityCents() < r.startEquityCents * (1 - BALANCE.ledger.drawdownStressPct)
    ) {
      r.drawdownHit = true;
      this.addStress(BALANCE.stress.drawdownOver5, 'Drawdown over 5% this round', true);
    }
    if (open.length && Math.abs(this.portfolioDelta()) >= 5) r.deltaNeutralOk = false;
  }

  private scoreClosed(): void {
    const s = this.session;
    if (!s) return;
    for (const p of s.positions)
      if (p.status === 'closed' && !this.state.round.scored.includes(p.id)) this.scoreTrade(p);
  }

  /** Losing trades in a row at the end of this round's tally (the Collector compounds them). */
  lossStreak(): number {
    const t = this.state.round.tallies;
    let n = 0;
    for (let i = t.length - 1; i >= 0 && !t[i].winner; i--) n++;
    return n;
  }

  private scoreTrade(p: Position): void {
    const s = this.session as TradingSession;
    const st = this.state;
    const r = st.round;
    const carts = this.activeCartridges();
    const run = this.runView();
    const facts = computeFacts(s, p, {
      thetaChips: r.thetaChips[p.id] ?? 0,
      straddlesBefore: r.straddlesBefore[p.id] ?? 0,
      portfolioDelta: this.portfolioDelta(),
    });
    const steps = scoreSteps({
      facts,
      deskId: st.config.deskId,
      level: st.levels[p.structureId] ?? 1,
      goodRR: !!p.entry.goodRR,
      edgeTier: p.entry.edgeTier,
      reviewId: r.reviewId,
      bossId: r.bossId,
      showdown: r.showdown ?? 0,
      lossStreak: this.lossStreak(),
      families: this.families(),
      cartridges: carts,
      cartState: st.cartState,
      run,
      doubleDown: r.doubleDownFor === p.id,
      hedge: r.memo.hedge,
    });
    const res = runScore(
      facts.realizedCents,
      r.startEquityCents,
      steps,
      winQuality(facts.returnOnRisk, facts.structureId),
    );
    r.meter += res.points;
    r.scored.push(p.id);
    const card = s.card(p.cardId);
    r.tallies.push({
      positionId: p.id,
      cardId: p.cardId,
      displaySymbol: card.displaySymbol,
      structureId: p.structureId,
      realizedCents: facts.realizedCents,
      winner: res.winner,
      chips: res.chips,
      mult: res.mult,
      points: res.points,
      steps,
      trace: res.trace,
      closedOn: p.closedOn ?? '',
      meterAfter: r.meter,
      target: r.target,
      exitReason: p.exitReason ?? null,
      planExit: facts.closedAtPlan ?? null,
      maxLossCents: p.entry.maxLossCents,
    });
    this.events.push({
      kind: 'score',
      text: `${card.displaySymbol} ${STRUCTURES[p.structureId].short}: ${res.points >= 0 ? '+' : ''}${res.points} points`,
      points: res.points,
    });

    // One-shot effects consumed by this trade.
    if (r.doubleDownFor === p.id) r.doubleDownFor = null;
    if (r.memo.hedge && !facts.win) r.memo.hedge = false;
    if (!facts.win && facts.gappedThroughShort && carts.includes('breakout_insurance'))
      r.gapInsuranceUsed = true;
    if (facts.win && carts.includes('patience_pays')) st.patienceStacks = 0;
    for (const id of carts) CARTRIDGE_BY_ID[id]?.onClose?.({ facts, run, state: this.cartState(id) });

    // Stress, each with its cause.
    const sym = card.displaySymbol;
    if (!facts.win && !(facts.assigned && st.config.deskId === 'income'))
      this.addStress(BALANCE.stress.perLoser, `Losing trade on ${sym}`, true);
    if (res.points <= -0.4 * r.target || facts.realizedCents <= -0.03 * r.startEquityCents)
      this.say('big_loss', 6, { points: res.points });
    else if (res.points >= 0.5 * r.target) this.say('big_win', 6, { points: res.points });
    if (facts.closedAtPlan)
      this.addStress(BALANCE.stress.closeAtPlan, `Closed ${sym} at plan (${facts.closedAtPlan})`);
    if (facts.closedAtPlan && this.rng(`plan:${p.id}`).chance(0.5)) this.say('closed_at_plan', 3);
    st.stats.lossRun = facts.win ? 0 : (st.stats.lossRun ?? 0) + 1;
    if (facts.win) this.tip('tip_first_win', 4);
    else if ((st.stats.lossRun ?? 0) >= 2 || r.meter < 0)
      this.tip('tip_struggling', 5, `tip_struggling:${st.quarter}:${r.index}`);
    if (facts.assigned && st.config.deskId !== 'income' && !carts.includes('assignment_artist'))
      this.addStress(BALANCE.stress.assignment, `Assigned on ${sym}`);
    const call = card.call;
    if (call && facts.callActual !== null) {
      st.brierScores.push(brier(call, facts.callActual as 0 | 1 | 2 | 3 | 4));
      if (call.confidence >= 0.8 - 1e-9 && !facts.callExact && !facts.callAdjacent)
        this.addStress(
          BALANCE.stress.wrongHighConfidence,
          `Wrong call at ${Math.round(call.confidence * 100)}% on ${sym}`,
        );
    }
    st.totals.trades++;
    if (facts.win) st.totals.wins++;
    st.totals.points += res.points;
    const ss = st.stats;
    for (const stp of steps)
      if (stp.kind === 'cartridge' && stp.source && res.trace.some((t) => t.label === stp.label))
        ss.cartTriggers[stp.source] = (ss.cartTriggers[stp.source] ?? 0) + 1;
    if (res.winner) {
      ss.maxMult = Math.max(ss.maxMult, res.mult);
      ss.maxPoints = Math.max(ss.maxPoints, res.points);
    }
    if (facts.ivCrushWin) ss.ivCrushWins++;
    if (facts.win && (facts.pctOfMaxProfit ?? 0) >= 0.5 && facts.exitReason !== 'expired') ss.closes50++;
    if (facts.closedAtPlan === 'stop') ss.plannedStops++;
    ss.exits = recordExit(
      ss.exits ?? {},
      exitKind(facts.closedAtPlan, p.exitReason),
      facts.realizedCents,
      p.entry.maxLossCents,
    );
    if (p.entry.edgeTier === 'top10') ss.edgeTop10++;
    ss.ladderBest = Math.max(ss.ladderBest, st.cartState.ladder_up?.streak ?? 0);
    if (facts.cspAssigned) ss.cspAssigned = true;
    if (facts.win && facts.structureId === 'covered_call' && ss.cspAssigned) {
      ss.wheel++;
      ss.cspAssigned = false;
    }
  }

  private async checkLine(): Promise<void> {
    const s = this.session;
    const r = this.state.round;
    if (!s || r.breached || r.memo.waiver) return;
    const floor = this.maxLossFloorCents();
    const eq = s.markedEquityCents();
    if (eq >= floor) return;
    r.breached = true;
    this.events.push({
      kind: 'breach',
      text: `MAX-LOSS LINE CROSSED: equity ${formatCents(eq)} is below ${formatCents(floor)}. The risk desk is closing everything.`,
    });
    for (const o of s.orders.slice()) await this.sdispatch({ t: 'cancel', orderId: o.id });
    for (const p of s.openPositions())
      await this.sdispatch({ t: 'close', positionId: p.id, order: { type: 'market', forceNatural: true } });
    this.scoreClosed();
  }

  private async settleRound(): Promise<void> {
    const s = this.session as TradingSession;
    const st = this.state;
    const r = st.round;
    this.scoreClosed();
    for (const p of s.positions.filter((x) => x.status === 'closed')) {
      try {
        const d = await buildDebrief(s, p.id);
        r.debriefs.push(d);
        st.totals.alphaCents += d.alphaCents;
        st.totals.benchmarkCents += d.benchmarkCents;
      } catch {
        // A debrief is a nice-to-have; the score and ledger are already final.
      }
    }
    st.totals.realizedCents += s.realizedCents;
    let equity = st.equityCents + s.realizedCents;
    if (st.config.realism.taxes && s.realizedCents > 0) {
      r.taxCents = Math.round(s.realizedCents * BALANCE.ledger.shortTermTaxRate);
      equity -= r.taxCents;
      this.events.push({
        kind: 'info',
        text: `Taxes: ${formatCents(r.taxCents)} set aside on this round's gain.`,
      });
    }
    st.equityCents = equity;
    // Money and points pull the same way: a round that made money scores a bonus on top.
    r.realizedCents = s.realizedCents;
    if (!r.breached && s.realizedCents !== 0 && r.meter > 0) {
      const green = s.realizedCents > 0;
      r.greenBonus = Math.round(
        r.meter * (green ? BALANCE.scoring.greenRoundBonus : -BALANCE.scoring.redRoundPenalty),
      );
      r.meter += r.greenBonus;
      this.events.push({
        kind: 'score',
        text: green
          ? `Green round: the round made money, +${r.greenBonus} points.`
          : `Red round: the round lost money, ${r.greenBonus} points.`,
        points: r.greenBonus,
      });
    }
    // The duel: finishing ahead of Chad multiplies the round's score, trailing him cuts it.
    const duel = this.duelNow();
    if (duel) {
      const won = s.realizedCents > duel.rival;
      r.duel = { you: s.realizedCents, rival: duel.rival, won };
      const mult = won ? BALANCE.duel.winMult : BALANCE.duel.loseMult;
      const before = r.meter;
      if (r.meter > 0) r.meter = Math.round(r.meter * mult);
      this.events.push({
        kind: won ? 'good' : 'warn',
        text: won
          ? `You beat Chad: ${formatCents(r.duel.you)} to his ${formatCents(r.duel.rival)}. Round score x${mult}.`
          : `Chad wins the duel: his ${formatCents(r.duel.rival)} to your ${formatCents(r.duel.you)}. Round score x${mult}.`,
        points: r.meter - before,
      });
    }
    const goal = this.secondGoal();
    if (goal && !goal.met)
      this.events.push({
        kind: 'warn',
        text: `Second goal missed: ${goal.have} of ${goal.need} structure types. The Review needs both.`,
      });
    r.status = !r.breached && r.meter >= r.target && (!goal || goal.met) ? 'passed' : 'failed';
    if (r.bossId) r.styleMet = styleState(BOSSES[r.bossId].style, this.styleTrades(), true) === 'met';
    // Part of a surplus carries into the next round, so a strong round leaves a cushion.
    st.carry = r.status === 'passed' ? Math.round((r.meter - r.target) * BALANCE.scoring.carryShare) : 0;
    if (r.breached) this.say('breach', 9);
    else this.say(r.status === 'passed' ? 'target_met' : 'target_missed', 5);
    const unused = Math.max(0, r.tickets - r.ticketsUsed);
    if (this.activeCartridges().includes('patience_pays'))
      st.patienceStacks = Math.min(3, st.patienceStacks + unused);
    st.phase = 'tally';
    this.finishedSession = s;
    this.session = null;
    this.sessionDirty = false;
    this.events.push({ kind: 'phase', text: r.status === 'passed' ? 'Target met.' : 'Target missed.' });
  }

  private async endRoundEarly(): Promise<void> {
    const s = this.session;
    const r = this.state.round;
    if (!s || this.state.phase !== 'round') return this.warn('No round is in progress.');
    if (r.sitOut) return this.warn('You are sitting this round out: let the days run.');
    if (s.openPositions().length || s.orders.length || s.inDay)
      return this.warn('Close or wait out your positions first.');
    r.clockStarted = true;
    s.holdOpen = false;
    await this.settleRound();
  }

  private async finishTally(): Promise<void> {
    const st = this.state;
    const r = st.round;
    if (st.phase !== 'tally') return this.warn('Nothing to tally.');
    const passed = r.status === 'passed';
    const unused = Math.max(0, r.tickets - r.ticketsUsed);
    const cashBefore = st.cash;
    const run = this.runView();
    for (const id of this.activeCartridges()) {
      const eff = CARTRIDGE_BY_ID[id]?.onRoundEnd?.({
        run,
        state: this.cartState(id),
        meter: r.meter,
        target: r.target,
        passed,
        unusedTickets: unused,
        portfolioDeltaOk: r.deltaNeutralOk,
      });
      if (eff?.cash) r.payouts.push({ label: eff.note ?? CARTRIDGE_BY_ID[id].name, cash: eff.cash });
      if (eff?.stress) this.addStress(eff.stress, eff.note ?? CARTRIDGE_BY_ID[id].name);
    }
    if (passed) {
      r.payouts.push({ label: `Round win (${ROUND_NAMES[r.index]})`, cash: BALANCE.cash.roundWin[r.index] });
      if (r.bossId && r.styleMet)
        r.payouts.push({
          label: `Style: ${STYLE_TEXT[BOSSES[r.bossId].style]}`,
          cash: BALANCE.run.styleCash,
        });
      if (unused)
        r.payouts.push({
          label: `${unused} unused ticket${unused > 1 ? 's' : ''}`,
          cash: unused * BALANCE.cash.perUnusedTicket,
        });
      const interest = complianceMods(st.config.compliance).noInterest
        ? 0
        : interestFor(cashBefore, this.passives().interestCapAdd);
      if (interest)
        r.payouts.push({ label: `Interest ($1 per $${BALANCE.cash.interestPer})`, cash: interest });
    }
    if (r.index === 2 && st.tagEffects.investment) {
      r.payouts.push({ label: 'Investment Tag', cash: st.tagEffects.investment });
      st.tagEffects.investment = 0;
    }
    if (r.client) {
      const def = CLIENT_BY_ID[r.client.id];
      if (r.client.status === 'filled') {
        r.payouts.push({ label: `Client: ${def.name}`, cash: def.cash });
        st.reputation += def.reputation;
      } else {
        r.client.status = 'missed';
        st.reputation -= 1;
      }
    }
    if (passed && r.reviewId && !st.stats.reviewsPassed.includes(r.reviewId))
      st.stats.reviewsPassed.push(r.reviewId);
    if (passed && r.bossId) {
      st.stats.bossesBeaten ??= [];
      if (!st.stats.bossesBeaten.includes(r.bossId)) st.stats.bossesBeaten.push(r.bossId);
      this.bossRewards(r.bossId);
    }
    st.cash = Math.max(0, st.cash + r.payouts.reduce((a, p) => a + p.cash, 0));
    st.history.push({
      quarter: st.quarter,
      index: r.index,
      reviewId: r.reviewId,
      bossId: r.bossId ?? null,
      target: r.target,
      meter: r.meter,
      status: r.status,
      realizedCents: r.debriefs.reduce((a, d) => a + d.realizedCents, 0),
      alphaCents: r.debriefs.reduce((a, d) => a + d.alphaCents, 0),
      trades: r.tallies.length,
    });
    // One missed Month target per quarter is a write-up, not the end: more stress, no round-win
    // cash, and a bigger Review. A breach, a missed Review or a second miss still ends the run.
    // Practice (the tutorial) never writes anyone up: a miss there is only a lesson.
    const writeUp =
      !passed &&
      !r.breached &&
      (r.index < 2 || !BALANCE.run.bossFailEndsRun) &&
      !this.writtenUp(st.quarter) &&
      !st.endless &&
      !st.config.practice;
    if (writeUp) {
      st.writeUps = [...(st.writeUps ?? []), st.quarter];
      this.addStress(BALANCE.stress.writeUp, `Written up: missed the ${ROUND_NAMES[r.index]} target`);
      this.events.push({
        kind: 'warn',
        text: `WRITTEN UP: ${r.meter} of ${r.target} points. One miss a quarter is allowed; this quarter's Review target is ${Math.round((BALANCE.targets.writeUpReviewMult - 1) * 100)}% higher, and another miss ends the run.`,
      });
      this.say('target_missed', 9);
    } else if (!passed) {
      if (this.activeCartridges().includes('golden_parachute')) {
        st.cartridges = st.cartridges.filter((c) => c !== 'golden_parachute');
        st.parachuteUsed = true;
        this.events.push({
          kind: 'good',
          text: 'GOLDEN PARACHUTE DEPLOYED. You survive this one. The cartridge is gone.',
        });
        this.say('parachute', 9);
        st.stats.parachuteSaves++;
      } else if (st.config.practice) {
        this.events.push({ kind: 'info', text: 'Practice run: a missed round does not end the run.' });
      } else if (st.endless) {
        // The year's victory is banked; Endless ends where you fall.
        this.finishRun(
          'victory',
          `Endless ended in ${yearLabel(st.quarter, r.index)}: ${r.breached ? 'you crossed the Max-Loss Line' : `${r.meter} of ${r.target} points`}.`,
        );
        return;
      } else {
        this.finishRun(
          'defeat',
          r.breached
            ? 'You crossed the Max-Loss Line.'
            : `You missed the target: ${r.meter} of ${r.target} points.`,
        );
        return;
      }
    }
    if (this.isLastRound()) {
      // The Rebalancer asks this round to beat SPY; a year-end without one asks the whole year.
      const roundSpy = !!r.bossId && this.rule().beatSpy;
      const alpha = roundSpy ? r.debriefs.reduce((a, d) => a + d.alphaCents, 0) : st.totals.alphaCents;
      if (st.config.practice) {
        const cleared = st.history.filter((h) => h.status === 'passed').length;
        this.finishRun(
          'survived',
          `Practice run complete: ${cleared} of ${st.history.length} rounds cleared.`,
        );
        return;
      }
      this.finishRun(
        alpha > 0 ? 'victory' : 'survived',
        alpha > 0
          ? roundSpy
            ? 'You beat the year, the Rebalancer and SPY.'
            : 'You beat the year and beat SPY.'
          : roundSpy
            ? "You survived the Rebalancer, but your last round trailed SPY. The board asks why you didn't just buy SPY."
            : "You survived, but the board asks why you didn't just buy SPY.",
      );
      return;
    }
    this.openShop();
  }

  /** After a victory: keep the build and play on. The year's result stays banked. */
  private enterEndless(): void {
    const st = this.state;
    if (
      st.phase !== 'victory' ||
      st.result?.outcome !== 'victory' ||
      st.config.practice ||
      st.config.mode !== 'career'
    )
      return this.warn('Endless opens after a Career victory.');
    if (st.endless) return this.warn('Already in Endless.');
    st.endless = true;
    st.result = null;
    this.say('endless', 9);
    this.openShop();
  }

  private finishRun(outcome: RunResult['outcome'], reason: string): void {
    const st = this.state;
    const mb = meanBrier(st.brierScores);
    const grade = calibrationGrade(mb);
    const cleared = st.history.filter((h) => h.status === 'passed').length;
    const alpha = st.totals.alphaCents;
    const won = outcome === 'victory';
    const survived = outcome === 'survived';
    st.result = {
      outcome,
      reason,
      calGrade: grade,
      meanBrier: mb,
      xp: cleared * 10 + BALANCE.calibration.xp[grade] + (won ? 100 : survived ? 60 : 0),
      bonus:
        Math.floor(Math.max(0, st.totals.points) / 200) +
        BALANCE.calibration.bonusCash[grade] +
        (alpha > 0 ? 10 : 0) +
        (won ? 25 : survived ? 10 : 0),
      alphaCents: alpha,
      realizedCents: st.totals.realizedCents,
      points: st.totals.points,
      roundsCleared: cleared,
    };
    st.phase = won || survived ? 'victory' : 'defeat';
    this.say(won ? 'victory' : survived ? 'survived' : 'defeat', 10);
    st.shop = null;
    this.session = null;
    this.sessionDirty = false;
    this.events.push({ kind: 'phase', text: reason });
  }

  // ---------- rounds ----------

  private async loadWindows(): Promise<WindowDef[]> {
    if (this.allWindows) return this.allWindows;
    let cached = windowCache.get(this.source);
    if (!cached) {
      cached = Promise.all([this.source.windows({}), this.source.symbols()]).then(([windows, symbols]) => ({
        windows,
        index: symbols.filter((s) => s.isEtf).map((s) => s.symbol),
      }));
      windowCache.set(this.source, cached);
    }
    const { windows, index } = await cached;
    this.allWindows = windows;
    this.windowById = new Map(windows.map((w) => [w.id, w]));
    this.indexSymbols = new Set(index);
    return windows;
  }

  sessionConfig(): SessionConfig {
    const st = this.state;
    const cfg = st.config;
    const tier = tierMods(cfg.tier);
    const r = st.round;
    const rule = this.rule();
    const p = this.passives();
    const desk = DESKS[cfg.deskId];
    const comp = complianceMods(cfg.compliance);
    return defaultSessionConfig({
      seed: r.sessionSeed,
      mode: cfg.mode === 'sim' ? 'sim' : 'run',
      startEquityCents: r.startEquityCents,
      riskCapPct: tier.riskCapPct * p.riskCapMult * (rule.riskCapMult ?? 1),
      realism: {
        ...cfg.realism,
        ...Object.fromEntries(Object.entries(comp.realism).filter(([, v]) => v)),
        fees: cfg.realism.fees || tier.fees || !!comp.realism.fees,
        earlyAssignment: cfg.realism.earlyAssignment || tier.assignmentAlways || !!rule.earlyAssignmentAlways,
        expirationMechanics: cfg.realism.expirationMechanics || tier.assignmentAlways,
      },
      pause: cfg.pause,
      trustEarningsAck: !!cfg.trustEarningsAck,
      autoBrackets: p.autoBrackets && !p.losersLocked,
      suppressOnGap: !!rule.noDecisionsOnGap,
      execution: {
        ...p.execution,
        fillPenalty: tier.fillPenalty,
        marketOrdersDisabled: !!rule.marketOrdersDisabled || comp.marketOrdersDisabled,
      },
      bracketDefaults: this.exitPlan(),
      benchmark: cfg.benchmark,
      callMode: cfg.callMode,
      blind: true,
      rescale: cfg.rescale,
      priceRange: desk.priceRange ?? [20, 150],
      advanceIdle: cfg.mode !== 'sim',
    });
  }

  private async openSession(): Promise<void> {
    this.rival = null;
    await this.loadWindows();
    const s = new TradingSession(this.source, this.sessionConfig());
    for (const c of this.state.round.cards)
      await s.dispatch({
        t: 'addCard',
        cardId: c.cardId,
        windowId: c.windowId,
        timeSkip: c.timeSkip || undefined,
      });
    this.session = s;
    this.sessionDirty = false;
    s.holdOpen = this.holdOpen();
  }

  private async enterRound(reviewId: ReviewId | null): Promise<void> {
    const st = this.state;
    const cfg = st.config;
    const tier = tierMods(cfg.tier);
    const q = st.quarter;
    const idx = st.roundIndex;
    const rng = this.rng(`round:q${q}r${idx}`);
    // The quarter's boss is known from its first day (so it can be shown ahead); it runs the Review.
    const quarterBoss = this.bossFor(q);
    const bossId = reviewId && BOSSES[quarterBoss].market === reviewId ? quarterBoss : null;
    const showdown = bossId ? showdownTier(q) : 0;
    const rule = roundRule(reviewId, bossId, showdown);
    const p = this.passives();
    const target = computeTarget(q, idx, reviewId, cfg, this.writtenUp(q), bossId);
    const comp = complianceMods(cfg.compliance);
    const line = Math.max(0.02, this.baseLossLinePct() + (rule.maxLossLineDelta ?? 0) + st.tagEffects.calm);
    st.tagEffects.calm = 0;
    const burnout = st.burnoutNext;
    st.burnoutNext = false;
    const scoutRerolls = st.analysts.reduce((a, x) => a + (ANALYSTS[x.id].extraRerolls ?? 0) * x.level, 0);
    const silent = burnout && st.analysts.length ? rng.pick(st.analysts).id : null;
    st.round = {
      ...emptyRound(),
      quarter: q,
      index: idx,
      reviewId,
      bossId,
      showdown,
      // The month menu comes before each Month (a Review has its case file instead).
      boardSeen: !!reviewId || cfg.mode === 'tutorial' || cfg.mode === 'sim',
      target,
      startEquityCents: st.equityCents,
      maxLossLinePct: line,
      tickets: Math.max(
        1,
        BALANCE.run.ticketsPerRound +
          (DESKS[cfg.deskId].ticketsAdd ?? 0) +
          tier.ticketDelta +
          // The Allocator's second goal comes with a ticket to reach it.
          (rule.variety ? 1 : 0) -
          (burnout ? 1 : 0),
      ),
      rerolls: Math.max(
        0,
        BALANCE.run.rerollsPerRound +
          tier.rerollDelta +
          comp.rerollDelta +
          (idx === 0 ? (cfg.perks?.month1Rerolls ?? 0) : 0) +
          cfg.extraRerolls +
          (silent === 'scout' ? 0 : scoutRerolls),
      ),
      sessionSeed: `${cfg.seed}:q${q}r${idx}`,
      burnout,
      silentAnalyst: silent,
      ghostScore: Math.round(target * rng.range(0.75, 1.35)),
      skipTag: idx < 2 ? rng.pick(TAG_IDS) : null,
    };
    const carry = Math.max(0, Math.min(st.carry ?? 0, Math.round(target * BALANCE.scoring.carryCap)));
    st.carry = 0;
    if (carry > 0) {
      st.round.meter = carry;
      st.round.carriedIn = carry;
    }
    if (!reviewId && rng.chance(1 / 3)) {
      const fits = CLIENTS.filter((c) => clientFitsDesk(c, cfg.deskId));
      if (fits.length) st.round.client = { id: rng.pick(fits).id, status: 'open' };
    }
    if (reviewId) st.reviewsSeen.push(reviewId);
    st.phase = 'round';
    if (this.activeCartridges().includes('rivals_bet')) this.say('rival', 2, {}, 'bradley');
    else if (!reviewId && (idx === 0 || rng.chance(0.4)))
      this.say('round_start', 2, { target, tickets: st.round.tickets });
    if (burnout)
      this.events.push({
        kind: 'bad',
        text: `Burnout: one fewer ticket this round${silent ? `, and ${ANALYSTS[silent].name} is not answering` : ''}.`,
      });
    const count =
      Math.min(
        BALANCE.run.lineupMax + (DESKS[cfg.deskId].lineupAdd ?? 0),
        BALANCE.run.lineupSize + p.lineupAdd + (DESKS[cfg.deskId].lineupAdd ?? 0),
      ) + comp.lineupDelta;
    const { windows, relaxed } = await this.deal(Math.max(1, count), []);
    const r = st.round;
    r.filterRelaxed = relaxed;
    r.cards = windows.map((w) => ({ cardId: `c${++r.cardCounter}`, windowId: w.id, timeSkip: 0 }));
    st.usedWindows.push(...windows.map((w) => w.id));
    await this.openSession();
  }

  private async deal(
    count: number,
    keepCardIds: string[],
  ): Promise<{ windows: WindowDef[]; relaxed: boolean }> {
    const all = await this.loadWindows();
    const st = this.state;
    const r = st.round;
    const review = r.reviewId ? REVIEWS[r.reviewId] : null;
    const rule = this.rule();
    const keepWindows = keepCardIds
      .map((id) => this.windowById.get(r.cards.find((c) => c.cardId === id)?.windowId ?? -1))
      .filter((x): x is WindowDef => !!x);
    const keepSymbols = keepWindows.map((w) => w.symbol);
    const hasIndex = keepSymbols.some((sym) => this.indexSymbols.has(sym));
    const res = dealWindows(all, this.rng(`deal:q${st.quarter}r${st.roundIndex}:${r.cardCounter}`), {
      count,
      filter: review && r.reviewId !== 'annual_review' ? review.filter : undefined,
      mix: r.reviewId === 'annual_review' ? ANNUAL_MIX : undefined,
      excludeWindows: new Set(st.usedWindows),
      excludeSymbols: new Set(keepSymbols),
      indexSymbols: this.indexSymbols,
      forceIndexCard: !!rule.forceContextCard && !hasIndex,
      needFlat: this.deskSellsRange() && !keepWindows.some(isFlat),
    });
    if (!res.windows.length)
      throw new Error('No market windows left to deal. Rebuild the market data (Settings > Data).');
    return res;
  }

  /** The desk's playbook sells a range (condors, flies, calendars): its lineups need a flat chart. */
  deskSellsRange(): boolean {
    return DESKS[this.state.config.deskId].structures.some((id) => STRUCTURES[id].bias === 'neutral');
  }

  private async rerollLineup(free: boolean): Promise<boolean> {
    const s = this.session;
    const r = this.state.round;
    if (!s || this.state.phase !== 'round') {
      this.warn('No lineup to reroll.');
      return false;
    }
    if (r.clockStarted) {
      this.warn('The clock is running: the lineup is locked.');
      return false;
    }
    if (!free && r.rerollsUsed >= r.rerolls) {
      this.warn('No rerolls left this round.');
      return false;
    }
    const traded = (id: string) => {
      const c = s.cards.find((x) => x.id === id);
      return !!c && (c.positionIds.length > 0 || c.orderIds.length > 0);
    };
    const keep = r.cards.filter((c) => traded(c.cardId));
    const drop = r.cards.filter((c) => !traded(c.cardId));
    if (!drop.length) {
      this.warn('Every card is already traded.');
      return false;
    }
    if (!free) r.rerollsUsed++;
    for (const c of drop) await this.sdispatch({ t: 'removeCard', cardId: c.cardId });
    const { windows, relaxed } = await this.deal(
      drop.length,
      keep.map((c) => c.cardId),
    );
    r.filterRelaxed = r.filterRelaxed || relaxed;
    const fresh = windows.map((w) => ({ cardId: `c${++r.cardCounter}`, windowId: w.id, timeSkip: 0 }));
    for (const c of fresh) await this.sdispatch({ t: 'addCard', cardId: c.cardId, windowId: c.windowId });
    r.cards = [...keep, ...fresh];
    this.state.usedWindows.push(...windows.map((w) => w.id));
    this.events.push({ kind: 'info', text: `Rerolled ${fresh.length} card${fresh.length > 1 ? 's' : ''}.` });
    return true;
  }

  /**
   * A skip sits the round out: no trades for a set number of trading days while the market moves
   * on without you, then the Tag and the stress relief pay. The simulator skips instantly.
   */
  private async skipRound(): Promise<void> {
    const st = this.state;
    const r = st.round;
    if (!this.canSkip())
      return this.warn(
        r.index === 2 ? 'Reviews cannot be skipped.' : 'You can only skip before placing any trade.',
      );
    if (st.config.mode === 'sim' || !this.session) return this.finishSitOut();
    r.sitOut = { days: BALANCE.run.sitOutDays };
    this.session.holdOpen = true;
    this.say('skip', 5);
    this.events.push({
      kind: 'info',
      text: `Sitting out: ${BALANCE.run.sitOutDays} trading days with no new trades. Press Space to let them pass; the Tag pays at the end.`,
    });
  }

  private async finishSitOut(): Promise<void> {
    const st = this.state;
    const r = st.round;
    this.addStress(BALANCE.stress.skipRound, 'Sat a round out');
    st.stats.skips++;
    if (this.activeCartridges().includes('patience_pays'))
      st.patienceStacks = Math.min(3, st.patienceStacks + 1);
    r.status = 'skipped';
    st.history.push({
      quarter: st.quarter,
      index: r.index,
      reviewId: null,
      target: r.target,
      meter: 0,
      status: 'skipped',
      realizedCents: 0,
      alphaCents: 0,
      trades: 0,
    });
    if (r.skipTag) this.awardTag(r.skipTag);
    this.events.push({ kind: 'good', text: 'Sit-out over: rested, and the Tag is yours.' });
    this.session = null;
    this.sessionDirty = false;
    await this.advanceRound();
  }

  private awardTag(tag: TagId): void {
    const st = this.state;
    const fx = st.tagEffects;
    if (tag === 'double') {
      fx.doubleNext = true;
      this.events.push({ kind: 'good', text: 'Double Tag: your next tag is copied.' });
      return;
    }
    const times = fx.doubleNext ? 2 : 1;
    fx.doubleNext = false;
    for (let i = 0; i < times; i++) {
      switch (tag) {
        case 'discipline':
          this.addStress(-20, 'Discipline Tag');
          st.cash += 4;
          break;
        case 'analyst':
          fx.freeAnalyst++;
          break;
        case 'cartridge':
          fx.freeUncommon++;
          break;
        case 'playbook': {
          const rng = this.rng(`tag:playbook:${st.quarter}:${st.roundIndex}:${i}`);
          for (let k = 0; k < 2; k++) {
            const sid = rng.pick(DESKS[st.config.deskId].structures);
            st.levels[sid] = (st.levels[sid] ?? 1) + 1;
          }
          break;
        }
        case 'investment':
          fx.investment += 15;
          break;
        case 'reroll':
          fx.freeRerolls += 2;
          break;
        case 'calm':
          fx.calm += 0.02;
          break;
      }
    }
    st.pendingTags.push(tag);
    this.events.push({
      kind: 'good',
      text: `${tag[0].toUpperCase()}${tag.slice(1)} Tag${times > 1 ? ' x2' : ''}.`,
    });
  }

  private async advanceRound(): Promise<void> {
    const st = this.state;
    let q = st.quarter;
    let i = st.roundIndex + 1;
    if (i > 2) {
      q++;
      i = 0;
    }
    st.quarter = q;
    st.roundIndex = i;
    st.stats.year = Math.floor((q - 1) / 4) + 1;
    const relief = st.config.perks?.quarterStressRelief ?? 0;
    if (i === 0 && q > 1 && relief > 0) this.addStress(-relief, 'The Pad: a quiet evening at home');
    if (i === 2) {
      // The quarter's boss runs the Review, in its market; the year ends with the Rebalancer.
      const bossId = this.bossFor(q);
      const review: ReviewId = BOSSES[bossId].market;
      st.nextReview = review;
      st.phase = 'review_intro';
      // (The line quotes the Review's own target, not the Month that just ended.)
      this.say(
        'review_intro',
        4,
        { target: computeTarget(q, 2, review, st.config, this.writtenUp(q), bossId) },
        'kessler',
      );
      st.round = {
        ...emptyRound(),
        quarter: q,
        index: 2,
        reviewId: review,
        bossId,
        target: computeTarget(q, 2, review, st.config, this.writtenUp(q), bossId),
      };
      this.addStress(BALANCE.stress.enterReview, `Entering a Review: ${BOSSES[bossId].name}`);
      return;
    }
    await this.enterRound(null);
  }

  private async startReview(): Promise<void> {
    const st = this.state;
    if (st.phase !== 'review_intro' || !st.nextReview) return this.warn('No Review is waiting.');
    const id = st.nextReview;
    st.nextReview = null;
    await this.enterRound(id);
  }

  // ---------- memos ----------

  private async useMemo(id: MemoId, cardId?: string, analyst?: AnalystId): Promise<void> {
    const st = this.state;
    const r = st.round;
    const at = st.memos.indexOf(id);
    if (at < 0) return this.warn('You do not have that memo.');
    const def = MEMOS[id];
    const inRound = st.phase === 'round' && !!this.session;
    if (id !== 'vacation' && !inRound) return this.warn(`${def.name} can only be used during a round.`);
    if (def.when !== 'anytime' && r.clockStarted)
      return this.warn(`${def.name} has to be used before the clock starts.`);
    switch (id) {
      case 'reroll':
        if (!(await this.rerollLineup(true))) return;
        break;
      case 'extra_ticket':
        r.tickets++;
        break;
      case 'time_skip': {
        const s = this.session as TradingSession;
        const c = r.cards.find((x) => x.cardId === cardId);
        const sc = s.cards.find((x) => x.id === cardId);
        if (!c || !sc || sc.positionIds.length || sc.orderIds.length)
          return this.warn('Pick an untraded card first.');
        await this.sdispatch({ t: 'removeCard', cardId: c.cardId });
        const next = { cardId: `c${++r.cardCounter}`, windowId: c.windowId, timeSkip: c.timeSkip + 2 };
        await this.sdispatch({
          t: 'addCard',
          cardId: next.cardId,
          windowId: next.windowId,
          timeSkip: next.timeSkip,
        });
        r.cards = r.cards.map((x) => (x.cardId === c.cardId ? next : x));
        break;
      }
      case 'roll_voucher':
        r.memo.rollAtMid = true;
        break;
      case 'vacation':
        this.addStress(BALANCE.stress.vacationDay, 'Vacation Day');
        break;
      case 'lens':
        r.memo.lens = true;
        break;
      case 'hedge':
        r.memo.hedge = true;
        break;
      case 'analyst_loan':
        if (!analyst || this.state.analysts.some((a) => a.id === analyst))
          return this.warn('Pick an analyst you have not hired.');
        r.memo.loan = analyst;
        break;
      case 'due_diligence':
        if (!cardId) return this.warn('Pick a card first.');
        r.memo.dueDiligence.push(cardId);
        break;
      case 'double_down':
        r.memo.doubleDown = true;
        break;
      case 'compliance_waiver':
        r.memo.waiver = true;
        this.addStress(20, 'Compliance Waiver');
        break;
    }
    st.memos.splice(st.memos.indexOf(id), 1);
    this.events.push({ kind: 'info', text: `${def.name} used.` });
  }

  // ---------- shop ----------

  private shopMods() {
    const p = this.passives();
    return {
      priceMult: p.priceMult,
      cartridgeOffers: BALANCE.shop.cartridgeOffers + p.shopSlotsAdd,
      analystOffers: BALANCE.shop.analystOffers + p.analystOffersAdd,
    };
  }

  private openShop(): void {
    const st = this.state;
    const rng = this.rng(`shop:q${st.quarter}r${st.roundIndex}:0`);
    const items = generateShop(st, rng, this.shopMods());
    const fx = st.tagEffects;
    while (fx.freeAnalyst > 0) {
      const a = items.find((x) => x.kind === 'analyst' && x.price > 0);
      if (a) a.price = 0;
      fx.freeAnalyst--;
    }
    while (fx.freeUncommon > 0) {
      const pool = cartridgePool(st).filter(
        (c) => !items.some((x) => x.kind === 'cartridge' && x.id === c.id),
      );
      const c = pickCartridge(pool, rng, st.config.deskId, 'U');
      if (c) items.push({ kind: 'cartridge', id: c.id, price: 0, sold: false });
      fx.freeUncommon--;
    }
    st.shop = { items, rerolls: 0, freeRerolls: fx.freeRerolls };
    if (st.spoilsDue) {
      // The boss's spoils: three free cartridges you don't own and the shop isn't showing, the
      // first a Rare (an Uncommon if no Rare is left).
      st.spoilsDue = false;
      const srng = this.rng(`spoils:q${st.quarter}`);
      const ids: string[] = [];
      for (let i = 0; i < BALANCE.run.spoilsCount; i++) {
        const pool = cartridgePool(st).filter(
          (c) => !ids.includes(c.id) && !items.some((x) => x.kind === 'cartridge' && x.id === c.id),
        );
        const c =
          i === 0
            ? (pickCartridge(pool, srng, st.config.deskId, 'R') ??
              pickCartridge(pool, srng, st.config.deskId, 'U'))
            : pickCartridge(pool, srng, st.config.deskId);
        if (c) ids.push(c.id);
      }
      const trophy = st.spoilsTrophy ?? null;
      st.spoilsTrophy = null;
      if (ids.length || trophy) st.shop.spoils = { ids, taken: null, trophy };
    }
    fx.freeRerolls = 0;
    st.phase = 'shop';
    // After a Review the next quarter's boss is drawn now, so the shop can show (and reroll) it a
    // quarter ahead.
    if (st.roundIndex === 2) this.bossFor(st.quarter + 1);
    if (this.rng(`shopline:${st.quarter}:${st.roundIndex}`).chance(0.4)) this.say('shop', 2);
  }

  shopRerollCost(): number {
    const shop = this.state.shop;
    if (!shop) return 0;
    const p = this.passives();
    if (shop.freeRerolls > 0 || (p.freeFirstShopReroll && shop.rerolls === 0)) return 0;
    return rerollCost(shop.rerolls, p.rerollCostDelta);
  }

  private rerollShop(): void {
    const st = this.state;
    const shop = st.shop;
    if (!shop || st.phase !== 'shop') return this.warn('The shop is closed.');
    const cost = this.shopRerollCost();
    if (st.cash < cost) return this.warn(`A reroll costs $${cost}.`);
    if (shop.freeRerolls > 0) shop.freeRerolls--;
    st.cash -= cost;
    shop.rerolls++;
    const fresh = generateShop(
      st,
      this.rng(`shop:q${st.quarter}r${st.roundIndex}:${shop.rerolls}`),
      this.shopMods(),
    ).filter((x) => x.kind !== 'voucher');
    shop.items = [...fresh, ...shop.items.filter((x) => x.kind === 'voucher')];
  }

  /**
   * Beating a boss pays a bounty, hands over its trophy (a permanent buff; cash instead if you
   * already hold it) and puts three free cartridges in the next shop.
   */
  private bossRewards(id: BossId): void {
    const st = this.state;
    const r = st.round;
    const def = BOSSES[id];
    r.payouts.push({ label: `Boss beaten: ${def.name}`, cash: BALANCE.run.bossBounty });
    st.trophies ??= [];
    if (st.trophies.includes(id)) {
      r.payouts.push({ label: `${BOSS_TROPHIES[id].name} (already yours)`, cash: BALANCE.run.bossBounty });
      st.spoilsTrophy = null;
    } else {
      st.trophies.push(id);
      st.spoilsTrophy = id;
      this.events.push({
        kind: 'good',
        text: `TROPHY: ${BOSS_TROPHIES[id].name}. ${BOSS_TROPHIES[id].text}`,
      });
    }
    st.spoilsDue = true;
  }

  /** Take one of a boss's spoils (free); the others go. */
  private takeSpoil(id: string): void {
    const st = this.state;
    const sp = st.shop?.spoils;
    if (st.phase !== 'shop' || !sp || !sp.ids.includes(id)) return this.warn('Nothing to take there.');
    if (sp.taken) return this.warn('You already took one.');
    if (st.cartridges.length >= this.cartridgeSlots())
      return this.warn('No free cartridge slot. Sell one first.');
    st.cartridges.push(id);
    st.cartState[id] = {};
    if (!st.stats.owned.includes(id)) {
      st.stats.owned.push(id);
      st.stats.ownedAt[id] = st.history.length;
    }
    sp.taken = id;
    st.stats.maxCartridges = Math.max(st.stats.maxCartridges, st.cartridges.length);
    if (st.cartridges.some((c) => CARTRIDGE_BY_ID[c]?.duoOf)) st.stats.duoOwned = true;
    this.events.push({ kind: 'good', text: `Spoils: ${CARTRIDGE_BY_ID[id]?.name ?? id}.` });
  }

  private buy(index: number): void {
    const st = this.state;
    const item = st.shop?.items[index];
    if (!item || st.phase !== 'shop') return this.warn('Nothing to buy there.');
    if (item.sold) return this.warn('Already bought.');
    if (st.cash < item.price) return this.warn(`You need $${item.price}.`);
    switch (item.kind) {
      case 'cartridge':
        if (st.cartridges.length >= this.cartridgeSlots())
          return this.warn('No free cartridge slot. Sell one first.');
        st.cartridges.push(item.id);
        st.cartState[item.id] = {};
        if (!st.stats.owned.includes(item.id)) {
          st.stats.owned.push(item.id);
          st.stats.ownedAt[item.id] = st.history.length;
        }
        break;
      case 'analyst': {
        const have = st.analysts.find((a) => a.id === item.id);
        if (have) have.level = Math.max(have.level, item.level);
        else {
          if (st.analysts.length >= this.analystSeats())
            return this.warn('No free analyst seat. Let one go first.');
          st.analysts.push({ id: item.id, level: 1 });
        }
        break;
      }
      case 'memo':
        if (st.memos.length >= BALANCE.shop.memoSlots) return this.warn('Memo slots are full.');
        st.memos.push(item.id);
        break;
      case 'page':
        st.levels[item.id] = (st.levels[item.id] ?? 1) + 1;
        break;
      case 'voucher':
        st.vouchers.push(item.id);
        st.cash += VOUCHERS[item.id].cashNow ?? 0;
        break;
    }
    st.cash -= item.price;
    item.sold = true;
    st.stats.maxCartridges = Math.max(st.stats.maxCartridges, st.cartridges.length);
    st.stats.maxAnalysts = Math.max(st.stats.maxAnalysts, st.analysts.length);
    if (st.cartridges.some((c) => CARTRIDGE_BY_ID[c]?.duoOf)) st.stats.duoOwned = true;
    this.events.push({ kind: 'good', text: 'Bought.' });
  }

  /** Developer mode: skip the rest of this quarter's Months and face this boss now. */
  private async devBoss(id: BossId): Promise<void> {
    const st = this.state;
    if (st.phase !== 'round' || st.roundIndex === 2 || st.round.clockStarted)
      return this.warn('Jump to a boss from a Month, before its clock starts.');
    if (this.session?.positions.length) return this.warn('Close this Month’s trades first.');
    st.dev = true;
    st.bosses = [...(st.bosses ?? []).filter((b) => b.quarter !== st.quarter), { quarter: st.quarter, id }];
    st.roundIndex = 1;
    this.session = null;
    this.events.push({ kind: 'info', text: `DEV: straight to ${BOSSES[id].name}` });
    await this.advanceRound();
  }

  /** Developer mode's levers: game-layer only, logged like any action. */
  private devOp(op: DevOp): void {
    const st = this.state;
    const r = st.round;
    st.dev = true;
    const note = (text: string): void => {
      this.events.push({ kind: 'info', text: `DEV: ${text}` });
    };
    switch (op.k) {
      case 'cash':
        st.cash = Math.max(0, st.cash + op.delta);
        return note(`cash ${op.delta >= 0 ? '+' : '−'}$${Math.abs(op.delta)}`);
      case 'stress':
        this.addStress(op.delta, 'Developer mode');
        return note(`stress ${op.delta >= 0 ? '+' : ''}${op.delta}`);
      case 'tickets':
        r.tickets = Math.max(0, r.tickets + op.delta);
        return note(`tickets now ${r.tickets}`);
      case 'rerolls':
        r.rerolls = Math.max(0, r.rerolls + op.delta);
        return note(`rerolls now ${r.rerolls - r.rerollsUsed}`);
      case 'meter':
        r.meter += op.delta;
        return note(`meter ${op.delta >= 0 ? '+' : ''}${op.delta}`);
      case 'cartridge': {
        const c = CARTRIDGE_BY_ID[op.id];
        if (!c || st.cartridges.includes(op.id)) return this.warn('Already owned (or unknown).');
        if (st.cartridges.length >= this.cartridgeSlots())
          return this.warn('No free cartridge slot. Sell one first.');
        st.cartridges.push(op.id);
        st.cartState[op.id] = {};
        return note(`added ${c.name}`);
      }
      case 'analyst': {
        const have = st.analysts.find((a) => a.id === op.id);
        if (have) have.level = 2;
        else {
          if (st.analysts.length >= this.analystSeats()) return this.warn('No free analyst seat.');
          st.analysts.push({ id: op.id, level: 1 });
        }
        return note(`hired ${ANALYSTS[op.id].name}`);
      }
      case 'memo':
        if (st.memos.length >= BALANCE.shop.memoSlots) return this.warn('Memo slots are full.');
        st.memos.push(op.id);
        return note(`memo ${MEMOS[op.id].name}`);
      case 'voucher':
        if (st.vouchers.includes(op.id)) return this.warn('Already owned.');
        st.vouchers.push(op.id);
        st.cash += VOUCHERS[op.id].cashNow ?? 0;
        return note(`voucher ${VOUCHERS[op.id].name}`);
      case 'boss':
        // Async: handled by devBoss.
        return;
    }
  }

  private sell(id: string): void {
    const st = this.state;
    if (st.phase !== 'shop') return this.warn('Cartridges can be sold in the shop.');
    if (!st.cartridges.includes(id)) return this.warn('You do not own that cartridge.');
    const c = CARTRIDGE_BY_ID[id];
    st.cartridges = st.cartridges.filter((x) => x !== id);
    delete st.cartState[id];
    st.cash += sellPrice(c);
  }

  private fire(id: AnalystId): void {
    const st = this.state;
    if (st.phase !== 'shop') return this.warn('Analysts can be let go in the shop.');
    st.analysts = st.analysts.filter((a) => a.id !== id);
  }

  private move(from: number, to: number): void {
    const list = this.state.cartridges;
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
  }

  private async leaveShop(): Promise<void> {
    if (this.state.phase !== 'shop') return this.warn('The shop is closed.');
    this.state.shop = null;
    await this.advanceRound();
  }

  // ---------- stress ----------

  private addStress(delta: number, reason: string, fromLoss = false): void {
    const st = this.state;
    let d = delta;
    if (d > 0) {
      const p = this.passives();
      d *= p.stressGainMult;
      if (fromLoss) d *= p.stressFromLossesMult;
      d = Math.round(d);
    }
    const before = st.stress;
    st.stress = Math.max(0, Math.min(BALANCE.stress.burnoutAt, st.stress + d));
    if (before < 75 && st.stress >= 75 && st.stress < BALANCE.stress.burnoutAt)
      this.say('high_stress', 4, { stress: st.stress });
    st.stats.maxStress = Math.max(st.stats.maxStress, st.stress);
    const at = yearLabel(st.quarter, st.roundIndex);
    if (st.stress !== before) {
      st.stressLog.push({ delta: st.stress - before, reason, at });
      this.events.push({
        kind: 'stress',
        text: `Stress ${st.stress - before > 0 ? '+' : ''}${st.stress - before}: ${reason}`,
      });
    }
    if (st.stress >= BALANCE.stress.burnoutAt) {
      st.burnoutNext = true;
      st.stress = BALANCE.stress.burnoutResetTo;
      st.stressLog.push({
        delta: BALANCE.stress.burnoutResetTo - BALANCE.stress.burnoutAt,
        reason: 'BURNOUT: next round has one fewer ticket and one analyst goes silent',
        at,
      });
      this.events.push({
        kind: 'bad',
        text: 'BURNOUT. Next round: one fewer ticket, and one analyst stops answering.',
      });
      this.say('burnout', 8);
      st.stats.burnouts++;
    }
  }
}

/** Every cartridge id, for UI lookups and tests. */
export const ALL_CARTRIDGE_IDS = CARTRIDGES.map((c) => c.id);
export { cartridgePrice, sellPrice };
