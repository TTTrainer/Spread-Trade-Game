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
    /** New trades may start on any of a round's first N trading days. */
    tradeWindowDays: 10,
    /** A skip sits the round out for this many trading days before its Tag pays. */
    sitOutDays: 5,
    /**
     * A "flat" chart, judged only from history up to the entry date: weak trend strength (ADX)
     * and a nearly level 50-day average (% per day). Desks that sell a range always get one.
     */
    flatMaxAdx: 20,
    flatMaxSlope: 0.1,
    /**
     * A failed Review (boss) ends the run. Set false and a failed boss becomes a write-up instead
     * (more stress, and the run ends only at a second miss in the same quarter).
     */
    bossFailEndsRun: true,
    /** Rerolling a boss (once per boss) costs more for each boss of the run: 1st, 2nd, 3rd, later. */
    bossRerollCosts: [10, 25, 40, 60],
    /** Cash for a boss round played in the boss's style (on top of the round win). */
    styleCash: 3,
    /** Cash for beating a boss (on top of the round win), and for a trophy you already hold. */
    bossBounty: 8,
    /** Free cartridges offered after a boss (take one). */
    spoilsCount: 3,
  },

  /**
   * The Early Retiree's duel: Chad buys out-of-the-money bull call spreads (long leg at `delta`,
   * about `dte` days out) on his first `trades` cards, sized at this share of the risk cap but
   * never more than `maxQty` contracts.
   */
  duel: {
    trades: 2,
    delta: 0.25,
    dte: 21,
    riskShare: 0.3,
    maxQty: 1,
    /** Your round score is multiplied by this when you finish ahead of Chad, or behind him. */
    winMult: 1.5,
    loseMult: 0.75,
  },

  /**
   * Each boss's Review target, as a share of the normal Review target, tuned in the simulator so a
   * good player beats a typical boss about 9 times in 10 and the year-end Rebalancer about 7 in 10
   * (on top of the Annual Review's own x1.25). A harsher twist gets a lower bar. The simulator's
   * bots don't read the screen, so the bosses that only seal information (the Controller, the
   * Executor, the Shell Company) are set by hand a little under 1.
   */
  bossTargets: {
    controller: 0.85,
    margin_clerk: 0.76,
    underwriter: 0.81,
    landlord: 0.57,
    early_retiree: 0.85,
    tax_man: 0.95,
    bursar: 0.81,
    allocator: 0.95,
    shell_company: 0.71,
    executor: 0.85,
    collector: 0.9,
    rebalancer: 2.7,
  } as Record<string, number>,

  targets: {
    // Round 1 needs more than one typical trade (a median Verticals win scores about 220 on the
    // SIM market). Reviews ask a little less: their rules (beat SPY, stay calm) are the hard part.
    q1: [200, 220, 150] as [number, number, number],
    // Builds compound, so targets grow 34% a quarter (12% before 1.6, when a decent build scored
    // 5 to 14 times the target by the fourth quarter; 30% in 1.6.0, when a strong player still
    // finished Months at 3 to 5 times the target). Months ask more than Reviews: the boss is the
    // Review's hard part, and a Month is where a strong build snowballs.
    quarterGrowth: 1.34,
    /** A missed Month target is a write-up, not the end: that quarter's Review target grows this much. */
    writeUpReviewMult: 1.1,
    endlessGrowth: 1.8,
    annualReviewMult: 1.25,
  },

  risk: {
    maxLossLinePct: 0.15,
    riskCapPct: 0.1,
    plannedRiskPct: 0.05, // sizing beyond this is flagged "oversized"
  },

  /** Size: the share of the per-trade risk cap each conviction step uses (FEELER to ALL IN). */
  conviction: {
    capShares: [0.2, 0.4, 0.6, 0.8, 1] as [number, number, number, number, number],
  },

  /**
   * Covered calls carry an automatic stop: it buys the call back once the loss reaches this many
   * times the premium, and the risk cap measures the trade at that stop plus an allowance for a
   * gap skipping past it. (Sized on a stock jump instead, a call on a $700 stock never fit.)
   */
  coveredCall: {
    stopMult: 2,
    minStopMult: 0.5,
    gapAllowance: 0.25,
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
    lossChipsScale: 1,
    /** Bonus chips are full for a win that earned this share of its risk, and scale down below it. */
    bonusFullRoR: 0.08,
    /** The same for cash-secured puts (their risk is a stress drop in the stock). */
    incomeFullRoR: 0.01,
    /** A round that finished with a profit adds this share of its score... */
    greenRoundBonus: 0.2,
    /** ...and one that finished with a loss gives up this share. */
    redRoundPenalty: 0.2,
    /** This share of a passed round's surplus carries into the next round's meter... */
    carryShare: 0.35,
    /** ...up to this share of the next target (half until 1.6.1, a head start that snowballed). */
    carryCap: 0.25,
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
    writeUp: 15,
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
