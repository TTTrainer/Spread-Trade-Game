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
  callMode: 'em' | 'fixed';
  rescale: boolean;
  quarters: number;
  benchmark: string | null;
  startingStress: number;
  extraRerolls: number;
  /** Practice (tutorial): a missed round does not end the run. */
  practice: boolean;
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

export interface RoundState {
  quarter: number;
  index: number; // 0 = Month 1, 1 = Month 2, 2 = Review
  reviewId: ReviewId | null;
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
  burnoutNext: boolean;
  usedWindows: number[];
  result: RunResult | null;
  startedAt: string;
  reputation: number;
  /** Counters for achievements and the end screen. */
  stats: RunStats;
}

export interface RunStats {
  cartTriggers: Record<string, number>;
  maxStress: number;
  stopDeclines: number;
  burnouts: number;
  skips: number;
  reviewsPassed: string[];
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
  | { t: 'forfeit' };

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
