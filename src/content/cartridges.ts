/**
 * The 50 cartridges. Each one is data plus hooks from src/content/types.ts. Hooks only ever
 * return score steps, stress or cash for the game layer; none of them can reach market data.
 * Effects apply in the player's slot order, left to right.
 */

import type { ScoreStep } from '../engine/scoring/mult';
import type { CartridgeDef } from './types';

type Tag = 'REAL' | 'ARCADE';

const chips = (label: string, value: number, tag: Tag = 'ARCADE'): ScoreStep => ({
  label,
  kind: 'cartridge',
  op: 'chips',
  value,
  tag,
});
const add = (label: string, value: number, tag: Tag = 'ARCADE'): ScoreStep => ({
  label,
  kind: 'cartridge',
  op: 'add',
  value,
  tag,
});
const mul = (label: string, value: number, tag: Tag = 'ARCADE'): ScoreStep => ({
  label,
  kind: 'cartridge',
  op: 'mul',
  value,
  tag,
});
const meter = (label: string, value: number, tag: Tag = 'ARCADE'): ScoreStep => ({
  label,
  kind: 'cartridge',
  op: 'meter',
  value,
  tag,
});
const when = (cond: boolean, ...steps: ScoreStep[]): ScoreStep[] => (cond ? steps : []);

