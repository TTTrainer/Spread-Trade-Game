import type { ISODate } from '../calendar';
import type { Cents } from '../money';
import type { ContractKey, Dividend, OptionQuote } from '../market/types';
import type { Leg, StructureId } from '../strategies/types';

/** One day's market as the lifecycle sees it: today's close, built from the MarketView. */
export interface DayBook {
  date: ISODate;
  spot: number;
  open: number;
  rate: number;
  divYield: number;
  quote(key: ContractKey): OptionQuote | null;
  /** An earnings report is out tonight or tomorrow before the open. */
  earningsTomorrow: boolean;
  exDivToday: Dividend | null;
  exDivTomorrow: Dividend | null;
  /** Today's open gapped more than 2 ATR from yesterday's close. */
  gapDay: boolean;
  atr: number | null;
}

export interface LegSnapshot {
  stock?: boolean;
  mid: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  modeled: boolean;
}

export interface Mark {
  date: ISODate;
  spot: number;
  /** Market value of the legs per share per unit (mid; stock at spot). */
  value: number;
  plCents: Cents;
  legs: LegSnapshot[];
  /** Ratio of each leg at this mark, aligned with `legs`. */
  ratios: number[];
  greeks: { delta: number; gamma: number; theta: number; vega: number };
  modeled: boolean;
}

export type ExitReason =
  'target' | 'stop' | 'manual' | 'expired' | 'assigned' | 'window_end' | 'decision' | 'liquidated';

/** Brackets in P/L per share per unit: close for a profit of targetPl or a loss of -stopPl. */
export interface Brackets {
  targetPl: number | null;
  stopPl: number | null;
  targetPct: number | null;
  stopMult: number | null;
}

export type DecisionKind =
  | 'target_hit'
  | 'stop_hit'
  | 'short_touched'
  | 'dte21'
  | 'earnings_tomorrow'
  | 'exdiv_itm_call'
  | 'pin_risk'
  | 'assigned_shares';

export type DecisionAction = 'hold' | 'close' | 'roll' | 'adjust' | 'exercise' | 'sell_shares';

export interface DecisionPoint {
  id: string;
  positionId: string;
  kind: DecisionKind;
  date: ISODate;
  title: string;
  message: string;
  options: DecisionAction[];
  /** For bracket hits: the action that follows the plan. */
  planned?: DecisionAction;
}

export type PositionEventKind =
  | 'open'
  | 'close'
  | 'roll'
  | 'adjust'
  | 'exercise'
  | 'assigned'
  | 'expired'
  | 'dividend'
  | 'decision'
  | 'bracket';

export interface PositionEvent {
  date: ISODate;
  kind: PositionEventKind;
  detail: string;
  cashCents?: Cents;
}

export interface EntrySnapshot {
  spot: number;
  ivr: number | null;
  iv: number;
  hv20: number | null;
  expectedMove: number | null; // dollars to the front expiration
  expectedMovePct: number | null;
  edgePercentile: number | null;
  edgeTier: 'top10' | 'top25' | 'none' | null;
  rewardToRisk: number | null;
  pop: number;
  maxProfitCents: Cents | null;
  maxLossCents: Cents;
  riskPct: number;
  shortStrikes: number[];
  dte: number;
  earningsInside: boolean;
  exDivInside: boolean;
  rsi: number | null;
  trendSlope: number | null;
  sma50Slope: number | null;
  macdCrossDaysAgo: number | null;
  macdCrossDir: 'up' | 'down' | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  trend5d: number | null; // % change over the last 5 days
  ivVsHv: number | null; // IV minus HV20, vol points
  atr: number | null;
  credit: boolean;
  fillVsMidCents: Cents; // execution cost at entry (positive = paid away)
  /** Met its structure's "good R:R" rule at entry (scores +1 mult). */
  goodRR?: boolean;
}

export interface Position {
  id: string;
  cardId: string;
  windowId: number;
  symbol: string;
  structureId: StructureId;
  legs: Leg[];
  qty: number;
  openedOn: ISODate;
  openNet: number; // fill, per share per unit (+ debit / - credit)
  openMid: number;
  cashCents: Cents;
  feesCents: Cents;
  /** Money paid away versus mid on every fill (negative = cost). Feeds P/L attribution. */
  executionCents: Cents;
  collateralCents: Cents;
  brackets: Brackets;
  status: 'open' | 'closed';
  closedOn: ISODate | null;
  exitReason: ExitReason | null;
  realizedCents: Cents | null;
  marks: Mark[];
  events: PositionEvent[];
  entry: EntrySnapshot;
  flags: {
    shortTouched: boolean;
    dte21: boolean;
    earningsWarned: ISODate | null;
    exdivWarned: ISODate | null;
    pinWarned: boolean;
    stopDeclined: boolean;
    targetDeclined: boolean;
    assigned: boolean;
    assignedPending: boolean;
    heldIntoLast7: boolean;
    rolledForDebit: boolean;
    rolls: number;
    rollsForCredit: number;
    closedAtPlan: 'target' | 'stop' | null;
    earningsHeld: boolean;
    dividendsCents: Cents;
    exercised: boolean;
  };
  /** Last known snapshot per leg, used to model a mark when a quote is missing. */
  lastLegs: LegSnapshot[];
}
