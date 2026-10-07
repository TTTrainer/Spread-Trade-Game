/**
 * The player's profile: career XP, Bonus (the meta currency) and everything it buys. Plain JSON,
 * stored in user.db. Every change is a pure function returning a new profile, so the rules are
 * tested without the UI. Purchases are final (no undo), like everything else in the game.
 */

import { CARTRIDGES } from '../../content/cartridges';
import { DESKS, DESK_ORDER } from '../../content/desks';
import {
  CARTRIDGE_PACKS,
  COLLECTIONS,
  COSMETIC_BY_ID,
  COSMETICS,
  HEAT_MILESTONES,
  PACKED_CARTRIDGES,
  PAD_TIERS,
  RANKS,
  SETUP_TRACKS,
  collectionPrice,
  deskDiscount,
  padPerks,
  rankFor,
  type CollectionId,
  type CosmeticDef,
  type PadPerk,
  type SetupTrack,
} from '../../content/meta';
import { RISK_TIERS } from '../../content/tiers';
import type { DeskId } from '../../content/types';

export interface DailyResult {
  points: number;
  ghost: number;
  outcome: string;
  roundsCleared: number;
}

export interface ContractResult {
  filled: boolean;
  realizedCents: number;
  bonus: number;
  /** The trade is placed but still running. Leaving now forfeits the contract. */
  open?: boolean;
}

export interface Profile {
  version: 1;
  xp: number;
  /** Spendable Bonus. */
  bonus: number;
  /** Lifetime Bonus earned. */
  bonusEarned: number;
  desks: DeskId[];
  packs: string[];
  /** Highest Risk Tier the player may pick (beating a tier unlocks the next). */
  maxTier: number;
  /** Best Risk Tier cleared (a whole year) on each desk. */
  tierCleared: Partial<Record<DeskId, number>>;
  /** Best Heat of a cleared year. */
  heatBest: number;
  pad: {
    tier: number;
    items: string[];
    setup: Record<SetupTrack, number>;
    /** Desk items on display (up to six). */
    deskItems: string[];
  };
  /** Cosmetics bought with Bonus (rank, heat, tier and tutorial unlocks are computed). */
  cosmetics: string[];
  /** Runs already paid out, so a run that continues into Endless is only paid the difference. */
  paidRuns: Record<string, { xp: number; bonus: number }>;
  paidAchievements: string[];
  daily: {
    streak: number;
    bestStreak: number;
    lastDate: string | null;
    results: Record<string, DailyResult>;
  };
  contracts: { week: string; done: Record<string, ContractResult> };
  tutorialDone: boolean;
}

export function defaultProfile(): Profile {
  return {
    version: 1,
    xp: 0,
    bonus: 0,
    bonusEarned: 0,
    desks: ['income', 'verticals'],
    packs: [],
    maxTier: 0,
    tierCleared: {},
    heatBest: 0,
    pad: {
      tier: 0,
      items: [],
      setup: { desk: 0, monitors: 0, chair: 0, plants: 0, lighting: 0 },
      deskItems: [],
    },
    cosmetics: [],
    paidRuns: {},
    paidAchievements: [],
    daily: { streak: 0, bestStreak: 0, lastDate: null, results: {} },
    contracts: { week: '', done: {} },
    tutorialDone: false,
  };
}

/** Merge a saved profile over the defaults so new fields get sane values after updates. */
export function mergeProfile(saved: unknown): Profile {
  const d = defaultProfile();
  const s = (saved ?? {}) as Partial<Profile>;
  const setup = { ...d.pad.setup, ...s.pad?.setup };
  // Tracks change length between versions (1.5 re-cut the plants and lights to the new art).
  for (const t of Object.keys(SETUP_TRACKS) as SetupTrack[])
    setup[t] = Math.max(0, Math.min(SETUP_TRACKS[t].levels.length - 1, Math.floor(setup[t] || 0)));
  const deskValues = new Set(COSMETICS.filter((c) => c.kind === 'deskitem').map((c) => c.value));
  return {
    ...d,
    ...s,
    // Income and Verticals are free from the start (Income cost 100 Bonus before 1.8.2).
    desks: DESK_ORDER.filter((d) => d === 'income' || d === 'verticals' || (s.desks ?? []).includes(d)),
    pad: {
      ...d.pad,
      ...s.pad,
      setup,
      deskItems: (s.pad?.deskItems ?? []).filter((v) => deskValues.has(v)).slice(0, DESK_ITEM_LIMIT),
    },
    daily: { ...d.daily, ...s.daily, results: { ...s.daily?.results } },
    contracts: { ...d.contracts, ...s.contracts, done: { ...s.contracts?.done } },
    tierCleared: { ...s.tierCleared },
    paidRuns: { ...s.paidRuns },
    version: 1,
  };
}

