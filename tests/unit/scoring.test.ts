import { describe, expect, it } from 'vitest';
import {
  brier,
  bucketOf,
  calibrationGrade,
  callBonus,
  cutoffLabels,
  cutoffs,
  meanBrier,
  resolveCall,
  type Call,
} from '../../src/engine/scoring/calls';
import { edgeStep, levelSteps, pnlChips, runScore, type ScoreStep } from '../../src/engine/scoring/mult';
import {
  alternateKeys,
  alternateSpecs,
  benchmarkCents,
  valueAlternates,
} from '../../src/engine/scoring/alternates';
import { mistakeTags, processGrade } from '../../src/engine/scoring/grade';
import {
  contractCents,
  formatCents,
  pctOf,
  toCents,
  centsToDollars,
  assertCents,
} from '../../src/engine/money';
import type { Position } from '../../src/engine/lifecycle/types';
import { flatChain } from '../helpers/market';

describe('money', () => {
  it('works in integer cents', () => {
    expect(toCents(12.345)).toBe(1235);
    expect(contractCents(1.25, 2)).toBe(25000);
    expect(centsToDollars(1999)).toBe(19.99);
    expect(pctOf(5000, 500000)).toBe(0.01);
    expect(pctOf(1, 0)).toBe(0);
    expect(formatCents(-123456)).toBe('−$1,234.56');
    expect(formatCents(500, { sign: true })).toBe('+$5.00');
    expect(formatCents(500, { decimals: false })).toBe('$5');
    expect(() => assertCents(1.5)).toThrow();
    expect(() => assertCents(2)).not.toThrow();
  });
});

describe('calls', () => {
  const call: Call = { bucket: 3, confidence: 0.7, emPct: 0.06, horizonDays: 30, mode: 'em' };

  it('scales cutoffs with the expected move and elapsed time', () => {
    expect(cutoffs(call)).toEqual({ flat: 0.015, big: 0.06 });
    const half = cutoffs(call, 0.25);
    expect(half.flat).toBeCloseTo(0.0075, 12);
    expect(cutoffs({ emPct: 0.06, mode: 'fixed' })).toEqual({ flat: 0.01, big: 0.05 });
    expect(cutoffLabels(call)[2]).toBe('±1.5%');
  });

  it('puts moves in the right bucket', () => {
    const c = { flat: 0.015, big: 0.06 };
    expect(bucketOf(-0.1, c)).toBe(0);
    expect(bucketOf(-0.03, c)).toBe(1);
    expect(bucketOf(0.01, c)).toBe(2);
    expect(bucketOf(0.03, c)).toBe(3);
    expect(bucketOf(0.08, c)).toBe(4);
  });

  it('pays the call bonus: exact, adjacent, wrong', () => {
    expect(callBonus(0.9, true, false)).toBeCloseTo(2.5, 12);
    expect(callBonus(0.5, true, false)).toBeCloseTo(0.5, 12);
    expect(callBonus(0.9, false, true)).toBe(0.25);
    expect(callBonus(0.9, false, false)).toBe(0);
    const r = resolveCall(call, 100, 103, 30);
    expect(r).toMatchObject({ actual: 3, exact: true, directionRight: true });
    expect(r.bonus).toBeCloseTo(1.5, 12);
    const early = resolveCall(call, 100, 101, 5);
    expect(early.actual).toBe(3); // 1% in 5 days beats the scaled flat band
    expect(resolveCall(call, 100, 90, 30)).toMatchObject({
      actual: 0,
      exact: false,
      adjacent: false,
      directionRight: false,
    });
  });

  it('scores calibration with a multi-class Brier score', () => {
    expect(brier({ bucket: 2, confidence: 0.2 }, 2)).toBeCloseTo(0.8, 12);
    expect(brier({ bucket: 2, confidence: 0.9 }, 2)).toBeCloseTo(0.01 + 4 * 0.025 ** 2, 12);
    expect(brier({ bucket: 2, confidence: 0.9 }, 4)).toBeCloseTo(0.81 + 0.975 ** 2 + 3 * 0.025 ** 2, 12);
    expect(meanBrier([])).toBeNull();
    expect(meanBrier([0.4, 0.6])).toBeCloseTo(0.5, 12);
    expect(calibrationGrade(0.5)).toBe('A');
    expect(calibrationGrade(0.7)).toBe('B');
    expect(calibrationGrade(0.8)).toBe('C');
    expect(calibrationGrade(0.9)).toBe('D');
    expect(calibrationGrade(1.2)).toBe('F');
    expect(calibrationGrade(null)).toBe('C');
  });
});

