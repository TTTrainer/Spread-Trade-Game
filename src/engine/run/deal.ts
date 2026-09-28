/**
 * Dealing lineup cards. Windows come 75% of the time from the last three years and 25% from
 * earlier, a Review deals only windows that match its regime filter, and a card never repeats a
 * symbol already on the table or a window already used this run. If a filter leaves nothing to
 * deal, it is relaxed (and the round says so) rather than stalling the run.
 */

import { BALANCE } from '../../content/balance';
import { matchesFilter } from '../market/filter';
import type { WindowFilter } from '../market/source';
import type { WindowDef } from '../market/types';
import type { Rng } from '../rng';

export interface DealOptions {
  count: number;
  filter?: WindowFilter;
  /** One filter per card (Annual Review's mixed regimes). */
  mix?: WindowFilter[];
  excludeWindows: Set<number>;
  excludeSymbols: Set<string>;
  /** Index-like symbols (SPY, DIA) are context, dealt only when a Review asks for one. */
  indexSymbols: Set<string>;
  forceIndexCard?: boolean;
}

export interface DealResult {
  windows: WindowDef[];
  relaxed: boolean;
}

function pickOne(pool: WindowDef[], rng: Rng): WindowDef {
  const recent = pool.filter((w) => w.recent);
  const older = pool.filter((w) => !w.recent);
  const from = recent.length && older.length ? (rng.chance(BALANCE.run.recentShare) ? recent : older) : pool;
  return rng.pick(from);
}

export function dealWindows(all: WindowDef[], rng: Rng, o: DealOptions): DealResult {
  const out: WindowDef[] = [];
  const symbols = new Set(o.excludeSymbols);
  let relaxed = false;
  for (let i = 0; i < o.count; i++) {
    const wantIndex = !!o.forceIndexCard && i === 0;
    const f = o.mix ? o.mix[i % o.mix.length] : o.filter;
    const base = (w: WindowDef) =>
      !o.excludeWindows.has(w.id) &&
      !symbols.has(w.symbol) &&
      (wantIndex ? o.indexSymbols.has(w.symbol) : !o.indexSymbols.has(w.symbol));
    let pool = all.filter((w) => base(w) && (!f || matchesFilter(w, f)));
    if (!pool.length && f && Object.keys(f).length) {
      pool = all.filter(base);
      if (!o.mix) relaxed = true;
    }
    if (!pool.length && wantIndex)
      pool = all.filter(
        (w) => !o.excludeWindows.has(w.id) && !symbols.has(w.symbol) && !o.indexSymbols.has(w.symbol),
      );
    if (!pool.length) break;
    const w = pickOne(pool, rng);
    out.push(w);
    symbols.add(w.symbol);
  }
  return { windows: out, relaxed };
}