export const CARTRIDGES: CartridgeDef[] = [
  // ---------------- THETA ----------------
  {
    id: 'theta_engine',
    name: 'Theta Engine',
    families: ['THETA'],
    desks: ['verticals', 'condor', 'income'],
    rarity: 'C',
    tag: 'ARCADE',
    // +3 a day: at +8 the balance simulator found it doubled the win rate once targets rose in 1.4.2.
    text: '+3 chips for every trading day a short-premium position is open and in profit.',
    synergies: ['fifty_percent_club', 'premium_printer', 'weekend_warrior'],
    onDayClose: ({ positions, addChips }) => {
      for (const p of positions) if (p.shortPremium && p.inProfit) addChips(p.id, 3);
    },
    score: ({ facts }) => when(facts.win && facts.thetaChips > 0, chips('Theta Engine', facts.thetaChips)),
  },
  {
    id: 'fifty_percent_club',
    name: 'Fifty-Percent Club',
    families: ['THETA', 'DISC'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Close a short-premium trade at 50%+ of max profit before expiration: +3 mult.',
    synergies: ['theta_engine', 'premium_printer', 'twenty_one_day_rule'],
    score: ({ facts }) =>
      when(
        facts.win &&
          facts.shortPremium &&
          (facts.pctOfMaxProfit ?? 0) >= 0.5 &&
          facts.exitReason !== 'expired',
        add('Fifty-Percent Club', 3),
      ),
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    families: ['THETA'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Short premium held over a weekend: +15 chips.',
    synergies: ['theta_engine', 'credit_where_due'],
    score: ({ facts }) =>
      when(facts.win && facts.shortPremium && facts.heldOverWeekend, chips('Weekend Warrior', 15)),
  },
  {
    id: 'twenty_one_day_rule',
    name: '21-Day Rule',
    families: ['THETA', 'DISC'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Close or roll a winner at 21 DTE or less: +2 mult. Winners held into the last 7 DTE: -1 mult.',
    synergies: ['fifty_percent_club', 'roll_artist'],
    score: ({ facts }) => {
      if (!facts.win) return [];
      const out: ScoreStep[] = [];
      if (facts.exitReason !== 'expired' && facts.shortDte !== null && facts.shortDte <= 21)
        out.push(add('21-Day Rule', 2));
      if (facts.shortDte !== null && facts.shortDte <= 7) out.push(add('21-Day Rule (held past 7 DTE)', -1));
      return out;
    },
  },
  {
    id: 'credit_where_due',
    name: 'Credit Where Due',
    families: ['THETA'],
    desks: ['verticals'],
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Credit of at least 1/3 of the width: +2 mult.',
    synergies: ['edge_hunter', 'ladder_up', 'weekend_warrior'],
    score: ({ facts }) =>
      when(
        facts.win && facts.creditOfWidth !== null && facts.creditOfWidth >= 1 / 3 - 1e-9,
        add('Credit Where Due', 2),
      ),
  },
  {
    id: 'ladder_up',
    name: 'Ladder Up',
    families: ['THETA'],
    desks: ['verticals'],
    rarity: 'R',
    tag: 'ARCADE',
    text: '+1 mult per consecutive winning credit spread this run. A loss resets it.',
    synergies: ['credit_where_due', 'stop_discipline', 'fifty_percent_club'],
    score: ({ facts, state }) =>
      when(
        facts.win && facts.credit && facts.family === 'vertical',
        add(`Ladder Up (${(state.streak ?? 0) + 1} in a row)`, (state.streak ?? 0) + 1),
      ),
    onClose: ({ facts, state }) => {
      if (!(facts.credit && facts.family === 'vertical')) return;
      state.streak = facts.win ? (state.streak ?? 0) + 1 : 0;
    },
  },
  {
    id: 'premium_printer',
    name: 'Premium Printer',
    families: ['THETA'],
    desks: 'any',
    rarity: 'L',
    tag: 'ARCADE',
    text: 'Duo of Theta Engine + Fifty-Percent Club. Theta Engine chips x3 on trades closed at 50%+ of max profit.',
    synergies: ['theta_engine', 'fifty_percent_club'],
    duoOf: ['theta_engine', 'fifty_percent_club'],
    score: ({ facts }) =>
      when(
        facts.win && facts.thetaChips > 0 && (facts.pctOfMaxProfit ?? 0) >= 0.5,
        chips('Premium Printer (theta chips x3)', facts.thetaChips * 2),
      ),
  },

  // ---------------- VEGA ----------------
  {
    id: 'iv_crusher',
    name: 'IV Crusher',
    families: ['VEGA'],
    desks: ['verticals', 'condor'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Short-vega trade opened at IV rank 50+ whose IV drops 20%+ while open: x1.5.',
    synergies: ['crush_it', 'vol_arb'],
    score: ({ facts }) =>
      when(
        facts.win &&
          facts.shortPremium &&
          (facts.ivrAtEntry ?? 0) >= 50 &&
          facts.ivChangePct !== null &&
          facts.ivChangePct <= -0.2,
        mul('IV Crusher', 1.5),
      ),
  },
  {
    id: 'vol_arb',
    name: 'Vol Arb',
    families: ['VEGA'],
    desks: 'any',
    rarity: 'R',
    tag: 'REAL+ARCADE',
    text: 'Shows implied minus 20-day realized volatility. Trades opened when IV beats HV by 5+ points: +2 mult.',
    synergies: ['iv_crusher', 'long_gamma'],
    score: ({ facts }) =>
      when(facts.win && facts.ivMinusHvAtEntry !== null && facts.ivMinusHvAtEntry >= 5, add('Vol Arb', 2)),
  },
  {
    id: 'long_gamma',
    name: 'Long Gamma',
    families: ['VEGA'],
    desks: ['volatility'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'A straddle or strangle whose move beats the expected move: x1.5.',
    synergies: ['earnings_sniper', 'straddle_stack', 'gamma_scalper'],
    // x1.5 since 1.6: with chips scaled by return on risk, a winning straddle already scores big.
    score: ({ facts }) => when(facts.win && facts.straddleBeatEm, mul('Long Gamma', 1.5)),
  },
  {
    id: 'term_structure_tap',
    name: 'Term Structure Tap',
    families: ['VEGA'],
    desks: ['calendar'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'A calendar opened with front-month IV above back-month IV: +3 mult.',
    synergies: ['double_time', 'diagonal_drift'],
    score: ({ facts }) =>
      when(
        facts.win && facts.family === 'calendar' && facts.frontIvAboveBack === true,
        add('Term Structure Tap', 3),
      ),
  },
  {
    id: 'crush_it',
    name: 'Crush It',
    families: ['EVENT', 'VEGA'],
    desks: ['condor', 'verticals'],
    rarity: 'R',
    tag: 'ARCADE',
    text: 'Short premium held through earnings, and the stock stays inside the expected move: x3.',
    synergies: ['iv_crusher', 'earnings_whisper', 'wing_clipper'],
    score: ({ facts }) =>
      when(
        facts.win && facts.shortPremium && facts.heldThroughEarnings && facts.stayedInsideEm === true,
        mul('Crush It', 3),
      ),
  },

  // ---------------- EVENT ----------------
  {
    id: 'earnings_sniper',
    name: 'Earnings Sniper',
    families: ['EVENT'],
    desks: ['volatility'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'A long straddle held through earnings: +100 chips x (actual move / implied move).',
    synergies: ['long_gamma', 'earnings_whisper'],
    score: ({ facts }) =>
      when(
        facts.win && facts.isStraddle && facts.heldThroughEarnings && facts.earningsMoveRatio !== null,
        chips('Earnings Sniper', Math.round(100 * (facts.earningsMoveRatio ?? 0))),
      ),
  },
  {
    id: 'earnings_whisper',
    name: 'Earnings Whisper',
    families: ['EVENT'],
    desks: 'any',
    rarity: 'C',
    tag: 'REAL',
    text: 'Lineup cards show the earnings date and the implied move.',
    synergies: ['crush_it', 'earnings_sniper', 'fed_watcher'],
  },
  {
    id: 'fed_watcher',
    name: 'Fed Watcher',
    families: ['EVENT'],
    desks: 'any',
    rarity: 'U',
    tag: 'REAL+ARCADE',
    text: 'Flags FOMC and CPI days. Profitable closes the day after one: +2 mult.',
    synergies: ['earnings_whisper', 'delta_neutral'],
    score: ({ facts }) => when(facts.win && facts.closedDayAfterMacro, add('Fed Watcher', 2)),
  },
  {
    id: 'dividend_radar',
    name: 'Dividend Radar',
    families: ['EVENT'],
    desks: ['income'],
    rarity: 'C',
    tag: 'REAL',
    text: 'Warns about early assignment before ex-dividend dates. Covered calls that collect a dividend: +40 chips.',
    synergies: ['covered_and_chill', 'the_wheel'],
    score: ({ facts }) => when(facts.win && facts.coveredCallDividend, chips('Dividend Radar', 40, 'REAL')),
  },

  // ---------------- DELTA ----------------
  {
    id: 'trend_rider',
    name: 'Trend Rider',
    families: ['DELTA'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Trades aligned with the 50-day SMA slope: +1 mult.',
    synergies: ['macd_cross', 'diagonal_drift'],
    score: ({ facts }) => when(facts.win && facts.trendAligned === true, add('Trend Rider', 1)),
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    families: ['DELTA'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Correct calls against the 5-day trend: call bonus x2.',
    synergies: ['rsi_radar', 'bollinger_bouncer'],
    score: ({ facts }) =>
      when(
        facts.win && facts.against5dTrend && facts.callBonus > 0,
        add('Contrarian (call bonus x2)', facts.callBonus),
      ),
  },
  {
    id: 'bollinger_bouncer',
    name: 'Bollinger Bouncer',
    families: ['DELTA'],
    desks: ['verticals'],
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Short strike outside the Bollinger Band at entry: +30 chips.',
    synergies: ['rsi_radar', 'contrarian'],
    score: ({ facts }) => when(facts.win && facts.shortOutsideBollinger, chips('Bollinger Bouncer', 30)),
  },
  {
    id: 'rsi_radar',
    name: 'RSI Radar',
    families: ['DELTA'],
    desks: ['verticals'],
    rarity: 'C',
    tag: 'ARCADE',
    text: 'A winning bear call opened at RSI above 70, or a bull put below 30: +2 mult.',
    synergies: ['bollinger_bouncer', 'contrarian'],
    score: ({ facts }) =>
      when(
        facts.win &&
          facts.rsiAtEntry !== null &&
          ((facts.structureId === 'bear_call' && facts.rsiAtEntry > 70) ||
            (facts.structureId === 'bull_put' && facts.rsiAtEntry < 30)),
        add('RSI Radar', 2),
      ),
  },
  {
    id: 'macd_cross',
    name: 'MACD Cross',
    families: ['DELTA'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Entry within 2 days of a MACD cross in your direction: +1 mult.',
    synergies: ['trend_rider', 'diagonal_drift'],
    score: ({ facts }) => when(facts.win && facts.macdCrossWithin2, add('MACD Cross', 1)),
  },
  {
    id: 'gamma_scalper',
    name: 'Gamma Scalper',
    families: ['DELTA', 'VEGA'],
    desks: ['volatility'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Correct "big" bucket calls: call bonus x2.',
    synergies: ['long_gamma', 'straddle_stack'],
    score: ({ facts }) =>
      when(
        facts.win && facts.callBigBucket && facts.callBonus > 0,
        add('Gamma Scalper (call bonus x2)', facts.callBonus),
      ),
  },
  {
    id: 'diagonal_drift',
    name: 'Diagonal Drift',
    families: ['DELTA'],
    desks: ['calendar'],
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Diagonals pointed with the trend: +1 mult.',
    synergies: ['trend_rider', 'term_structure_tap'],
    score: ({ facts }) => when(facts.win && facts.diagonalWithTrend, add('Diagonal Drift', 1)),
  },

  // ---------------- DISCIPLINE ----------------
  {
    id: 'stop_discipline',
    name: 'Stop Discipline',
    families: ['DISC'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Closing a loser at or before its stop refunds 30% of its lost chips. Declining a stop at a decision point: +10 stress.',
    synergies: ['iron_stomach', 'ladder_up', 'right_sized'],
    score: ({ facts }) =>
      when(!facts.win && facts.lossWithinStop, meter('Stop Discipline (30% refund)', 0.7)),
    onDecisionPoint: ({ kind, action }) =>
      kind === 'stop_hit' && action === 'hold' ? { stress: 10 } : undefined,
  },
  {
    id: 'iron_stomach',
    name: 'Iron Stomach',
    families: ['DISC'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Stress gains are halved.',
    synergies: ['stop_discipline', 'meme_energy'],
    passive: { stressGainMult: 0.5 },
  },
  {
    id: 'patience_pays',
    name: 'Patience Pays',
    families: ['DISC'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Each skipped round or unused ticket: +1 mult on your next winner (up to +3).',
    synergies: ['right_sized', 'bonus_pool'],
    score: ({ facts, run }) =>
      when(
        facts.win && run.patienceStacks > 0,
        add(`Patience Pays (${Math.min(3, run.patienceStacks)})`, Math.min(3, run.patienceStacks)),
      ),
  },
  {
    id: 'roll_artist',
    name: 'Roll Artist',
    families: ['DISC', 'THETA'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Each roll for a net credit: +1 mult for the rest of the round.',
    synergies: ['legging_pro', 'twenty_one_day_rule'],
    score: ({ facts, run }) =>
      when(
        facts.win && run.rollArtistStacks > 0,
        add(`Roll Artist (${run.rollArtistStacks})`, run.rollArtistStacks),
      ),
  },
  {
    id: 'right_sized',
    name: 'Right-Sized',
    families: ['DISC'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Trades risking 3% of equity or less: +25 chips.',
    synergies: ['stop_discipline', 'patience_pays'],
    score: ({ facts }) => when(facts.win && facts.riskPct <= 0.03 + 1e-9, chips('Right-Sized', 25)),
  },
  {
    id: 'breakout_insurance',
    name: 'Breakout Insurance',
    families: ['DISC', 'DELTA'],
    desks: ['verticals'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'The first gap through a short strike each round counts half on the meter.',
    synergies: ['stop_discipline', 'trend_rider'],
    score: ({ facts, run }) =>
      when(!facts.win && facts.gappedThroughShort && !run.gapInsuranceUsed, meter('Breakout Insurance', 0.5)),
  },

  // ---------------- EXECUTION ----------------
  {
    id: 'level_ii_feed',
    name: 'Level II Feed',
    families: ['EXEC'],
    desks: 'any',
    rarity: 'C',
    tag: 'REAL',
    text: 'Limit orders fill 15% closer to mid.',
    synergies: ['smart_router', 'edge_hunter'],
    passive: { execution: { limitBoost: 0.15 } },
  },
  {
    id: 'smart_router',
    name: 'Smart Router',
    families: ['EXEC'],
    desks: 'any',
    rarity: 'U',
    tag: 'REAL',
    text: 'Market orders pay 75% of the spread instead of all of it.',
    synergies: ['level_ii_feed', 'legging_pro'],
    passive: { execution: { marketImprove: 0.25 } },
  },
  {
    id: 'legging_pro',
    name: 'Legging Pro',
    families: ['EXEC'],
    desks: 'any',
    rarity: 'U',
    tag: 'REAL',
    text: 'Rolls and adjustments pay no extra slippage.',
    synergies: ['roll_artist', 'smart_router'],
    passive: { execution: { rollSlippage: 0 } },
  },
  {
    id: 'portfolio_margin',
    name: 'Portfolio Margin',
    families: ['EXEC'],
    desks: 'any',
    rarity: 'R',
    tag: 'REAL',
    text: 'Risk cap +25%.',
    synergies: ['two_x_leverage', 'right_sized'],
    passive: { riskCapMult: 1.25 },
  },
  {
    id: 'edge_hunter',
    name: 'Edge Hunter',
    families: ['EXEC'],
    desks: ['verticals'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Edge Rank top 10% pays x2 instead of x1.5.',
    synergies: ['credit_where_due', 'level_ii_feed'],
  },

  // ---------------- ECONOMY ----------------
  {
    id: 'compound_interest',
    name: 'Compound Interest',
    families: ['ECON'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Interest cap +$5.',
    synergies: ['bonus_pool', 'expense_account'],
    passive: { interestCapAdd: 5 },
  },
  {
    id: 'bonus_pool',
    name: 'Bonus Pool',
    families: ['ECON'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: '+$1 for every 100 points over the round target.',
    synergies: ['compound_interest', 'patience_pays'],
    onRoundEnd: ({ meter: m, target, passed }) =>
      passed && m > target ? { cash: Math.floor((m - target) / 100), note: 'Bonus Pool' } : undefined,
  },
  {
    id: 'expense_account',
    name: 'Expense Account',
    families: ['ECON'],
    desks: 'any',
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Rerolls in the shop cost $1 less.',
    synergies: ['compound_interest', 'bonus_pool'],
    passive: { rerollCostDelta: -1 },
  },
  {
    id: 'golden_parachute',
    name: 'Golden Parachute',
    families: ['ECON'],
    desks: 'any',
    rarity: 'L',
    tag: 'ARCADE',
    text: 'Once per run, survive a failed round or a Max-Loss breach. Then it is destroyed.',
    synergies: ['two_x_leverage', 'bag_holder'],
    savesRun: true,
  },

  // ---------------- CHAOS ----------------
  {
    id: 'two_x_leverage',
    name: '2x Leverage',
    families: ['CHAOS'],
    desks: 'any',
    rarity: 'R',
    tag: 'ARCADE',
    text: 'All meter chips x2, gains and losses. The Max-Loss Line tightens by 2%.',
    synergies: ['golden_parachute', 'portfolio_margin'],
    score: () => [meter('2x Leverage', 2)],
    passive: { maxLossLineDelta: -0.02 },
  },
  {
    id: 'bag_holder',
    name: 'Bag Holder',
    families: ['CHAOS'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: '+3 mult on winners, but losers cannot be closed before expiration.',
    synergies: ['golden_parachute', 'iron_stomach'],
    score: ({ facts }) => when(facts.win, add('Bag Holder', 3)),
    passive: { losersLocked: true },
  },
  {
    id: 'meme_energy',
    name: 'Meme Energy',
    families: ['CHAOS'],
    desks: 'any',
    rarity: 'R',
    tag: 'ARCADE',
    text: 'Names with IV above 60%: winners x2. +10 stress per trade.',
    synergies: ['iron_stomach', 'long_gamma'],
    onEntry: () => ({ stress: 10 }),
    score: ({ facts }) => when(facts.win && facts.highIv, mul('Meme Energy', 2)),
  },
  {
    id: 'rivals_bet',
    name: "Rival's Bet",
    families: ['CHAOS'],
    desks: 'any',
    rarity: 'U',
    tag: 'ARCADE',
    text: "Outscore Bradley's ghost this round: +$10. Lose: -$5.",
    synergies: ['bonus_pool', 'two_x_leverage'],
    onRoundEnd: ({ meter: m, run }) =>
      m > run.ghostScore
        ? { cash: 10, note: "Rival's Bet: beat Bradley" }
        : { cash: -5, note: "Rival's Bet: Bradley won" },
  },

  // ---------------- INCOME ----------------
  {
    id: 'the_wheel',
    name: 'The Wheel',
    // EVENT, not THETA (1.6): on the Income desk every trade collects premium, so a cheap THETA
    // card lit the THETA family on its own (the same reason Covered & Chill moved in 1.5).
    families: ['EVENT'],
    desks: ['income'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'After a cash-secured put is assigned, your next covered call scores x2.',
    synergies: ['covered_and_chill', 'assignment_artist', 'dividend_radar'],
    score: ({ facts, state }) =>
      when(facts.win && facts.structureId === 'covered_call' && (state.primed ?? 0) > 0, mul('The Wheel', 2)),
    onClose: ({ facts, state }) => {
      if (facts.cspAssigned) state.primed = 1;
      else if (facts.structureId === 'covered_call') state.primed = 0;
    },
  },
  {
    id: 'covered_and_chill',
    name: 'Covered & Chill',
    // EVENT, not THETA: on the Income desk every trade is short premium, so as a cheap THETA card
    // it was mostly a ticket to the THETA family bonus (+15.7 points of win rate in the simulator).
    families: ['EVENT'],
    desks: ['income'],
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Covered calls that expire out of the money: +2 mult.',
    synergies: ['the_wheel', 'dividend_radar'],
    score: ({ facts }) => when(facts.win && facts.coveredCallExpiredOtm, add('Covered & Chill', 2)),
  },
  {
    id: 'assignment_artist',
    name: 'Assignment Artist',
    families: ['EVENT'],
    desks: ['income'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Assignments give +50 chips instead of stress.',
    synergies: ['the_wheel', 'dividend_radar'],
    score: ({ facts }) => when(facts.win && facts.assigned, chips('Assignment Artist', 50)),
  },

  // ---------------- CONDOR ----------------
  {
    id: 'delta_neutral',
    name: 'Delta Neutral',
    families: ['DELTA', 'VEGA'],
    desks: ['condor'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Keep portfolio delta under 5 at every close: +1 mult for the round.',
    synergies: ['wing_clipper', 'fed_watcher'],
    score: ({ facts, run }) => when(facts.win && run.deltaNeutralOk, add('Delta Neutral', 1)),
  },
  {
    id: 'wing_clipper',
    name: 'Wing Clipper',
    families: ['THETA'],
    desks: ['condor'],
    rarity: 'C',
    tag: 'ARCADE',
    text: 'Condors with both short strikes outside the expected move: +40 chips.',
    synergies: ['delta_neutral', 'crush_it', 'pin_master'],
    score: ({ facts }) => when(facts.win && facts.condorOutsideEm, chips('Wing Clipper', 40)),
  },
  {
    id: 'pin_master',
    name: 'Pin Master',
    families: ['THETA'],
    desks: ['condor'],
    rarity: 'L',
    tag: 'ARCADE',
    text: 'An iron fly expiring within 1% of its center strike: x4.',
    synergies: ['wing_clipper', 'theta_engine'],
    score: ({ facts }) => when(facts.win && facts.pinnedFly, mul('Pin Master', 4)),
  },

  // ---------------- VOLATILITY / CALENDAR ----------------
  {
    id: 'straddle_stack',
    name: 'Straddle Stack',
    families: ['VEGA'],
    desks: ['volatility'],
    rarity: 'R',
    tag: 'ARCADE',
    text: 'Each straddle opened this round adds +1 mult to the next one (up to +2).',
    synergies: ['long_gamma', 'gamma_scalper'],
    score: ({ facts }) =>
      when(
        facts.win && facts.isStraddle && facts.straddlesBefore > 0,
        add(`Straddle Stack (${facts.straddlesBefore})`, Math.min(2, facts.straddlesBefore)),
      ),
  },
  {
    id: 'double_time',
    name: 'Double Time',
    families: ['THETA', 'VEGA'],
    desks: ['calendar'],
    rarity: 'U',
    tag: 'ARCADE',
    text: 'Double calendars: +2 mult.',
    synergies: ['term_structure_tap', 'theta_engine'],
    score: ({ facts }) => when(facts.win && facts.isDoubleCalendar, add('Double Time', 2)),
  },
];

export const CARTRIDGE_BY_ID: Record<string, CartridgeDef> = Object.fromEntries(
  CARTRIDGES.map((c) => [c.id, c]),
);

export function cartridge(id: string): CartridgeDef {
  const c = CARTRIDGE_BY_ID[id];
  if (!c) throw new Error(`Unknown cartridge ${id}`);
  return c;
}
