/**
 * The options course's rules, kept apart from the screen: how a lesson's legs ("sell the .25
 * delta put") become real strikes on the chain you have open, and when a lesson's task is done.
 */

import type { ISODate } from '../calendar';
import type { Chain } from '../market/types';
import type { OptionLeg } from '../strategies/types';

export interface CourseLegSpec {
  right: 'C' | 'P';
  side: 'buy' | 'sell';
  /** Target |delta|: the strike whose delta is nearest. */
  delta: number;
}

export type CourseTask =
  { kind: 'strike' } | { kind: 'days' } | { kind: 'iv' } | { kind: 'pop'; lo: number; hi: number };

/** What the course can see of the builder right now. */
export interface CourseState {
  /** A key for the trade's strikes, to notice them moving. */
  strikeKey: string;
  /** The payoff's DATE slider (days ahead) and the days to expiration. */
  days: number;
  dte: number;
  /** The payoff's IV slider, in points. */
  ivPts: number;
  pop: number | null;
}

export function resolveCourseLegs(chain: Chain, expiration: ISODate, specs: CourseLegSpec[]): OptionLeg[] {
  return specs.flatMap((s) => {
    const qs = chain.quotes.filter((q) => q.expiration === expiration && q.right === s.right && q.bid >= 0);
    if (!qs.length) return [];
    const q = qs.reduce((a, b) =>
      Math.abs(Math.abs(b.delta) - s.delta) < Math.abs(Math.abs(a.delta) - s.delta) ? b : a,
    );
    return [
      {
        kind: 'option' as const,
        right: s.right,
        strike: q.strike,
        expiration,
        ratio: s.side === 'buy' ? 1 : -1,
      },
    ];
  });
}

/** Done when the player did the thing: moved the strike, reached expiration, cut IV, landed the POP. */
export function courseTaskDone(task: CourseTask | undefined, start: CourseState, now: CourseState): boolean {
  if (!task) return true;
  switch (task.kind) {
    case 'strike':
      return now.strikeKey !== start.strikeKey;
    case 'days':
      return now.dte > 0 && now.days >= now.dte;
    case 'iv':
      return now.ivPts <= -5;
    case 'pop':
      return now.pop !== null && now.pop >= task.lo && now.pop <= task.hi;
  }
}