describe('chips x mult', () => {
  it('turns +1% of equity into 100 chips', () => {
    expect(pnlChips(5000, 500000)).toBe(100);
    expect(pnlChips(5000, 0)).toBe(0);
  });

  it('adds, then multiplies in order, so slot order matters', () => {
    const add: ScoreStep = { label: '+2', kind: 'cartridge', op: 'add', value: 2 };
    const mul: ScoreStep = { label: 'x2', kind: 'cartridge', op: 'mul', value: 2 };
    const a = runScore(5000, 500000, [add, mul]);
    const b = runScore(5000, 500000, [mul, add]);
    expect(a.mult).toBe(6);
    expect(b.mult).toBe(4);
    expect(a.points).toBe(600);
    expect(b.points).toBe(400);
    expect(a.trace).toHaveLength(3);
  });

  it('never multiplies losers, but lets meter effects soften them', () => {
    const steps: ScoreStep[] = [
      { label: '+3', kind: 'cartridge', op: 'add', value: 3 },
      { label: '+50 chips', kind: 'cartridge', op: 'chips', value: 50 },
      { label: 'refund 30%', kind: 'cartridge', op: 'meter', value: 0.7 },
    ];
    const r = runScore(-10000, 500000, steps);
    expect(r.winner).toBe(false);
    expect(r.chips).toBe(-200);
    expect(r.mult).toBe(1);
    expect(r.points).toBe(-140);
  });

  it('builds level and Edge Rank steps', () => {
    expect(levelSteps(1, 30)).toHaveLength(1);
    const l3 = levelSteps(3, 30);
    expect(l3.map((s) => s.value)).toEqual([30, 20, 1]);
    expect(edgeStep('top10')?.value).toBe(1.5);
    expect(edgeStep('top10', 2)?.value).toBe(2);
    expect(edgeStep('top25')?.value).toBe(1.25);
    expect(edgeStep('none')).toBeNull();
    expect(edgeStep(null)).toBeNull();
  });
});

describe('alternates and benchmark', () => {
  it('prices what else you could have done on the same chain', () => {
    const entry = flatChain({ date: '2025-01-03', spot: 100, expirations: ['2025-01-31'] });
    const specs = alternateSpecs(entry, '2025-01-31', true);
    expect(specs.map((s) => s.id)).toEqual([
      'shares',
      'long_option',
      'debit_spread',
      'credit_spread',
      'condor16',
    ]);
    expect(alternateKeys(specs).length).toBeGreaterThan(8);
    const exit = flatChain({ date: '2025-01-24', spot: 106, expirations: ['2025-01-31'] });
    const idx = new Map(exit.quotes.map((q) => [`${q.strike}|${q.right}`, q] as const));
    const res = valueAlternates(specs, entry, 106, (k) => idx.get(`${k.strike}|${k.right}`) ?? null, false);
    const shares = res.find((r) => r.id === 'shares');
    expect(shares?.plCents).toBe(60000);
    expect(res.find((r) => r.id === 'long_option')?.plCents).toBeGreaterThan(0);
    expect(res.find((r) => r.id === 'credit_spread')?.plCents).toBeGreaterThan(0);
    const bearish = alternateSpecs(entry, '2025-01-31', false);
    const expired = valueAlternates(bearish, entry, 106, () => null, true);
    expect(expired.find((r) => r.id === 'long_option')?.plCents).toBeLessThan(0);
    expect(benchmarkCents(50000, 400, 410)).toBe(1250);
    expect(benchmarkCents(50000, 0, 410)).toBe(0);
  });
});

describe('process grade and mistake tags', () => {
  const base = {
    structureId: 'bull_put',
    realizedCents: -20000,
    exitReason: 'stop',
    flags: {
      stopDeclined: false,
      heldIntoLast7: false,
      rolledForDebit: false,
      assigned: false,
      closedAtPlan: 'stop',
    },
    entry: {
      spot: 100,
      ivr: 45,
      expectedMove: 5,
      shortStrikes: [94],
      riskPct: 0.04,
      earningsInside: false,
      edgePercentile: 0.6,
      credit: true,
      sma50Slope: 0.1,
    },
  } as unknown as Position;

  it('grades a disciplined losing trade as good process, bad luck', () => {
    const g = processGrade({
      pos: base,
      riskCapPct: 0.1,
      earningsAcknowledged: false,
      declinedDecisions: [],
    });
    expect(g.grade).toBe('A');
    expect(g.outcome).toBe('Good trade, bad luck.');
    expect(
      mistakeTags({ pos: base, riskCapPct: 0.1, earningsAcknowledged: false, declinedDecisions: [] }),
    ).toEqual([]);
  });

  it('tags the usual mistakes', () => {
    const bad = {
      ...base,
      realizedCents: 5000,
      exitReason: 'manual',
      flags: {
        ...base.flags,
        stopDeclined: true,
        heldIntoLast7: true,
        rolledForDebit: true,
        assigned: true,
        closedAtPlan: null,
      },
      entry: {
        ...base.entry,
        ivr: 10,
        shortStrikes: [98],
        riskPct: 0.09,
        earningsInside: true,
        edgePercentile: 0.1,
        sma50Slope: -0.3,
      },
    } as unknown as Position;
    const tags = mistakeTags({
      pos: bad,
      riskCapPct: 0.1,
      earningsAcknowledged: false,
      declinedDecisions: ['pin_risk', 'exdiv_itm_call'],
    });
    expect(tags).toEqual([
      'held_past_stop',
      'low_ivr_premium',
      'short_inside_em',
      'unplanned_earnings',
      'oversized',
      'poor_edge',
      'held_last_7',
      'ignored_pin',
      'ignored_exdiv',
      'rolled_for_debit',
      'counter_trend',
    ]);
    const g = processGrade({ pos: bad, riskCapPct: 0.1, earningsAcknowledged: false, declinedDecisions: [] });
    expect(g.grade).toBe('F');
    expect(g.outcome).toBe('Bad trade, good luck.');
  });
});
