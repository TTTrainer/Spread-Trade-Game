/**
 * The Collector's test: is a trade's price at or past a strike it sold? "Touching" counts: within
 * half a percent of the strike on the wrong side of the money.
 */

import type { Leg } from '../strategies/types';

export const TOUCH_TOLERANCE = 0.005;

/** The first sold strike the price is at or past (puts from above, calls from below), or null. */
export function testedShort(legs: Leg[], spot: number): { strike: number; right: 'C' | 'P' } | null {
  for (const l of legs) {
    if (l.kind !== 'option' || l.ratio >= 0) continue;
    if (l.right === 'P' && spot <= l.strike * (1 + TOUCH_TOLERANCE)) return { strike: l.strike, right: 'P' };
    if (l.right === 'C' && spot >= l.strike * (1 - TOUCH_TOLERANCE)) return { strike: l.strike, right: 'C' };
  }
  return null;
}
