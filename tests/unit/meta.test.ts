import { describe, expect, it } from 'vitest';
import { CARTRIDGES } from '../../src/content/cartridges';
import { DESKS } from '../../src/content/desks';
import {
  CARTRIDGE_PACKS,
  COLLECTIONS,
  COMPLIANCE_RULES,
  COSMETICS,
  PACKED_CARTRIDGES,
  PAD_TIERS,
  RANKS,
  collectionPrice,
  complianceMods,
  heatOf,
  padPerks,
  rankFor,
} from '../../src/content/meta';
import {
  awardAchievements,
  awardRun,
  buyCollectionItem,
  buyCosmetic,
  buyPack,
  buyPadTier,
  buySetup,
  cartridgePoolFor,
  cosmeticUnlocked,
  defaultProfile,
  deskPrice,
  liveStreak,
  mergeProfile,
  recordContract,
  recordDaily,
  toggleDeskItem,
  unlockDesk,
  weekKey,
  type Profile,
  type RunReward,
} from '../../src/engine/meta/profile';

const rich = (over: Partial<Profile> = {}): Profile => ({ ...defaultProfile(), bonus: 10_000, ...over });
const reward = (over: Partial<RunReward> = {}): RunReward => ({
  id: 'run-a',
  mode: 'career',
  desk: 'verticals',
  tier: 0,
  heat: 0,
  outcome: 'victory',
  xp: 200,
  bonus: 40,
  ...over,
});

describe('career ladder', () => {
  it('has eight ranks with rising XP and finds the right one', () => {
    expect(RANKS.map((r) => r.name)).toEqual([
      'Intern',
      'Analyst',
      'Associate',
      'Trader',
      'Senior Trader',
      'Portfolio Manager',
      'Head of Desk',
      'Fund Founder',
    ]);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
    expect(rankFor(0).name).toBe('Intern');
    expect(rankFor(RANKS[3].xp).name).toBe('Trader');
    expect(rankFor(RANKS[3].xp - 1).name).toBe('Associate');
    expect(rankFor(1e9).name).toBe('Fund Founder');
  });

  it('pays each run once, and only the extra when an Endless run ends later', () => {
    let p = awardRun(defaultProfile(), reward());
    expect(p.xp).toBe(200);
    expect(p.bonus).toBe(40);
    p = awardRun(p, reward());
    expect(p.bonus).toBe(40);
    p = awardRun(p, reward({ xp: 260, bonus: 55 }));
    expect(p.xp).toBe(260);
    expect(p.bonus).toBe(55);
    expect(p.bonusEarned).toBe(55);
  });

  it('pays nothing for practice runs and the tutorial', () => {
    expect(awardRun(defaultProfile(), reward({ mode: 'practice' })).bonus).toBe(0);
    expect(awardRun(defaultProfile(), reward({ mode: 'tutorial' })).xp).toBe(0);
  });

  it('clearing a year unlocks the next Risk Tier and records Heat; a defeat does not', () => {
    let p = awardRun(defaultProfile(), reward({ outcome: 'defeat' }));
    expect(p.maxTier).toBe(0);
    p = awardRun(p, reward({ id: 'b', outcome: 'survived', heat: 4 }));
    expect(p.maxTier).toBe(1);
    expect(p.heatBest).toBe(4);
    expect(p.tierCleared.verticals).toBe(0);
    p = awardRun(p, reward({ id: 'c', tier: 1 }));
    expect(p.maxTier).toBe(2);
    // Clearing a lower tier again doesn't move it back.
    p = awardRun(p, reward({ id: 'd', tier: 0 }));
    expect(p.maxTier).toBe(2);
    // Daily runs pay but don't unlock tiers.
    p = awardRun(p, reward({ id: 'e', tier: 2, mode: 'daily' }));
    expect(p.maxTier).toBe(2);
    // Tier 8 is the top.
    expect(awardRun(p, reward({ id: 'f', tier: 8 })).maxTier).toBe(8);
  });

  it('pays achievements once', () => {
    let p = awardAchievements(defaultProfile(), [{ id: 'a', bonus: 10 }]);
    p = awardAchievements(p, [
      { id: 'a', bonus: 10 },
      { id: 'b', bonus: 5 },
    ]);
    expect(p.bonus).toBe(15);
    expect(p.paidAchievements).toEqual(['a', 'b']);
  });
});

