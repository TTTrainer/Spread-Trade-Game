import { create } from 'zustand';
import {
  awardAchievements,
  awardRun,
  defaultProfile,
  mergeProfile,
  profileFlags,
  type Buy,
  type Profile,
  type RunReward,
} from '../../engine/meta/profile';
import { rankFor } from '../../content/meta';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { useApp } from './app';

interface ProfileStore {
  profile: Profile;
  loaded: boolean;
  load: () => Promise<Profile>;
  /** Apply a purchase or change; saves on success and toasts the reason on failure. */
  apply: (fn: (p: Profile) => Buy) => Promise<boolean>;
  /** Replace the profile (rewards, daily results) and save. */
  set: (fn: (p: Profile) => Profile) => Promise<Profile>;
  awardRun: (r: RunReward) => Promise<void>;
  awardAchievements: (a: { id: string; bonus: number }[]) => Promise<void>;
}

async function save(p: Profile): Promise<void> {
  if (!hasBridge()) return;
  await bridge().invoke('user.set', 'profile', p);
  const flags = ((await bridge().invoke('user.get', 'flags')) as Record<string, number> | null) ?? {};
  await bridge().invoke('user.set', 'flags', { ...flags, ...profileFlags(p) });
}

export const useProfile = create<ProfileStore>((set, get) => ({
  profile: defaultProfile(),
  loaded: false,
  load: async () => {
    if (!hasBridge()) {
      set({ loaded: true });
      return get().profile;
    }
    const p = mergeProfile(await bridge().invoke('user.get', 'profile'));
    set({ profile: p, loaded: true });
    return p;
  },
  apply: async (fn) => {
    if (!get().loaded) await get().load();
    const r = fn(get().profile);
    if (!r.ok) {
      useApp.getState().toast(r.reason, 'warn');
      sfx('error');
      return false;
    }
    set({ profile: r.profile });
    await save(r.profile);
    sfx('coin');
    return true;
  },
  set: async (fn) => {
    if (!get().loaded) await get().load();
    const p = fn(get().profile);
    set({ profile: p });
    await save(p);
    return p;
  },
  awardRun: async (r) => {
    const before = get().profile;
    const after = await get().set((p) => awardRun(p, r));
    const rb = rankFor(before.xp);
    const ra = rankFor(after.xp);
    if (ra.rank > rb.rank) {
      sfx('win');
      useApp.getState().toast(`PROMOTED: ${ra.name}. Unlocked: ${ra.unlocks}`, 'good');
    }
    if (after.maxTier > before.maxTier)
      useApp.getState().toast(`Risk Tier ${after.maxTier} unlocked.`, 'good');
  },
  awardAchievements: async (a) => {
    await get().set((p) => awardAchievements(p, a));
  },
}));
