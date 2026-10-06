import { describe, expect, it } from 'vitest';
import { OPTIONS_COURSE } from '../../src/content/optionsCourse';
import { STRUCTURES } from '../../src/engine/strategies/structures';
import { courseTaskDone, resolveCourseLegs, type CourseState } from '../../src/engine/teach/course';
import type { Chain, OptionQuote } from '../../src/engine/market/types';

const q = (strike: number, right: 'C' | 'P', delta: number): OptionQuote => ({
  expiration: '2026-11-20',
  strike,
  right,
  bid: 1,
  ask: 1.1,
  iv: 0.25,
  delta,
  gamma: 0.01,
  theta: -0.02,
  vega: 0.1,
  rho: 0,
  source: 'real',
});

const chain: Chain = {
  symbol: 'SPY',
  date: '2026-10-06',
  spot: 100,
  source: 'real',
  quotes: [
    q(90, 'P', -0.1),
    q(95, 'P', -0.24),
    q(100, 'P', -0.5),
    q(100, 'C', 0.5),
    q(105, 'C', 0.27),
    q(110, 'C', 0.1),
  ],
};

describe('the options course', () => {
  it('is short, in order, and every lesson reads at a glance', () => {
    expect(OPTIONS_COURSE.length).toBeGreaterThanOrEqual(10);
    const ids = OPTIONS_COURSE.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of OPTIONS_COURSE) {
      expect(l.title.length, l.id).toBeLessThan(32);
      expect(l.text.length, l.id).toBeLessThanOrEqual(260);
      if (l.structure) expect(STRUCTURES[l.structure], l.id).toBeTruthy();
      if (l.quiz) {
        expect(l.quiz.options.length, l.id).toBeGreaterThanOrEqual(2);
        expect(l.quiz.answer, l.id).toBeLessThan(l.quiz.options.length);
        expect(l.quiz.why.length, l.id).toBeGreaterThan(20);
      }
      // A lesson either asks you to do one thing or asks one question, not both.
      expect(!!(l.task && l.quiz), l.id).toBe(false);
    }
    // It starts with a single option and reaches the credit spread and the condor.
    const at = (id: string) => ids.indexOf(id);
    expect(at('call')).toBeLessThan(at('vertical'));
    expect(at('vertical')).toBeLessThan(at('condor'));
    expect(at('condor')).toBeLessThan(at('manage'));
  });

  it('turns "sell the .25 delta put" into a real strike on the open chain', () => {
    const legs = resolveCourseLegs(chain, '2026-11-20', [
      { right: 'P', side: 'sell', delta: 0.25 },
      { right: 'C', side: 'buy', delta: 0.5 },
    ]);
    expect(legs).toEqual([
      { kind: 'option', right: 'P', strike: 95, expiration: '2026-11-20', ratio: -1 },
      { kind: 'option', right: 'C', strike: 100, expiration: '2026-11-20', ratio: 1 },
    ]);
    expect(resolveCourseLegs(chain, '2027-01-15', [{ right: 'P', side: 'sell', delta: 0.25 }])).toEqual([]);
  });

  it('knows when the player did the thing', () => {
    const s: CourseState = { strikeKey: 'a', days: 0, dte: 30, ivPts: 0, pop: 0.6 };
    expect(courseTaskDone(undefined, s, s)).toBe(true);
    expect(courseTaskDone({ kind: 'strike' }, s, s)).toBe(false);
    expect(courseTaskDone({ kind: 'strike' }, s, { ...s, strikeKey: 'b' })).toBe(true);
    expect(courseTaskDone({ kind: 'days' }, s, { ...s, days: 29 })).toBe(false);
    expect(courseTaskDone({ kind: 'days' }, s, { ...s, days: 30 })).toBe(true);
    expect(courseTaskDone({ kind: 'iv' }, s, { ...s, ivPts: -6 })).toBe(true);
    expect(courseTaskDone({ kind: 'pop', lo: 0.75, hi: 0.85 }, s, s)).toBe(false);
    expect(courseTaskDone({ kind: 'pop', lo: 0.75, hi: 0.85 }, s, { ...s, pop: 0.8 })).toBe(true);
  });
});