describe('spending Bonus', () => {
  it('unlocks desks at their price, with the rank discount, and never twice', () => {
    const p = rich();
    expect(deskPrice(p, 'income')).toBe(DESKS.income.unlockCost);
    const r = unlockDesk(p, 'income');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.desks).toEqual(['verticals', 'income']);
    expect(r.profile.bonus).toBe(10_000 - DESKS.income.unlockCost);
    expect(unlockDesk(r.profile, 'income').ok).toBe(false);
    const associate = rich({ xp: RANKS[2].xp });
    expect(deskPrice(associate, 'calendar')).toBe(Math.round(DESKS.calendar.unlockCost * 0.75));
    const head = rich({ xp: RANKS[6].xp });
    expect(deskPrice(head, 'calendar')).toBe(Math.round(DESKS.calendar.unlockCost * 0.5));
  });

  it('refuses a purchase without enough Bonus, leaving the profile unchanged', () => {
    const p = defaultProfile();
    const r = unlockDesk(p, 'condor');
    expect(r.ok).toBe(false);
    expect(p.bonus).toBe(0);
    expect(p.desks).toEqual(['verticals']);
  });

  it('starts with 38 cartridges in the pool; packs open by rank or Bonus', () => {
    expect(PACKED_CARTRIDGES.size).toBe(12);
    for (const id of PACKED_CARTRIDGES) expect(CARTRIDGES.some((c) => c.id === id)).toBe(true);
    // No desk's starting kit is locked away.
    for (const d of Object.values(DESKS))
      for (const c of d.startingCartridges) expect(PACKED_CARTRIDGES.has(c)).toBe(false);
    expect(cartridgePoolFor(defaultProfile())).toHaveLength(38);
    const analyst = defaultProfile();
    analyst.xp = RANKS[1].xp;
    expect(cartridgePoolFor(analyst)).toHaveLength(42);
    const r = buyPack(rich(), 'hall_of_fame');
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(cartridgePoolFor(r.profile)).toEqual(expect.arrayContaining(CARTRIDGE_PACKS[2].cartridges));
    expect(buyPack(analyst, 'floor_tricks').ok).toBe(false);
  });

  it('moves up The Pad in order, gated by rank; perks stack and stay small', () => {
    expect(buyPadTier(rich()).ok).toBe(false); // Loft needs Trader
    const trader = rich({ xp: RANKS[3].xp });
    const r = buyPadTier(trader);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.pad.tier).toBe(1);
    expect(buyPadTier(r.profile).ok).toBe(false); // Penthouse needs Portfolio Manager
    expect(padPerks(0)).toEqual({ startCash: 0, month1Rerolls: 0, quarterStressRelief: 0 });
    expect(padPerks(3)).toEqual({ startCash: 2, month1Rerolls: 1, quarterStressRelief: 5 });
    expect(PAD_TIERS.map((t) => t.cost)).toEqual([0, 150, 400, 1000]);
  });

  it('collections get pricier as they grow', () => {
    expect(COLLECTIONS.art.items).toHaveLength(12);
    expect(COLLECTIONS.watches.items).toHaveLength(8);
    expect(COLLECTIONS.vehicles.items).toHaveLength(6);
    let p = rich();
    const prices: number[] = [];
    for (const it of COLLECTIONS.art.items) {
      const before = p.bonus;
      const r = buyCollectionItem(p, 'art', it.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      prices.push(before - r.profile.bonus);
      p = r.profile;
    }
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    expect(prices[0]).toBe(collectionPrice('art', 0));
    expect(buyCollectionItem(p, 'art', COLLECTIONS.art.items[0].id).ok).toBe(false);
  });

  it('upgrades desk setups one level at a time until maxed', () => {
    let p = rich();
    for (let i = 0; i < 4; i++) {
      const r = buySetup(p, 'monitors');
      expect(r.ok).toBe(true);
      if (r.ok) p = r.profile;
    }
    expect(p.pad.setup.monitors).toBe(4);
    expect(buySetup(p, 'monitors').ok).toBe(false);
  });

  it('cosmetics unlock by rank, Bonus, Heat, tier and the tutorial', () => {
    const p = defaultProfile();
    const byId = (id: string) => COSMETICS.find((c) => c.id === id)!;
    expect(cosmeticUnlocked(p, byId('theme_indigo'))).toBe(true);
    expect(cosmeticUnlocked(p, byId('theme_amber'))).toBe(false);
    expect(cosmeticUnlocked({ ...p, xp: RANKS[1].xp }, byId('theme_amber'))).toBe(true);
    expect(cosmeticUnlocked(p, byId('item_mug'))).toBe(false);
    expect(cosmeticUnlocked({ ...p, tutorialDone: true }, byId('item_mug'))).toBe(true);
    expect(cosmeticUnlocked({ ...p, heatBest: 10 }, byId('theme_vapor'))).toBe(true);
    expect(cosmeticUnlocked({ ...p, tierCleared: { condor: 8 } }, byId('item_trophy'))).toBe(true);
    const bought = buyCosmetic(rich(), 'back_circuit');
    expect(bought.ok && cosmeticUnlocked(bought.profile, byId('back_circuit'))).toBe(true);
    expect(buyCosmetic(rich(), 'theme_amber').ok).toBe(false); // earned, not bought
  });

  it('shows at most four desk items, and only owned ones', () => {
    let p = rich({ tutorialDone: true, xp: RANKS[3].xp, heatBest: 12 });
    for (const id of ['item_duck', 'item_bell']) {
      const r = buyCosmetic(p, id);
      if (r.ok) p = r.profile;
    }
    for (const v of ['mug', 'duck', 'bell', 'bonsai']) {
      const r = toggleDeskItem(p, v);
      expect(r.ok).toBe(true);
      if (r.ok) p = r.profile;
    }
    expect(toggleDeskItem(p, 'lava').ok).toBe(false); // desk full
    const off = toggleDeskItem(p, 'mug');
    expect(off.ok && off.profile.pad.deskItems).toEqual(['duck', 'bell', 'bonsai']);
    expect(toggleDeskItem(defaultProfile(), 'trophy').ok).toBe(false);
  });
});