export type Buy = { ok: true; profile: Profile } | { ok: false; reason: string };

const fail = (reason: string): Buy => ({ ok: false, reason });

function spend(p: Profile, cost: number, change: (q: Profile) => void): Buy {
  if (cost > p.bonus) return fail(`You need ${cost} Bonus (you have ${p.bonus}).`);
  const q = structuredClone(p);
  q.bonus -= cost;
  change(q);
  return { ok: true, profile: q };
}

export function rankOf(p: Profile): number {
  return rankFor(p.xp).rank;
}

export function nextRank(p: Profile) {
  const r = rankOf(p);
  return RANKS[r + 1] ?? null;
}

// ---------------- desks ----------------

export function deskPrice(p: Profile, desk: DeskId): number {
  return Math.round(DESKS[desk].unlockCost * (1 - deskDiscount(rankOf(p))));
}

export function unlockDesk(p: Profile, desk: DeskId): Buy {
  if (p.desks.includes(desk)) return fail('Already unlocked.');
  return spend(p, deskPrice(p, desk), (q) => {
    q.desks = DESK_ORDER.filter((d) => d === desk || q.desks.includes(d));
  });
}

// ---------------- cartridge packs ----------------

export function packUnlocked(p: Profile, packId: string): boolean {
  const pack = CARTRIDGE_PACKS.find((x) => x.id === packId);
  return !!pack && (p.packs.includes(packId) || rankOf(p) >= pack.rank);
}

export function buyPack(p: Profile, packId: string): Buy {
  const pack = CARTRIDGE_PACKS.find((x) => x.id === packId);
  if (!pack) return fail('No such pack.');
  if (packUnlocked(p, packId)) return fail('Already unlocked.');
  return spend(p, pack.bonus, (q) => q.packs.push(packId));
}

/** Cartridge ids the shop may offer this player (the base pool plus unlocked packs). */
export function cartridgePoolFor(p: Profile): string[] {
  const open = new Set(CARTRIDGE_PACKS.filter((x) => packUnlocked(p, x.id)).flatMap((x) => x.cartridges));
  return CARTRIDGES.filter((c) => !PACKED_CARTRIDGES.has(c.id) || open.has(c.id)).map((c) => c.id);
}

// ---------------- The Pad ----------------

export function buyPadTier(p: Profile): Buy {
  const next = PAD_TIERS[p.pad.tier + 1];
  if (!next) return fail('You already own the top floor.');
  if (rankOf(p) < next.rank) return fail(`The ${next.name} needs the rank of ${RANKS[next.rank].name}.`);
  return spend(p, next.cost, (q) => {
    q.pad.tier = next.tier;
  });
}

export function nextCollectionPrice(p: Profile, col: CollectionId): number {
  const owned = COLLECTIONS[col].items.filter((i) => p.pad.items.includes(i.id)).length;
  return collectionPrice(col, owned);
}

export function buyCollectionItem(p: Profile, col: CollectionId, itemId: string): Buy {
  const item = COLLECTIONS[col].items.find((i) => i.id === itemId);
  if (!item) return fail('No such item.');
  if (p.pad.items.includes(itemId)) return fail('Already in your collection.');
  if (item.retired) return fail('No longer for sale.');
  return spend(p, nextCollectionPrice(p, col), (q) => q.pad.items.push(itemId));
}

export function buySetup(p: Profile, track: SetupTrack): Buy {
  const lv = p.pad.setup[track];
  const next = SETUP_TRACKS[track].levels[lv + 1];
  if (!next) return fail('Already maxed out.');
  return spend(p, next.cost, (q) => {
    q.pad.setup[track] = lv + 1;
  });
}

