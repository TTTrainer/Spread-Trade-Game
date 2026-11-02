/**
 * The payout queue: each closed trade's scoring, waiting to be played out on screen (one at a
 * time, Balatro style), and the Collector's interest notices. The engine has already counted the
 * points; the screen shows the score without them until each item lands, and the clock waits
 * while one plays.
 */

import { create } from 'zustand';
import type { InterestItem, TradeTally } from '../../engine/run/types';

export type PayoutItem =
  | { id: number; kind: 'trade'; tally: TradeTally }
  | { id: number; kind: 'interest'; items: InterestItem[]; rate: number; day: number; points: number };

/** A cartridge on the Joker Row during a payout: lit (the coin's next stop), fired, or passed by. */
export interface CardFx {
  state: 'lit' | 'fired' | 'idle';
  /** Bumped on each hit, to replay the flash and slam. */
  hit: number;
}

interface PayoutStore {
  queue: PayoutItem[];
  /** While a payout plays: the Joker Row dims all but the cartridges the coin has reached. */
  focus: boolean;
  fx: Record<string, CardFx>;
  setFx: (id: string, state: CardFx['state'], hit?: boolean) => void;
  setFocus: (on: boolean) => void;
  /** Bumped to fast-forward the payout on screen. */
  skipN: number;
  push: (tallies: TradeTally[]) => void;
  /** The Collector's bill for a day: its own screen, after any payouts already waiting. */
  pushInterest: (bill: { items: InterestItem[]; rate: number; day: number }) => void;
  /** The head landed: drop it. */
  done: (id: number) => void;
  skip: () => void;
  clear: () => void;
}

let nextId = 0;

export const usePayout = create<PayoutStore>((set, get) => ({
  queue: [],
  focus: false,
  fx: {},
  setFx: (id, state, hit) => {
    const was = get().fx[id];
    set({ fx: { ...get().fx, [id]: { state, hit: (was?.hit ?? 0) + (hit ? 1 : 0) } } });
  },
  setFocus: (on) => set(on ? { focus: true, fx: {} } : { focus: false, fx: {} }),
  skipN: 0,
  push: (tallies) =>
    tallies.length &&
    set({
      queue: [...get().queue, ...tallies.map((tally) => ({ id: ++nextId, kind: 'trade' as const, tally }))],
    }),
  pushInterest: (bill) =>
    set({
      queue: [
        ...get().queue,
        { id: ++nextId, kind: 'interest', ...bill, points: -bill.items.reduce((a, x) => a + x.points, 0) },
      ],
    }),
  done: (id) => set({ queue: get().queue.filter((x) => x.id !== id) }),
  skip: () => set({ skipN: get().skipN + 1 }),
  clear: () => set({ queue: [] }),
}));

/** A payout is on screen (or waiting): the clock holds and the score hasn't caught up yet. */
export function payoutBusy(): boolean {
  return usePayout.getState().queue.length > 0;
}

/** Points the engine has counted that haven't landed on screen yet (interest counts negative). */
export function usePendingPoints(): number {
  return usePayout((s) => s.queue.reduce((a, x) => a + (x.kind === 'trade' ? x.tally.points : x.points), 0));
}
