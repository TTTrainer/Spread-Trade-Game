/**
 * The rules in force for a round, from one place. A boss round keeps only its market (which
 * windows are dealt, plus The Fed's index card and macro panel, which are information) and adds
 * the boss's single twist; the market type's old Review rule is dropped. A Review with no boss
 * (an older save) keeps its old rule.
 */

import { BOSSES, showdownTwist, type BossId, type SealedInfo } from '../../content/bosses';
import { REVIEWS } from '../../content/reviews';
import type { ReviewDef, ReviewId } from '../../content/types';

export type RoundRule = ReviewDef['rule'] & {
  /** Multiplies the per-trade risk cap. */
  riskCapMult?: number;
  /** Multiplies a losing trade's points. */
  lossMult?: number;
  /** Each earlier loss in an unbroken streak multiplies the next loser's points by this. */
  lossStreakStep?: number;
  /** The Collector's daily interest on tested losers, as a share of each trade's risk. */
  interestRate?: number;
  /** Wins closed within this many trading days score `mult`. */
  shortWinTax?: { days: number; mult: number };
  /** The leftmost cartridge is switched off. */
  leftCartOff?: boolean;
  /** A winner's total mult keeps this share (applied after every other mult source). */
  multKeep?: number;
  /** Information sealed for the round. */
  hide?: SealedInfo[];
  /** Second goal: this many different structure types (capped at what the desk trades). */
  variety?: number;
  /** The full victory needs this round's trades to beat SPY on the same capital. */
  beatSpy?: boolean;
  /** A rival trades the same cards; the Review needs more P/L than his. */
  duel?: boolean;
};

/** `tier` is the boss's showdown tier (0 in the first year; harsher each Endless year). */
export function roundRule(reviewId: ReviewId | null, bossId?: BossId | null, tier = 0): RoundRule {
  if (!reviewId) return {};
  const market = REVIEWS[reviewId].rule;
  if (!bossId) return market;
  const traits: RoundRule = {
    forceContextCard: market.forceContextCard,
    macroPanel: market.macroPanel,
  };
  const t = showdownTwist(BOSSES[bossId].twist, tier);
  switch (t.kind) {
    case 'riskCap':
      return { ...traits, riskCapMult: t.mult };
    case 'lossMult':
      return { ...traits, lossMult: t.mult };
    case 'shortWinTax':
      return { ...traits, shortWinTax: { days: t.days, mult: t.mult } };
    case 'leftCartOff':
      return { ...traits, leftCartOff: true };
    case 'hide':
      return { ...traits, hide: t.what };
    case 'lossStreak':
      return { ...traits, lossStreakStep: t.step };
    case 'interest':
      return { ...traits, interestRate: t.rate };
    case 'multCut':
      return { ...traits, multKeep: t.keep };
    case 'variety':
      return { ...traits, variety: t.count };
    case 'duel':
      return { ...traits, duel: true };
    case 'annual':
      return { ...traits, targetMult: market.targetMult, beatSpy: true };
    case 'pending':
      return traits;
  }
}
