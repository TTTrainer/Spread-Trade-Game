import type { StructureId } from '../engine/strategies/types';

/**
 * "Good R:R" thresholds per structure (+1 mult when met). Credit verticals: credit at least a
 * third of the width; debit verticals: debit at most half the width; and so on.
 */
export interface RRRule {
  kind: 'creditOfWidth' | 'debitOfWidth' | 'ivrAtMost' | 'annualYield' | 'profitOverDebit';
  threshold: number;
  text: string;
}

export const RR_RULES: Record<StructureId, RRRule> = {
  bull_put: { kind: 'creditOfWidth', threshold: 1 / 3, text: 'Credit at least 1/3 of the width' },
  bear_call: { kind: 'creditOfWidth', threshold: 1 / 3, text: 'Credit at least 1/3 of the width' },
  bull_call: { kind: 'debitOfWidth', threshold: 1 / 2, text: 'Debit at most 1/2 of the width' },
  bear_put: { kind: 'debitOfWidth', threshold: 1 / 2, text: 'Debit at most 1/2 of the width' },
  iron_condor: { kind: 'creditOfWidth', threshold: 1 / 3, text: 'Credit at least 1/3 of the widest wing' },
  bwb_condor: { kind: 'creditOfWidth', threshold: 1 / 3, text: 'Credit at least 1/3 of the widest wing' },
  iron_fly: { kind: 'creditOfWidth', threshold: 0.55, text: 'Credit at least 55% of the wing width' },
  long_straddle: { kind: 'ivrAtMost', threshold: 30, text: 'Bought with IV rank at or below 30' },
  long_strangle: { kind: 'ivrAtMost', threshold: 30, text: 'Bought with IV rank at or below 30' },
  covered_call: { kind: 'annualYield', threshold: 0.15, text: 'Premium worth 15%+ a year' },
  cash_secured_put: { kind: 'annualYield', threshold: 0.15, text: 'Premium worth 15%+ a year' },
  calendar: { kind: 'profitOverDebit', threshold: 1.5, text: 'Max profit at least 1.5x the debit' },
  diagonal: { kind: 'profitOverDebit', threshold: 1.5, text: 'Max profit at least 1.5x the debit' },
  double_calendar: { kind: 'profitOverDebit', threshold: 1.5, text: 'Max profit at least 1.5x the debit' },
};
