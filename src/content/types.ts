/**
 * Content is data. Every desk, cartridge, analyst, memo, voucher, tag and Review is a typed
 * definition validated by schema tests. Cartridges act only through the documented hooks
 * below, and hooks can only touch the game layer (score, meter, cash, stress, shop, what the
 * player can see, execution inside the real bid/ask). They never see or change market data.
 */

import type { StructureId } from '../engine/strategies/types';
import type { ScoreStep } from '../engine/scoring/mult';
import type { ExecutionMods } from '../engine/orders/fill';
import type { WindowFilter } from '../engine/market/source';

export type DeskId = 'verticals' | 'income' | 'condor' | 'volatility' | 'calendar';
export type Family = 'THETA' | 'VEGA' | 'DELTA' | 'DISC' | 'EXEC' | 'EVENT' | 'ECON' | 'CHAOS';
export type Rarity = 'C' | 'U' | 'R' | 'L';
export type PowerTag = 'REAL' | 'ARCADE' | 'REAL+ARCADE';

/** Everything a scoring hook may know about a closed trade. Facts, not market access. */
export interface TradeFacts {
  positionId: string;
  cardId: string;
  structureId: StructureId;
  family: 'vertical' | 'income' | 'condor' | 'volatility' | 'calendar';
  bias: 'bull' | 'bear' | 'neutral' | 'long_vol';
  win: boolean;
  realizedCents: number;
  riskPct: number;
  shortPremium: boolean;
  credit: boolean;
  creditOfWidth: number | null; // credit / width for credit spreads
  pctOfMaxProfit: number | null; // realized / max profit
  closedAtPlan: 'target' | 'stop' | null;
  exitReason: string;
  expiredWorthless: boolean; // short premium expired for (nearly) full credit
  dteAtEntry: number;
  dteAtClose: number;
  daysOpen: number;
  daysInProfit: number; // trading days the position closed in profit
  heldOverWeekend: boolean;
  ivrAtEntry: number | null;
  ivChangePct: number | null; // relative change of the legs' IV, entry to exit
  ivMinusHvAtEntry: number | null; // vol points
  heldThroughEarnings: boolean;
  moveVsEm: number | null; // |exit - entry| / expected move
  stayedInsideEm: boolean | null;
  rsiAtEntry: number | null;
  shortOutsideBollinger: boolean;
  macdCrossWithin2: boolean; // cross in the trade's direction within 2 days of entry
  trendAligned: boolean | null; // bias agrees with the 50-day slope
  counterTrend: boolean;
  against5dTrend: boolean;
  callExact: boolean;
  callAdjacent: boolean;
  callDirectionRight: boolean;
  callBucket: number | null;
  callActual: number | null;
  callBigBucket: boolean; // exact call on a "big" bucket
  callFlat: boolean;
  rollsForCredit: number;
  closedDayAfterMacro: boolean;
  eventDayWin: boolean; // closed on an earnings reaction or macro day with a profit
  assigned: boolean;
  cspAssigned: boolean;
  coveredCallDividend: boolean;
  coveredCallExpiredOtm: boolean;
  pinnedFly: boolean; // iron fly expired within 1% of center
  straddleBeatEm: boolean;
  condorOutsideEm: boolean;
  gappedThroughShort: boolean;
  earningsMoveRatio: number | null; // actual / implied move on an earnings reaction inside the trade
  highIv: boolean; // IV above 60% at entry
  portfolioDeltaAtClose: number;
  frontIvAboveBack: boolean | null; // calendars: front IV > back IV at entry
  isDoubleCalendar: boolean;
  diagonalWithTrend: boolean;
  thetaChips: number; // chips accumulated by day-close hooks (e.g. Theta Engine)
  callBonus: number; // the call-bonus mult this trade earned (for "call bonus x2" effects)
  stopDeclined: boolean;
  lossWithinStop: boolean; // a loser closed at or before its planned stop
  dividendsCollected: number;
  longPremiumThroughEvent: boolean;
  debitDirectional: boolean; // a debit trade with a bull or bear lean
  ivCrushWin: boolean; // short-vega winner whose IV fell 15%+ while open
  straddlesBefore: number; // straddles/strangles opened earlier this round
  isStraddle: boolean;
  shortDte: number | null; // days to the front expiration at close
}

/** Per-run state a cartridge can keep (counters, one-shot flags). */
export type CartState = Record<string, number>;

export interface RunView {
  quarter: number;
  roundIndex: number; // 0 = Month 1, 1 = Month 2, 2 = Review
  reviewId: ReviewId | null;
  deskId: DeskId;
  families: Record<Family, number>;
  ownedCartridges: string[];
  patienceStacks: number;
  rollArtistStacks: number;
  deltaNeutralOk: boolean;
  gapInsuranceUsed: boolean;
  ghostScore: number;
}

export interface ScoreHookCtx {
  facts: TradeFacts;
  run: RunView;
  state: CartState;
}

export interface DayHookCtx {
  run: RunView;
  state: CartState;
  positions: { id: string; shortPremium: boolean; inProfit: boolean }[];
  addChips: (positionId: string, chips: number) => void;
}

export interface RoundEndCtx {
  run: RunView;
  state: CartState;
  meter: number;
  target: number;
  passed: boolean;
  unusedTickets: number;
  portfolioDeltaOk: boolean;
}

