import { ACHIEVEMENTS, evaluateAchievements, type AchievementCtx } from '../content/achievements';
import type { DrillRow, RunRow, TradeRow } from '../shared/userData';
import { sfx } from '../audio/sfx';
import { bridge, hasBridge } from './bridge';
import { useApp } from './store/app';

export type Unlocked = Record<string, string>; // id -> ISO date

export async function loadAchievementCtx(): Promise<AchievementCtx> {
  const [trades, runs, drills, flags] = await Promise.all([
    bridge().invoke('user.trades') as Promise<TradeRow[]>,
    bridge().invoke('user.runs') as Promise<RunRow[]>,
    bridge().invoke('user.drills') as Promise<DrillRow[]>,
    bridge().invoke('user.get', 'flags') as Promise<Record<string, number> | null>,
  ]);
  return { trades, runs, drills, flags: flags ?? {} };
}

/** Re-evaluate every achievement, store new unlocks, and announce them. */
export async function checkAchievements(announce = true): Promise<Unlocked> {
  if (!hasBridge()) return {};
  const ctx = await loadAchievementCtx();
  const unlocked = ((await bridge().invoke('user.get', 'achievements')) as Unlocked | null) ?? {};
  const fresh = evaluateAchievements(ctx).filter((a) => a.done && !unlocked[a.def.id]);
  if (!fresh.length) return unlocked;
  const now = new Date().toISOString();
  for (const a of fresh) unlocked[a.def.id] = now;
  await bridge().invoke('user.set', 'achievements', unlocked);
  if (announce) {
    sfx('win');
    for (const a of fresh)
      useApp.getState().toast(`ACHIEVEMENT: ${a.def.name} (+${a.def.bonus} Bonus)`, 'good');
  }
  return unlocked;
}

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;
