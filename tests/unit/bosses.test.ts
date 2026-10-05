import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  BOSS_IDS,
  quarterBossPool,
  showdownLabel,
  showdownTier,
  showdownTwist,
  twistLine,
} from '../../src/content/bosses';
import { BOSS_TROPHIES } from '../../src/content/trophies';
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

  it("Collector: a trade's own points are untouched (his interest is charged day by day)", () => {
    const collector = { reviewId: 'vol_spike' as const, bossId: 'collector' as const };
    expect(points(collector, loser)).toBe(points({}, loser));
    expect(points(collector)).toBe(points({}));
    expect(roundRule('vol_spike', 'collector').interestRate).toBe(0.05);
  });

  it('Tax Man: quick wins pay 25% less; held ones and losses are untouched', () => {
    // Within the first week (5 trading days) is quick; the 6th day is held.
    const quick = facts({ daysOpen: 5 });
    const held = facts({ daysOpen: 6 });
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

describe('showdown tiers and trophies', () => {
  it('year 1 is the boss as written; each Endless year turns the twist one notch harsher', () => {
    expect(showdownTier(1)).toBe(0);
    expect(showdownTier(4)).toBe(0);
    expect(showdownTier(5)).toBe(1);
    expect(showdownTier(9)).toBe(2);
    expect(showdownTwist(BOSSES.underwriter.twist, 0)).toEqual(BOSSES.underwriter.twist);
    expect(showdownTwist(BOSSES.underwriter.twist, 1)).toEqual({ kind: 'lossMult', mult: 2.5 });
    expect(showdownTwist(BOSSES.margin_clerk.twist, 1)).toEqual({ kind: 'riskCap', mult: 0.4 });
    expect(showdownTwist(BOSSES.landlord.twist, 9)).toEqual({ kind: 'multCut', keep: 0.35 });
    expect(roundRule('gap_risk', 'underwriter', 1).lossMult).toBe(2.5);
    // The text follows the numbers.
    expect(twistLine('underwriter', 0)).toBe(BOSSES.underwriter.twistText);
    expect(twistLine('underwriter', 1)).toContain('x2.5');
    expect(twistLine('tax_man', 1)).toContain('first 6 trading days');
    expect(showdownTwist(BOSSES.collector.twist, 1)).toEqual({ kind: 'interest', rate: 0.075 });
    expect(twistLine('collector', 1)).toContain('7.5%');
    expect(showdownLabel(0)).toBeNull();
    expect(showdownLabel(2)).toBe('SHOWDOWN II');
    for (const id of BOSS_IDS) expect(twistLine(id, 3).length, id).toBeLessThanOrEqual(90);
  });

  it('every boss has a trophy that only touches the game layer', () => {
    for (const id of BOSS_IDS) {
      const t = BOSS_TROPHIES[id];
      expect(t.name, id).toBeTruthy();
      expect(t.text.length, id).toBeLessThanOrEqual(90);
      expect(Object.keys(t.passive).length, id).toBeGreaterThan(0);
      expect(t.passive.execution, id).toBeUndefined();
    }
  });
});

describe('developer test checklist', () => {
  it('has unique ids, plain text, and a setup for every built boss', async () => {
    const { DEV_CHECKS } = await import('../../src/content/devChecklist');
    expect(new Set(DEV_CHECKS.map((c) => c.id)).size).toBe(DEV_CHECKS.length);
    for (const c of DEV_CHECKS) expect(c.look.length, c.id).toBeLessThanOrEqual(220);
    for (const id of BOSS_IDS.filter((b) => BOSSES[b].ready))
      expect(
        DEV_CHECKS.some((c) => c.setup?.boss === id),
        id,
      ).toBe(true);
  });
});