export interface RoundEndEffect {
  cash?: number;
  stress?: number;
  note?: string;
}

export interface PassiveMods {
  execution?: Partial<ExecutionMods>;
  riskCapMult?: number;
  interestCapAdd?: number;
  rerollCostDelta?: number;
  stressGainMult?: number;
  maxLossLineDelta?: number; // + loosens, - tightens (fraction of equity)
  shopSlotsAdd?: number;
  freeFirstShopReroll?: boolean;
  losersLocked?: boolean; // Bag Holder: losers can't be closed early
  stressPerTrade?: number;
}

export interface CartridgeDef {
  id: string;
  name: string;
  families: Family[];
  desks: DeskId[] | 'any';
  rarity: Rarity;
  tag: PowerTag;
  text: string;
  synergies: string[];
  duoOf?: [string, string];
  /** onEntry: a trade was opened (e.g. Meme Energy's stress). */
  onEntry?: (ctx: {
    structureId: StructureId;
    highIv: boolean;
    run: RunView;
    state: CartState;
  }) => { stress?: number } | void;
  /** onTally: score steps for one closed trade, applied in slot order. */
  score?: (ctx: ScoreHookCtx) => ScoreStep[];
  /** onDayClose: accumulate chips or counters while positions are open. */
  onDayClose?: (ctx: DayHookCtx) => void;
  /** onDecisionPoint: e.g. extra stress for declining a stop. */
  onDecisionPoint?: (ctx: {
    kind: string;
    action: string;
    run: RunView;
    state: CartState;
  }) => { stress?: number } | void;
  /** onClose: counters when a trade closes (streaks, stacks). */
  onClose?: (ctx: ScoreHookCtx) => void;
  /** onRoundEnd: cash and stress after the round. */
  onRoundEnd?: (ctx: RoundEndCtx) => RoundEndEffect | void;
  /** Passive modifiers while owned. */
  passive?: PassiveMods;
  /** One-shot survival (Golden Parachute). */
  savesRun?: boolean;
}

export interface DeskDef {
  id: DeskId;
  name: string;
  blurb: string;
  structures: StructureId[];
  passiveText: string;
  startingAnalysts: AnalystId[];
  startingCartridges: string[];
  unlockCost: number; // Bonus; 0 = unlocked from the start
  /** Desk passive in the score pipeline (added before Edge Rank). */
  passive?: (f: TradeFacts) => ScoreStep[];
  /** Desk-specific price range for blind rescaling (income desks need affordable shares). */
  priceRange?: [number, number];
}

export type AnalystId =
  | 'quant'
  | 'vol_surfer'
  | 'earnings_whisperer'
  | 'chartist'
  | 'skew_doctor'
  | 'macro_desk'
  | 'ghost'
  | 'scout'
  | 'risk_officer';

export interface AnalystDef {
  id: AnalystId;
  name: string;
  price: number;
  reveals: string;
  level2: string;
  extraRerolls?: number;
}

export type MemoId =
  | 'reroll'
  | 'extra_ticket'
  | 'time_skip'
  | 'roll_voucher'
  | 'vacation'
  | 'lens'
  | 'hedge'
  | 'analyst_loan'
  | 'due_diligence'
  | 'double_down'
  | 'compliance_waiver';

export interface MemoDef {
  id: MemoId;
  name: string;
  text: string;
  /** When it can be used. */
  when: 'lineup' | 'anytime' | 'before_clock';
}

export type VoucherId =
  | 'second_monitor'
  | 'terminal_pro'
  | 'prime_broker'
  | 'dma'
  | 'margin_upgrade'
  | 'algo_execution'
  | 'research_budget'
  | 'clearance'
  | 'seed_capital'
  | 'risk_committee';

export interface VoucherDef {
  id: VoucherId;
  name: string;
  text: string;
  passive: PassiveMods & {
    lineupAdd?: number;
    analystSeatsAdd?: number;
    cartridgeSlotsAdd?: number;
    autoBrackets?: boolean;
    analystOffersAdd?: number;
    priceMult?: number;
  };
  cashNow?: number;
}

export type TagId =
  'discipline' | 'analyst' | 'cartridge' | 'playbook' | 'investment' | 'double' | 'reroll' | 'calm';

export interface TagDef {
  id: TagId;
  name: string;
  text: string;
}

export type ReviewId =
  | 'earnings_gauntlet'
  | 'the_fed'
  | 'the_chop'
  | 'trend_train'
  | 'vol_spike'
  | 'dead_calm'
  | 'wide_markets'
  | 'assignment_week'
  | 'gap_risk'
  | 'annual_review';

export interface ReviewDef {
  id: ReviewId;
  name: string;
  filterText: string;
  ruleText: string;
  filter: WindowFilter;
  /** Rule effects on the round. */
  rule: {
    callBonusMult?: number;
    forceContextCard?: boolean;
    macroPanel?: boolean;
    debitDirectionalWinMult?: number;
    counterTrendLossMult?: number;
    maxLossLineDelta?: number;
    baseChipsMult?: number;
    marketOrdersDisabled?: boolean;
    earlyAssignmentAlways?: boolean;
    noDecisionsOnGap?: boolean;
    targetMult?: number;
    needsAlpha?: boolean;
  };
  announce: string; // COMPLY-3000's line
}
