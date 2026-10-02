/**
 * The boss in play, for the screen: which one, its rule, and whether it is up right now (its case
 * file or its round). Trading screens outside a run (Sandbox, Live, Contracts) never have one.
 */

import { useEffect } from 'react';
import { BOSSES, type BossDef } from '../content/bosses';
import { roundRule, type RoundRule } from '../engine/run/rules';
import type { RunEngine } from '../engine/run/engine';
import { useApp } from './store/app';
import { useRun } from './store/run';

export interface ActiveBoss {
  def: BossDef;
  rule: RoundRule;
}

export function activeBoss(e: RunEngine | null, screen: string): ActiveBoss | null {
  if (!e || screen !== 'run') return null;
  const st = e.state;
  const r = st.round;
  if (!r.bossId || (st.phase !== 'round' && st.phase !== 'review_intro')) return null;
  return { def: BOSSES[r.bossId], rule: roundRule(r.reviewId, r.bossId) };
}

export function useActiveBoss(): ActiveBoss | null {
  useRun((s) => s.version);
  const e = useRun((s) => s.engine);
  const screen = useApp((s) => s.screen);
  return activeBoss(e, screen);
}

/** Is this piece of information sealed by the boss? Returns the boss's name if so. */
export function useSealed(what: 'studies' | 'ivr'): string | null {
  const b = useActiveBoss();
  return b?.rule.hide?.includes(what) ? b.def.name : null;
}

/** While a boss is up, the whole board takes its colors (a data attribute and two CSS colors). */
export function useBossPalette(): void {
  const b = useActiveBoss();
  const id = b?.def.id ?? null;
  useEffect(() => {
    const root = document.documentElement;
    if (!b) {
      delete root.dataset.boss;
      return;
    }
    root.dataset.boss = b.def.id;
    root.style.setProperty('--boss-accent', b.def.palette.accent);
    root.style.setProperty('--boss-tint', b.def.palette.tint);
    return () => {
      delete root.dataset.boss;
    };
  }, [id]);
}
