/**
 * The payout queue: each closed trade's scoring, waiting to be played out on screen (one at a
 * time, Balatro style). The engine has already counted the points; the screen shows the score
 * without them until each payout lands, and the clock waits while one plays.
 */

import { create } from 'zustand';
import type { TradeTally } from '../../engine/run/types';

export interface PayoutItem {
  id: number;
  tally: TradeTally;
}

interface PayoutStore {
  queue: PayoutItem[];
  /** Bumped to fast-forward the payout on screen. */
  skipN: number;
  push: (tallies: TradeTally[]) => void;
  /** The head landed: drop it. */
  done: (id: number) => void;
  skip: () => void;
  clear: () => void;
}

let nextId = 0;

export const usePayout = create<PayoutStore>((set, get) => ({
  queue: [],
  skipN: 0,
  push: (tallies) =>
    tallies.length && set({ queue: [...get().queue, ...tallies.map((tally) => ({ id: ++nextId, tally }))] }),
  done: (id) => set({ queue: get().queue.filter((x) => x.id !== id) }),
  skip: () => set({ skipN: get().skipN + 1 }),
  clear: () => set({ queue: [] }),
}));

/** A payout is on screen (or waiting): the clock holds and the score hasn't caught up yet. */
export function payoutBusy(): boolean {
  return usePayout.getState().queue.length > 0;
}

/** Points the engine has counted that haven't landed on screen yet. */
export function usePendingPoints(): number {
  return usePayout((s) => s.queue.reduce((a, x) => a + x.tally.points, 0));
}
