import { describe, expect, it } from 'vitest';
import { CARTRIDGES, CARTRIDGE_BY_ID } from '../../src/content/cartridges';
import type { CartState, RunView, TradeFacts } from '../../src/content/types';
import type { ScoreStep } from '../../src/engine/scoring/mult';
import { runScore } from '../../src/engine/scoring/mult';
import { scoreSteps } from '../../src/engine/run/score';
import { facts, pipe } from './fixtures';

const run = (over: Partial<RunView> = {}): RunView => ({ ...pipe().run, ...over });

/** Steps one cartridge adds for a trade. */
function stepsOf(
  id: string,
  f: Partial<TradeFacts>,
  r: Partial<RunView> = {},
  state: CartState = {},
): ScoreStep[] {
  return CARTRIDGE_BY_ID[id].score?.({ facts: facts(f), run: run(r), state }) ?? [];
}
const one = (id: string, f: Partial<TradeFacts>, r?: Partial<RunView>, st?: CartState) => {
  const s = stepsOf(id, f, r, st);
  return s.length ? { op: s[0].op, value: s[0].value } : null;
};
const lose = { win: false, realizedCents: -10_000 };

/** One expectation per cartridge: it triggers when it should and stays quiet otherwise. */
const CASES: Record<string, () => void> = {
  theta_engine: () => {
    const added: Record<string, number> = {};
    CARTRIDGE_BY_ID.theta_engine.onDayClose?.({
      run: run(),
      state: {},
      positions: [
        { id: 'a', shortPremium: true, inProfit: true },
        { id: 'b', shortPremium: true, inProfit: false },
        { id: 'c', shortPremium: false, inProfit: true },
      ],
      addChips: (id, c) => (added[id] = (added[id] ?? 0) + c),
    });
    expect(added).toEqual({ a: 3 });
    expect(one('theta_engine', { thetaChips: 40 })).toEqual({ op: 'chips', value: 40 });
    expect(one('theta_engine', { thetaChips: 40, ...lose })).toBeNull();
  },
  fifty_percent_club: () => {
    expect(one('fifty_percent_club', { pctOfMaxProfit: 0.6 })).toEqual({ op: 'add', value: 3 });
    expect(one('fifty_percent_club', { pctOfMaxProfit: 0.6, exitReason: 'expired' })).toBeNull();
    expect(one('fifty_percent_club', { pctOfMaxProfit: 0.4 })).toBeNull();
  },
  weekend_warrior: () => {
    expect(one('weekend_warrior', { heldOverWeekend: true })).toEqual({ op: 'chips', value: 15 });
    expect(one('weekend_warrior', { heldOverWeekend: false })).toBeNull();
  },
  twenty_one_day_rule: () => {
    expect(stepsOf('twenty_one_day_rule', { shortDte: 15 }).map((s) => s.value)).toEqual([2]);
    expect(
      stepsOf('twenty_one_day_rule', { shortDte: 0, exitReason: 'expired' }).map((s) => s.value),
    ).toEqual([-1]);
    expect(stepsOf('twenty_one_day_rule', { shortDte: 30 })).toEqual([]);
  },
  credit_where_due: () => {
    expect(one('credit_where_due', { creditOfWidth: 0.34 })).toEqual({ op: 'add', value: 2 });
    expect(one('credit_where_due', { creditOfWidth: 0.3 })).toBeNull();
  },
  ladder_up: () => {
    expect(one('ladder_up', {}, {}, { streak: 2 })).toEqual({ op: 'add', value: 3 });
    const st: CartState = { streak: 4 };
    CARTRIDGE_BY_ID.ladder_up.onClose?.({ facts: facts(lose), run: run(), state: st });
    expect(st.streak).toBe(0);
    CARTRIDGE_BY_ID.ladder_up.onClose?.({ facts: facts(), run: run(), state: st });
    expect(st.streak).toBe(1);
  },
  premium_printer: () => {
    expect(one('premium_printer', { thetaChips: 40, pctOfMaxProfit: 0.6 })).toEqual({
      op: 'chips',
      value: 80,
    });
    expect(one('premium_printer', { thetaChips: 40, pctOfMaxProfit: 0.3 })).toBeNull();
    expect(CARTRIDGE_BY_ID.premium_printer.duoOf).toEqual(['theta_engine', 'fifty_percent_club']);
  },
  iv_crusher: () => {
    expect(one('iv_crusher', { ivrAtEntry: 60, ivChangePct: -0.25 })).toEqual({ op: 'mul', value: 1.5 });
    expect(one('iv_crusher', { ivrAtEntry: 40, ivChangePct: -0.25 })).toBeNull();
    expect(one('iv_crusher', { ivrAtEntry: 60, ivChangePct: -0.1 })).toBeNull();
  },
  vol_arb: () => {
    expect(one('vol_arb', { ivMinusHvAtEntry: 6 })).toEqual({ op: 'add', value: 2 });
    expect(one('vol_arb', { ivMinusHvAtEntry: 3 })).toBeNull();
  },
  long_gamma: () => {
    expect(one('long_gamma', { straddleBeatEm: true })).toEqual({ op: 'mul', value: 1.5 });
    expect(one('long_gamma', {})).toBeNull();
  },
  term_structure_tap: () => {
    expect(one('term_structure_tap', { family: 'calendar', frontIvAboveBack: true })).toEqual({
      op: 'add',
      value: 3,
    });
    expect(one('term_structure_tap', { family: 'calendar', frontIvAboveBack: false })).toBeNull();
  },
  crush_it: () => {
    expect(one('crush_it', { heldThroughEarnings: true, stayedInsideEm: true })).toEqual({
      op: 'mul',
      value: 3,
    });
    expect(one('crush_it', { heldThroughEarnings: true, stayedInsideEm: false })).toBeNull();
  },
  earnings_sniper: () => {
    expect(
      one('earnings_sniper', { isStraddle: true, heldThroughEarnings: true, earningsMoveRatio: 1.5 }),
    ).toEqual({ op: 'chips', value: 150 });
    expect(
      one('earnings_sniper', { isStraddle: false, heldThroughEarnings: true, earningsMoveRatio: 1.5 }),
    ).toBeNull();
  },
  earnings_whisper: () => {
    expect(CARTRIDGE_BY_ID.earnings_whisper.tag).toBe('REAL');
    expect(stepsOf('earnings_whisper', {})).toEqual([]);
  },
  fed_watcher: () => {
    expect(one('fed_watcher', { closedDayAfterMacro: true })).toEqual({ op: 'add', value: 2 });
    expect(one('fed_watcher', {})).toBeNull();
  },
  dividend_radar: () => {
    expect(one('dividend_radar', { coveredCallDividend: true })).toEqual({ op: 'chips', value: 40 });
    expect(one('dividend_radar', {})).toBeNull();
  },
  trend_rider: () => {
    expect(one('trend_rider', { trendAligned: true })).toEqual({ op: 'add', value: 1 });
    expect(one('trend_rider', { trendAligned: false })).toBeNull();
  },
  contrarian: () => {
    expect(one('contrarian', { against5dTrend: true, callBonus: 1.5 })).toEqual({ op: 'add', value: 1.5 });
    expect(one('contrarian', { against5dTrend: false, callBonus: 1.5 })).toBeNull();
  },
  bollinger_bouncer: () => {
    expect(one('bollinger_bouncer', { shortOutsideBollinger: true })).toEqual({ op: 'chips', value: 30 });
    expect(one('bollinger_bouncer', {})).toBeNull();
  },
  rsi_radar: () => {
    expect(one('rsi_radar', { structureId: 'bear_call', rsiAtEntry: 75 })).toEqual({ op: 'add', value: 2 });
    expect(one('rsi_radar', { structureId: 'bull_put', rsiAtEntry: 25 })).toEqual({ op: 'add', value: 2 });
    expect(one('rsi_radar', { structureId: 'bull_put', rsiAtEntry: 50 })).toBeNull();
  },
  macd_cross: () => {
    expect(one('macd_cross', { macdCrossWithin2: true })).toEqual({ op: 'add', value: 1 });
    expect(one('macd_cross', {})).toBeNull();
  },
  gamma_scalper: () => {
    expect(one('gamma_scalper', { callBigBucket: true, callBonus: 2.5 })).toEqual({ op: 'add', value: 2.5 });
    expect(one('gamma_scalper', { callBigBucket: false, callBonus: 2.5 })).toBeNull();
  },
  diagonal_drift: () => {
    expect(one('diagonal_drift', { diagonalWithTrend: true })).toEqual({ op: 'add', value: 1 });
    expect(one('diagonal_drift', {})).toBeNull();
  },
  stop_discipline: () => {
    expect(one('stop_discipline', { ...lose, lossWithinStop: true })).toEqual({ op: 'meter', value: 0.7 });
    expect(one('stop_discipline', { ...lose, lossWithinStop: false })).toBeNull();
    const c = CARTRIDGE_BY_ID.stop_discipline;
    expect(c.onDecisionPoint?.({ kind: 'stop_hit', action: 'hold', run: run(), state: {} })).toEqual({
      stress: 10,
    });
    expect(c.onDecisionPoint?.({ kind: 'stop_hit', action: 'close', run: run(), state: {} })).toBeUndefined();
  },
  iron_stomach: () => expect(CARTRIDGE_BY_ID.iron_stomach.passive?.stressGainMult).toBe(0.5),
  patience_pays: () => {
    expect(one('patience_pays', {}, { patienceStacks: 5 })).toEqual({ op: 'add', value: 3 });
    expect(one('patience_pays', {}, { patienceStacks: 0 })).toBeNull();
  },
  roll_artist: () => {
    expect(one('roll_artist', {}, { rollArtistStacks: 2 })).toEqual({ op: 'add', value: 2 });
    expect(one('roll_artist', {}, { rollArtistStacks: 0 })).toBeNull();
  },
  right_sized: () => {
    expect(one('right_sized', { riskPct: 0.02 })).toEqual({ op: 'chips', value: 25 });
    expect(one('right_sized', { riskPct: 0.05 })).toBeNull();
  },
  breakout_insurance: () => {
    expect(one('breakout_insurance', { ...lose, gappedThroughShort: true })).toEqual({
      op: 'meter',
      value: 0.5,
    });
    expect(
      one('breakout_insurance', { ...lose, gappedThroughShort: true }, { gapInsuranceUsed: true }),
    ).toBeNull();
  },
  level_ii_feed: () => expect(CARTRIDGE_BY_ID.level_ii_feed.passive?.execution?.limitBoost).toBe(0.15),
  smart_router: () => expect(CARTRIDGE_BY_ID.smart_router.passive?.execution?.marketImprove).toBe(0.25),
  legging_pro: () => expect(CARTRIDGE_BY_ID.legging_pro.passive?.execution?.rollSlippage).toBe(0),
  portfolio_margin: () => expect(CARTRIDGE_BY_ID.portfolio_margin.passive?.riskCapMult).toBe(1.25),
  edge_hunter: () => {
    const withIt = runScore(
      10_000,
      500_000,
      scoreSteps(pipe({ edgeTier: 'top10', cartridges: ['edge_hunter'] })),
    );
    const without = runScore(10_000, 500_000, scoreSteps(pipe({ edgeTier: 'top10' })));
    expect(withIt.mult / without.mult).toBeCloseTo(2 / 1.5);
  },
  compound_interest: () => expect(CARTRIDGE_BY_ID.compound_interest.passive?.interestCapAdd).toBe(5),
  bonus_pool: () => {
    const f = CARTRIDGE_BY_ID.bonus_pool.onRoundEnd;
    expect(
      f?.({
        run: run(),
        state: {},
        meter: 650,
        target: 400,
        passed: true,
        unusedTickets: 0,
        portfolioDeltaOk: true,
      }),
    ).toMatchObject({ cash: 2 });
    expect(
      f?.({
        run: run(),
        state: {},
        meter: 300,
        target: 400,
        passed: false,
        unusedTickets: 0,
        portfolioDeltaOk: true,
      }),
    ).toBeUndefined();
  },
  expense_account: () => expect(CARTRIDGE_BY_ID.expense_account.passive?.rerollCostDelta).toBe(-1),
  golden_parachute: () => expect(CARTRIDGE_BY_ID.golden_parachute.savesRun).toBe(true),
  two_x_leverage: () => {
    expect(one('two_x_leverage', {})).toEqual({ op: 'meter', value: 2 });
    expect(one('two_x_leverage', lose)).toEqual({ op: 'meter', value: 2 });
    expect(CARTRIDGE_BY_ID.two_x_leverage.passive?.maxLossLineDelta).toBe(-0.02);
  },
  bag_holder: () => {
    expect(one('bag_holder', {})).toEqual({ op: 'add', value: 1 });
    expect(one('bag_holder', lose)).toBeNull();
    expect(CARTRIDGE_BY_ID.bag_holder.passive?.losersLocked).toBe(true);
  },
  meme_energy: () => {
    expect(one('meme_energy', { highIv: true })).toEqual({ op: 'mul', value: 2 });
    expect(one('meme_energy', { highIv: false })).toBeNull();
    expect(
      CARTRIDGE_BY_ID.meme_energy.onEntry?.({
        structureId: 'bull_put',
        highIv: false,
        run: run(),
        state: {},
      }),
    ).toEqual({ stress: 10 });
  },
  rivals_bet: () => {
    const f = CARTRIDGE_BY_ID.rivals_bet.onRoundEnd;
    expect(
      f?.({
        run: run({ ghostScore: 300 }),
        state: {},
        meter: 400,
        target: 400,
        passed: true,
        unusedTickets: 0,
        portfolioDeltaOk: true,
      }),
    ).toMatchObject({ cash: 10 });
    expect(
      f?.({
        run: run({ ghostScore: 500 }),
        state: {},
        meter: 400,
        target: 400,
        passed: true,
        unusedTickets: 0,
        portfolioDeltaOk: true,
      }),
    ).toMatchObject({ cash: -5 });
  },
  the_wheel: () => {
    const st: CartState = {};
    CARTRIDGE_BY_ID.the_wheel.onClose?.({
      facts: facts({ structureId: 'cash_secured_put', cspAssigned: true }),
      run: run(),
      state: st,
    });
    expect(one('the_wheel', { structureId: 'covered_call' }, {}, st)).toEqual({ op: 'mul', value: 2 });
    expect(one('the_wheel', { structureId: 'covered_call' }, {}, {})).toBeNull();
  },
  covered_and_chill: () => {
    expect(one('covered_and_chill', { coveredCallExpiredOtm: true })).toEqual({ op: 'add', value: 2 });
    expect(one('covered_and_chill', {})).toBeNull();
  },
  assignment_artist: () => {
    expect(one('assignment_artist', { assigned: true })).toEqual({ op: 'chips', value: 50 });
    expect(one('assignment_artist', {})).toBeNull();
  },
  delta_neutral: () => {
    expect(one('delta_neutral', {}, { deltaNeutralOk: true })).toEqual({ op: 'add', value: 1 });
    expect(one('delta_neutral', {}, { deltaNeutralOk: false })).toBeNull();
  },
  wing_clipper: () => {
    expect(one('wing_clipper', { condorOutsideEm: true })).toEqual({ op: 'chips', value: 40 });
    expect(one('wing_clipper', {})).toBeNull();
  },
  pin_master: () => {
    expect(one('pin_master', { pinnedFly: true })).toEqual({ op: 'mul', value: 4 });
    expect(one('pin_master', {})).toBeNull();
  },
  straddle_stack: () => {
    expect(one('straddle_stack', { isStraddle: true, straddlesBefore: 2 })).toEqual({ op: 'add', value: 2 });
    expect(one('straddle_stack', { isStraddle: true, straddlesBefore: 4 })).toEqual({ op: 'add', value: 2 });
    expect(one('straddle_stack', { isStraddle: true, straddlesBefore: 0 })).toBeNull();
  },
  double_time: () => {
    expect(one('double_time', { isDoubleCalendar: true })).toEqual({ op: 'add', value: 2 });
    expect(one('double_time', {})).toBeNull();
  },
};

describe('every cartridge', () => {
  it('has a test case', () => {
    expect(Object.keys(CASES).sort()).toEqual(CARTRIDGES.map((c) => c.id).sort());
  });
  for (const c of CARTRIDGES) it(`${c.name}: ${c.text}`, () => CASES[c.id]());

  it('arcade effects never apply to the real P/L, only to steps', () => {
    for (const c of CARTRIDGES) {
      const steps =
        c.score?.({
          facts: facts({ thetaChips: 10, callBonus: 1, heldOverWeekend: true }),
          run: run({ patienceStacks: 1, rollArtistStacks: 1 }),
          state: { streak: 1, primed: 1 },
        }) ?? [];
      for (const s of steps) expect(['chips', 'add', 'mul', 'chipsMul', 'meter']).toContain(s.op);
    }
  });
});