/** How many desk items fit on the desk at once. */
export const DESK_ITEM_LIMIT = 6;

/** Put a desk item on display or take it off (at most six at once). */
export function toggleDeskItem(p: Profile, value: string): Buy {
  const c = COSMETICS.find((x) => x.kind === 'deskitem' && x.value === value);
  if (!c || !cosmeticUnlocked(p, c)) return fail('You do not own that yet.');
  const q = structuredClone(p);
  if (q.pad.deskItems.includes(value)) q.pad.deskItems = q.pad.deskItems.filter((x) => x !== value);
  else {
    if (q.pad.deskItems.length >= DESK_ITEM_LIMIT)
      return fail('The desk holds six items. Take one off first.');
    q.pad.deskItems.push(value);
  }
  return { ok: true, profile: q };
}

export function perksFor(p: Profile): PadPerk {
  return padPerks(p.pad.tier);
}

// ---------------- cosmetics ----------------

export function cosmeticUnlocked(p: Profile, c: CosmeticDef): boolean {
  const u = c.unlock;
  switch (u.kind) {
    case 'free':
      return true;
    case 'rank':
      return rankOf(p) >= u.rank;
    case 'bonus':
      return p.cosmetics.includes(c.id);
    case 'heat':
      return p.heatBest >= u.heat;
    case 'tutorial':
      return p.tutorialDone;
    case 'tier':
      return Object.values(p.tierCleared).some((t) => (t ?? -1) >= u.tier);
  }
}

export function buyCosmetic(p: Profile, id: string): Buy {
  const c = COSMETIC_BY_ID[id];
  if (!c) return fail('No such cosmetic.');
  if (c.unlock.kind !== 'bonus') return fail('This one cannot be bought.');
  if (p.cosmetics.includes(id)) return fail('Already owned.');
  return spend(p, c.unlock.cost, (q) => q.cosmetics.push(id));
}

export function unlockedCosmetics(p: Profile): CosmeticDef[] {
  return COSMETICS.filter((c) => cosmeticUnlocked(p, c));
}

// ---------------- rewards ----------------

export interface RunReward {
  id: string;
  mode: string;
  desk: DeskId;
  tier: number;
  heat: number;
  outcome: string;
  xp: number;
  bonus: number;
}

/**
 * Pay a finished run into the profile. Paid once per run id: a run that continues into Endless
 * is paid only the extra when it ends again. Practice runs pay nothing. Clearing the year
 * unlocks the next Risk Tier and records Heat.
 */
export function awardRun(p: Profile, r: RunReward): Profile {
  if (r.mode === 'practice' || r.mode === 'tutorial') return p;
  const q = structuredClone(p);
  const paid = q.paidRuns[r.id] ?? { xp: 0, bonus: 0 };
  const dx = Math.max(0, r.xp - paid.xp);
  const db = Math.max(0, r.bonus - paid.bonus);
  q.xp += dx;
  q.bonus += db;
  q.bonusEarned += db;
  q.paidRuns[r.id] = { xp: Math.max(paid.xp, r.xp), bonus: Math.max(paid.bonus, r.bonus) };
  // Keep the payout ledger small; old runs can't be paid again anyway (their ids are unique).
  const ids = Object.keys(q.paidRuns);
  if (ids.length > 60) for (const id of ids.slice(0, ids.length - 60)) delete q.paidRuns[id];
  const cleared = r.outcome === 'victory' || r.outcome === 'survived';
  if (cleared && r.mode === 'career') {
    q.tierCleared[r.desk] = Math.max(q.tierCleared[r.desk] ?? -1, r.tier);
    if (r.tier >= q.maxTier) q.maxTier = Math.min(8, r.tier + 1);
    q.heatBest = Math.max(q.heatBest, r.heat);
  }
  return q;
}