describe('Compliance Rules', () => {
  it('add Heat and combine their modifiers', () => {
    expect(COMPLIANCE_RULES.length).toBeGreaterThanOrEqual(10);
    expect(heatOf([])).toBe(0);
    expect(heatOf(['fees', 'guidance', 'nope'])).toBe(3);
    const m = complianceMods([
      'fees',
      'risk_committee',
      'hiring_freeze',
      'budget_cuts',
      'guidance',
      'no_skip',
      'open_floor',
    ]);
    expect(m.realism.fees).toBe(true);
    expect(m.lineDelta).toBeCloseTo(-0.03);
    expect(m.lineupDelta).toBe(-1);
    expect(m.rerollDelta).toBe(-2);
    expect(m.targetMult).toBeCloseTo(1.2);
    expect(m.noSkips).toBe(true);
    expect(m.startStress).toBe(25);
    expect(complianceMods(undefined).targetMult).toBe(1);
  });
});

describe('Daily and Contracts bookkeeping', () => {
  it('extends the streak on consecutive days and resets after a gap', () => {
    const res = { points: 100, ghost: 80, outcome: 'victory', roundsCleared: 3 };
    let p = recordDaily(defaultProfile(), '2026-09-26', res);
    p = recordDaily(p, '2026-09-27', res);
    expect(p.daily.streak).toBe(2);
    expect(liveStreak(p, '2026-09-28')).toBe(2);
    expect(liveStreak(p, '2026-09-29')).toBe(0);
    // The first finish of a day counts; a replay doesn't change it.
    expect(recordDaily(p, '2026-09-27', { ...res, points: 999 }).daily.results['2026-09-27'].points).toBe(
      100,
    );
    p = recordDaily(p, '2026-09-30', res);
    expect(p.daily.streak).toBe(1);
    expect(p.daily.bestStreak).toBe(2);
    // Month boundaries count as consecutive.
    const q = recordDaily(recordDaily(defaultProfile(), '2026-09-30', res), '2026-10-01', res);
    expect(q.daily.streak).toBe(2);
  });

  it('keys the Contracts board by ISO week', () => {
    expect(weekKey(new Date(2026, 8, 28))).toBe('2026-W40');
    expect(weekKey(new Date(2026, 8, 27))).toBe('2026-W39');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53');
  });

  it('marks a contract taken when the trade is placed, then pays it once', () => {
    let p = recordContract(defaultProfile(), '2026-W40', 'k1', {
      filled: true,
      realizedCents: 0,
      bonus: 0,
      open: true,
    });
    expect(p.bonus).toBe(0);
    expect(p.contracts.done.k1.open).toBe(true);
    p = recordContract(p, '2026-W40', 'k1', { filled: true, realizedCents: 1200, bonus: 22 });
    expect(p.bonus).toBe(22);
    p = recordContract(p, '2026-W40', 'k1', { filled: true, realizedCents: 1200, bonus: 22 });
    expect(p.bonus).toBe(22);
    // A new week starts a fresh board.
    p = recordContract(p, '2026-W41', 'k2', { filled: false, realizedCents: -500, bonus: 0 });
    expect(Object.keys(p.contracts.done)).toEqual(['k2']);
  });

  it('merges an old or partial saved profile over the defaults', () => {
    const p = mergeProfile({ xp: 50, desks: ['condor'], pad: { tier: 1 } });
    expect(p.desks).toEqual(['verticals', 'condor']);
    expect(p.pad.setup.monitors).toBe(0);
    expect(p.pad.deskItems).toEqual([]);
    expect(p.daily.results).toEqual({});
    expect(mergeProfile(null)).toEqual(defaultProfile());
  });
});
