/**
 * Every tunable number in one place. These are starting values; the balance simulator
 * (npm run sim) is how they get changed, not gut feel. Percentages are decimals.
 */
export const BALANCE = {
  startingEquityCents: 500_000,
  minEquityCents: 100_000,
  maxEquityCents: 10_000_000,

  run: {
    quarters: 4,
    roundsPerQuarter: 3,
    ticketsPerRound: 3,
    rerollsPerRound: 4,
    lineupSize: 4,
    lineupMax: 5,
    recentShare: 0.75,
  },

  targets: {
    q1: [30, 50, 80] as [number, number, number],
    quarterGrowth: 1.3,
    endlessGrowth: 1.8,
    annualReviewMult: 1.25,
  },

  risk: {
    maxLossLinePct: 0.15,
    riskCapPct: 0.1,
    plannedRiskPct: 0.05, // sizing beyond this is flagged "oversized"
  },

  brackets: {
    creditTargetPct: 0.5,
    creditStopMult: 2,
    debitTargetPct: 0.5,
    debitStopPct: 0.5,
    defaultShortDelta: 0.3,
  },

  scoring: {
    chipsPerUnit: 10_000, // chips = P/L / round-start equity * this (1% = 100 chips)
    /** A loser's chips on the meter, as a share of its P/L chips (the ledger is never touched). */
    lossChipsScale: 0.4,
    levelChips: 10,
    levelMult: 0.5,
    rrMult: 1,
    edgeTop10: 1.5,
    edgeTop25: 1.25,
    callExactOffset: 0.4,
    callExactScale: 0.2,
    callAdjacent: 0.25,
    disciplineMult: 1,
    /** A loser with no stop, or whose stop was declined, counts this much on the meter. */
    undisciplinedLossMult: 1.25,
    verticalsPassiveMult: 1,
  },

  calls: {
    flatEm: 0.25,
    bigEm: 1,
    fixedFlatPct: 0.01,
    fixedBigPct: 0.05,
  },

  calibration: {
    // Mean multi-class Brier score thresholds for grades A..D (above D is F).
    grades: [0.6, 0.72, 0.82, 0.95] as [number, number, number, number],
    bonusCash: { A: 8, B: 5, C: 3, D: 1, F: 0 } as Record<'A' | 'B' | 'C' | 'D' | 'F', number>,
    xp: { A: 60, B: 40, C: 25, D: 10, F: 5 } as Record<'A' | 'B' | 'C' | 'D' | 'F', number>,
  },

  cash: {
    roundWin: [3, 4, 5] as [number, number, number],
    perUnusedTicket: 1,
    interestPer: 5,
    interestCap: 5,
    sellBackFraction: 0.5,
    startingCash: 4,
  },

  stress: {
    declineStop: 15,
    drawdownOver5: 10,
    perLoser: 5,
    wrongHighConfidence: 10,
    enterReview: 10,
    skipRound: -10,
    closeAtPlan: -5,
    assignment: 5, // not in the plan's table; the Assignment Artist cartridge implies assignments cost stress
    vacationDay: -30,
    burnoutAt: 100,
    burnoutResetTo: 50,
  },

  shop: {
    cartridgeSlots: 5,
    cartridgeOffers: 2,
    analystSeats: 2,
    analystOffers: 1,
    memoSlots: 2,
    boosterOffers: 2,
    rerollBase: 5,
    rerollStep: 1,
    rarityWeights: { C: 0.6, U: 0.28, R: 0.1, L: 0.02 },
    prices: { C: 4, U: 6, R: 8, L: 10 },
    analystPrice: [5, 8] as [number, number],
    memoPrice: 3,
    pagePrice: 3,
    voucherPrice: 10,
    deskAffinity: 0.6,
  },

  ledger: {
    shortTermTaxRate: 0.24, // realism toggle "taxes": set aside on each round's net gain
    drawdownStressPct: 0.05,
  },

  fills: {
    pAtMid: 0.35,
    tier7Penalty: 0.1,
  },
} as const;

export type Balance = typeof BALANCE;