/** Pay each newly unlocked achievement's Bonus once. */
export function awardAchievements(p: Profile, unlocked: { id: string; bonus: number }[]): Profile {
  const fresh = unlocked.filter((a) => !p.paidAchievements.includes(a.id));
  if (!fresh.length) return p;
  const q = structuredClone(p);
  for (const a of fresh) {
    q.paidAchievements.push(a.id);
    q.bonus += a.bonus;
    q.bonusEarned += a.bonus;
  }
  return q;
}

// ---------------- Daily ----------------

export function dailyKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function prevDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dailyKey(new Date(y, m - 1, d - 1));
}

/** Record today's Daily (the first finish of the day counts) and extend or reset the streak. */
export function recordDaily(p: Profile, key: string, res: DailyResult): Profile {
  if (p.daily.results[key]) return p;
  const q = structuredClone(p);
  q.daily.results[key] = res;
  q.daily.streak = q.daily.lastDate === prevDay(key) ? q.daily.streak + 1 : 1;
  q.daily.bestStreak = Math.max(q.daily.bestStreak, q.daily.streak);
  q.daily.lastDate = key;
  const keys = Object.keys(q.daily.results).sort();
  if (keys.length > 120) for (const k of keys.slice(0, keys.length - 120)) delete q.daily.results[k];
  return q;
}

/** The streak shown today: it breaks if yesterday was missed. */
export function liveStreak(p: Profile, todayKey: string): number {
  const last = p.daily.lastDate;
  if (!last) return 0;
  return last === todayKey || last === prevDay(todayKey) ? p.daily.streak : 0;
}

// ---------------- Contracts ----------------

/** ISO week key (e.g. 2026-W39): the Contracts board changes every Monday. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/**
 * Record a contract. The first record (when the trade is placed) marks it taken; the final one pays
 * its Bonus. A finished contract can't be recorded again.
 */
export function recordContract(p: Profile, week: string, contractId: string, res: ContractResult): Profile {
  const q = structuredClone(p);
  if (q.contracts.week !== week) q.contracts = { week, done: {} };
  const prev = q.contracts.done[contractId];
  if (prev && !prev.open) return p;
  q.contracts.done[contractId] = res;
  const extra = Math.max(0, res.bonus - (prev?.bonus ?? 0));
  q.bonus += extra;
  q.bonusEarned += extra;
  return q;
}

export function contractsDone(p: Profile, week: string): Record<string, ContractResult> {
  return p.contracts.week === week ? p.contracts.done : {};
}

/** Flags the achievements read (kept in the same store as other counters). */
export function profileFlags(p: Profile): Record<string, number> {
  return { padTier: p.pad.tier, tutorialDone: p.tutorialDone ? 1 : 0 };
}

// ---------------- developer mode ----------------

/**
 * Developer mode: every desk, pack, tier, Pad upgrade and cosmetic, top rank and a pile of Bonus.
 * For playtesting only; it is a one-way switch on the profile like any other purchase.
 */
export function unlockEverything(p: Profile): Profile {
  const q = structuredClone(p);
  const top = RANKS[RANKS.length - 1];
  const maxTier = RISK_TIERS[RISK_TIERS.length - 1].tier;
  q.xp = Math.max(q.xp, top.xp);
  q.bonus += 5000;
  q.desks = [...DESK_ORDER];
  q.packs = CARTRIDGE_PACKS.map((x) => x.id);
  q.maxTier = maxTier;
  q.tierCleared = Object.fromEntries(DESK_ORDER.map((d) => [d, maxTier]));
  q.heatBest = Math.max(q.heatBest, ...HEAT_MILESTONES.map((m) => m.heat));
  q.pad.tier = PAD_TIERS[PAD_TIERS.length - 1].tier;
  q.pad.items = [
    ...new Set([
      ...q.pad.items,
      ...Object.values(COLLECTIONS).flatMap((c) => c.items.filter((i) => !i.retired).map((i) => i.id)),
    ]),
  ];
  for (const t of Object.keys(SETUP_TRACKS) as SetupTrack[])
    q.pad.setup[t] = SETUP_TRACKS[t].levels.length - 1;
  q.cosmetics = [
    ...new Set([...q.cosmetics, ...COSMETICS.filter((c) => c.unlock.kind === 'bonus').map((c) => c.id)]),
  ];
  q.tutorialDone = true;
  return q;
}
