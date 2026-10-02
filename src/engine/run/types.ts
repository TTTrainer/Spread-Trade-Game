import type { BossId } from '../../content/bosses';
/**
 * Run state: everything about a Career run that is not market data. It is plain JSON, so it
 * autosaves, and together with the action log it replays the run exactly.
 */

import type { AnalystId, CartState, DeskId, MemoId, ReviewId, TagId, VoucherId } from '../../content/types';
import type { DecisionKind } from '../lifecycle/types';
import type { RealismToggles } from '../lifecycle/daily';
import type { ScoreStep, TraceRow } from '../scoring/mult';
import type { Grade } from '../scoring/calls';
import type { StructureId } from '../strategies/types';
import type { SessionAction } from '../trading/session';
import type { TradeDebrief } from '../trading/debrief';
import type { Line } from '../../content/characters';
import type { PadPerk } from '../../content/meta';

export type RunPhase = 'round' | 'tally' | 'shop' | 'review_intro' | 'victory' | 'defeat';

export interface RunConfig {
  seed: string;
  deskId: DeskId;
  mode: 'career' | 'daily' | 'tutorial' | 'sim';
  tier: number;
  startEquityCents: number;
  pureMarket: boolean;
  realism: RealismToggles;
  pause: Record<DecisionKind, boolean>;
  /** Trust the earnings tick as "don't ask" (see SessionConfig). Absent in older saves. */
  trustEarningsAck?: boolean;
  callMode: 'em' | 'fixed';
  rescale: boolean;
  quarters: number;
  benchmark: string | null;
  startingStress: number;
  extraRerolls: number;
  /** Practice (tutorial): a missed round does not end the run. */
  practice: boolean;
  /** Compliance Rules switched on for this run (each adds Heat). */
  compliance?: string[];
  /** The Pad's comfort perks. */
  perks?: PadPerk;
  /** Cartridge ids the shop may offer (the profile's unlocked pool). All of them when absent. */
  cartridgePool?: string[];
  /** Simulator only: cartridges that are owned but do nothing (the counterfactual balance check). */
  inert?: string[];
}

export interface StressEntry {
  delta: number;
  reason: string;
  at: string;
}

export interface TradeTally {
  positionId: string;
  cardId: string;
  displaySymbol: string;
  structureId: StructureId;
  realizedCents: number;
  winner: boolean;
  chips: number;
  mult: number;
  points: number;
  steps: ScoreStep[];
  trace: TraceRow[];
  closedOn: string;
}

export interface RoundCard {
  cardId: string;
  windowId: number;
  timeSkip: number;
}

/** Where new trades take profit and stop out, for the whole run. */
export interface ExitPlan {
  /** Credit trades: take profit at this share of the credit. */
  creditTargetPct: number;
  /** Credit trades: stop out when the loss reaches this many times the credit. */
  creditStopMult: number;
  /** Debit trades: take profit at this gain on the debit. */
  debitTargetPct: number;
  /** Debit trades: stop out at this share of the debit lost. */
  debitStopPct: number;
}

export interface RoundState {
  quarter: number;
  index: number; // 0 = Month 1, 1 = Month 2, 2 = Review
  reviewId: ReviewId | null;
  /** The boss running this Review (its market is `reviewId`); none on Month rounds. */
  bossId?: BossId | null;
  /** The month menu (target, build, plan, the quarter's boss) has been seen for this round. */
  boardSeen?: boolean;
  target: number;
  meter: number;
  startEquityCents: number;
  maxLossLinePct: number;
  tickets: number;
  ticketsUsed: number;
  rerolls: number;
  rerollsUsed: number;
  cards: RoundCard[];
  cardCounter: number;
  sessionSeed: string;
  clockStarted: boolean;
  drawdownHit: boolean;
  breached: boolean;
  status: 'playing' | 'passed' | 'failed' | 'skipped';
  tallies: TradeTally[];
  debriefs: TradeDebrief[];
  thetaChips: Record<string, number>;
  straddlesBefore: Record<string, number>;
  straddlesOpened: number;
  doubleDownFor: string | null; // position id
  memo: {
    doubleDown: boolean;
    hedge: boolean;
    rollAtMid: boolean;
    waiver: boolean;
    lens: boolean;
    dueDiligence: string[];
    loan: AnalystId | null;
  };
  burnout: boolean;
  silentAnalyst: AnalystId | null;
  deltaNeutralOk: boolean;
  gapInsuranceUsed: boolean;
  ghostScore: number;
  skipTag: TagId | null;
  payouts: { label: string; cash: number }[];
  taxCents: number;
  filterRelaxed: boolean;
  scored: string[]; // position ids already tallied
  client: { id: string; status: 'open' | 'filled' | 'missed' } | null;
  /** Sitting the round out (a skip): no trades until the days run out, then the Tag pays. */
  sitOut?: { days: number } | null;
  /** Points carried in from the last round's surplus (already on the meter). */
  carriedIn?: number;
  /** Points added because the round finished with a profit (negative: taken for a loss). */
  greenBonus?: number;
  /** The round's realized P/L (set when it settles). */
  realizedCents?: number;
}

export type ShopItem =
  | { kind: 'cartridge'; id: string; price: number; sold: boolean }
  | { kind: 'analyst'; id: AnalystId; price: number; sold: boolean; level: number }
  | { kind: 'memo'; id: MemoId; price: number; sold: boolean }
  | { kind: 'page'; id: StructureId; price: number; sold: boolean }
  | { kind: 'voucher'; id: VoucherId; price: number; sold: boolean };

