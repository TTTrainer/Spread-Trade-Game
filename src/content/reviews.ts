/**
 * Reviews: the quarter-end bosses. Each deals only real windows that match a regime filter and
 * adds one rule. COMPLY-3000 reads the announcement.
 */

import type { ReviewDef, ReviewId } from './types';

export const REVIEWS: Record<ReviewId, ReviewDef> = {
  earnings_gauntlet: {
    id: 'earnings_gauntlet',
    name: 'Earnings Gauntlet',
    filterText: 'Every card has earnings inside the window.',
    ruleText: 'Outcomes as they happened. Call bonus x1.5.',
    filter: { hasEarnings: true },
    rule: { callBonusMult: 1.5 },
    announce:
      'NOTICE: EVERY POSITION THIS REVIEW CONTAINS A SCHEDULED DISCLOSURE EVENT. ACCURATE FORECASTS WILL BE WEIGHTED 1.5X. INACCURATE ONES WILL BE REMEMBERED.',
  },
  the_fed: {
    id: 'the_fed',
    name: 'The Fed',
    filterText: 'Every window includes an FOMC day.',
    ruleText: 'The SPY/VIX panel is forced on. One card is the index.',
    filter: { hasFomc: true },
    rule: { forceContextCard: true, macroPanel: true },
    announce:
      'NOTICE: MONETARY POLICY WILL BE SET DURING THIS REVIEW. YOU MAY NOT OPT OUT OF MONETARY POLICY.',
  },
  the_chop: {
    id: 'the_chop',
    name: 'The Chop',
    filterText: 'ADX(14) under 18 at entry: no trend.',
    ruleText: 'Debit directional wins score x0.5.',
    filter: { maxAdx: 18 },
    rule: { debitDirectionalWinMult: 0.5 },
    announce:
      'NOTICE: MARKETS IN THIS REVIEW ARE GOING NOWHERE, SLOWLY. DIRECTIONAL CONVICTION WILL BE DISCOUNTED 50%.',
  },
  trend_train: {
    id: 'trend_train',
    name: 'Trend Train',
    filterText: 'ADX(14) over 30 at entry: strong trends.',
    ruleText: 'Counter-trend losses count x1.5 on the meter.',
    filter: { minAdx: 30 },
    rule: { counterTrendLossMult: 1.5 },
    announce: 'NOTICE: THE TREND IS YOUR FRIEND. FIGHTING YOUR FRIEND WILL COST 1.5X.',
  },
  vol_spike: {
    id: 'vol_spike',
    name: 'Vol Spike',
    filterText: 'VIX above 25 at entry.',
    ruleText: 'The Max-Loss Line is 2% tighter.',
    filter: { minVix: 25 },
    rule: { maxLossLineDelta: -0.02 },
    announce:
      'NOTICE: FEAR INDEX ELEVATED. RISK TOLERANCE REDUCED 2 PERCENTAGE POINTS. PLEASE REMAIN CALM. CALM IS MANDATORY.',
  },
  dead_calm: {
    id: 'dead_calm',
    name: 'Dead Calm',
    filterText: 'IV rank under 15: premium is cheap.',
    ruleText: 'Structure base chips x0.5.',
    filter: { maxIvr: 15 },
    rule: { baseChipsMult: 0.5 },
    announce:
      'NOTICE: IMPLIED VOLATILITY IS AT A MULTI-QUARTER LOW. PREMIUM COLLECTION WILL BE COMPENSATED ACCORDINGLY.',
  },
  wide_markets: {
    id: 'wide_markets',
    name: 'Wide Markets',
    filterText: 'Bid/ask spreads in the widest 10% of all days.',
    ruleText: 'Market orders are disabled. Work your limits.',
    filter: { minSpreadDecile: 9 },
    rule: { marketOrdersDisabled: true },
    announce: 'NOTICE: MARKET ORDERS HAVE BEEN DISABLED FOR YOUR PROTECTION. YOU ARE BEING PROTECTED.',
  },
  assignment_week: {
    id: 'assignment_week',
    name: 'Assignment Week',
    filterText: 'An ex-dividend date inside the window.',
    ruleText: 'Early assignment is always on.',
    filter: { hasExDiv: true },
    rule: { earlyAssignmentAlways: true },
    announce: 'NOTICE: COUNTERPARTIES MAY EXERCISE THEIR RIGHTS AT ANY TIME. SO MAY COMPLIANCE.',
  },
  gap_risk: {
    id: 'gap_risk',
    name: 'Gap Risk',
    filterText: 'At least one gap over 2 ATR in the window.',
    ruleText: 'No decision points on gap days.',
    filter: { minGapAtr: 2 },
    rule: { noDecisionsOnGap: true },
    announce:
      'NOTICE: OVERNIGHT DISCONTINUITIES DETECTED IN THE FORECAST. DECISION SUPPORT WILL BE UNAVAILABLE ON THOSE DAYS.',
  },
  annual_review: {
    id: 'annual_review',
    name: 'Annual Review',
    filterText: 'Mixed regimes: a trend, a chop, a scare.',
    ruleText: 'Target x1.25. The full victory also needs positive alpha against SPY for the year.',
    filter: {},
    rule: { targetMult: 1.25, needsAlpha: true },
    announce:
      'NOTICE: ANNUAL PERFORMANCE REVIEW IN PROGRESS. THE BOARD WILL COMPARE YOUR RESULTS TO AN INDEX FUND. THE INDEX FUND HAS NO SALARY.',
  },
};

/** Reviews that can appear at the end of Q1-Q3. */
export const QUARTER_REVIEWS: ReviewId[] = [
  'earnings_gauntlet',
  'the_fed',
  'the_chop',
  'trend_train',
  'vol_spike',
  'dead_calm',
  'wide_markets',
  'assignment_week',
  'gap_risk',
];

/** The Annual Review deals one card from each of these regimes. */
export const ANNUAL_MIX = [{ minAdx: 30 }, { maxAdx: 18 }, { minVix: 25 }, { hasEarnings: true }, {}];
