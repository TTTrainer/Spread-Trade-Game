import type { ISODate } from '../calendar';
import type { OptionRight } from '../market/types';

export type StructureId =
  | 'bull_put'
  | 'bear_call'
  | 'bull_call'
  | 'bear_put'
  | 'iron_condor'
  | 'iron_fly'
  | 'bwb_condor'
  | 'long_straddle'
  | 'long_strangle'
  | 'covered_call'
  | 'cash_secured_put'
  | 'calendar'
  | 'diagonal'
  | 'double_calendar';

export type StructureFamily = 'vertical' | 'income' | 'condor' | 'volatility' | 'calendar';
export type Bias = 'bull' | 'bear' | 'neutral' | 'long_vol';

/** Ratio is signed per unit: +1 buys one contract, -1 sells one. Stock ratio 1 = 100 shares. */
export interface OptionLeg {
  kind: 'option';
  right: OptionRight;
  strike: number;
  expiration: ISODate;
  ratio: number;
}

export interface StockLeg {
  kind: 'stock';
  ratio: number;
}

export type Leg = OptionLeg | StockLeg;

export interface BuildParams {
  expiration: ISODate;
  backExpiration?: ISODate;
  /** Target |delta| of the short strike (credit) or long strike (debit). */
  delta: number;
  /** Width in listed strike steps. */
  width: number;
  /** Optional explicit anchor strike (the short strike for credit spreads); overrides delta. */
  anchor?: number;
  /** Extra steps on the far wing (broken-wing condor). */
  skip?: number;
}

export interface StructureDef {
  id: StructureId;
  name: string;
  short: string;
  family: StructureFamily;
  bias: Bias;
  /** Normally opened for a credit. */
  credit: boolean;
  baseChips: number;
  /** Two expirations (front and back). */
  twoExpiries: boolean;
  /** The structure Alt+R flips to (bull put <-> bear call). */
  reverse?: StructureId;
  defaults: { delta: number; width: number; skip?: number };
  /** One-line description for the structure card. */
  blurb: string;
}

export type BuildResult = { ok: true; legs: Leg[] } | { ok: false; reason: string };