export interface ShopState {
  items: ShopItem[];
  rerolls: number;
  freeRerolls: number;
}

export interface RoundSummary {
  quarter: number;
  index: number;
  reviewId: ReviewId | null;
  bossId?: BossId | null;
  target: number;
  meter: number;
  status: RoundState['status'];
  realizedCents: number;
  alphaCents: number;
  trades: number;
}

export interface RunResult {
  outcome: 'victory' | 'survived' | 'defeat' | 'forfeit';
  reason: string;
  calGrade: Grade;
  meanBrier: number | null;
  xp: number;
  bonus: number;
  alphaCents: number;
  realizedCents: number;
  points: number;
  roundsCleared: number;
}

export interface RunState {
  version: 1;
  id: string;
  /** Developer mode touched this run (its levers were used). */
  dev?: boolean;
  config: RunConfig;
  phase: RunPhase;
  quarter: number;
  roundIndex: number;
  equityCents: number;
  cash: number;
  stress: number;
  stressLog: StressEntry[];
  cartridges: string[];
  cartState: Record<string, CartState>;
  analysts: { id: AnalystId; level: number }[];
  memos: MemoId[];
  vouchers: VoucherId[];
  levels: Partial<Record<StructureId, number>>;
  pendingTags: TagId[];
  tagEffects: {
    freeAnalyst: number;
    freeUncommon: number;
    freeRerolls: number;
    investment: number;
    calm: number;
    doubleNext: boolean;
  };
  reviewsSeen: ReviewId[];
  nextReview: ReviewId | null;
  /** Each quarter's boss, picked when the quarter starts (so it can be shown a quarter ahead). */
  bosses?: { quarter: number; id: BossId }[];
  /** Quarters whose boss has been rerolled (once per boss). */
  bossRerolled?: number[];
  /** The run's exit plan for new trades, set from the month menu (else the desk's defaults). */
  plan?: ExitPlan;
  round: RoundState;
  shop: ShopState | null;
  history: RoundSummary[];
  brierScores: number[];
  totals: {
    realizedCents: number;
    alphaCents: number;
    benchmarkCents: number;
    points: number;
    trades: number;
    wins: number;
  };
  patienceStacks: number;
  parachuteUsed: boolean;
  /** Quarters with a written-up (missed) Month target; a second miss in one ends the run. */
  writeUps?: number[];
  /** Surplus points waiting to start the next round's meter. */
  carry?: number;
  burnoutNext: boolean;
  usedWindows: number[];
  result: RunResult | null;
  startedAt: string;
  reputation: number;
  /** Counters for achievements and the end screen. */
  stats: RunStats;
  /** Playing on after a victory: quarters keep coming and targets grow faster. */
  endless?: boolean;
}

export interface RunStats {
  cartTriggers: Record<string, number>;
  maxStress: number;
  stopDeclines: number;
  burnouts: number;
  skips: number;
  reviewsPassed: string[];
  bossesBeaten?: string[];
  maxMult: number;
  maxPoints: number;
  maxCartridges: number;
  maxAnalysts: number;
  ladderBest: number;
  clientsFilled: number;
  wheel: number;
  cspAssigned: boolean;
  ivCrushWins: number;
  closes50: number;
  plannedStops: number;
  edgeTop10: number;
  duoOwned: boolean;
  parachuteSaves: number;
  /** Every cartridge held at some point this run (the simulator's pick-rate analysis). */
  owned: string[];
  /** Rounds finished when each cartridge was first picked up (0 = the starting kit). */
  ownedAt: Record<string, number>;
  /** The year reached (2+ only in Endless). */
  year?: number;
  /** Coworker tips already given (first-time tips speak once a run; struggling once a round). */
  tipsSeen?: string[];
  /** Losing trades in a row. */
  lossRun?: number;
}

export type RunAction =
  | { t: 's'; a: SessionAction }
  | { t: 'reroll' }
  | { t: 'skip' }
  | { t: 'endRound' }
  | { t: 'memo'; id: MemoId; cardId?: string; analyst?: AnalystId }
  | { t: 'finishTally' }
  | { t: 'buy'; index: number }
  | { t: 'sell'; cartridgeId: string }
  | { t: 'fire'; analyst: AnalystId }
  | { t: 'move'; from: number; to: number }
  | { t: 'rerollShop' }
  | { t: 'leaveShop' }
  | { t: 'startReview' }
  | { t: 'boardDone' }
  | { t: 'rerollBoss' }
  | { t: 'setPlan'; plan: Partial<ExitPlan> }
  | { t: 'endless' }
  | { t: 'forfeit' }
  | { t: 'dev'; op: DevOp };

/**
 * Developer mode's test levers. They go through the action log like every other action, so a
 * resumed run replays them exactly. They touch the game layer only (cash, stress, meter, items),
 * never the market.
 */
export type DevOp =
  | { k: 'cash'; delta: number }
  | { k: 'stress'; delta: number }
  | { k: 'tickets'; delta: number }
  | { k: 'rerolls'; delta: number }
  | { k: 'meter'; delta: number }
  | { k: 'cartridge'; id: string }
  | { k: 'analyst'; id: AnalystId }
  | { k: 'memo'; id: MemoId }
  | { k: 'voucher'; id: VoucherId };

export interface RunEvent {
  kind: 'info' | 'good' | 'bad' | 'warn' | 'score' | 'stress' | 'breach' | 'phase' | 'say';
  text: string;
  points?: number;
  /** For 'say': who speaks and how they look. */
  line?: Line;
}

export interface RunSave {
  version: 1;
  checkpoint: RunState;
  pending: RunAction[];
  log: RunAction[];
}
