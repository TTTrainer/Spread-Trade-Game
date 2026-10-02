import { describe, expect, it } from 'vitest';
import { BOSSES, BOSS_IDS, quarterBossPool } from '../../src/content/bosses';
import { REVIEWS } from '../../src/content/reviews';
import { roundRule } from '../../src/engine/run/rules';
import { scoreSteps } from '../../src/engine/run/score';
import { runScore } from '../../src/engine/scoring/mult';
import { facts, pipe } from './fixtures';

const points = (over: Parameters<typeof pipe>[0], f = facts()) =>
  runScore(f.realizedCents, 500_000, scoreSteps(pipe({ ...over, facts: f }))).points;

describe('boss roster', () => {
  it('has the 12 pillars once each, with plain short text and a real market', () => {
    expect(BOSS_IDS.length).toBe(12);
    expect(new Set(BOSS_IDS.map((id) => BOSSES[id].pillar))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    );
    for (const id of BOSS_IDS) {
      const b = BOSSES[id];
      expect(REVIEWS[b.market], id).toBeDefined();
      expect(b.twistText.length, id).toBeLessThanOrEqual(80);
      expect(b.blocks.length, id).toBeLessThanOrEqual(40);
      expect(b.intro.length, id).toBeLessThanOrEqual(110);
      expect(b.palette.accent).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Only the year end is the Rebalancer; the quarter draw never includes it or an unbuilt boss.
    expect(BOSSES.rebalancer.market).toBe('annual_review');
    expect(quarterBossPool()).not.toContain('rebalancer');
    for (const id of quarterBossPool()) expect(BOSSES[id].ready).toBe(true);
    expect(quarterBossPool().length).toBeGreaterThanOrEqual(3);
  });

  it('drops the market type’s old rule: a boss round has exactly its one twist', () => {
    // Gap Risk's old rule (no decisions on gap days) is gone under the Underwriter.
    expect(roundRule('gap_risk', null).noDecisionsOnGap).toBe(true);
    const r = roundRule('gap_risk', 'underwriter');
    expect(r.noDecisionsOnGap).toBeUndefined();
    expect(r.lossMult).toBe(2);
    // The Fed's index card and macro panel are information, not a twist: they stay.
    expect(roundRule('the_fed', 'bursar')).toMatchObject({ forceContextCard: true, leftCartOff: true });
    expect(roundRule(null, null)).toEqual({});
  });
});

describe('boss twists in the score', () => {
  const loser = facts({ win: false, realizedCents: -10_000 });

  it('Underwriter: losers count double, winners untouched', () => {
    const base = points({}, loser);
    expect(points({ reviewId: 'gap_risk', bossId: 'underwriter' }, loser)).toBe(base * 2);
    expect(points({ reviewId: 'gap_risk', bossId: 'underwriter' })).toBe(points({}));
  });

  it('Collector: each loss in an unbroken streak costs 25% more than the last', () => {
    const base = points({}, loser);
    const at = (n: number) => points({ reviewId: 'vol_spike', bossId: 'collector', lossStreak: n }, loser);
    expect(at(0)).toBe(base);
    // (points round once at the end, so allow a point of rounding)
    expect(Math.abs(at(1) - base * 1.25)).toBeLessThanOrEqual(1);
    expect(Math.abs(at(2) - base * 1.5625)).toBeLessThanOrEqual(1);
  });

  it('Tax Man: quick wins pay 25% less; held ones and losses are untouched', () => {
    const quick = facts({ daysOpen: 2 });
    const held = facts({ daysOpen: 3 });
    const tax = { reviewId: 'assignment_week' as const, bossId: 'tax_man' as const };
    expect(Math.abs(points(tax, quick) - points({}, quick) * 0.75)).toBeLessThanOrEqual(1);
    expect(points(tax, held)).toBe(points({}, held));
    expect(points(tax, loser)).toBe(points({}, loser));
  });

  it('Landlord: a winner’s finished mult keeps 65%', () => {
    const steps = scoreSteps(
      pipe({ reviewId: 'trend_train', bossId: 'landlord', cartridges: ['edge_hunter'] }),
    );
    expect(steps.at(-1)).toMatchObject({ op: 'mul', value: 0.65 });
    const r = runScore(10_000, 500_000, steps);
    const plain = runScore(10_000, 500_000, scoreSteps(pipe({ cartridges: ['edge_hunter'] })));
    expect(r.mult).toBeCloseTo(plain.mult * 0.65);
  });
});
