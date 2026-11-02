/**
 * The Rebalancer's race: this round's trades against SPY on the same capital. Each trade's
 * benchmark is its max loss put into SPY from the day it opened to the day it closed (or today),
 * the same comparison the debrief's alpha uses. Only data up to each card's own today is read.
 */

import { lastMark } from '../lifecycle/position';
import { benchmarkCents } from '../scoring/alternates';
import type { TradingSession } from '../trading/session';
import type { Cents } from '../money';

export interface RacePoint {
  /** The trades' P/L: realized for closed ones, marked for open ones. */
  you: Cents;
  /** The same capital in SPY over the same days. */
  spy: Cents;
}

export function raceNow(s: TradingSession): RacePoint {
  let you = 0;
  let spy = 0;
  for (const p of s.positions) {
    const view = s.view(p.cardId);
    const bench = view.benchmarkBars();
    const b0 = bench.find((b) => b.date === p.openedOn)?.close;
    const end = p.closedOn ?? view.now;
    const b1 = bench.find((b) => b.date === end)?.close ?? bench[bench.length - 1]?.close;
    you += p.status === 'open' ? (lastMark(p)?.plCents ?? 0) : (p.realizedCents ?? 0);
    if (b0 && b1) spy += benchmarkCents(p.entry.maxLossCents, b0, b1);
  }
  return { you, spy };
}
