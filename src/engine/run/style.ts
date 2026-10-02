/**
 * Boss style bonuses and second goals, judged from the round's trades alone (no market data).
 * A style is a small extra the boss pays for playing its round a certain way; it is shown during
 * the round with its status, so the condition is never a surprise.
 */

import type { ExitReason } from '../lifecycle/types';
import type { StructureId } from '../strategies/types';

export type StyleId =
  | 'plan_exits'
  | 'green'
  | 'no_loser'
  | 'three_wins'
  | 'hold_wins'
  | 'two_wins'
  | 'all_types_green'
  | 'no_stop'
  | 'no_expiry'
  | 'no_streak';

/** What a style needs to know about one trade (open or closed). */
export interface StyleTrade {
  structureId: StructureId;
  open: boolean;
  realizedCents: number;
  exitReason: ExitReason | null;
  /** Trading days it was held (so far, for an open one). */
  daysHeld: number;
}

export type StyleState = 'met' | 'on_track' | 'broken';

export const STYLE_TEXT: Record<StyleId, string> = {
  plan_exits: 'Every trade closes at its target or its stop',
  green: 'Finish the round green',
  no_loser: 'Not one losing trade',
  three_wins: 'Win 3 trades',
  hold_wins: 'Every win held at least 3 trading days',
  two_wins: 'Win 2 trades',
  all_types_green: 'Every structure you trade makes money',
  no_stop: 'No trade stopped out',
  no_expiry: 'Close every trade yourself before it expires',
  no_streak: 'Never two losses in a row',
};

/**
 * Where the style stands. `final` is true once the round is over: "on track" then means it was
 * never reached. Closed trades are judged in the order they closed.
 */
export function styleState(id: StyleId, trades: StyleTrade[], final: boolean): StyleState {
  const closed = trades.filter((t) => !t.open);
  const wins = closed.filter((t) => t.realizedCents > 0);
  const losers = closed.filter((t) => t.realizedCents < 0);
  const done = (ok: boolean): StyleState => (ok ? 'met' : final ? 'broken' : 'on_track');
  switch (id) {
    case 'plan_exits':
      if (closed.some((t) => t.exitReason !== 'target' && t.exitReason !== 'stop')) return 'broken';
      return done(closed.length > 0 && closed.length === trades.length);
    case 'green': {
      const net = closed.reduce((a, t) => a + t.realizedCents, 0);
      return done(closed.length > 0 && net > 0 && (final || closed.length === trades.length));
    }
    case 'no_loser':
      if (losers.length) return 'broken';
      return done(closed.length > 0 && closed.length === trades.length);
    case 'three_wins':
      return wins.length >= 3 ? 'met' : final ? 'broken' : 'on_track';
    case 'two_wins':
      return wins.length >= 2 ? 'met' : final ? 'broken' : 'on_track';
    case 'hold_wins':
      if (wins.some((t) => t.daysHeld < 3)) return 'broken';
      return done(wins.length > 0 && closed.length === trades.length);
    case 'all_types_green': {
      const byType = new Map<StructureId, number>();
      for (const t of closed) byType.set(t.structureId, (byType.get(t.structureId) ?? 0) + t.realizedCents);
      const red = [...byType.values()].some((v) => v <= 0);
      if (red && final) return 'broken';
      return done(byType.size > 0 && !red && closed.length === trades.length);
    }
    case 'no_stop':
      if (closed.some((t) => t.exitReason === 'stop')) return 'broken';
      return done(closed.length > 0 && closed.length === trades.length);
    case 'no_expiry':
      if (closed.some((t) => t.exitReason === 'expired' || t.exitReason === 'assigned')) return 'broken';
      return done(closed.length > 0 && closed.length === trades.length);
    case 'no_streak':
      for (let i = 1; i < closed.length; i++)
        if (closed[i].realizedCents < 0 && closed[i - 1].realizedCents < 0) return 'broken';
      return done(closed.length > 0 && closed.length === trades.length);
  }
}

/** Distinct structure types among the round's trades (the Allocator's second goal). */
export function structureTypes(trades: { structureId: StructureId }[]): StructureId[] {
  return [...new Set(trades.map((t) => t.structureId))];
}
