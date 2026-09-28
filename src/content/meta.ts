/**
 * Meta-progression content: the career ladder, cartridge packs, The Pad (lifestyle), cosmetics and
 * Compliance Rules. Everything here is outside a run's market: nothing changes prices, fills or
 * events. The Pad's comfort perks are small and capped; Compliance Rules only make runs harder.
 */

import type { DeskId } from './types';

// ---------------- career ladder ----------------

export interface RankDef {
  rank: number;
  name: string;
  xp: number;
  unlocks: string;
}

export const RANKS: RankDef[] = [
  { rank: 0, name: 'Intern', xp: 0, unlocks: 'The Verticals desk and 38 cartridges.' },
  { rank: 1, name: 'Analyst', xp: 150, unlocks: 'Floor Tricks cartridge pack, Amber terminal theme.' },
  { rank: 2, name: 'Associate', xp: 400, unlocks: 'Desk unlocks cost 25% less. Darkwave music.' },
  { rank: 3, name: 'Trader', xp: 800, unlocks: 'Risk Desk Secrets pack. The Loft is for sale.' },
  { rank: 4, name: 'Senior Trader', xp: 1300, unlocks: 'Phosphor terminal theme, Ticker Tape card back.' },
  { rank: 5, name: 'Portfolio Manager', xp: 2000, unlocks: 'Hall of Fame pack. The Penthouse is for sale.' },
  { rank: 6, name: 'Head of Desk', xp: 3000, unlocks: 'Desk unlocks cost 50% less. Aperture-grille CRT.' },
  { rank: 7, name: 'Fund Founder', xp: 4500, unlocks: 'The Orbital Suite is for sale. Gold Foil card back.' },
];

export function rankFor(xp: number): RankDef {
  let r = RANKS[0];
  for (const x of RANKS) if (xp >= x.xp) r = x;
  return r;
}

export function deskDiscount(rank: number): number {
  return rank >= 6 ? 0.5 : rank >= 2 ? 0.25 : 0;
}

// ---------------- cartridge packs ----------------

export interface CartridgePack {
  id: string;
  name: string;
  text: string;
  cartridges: string[];
  /** Unlocks for free at this rank, or earlier for Bonus. */
  rank: number;
  bonus: number;
}

export const CARTRIDGE_PACKS: CartridgePack[] = [
  {
    id: 'floor_tricks',
    name: 'Floor Tricks',
    text: 'Order-flow craft from the old pit: legging, rolling and fading the crowd.',
    cartridges: ['vol_arb', 'contrarian', 'roll_artist', 'legging_pro'],
    rank: 1,
    bonus: 40,
  },
  {
    id: 'risk_desk',
    name: 'Risk Desk Secrets',
    text: 'What the risk desk lets senior people do. Bigger size, stranger rules.',
    cartridges: ['portfolio_margin', 'iron_stomach', 'bag_holder', 'two_x_leverage'],
    rank: 3,
    bonus: 70,
  },
  {
    id: 'hall_of_fame',
    name: 'Hall of Fame',
    text: 'Legends and bad ideas that became legends.',
    cartridges: ['premium_printer', 'golden_parachute', 'meme_energy', 'rivals_bet'],
    rank: 5,
    bonus: 110,
  },
];

export const PACKED_CARTRIDGES = new Set(CARTRIDGE_PACKS.flatMap((p) => p.cartridges));

// ---------------- The Pad ----------------

export interface PadPerk {
  /** Extra shop cash at the start of a run. */
  startCash: number;
  /** Extra lineup rerolls in every Month 1 round. */
  month1Rerolls: number;
  /** Stress taken off at the start of every quarter after the first. */
  quarterStressRelief: number;
}

export const NO_PERKS: PadPerk = { startCash: 0, month1Rerolls: 0, quarterStressRelief: 0 };

export interface PadTier {
  tier: number;
  id: 'studio' | 'loft' | 'penthouse' | 'orbital';
  name: string;
  blurb: string;
  cost: number;
  rank: number;
  perkText: string;
  perk: Partial<PadPerk>;
}

/** Perks stack as you move up (each tier keeps the ones below it). */
export const PAD_TIERS: PadTier[] = [
  {
    tier: 0,
    id: 'studio',
    name: 'Studio',
    blurb: 'One room, one window, one radiator that knocks at 3 a.m.',
    cost: 0,
    rank: 0,
    perkText: 'No perk. It builds character.',
    perk: {},
  },
  {
    tier: 1,
    id: 'loft',
    name: 'Loft',
    blurb: 'Exposed brick, a big window, and a neighbor who DJs.',
    cost: 150,
    rank: 3,
    perkText: '+$2 shop cash at the start of every run.',
    perk: { startCash: 2 },
  },
  {
    tier: 2,
    id: 'penthouse',
    name: 'Penthouse',
    blurb: 'The skyline is your screensaver.',
    cost: 400,
    rank: 5,
    perkText: '+1 lineup reroll in every Month 1 round.',
    perk: { month1Rerolls: 1 },
  },
  {
    tier: 3,
    id: 'orbital',
    name: 'Orbital Suite',
    blurb: 'Low Earth orbit. The market still closes at 4.',
    cost: 1000,
    rank: 7,
    perkText: '-5 stress at the start of every new quarter.',
    perk: { quarterStressRelief: 5 },
  },
];

export function padPerks(tier: number): PadPerk {
  const out = { ...NO_PERKS };
  for (const t of PAD_TIERS)
    if (t.tier <= tier) {
      out.startCash += t.perk.startCash ?? 0;
      out.month1Rerolls += t.perk.month1Rerolls ?? 0;
      out.quarterStressRelief += t.perk.quarterStressRelief ?? 0;
    }
  return out;
}

export type CollectionId = 'art' | 'watches' | 'vehicles';

export interface CollectionItem {
  id: string;
  name: string;
  blurb: string;
  /** Two palette colors the Pad scene draws it with. */
  colors: [string, string];
}

export const COLLECTIONS: Record<
  CollectionId,
  { name: string; base: number; growth: number; items: CollectionItem[] }
> = {
  art: {
    name: 'Art',
    base: 15,
    growth: 1.3,
    items: [
      {
        id: 'art_candle5',
        name: 'Candle No. 5',
        blurb: 'A single green candle on raw canvas.',
        colors: ['#2de2a6', '#10131f'],
      },
      {
        id: 'art_bear',
        name: 'Portrait of a Bear Market',
        blurb: 'Oil on regret.',
        colors: ['#ff4f7b', '#3a1030'],
      },
      {
        id: 'art_theta',
        name: 'Theta at Dusk',
        blurb: 'Time decay, beautifully lit.',
        colors: ['#ffb347', '#3b1d5e'],
      },
      {
        id: 'art_condor',
        name: 'Iron Condor in Flight',
        blurb: 'Four wings, zero directional opinion.',
        colors: ['#47d7ff', '#152040'],
      },
      {
        id: 'art_vix',
        name: 'VIX Spike (Study)',
        blurb: 'A single jagged line. Collectors weep.',
        colors: ['#ff2fd0', '#0d0d20'],
      },
      {
        id: 'art_smile',
        name: 'The Volatility Smile',
        blurb: 'It is not smiling at you.',
        colors: ['#9d7bff', '#1d1340'],
      },
      {
        id: 'art_greeks',
        name: 'Five Greeks',
        blurb: 'Delta, gamma, theta, vega, rho. Rho is in the corner, ignored.',
        colors: ['#f7f06d', '#2a2a14'],
      },
      {
        id: 'art_pin',
        name: 'Pinned at the Strike',
        blurb: 'Tense, minimalist, expires Friday.',
        colors: ['#ff8a3d', '#291606'],
      },
      {
        id: 'art_tape',
        name: 'Endless Tape',
        blurb: 'Ticker symbols scrolling into infinity.',
        colors: ['#6dff8a', '#06200e'],
      },
      {
        id: 'art_gap',
        name: 'Gap Down, 4 A.M.',
        blurb: 'Earnings night, as remembered.',
        colors: ['#5b8cff', '#0a1024'],
      },
      { id: 'art_bull', name: 'Bull, Resting', blurb: 'For once.', colors: ['#3ce07a', '#26142e'] },
      {
        id: 'art_ledger',
        name: 'The Ledger',
        blurb: 'Every trade, in gold leaf. Even that one.',
        colors: ['#e8c15a', '#1a1408'],
      },
    ],
  },
  watches: {
    name: 'Watches',
    base: 25,
    growth: 1.35,
    items: [
      {
        id: 'w_digital',
        name: 'Calculator Watch',
        blurb: 'It can compute a breakeven. Barely.',
        colors: ['#c0c0c0', '#202020'],
      },
      {
        id: 'w_diver',
        name: 'Deep Diver',
        blurb: 'Water resistant to 300 m and one margin call.',
        colors: ['#1f6fff', '#c8d0e0'],
      },
      {
        id: 'w_chrono',
        name: 'Chronograph',
        blurb: 'Times the gap between the open and your first mistake.',
        colors: ['#e0e0e0', '#303040'],
      },
      {
        id: 'w_gold',
        name: 'Gold Dress Watch',
        blurb: 'Tells time. Mostly tells people things.',
        colors: ['#f0c040', '#402a08'],
      },
      {
        id: 'w_skeleton',
        name: 'Skeleton Dial',
        blurb: 'You can see its gamma.',
        colors: ['#d0d8e8', '#101018'],
      },
      {
        id: 'w_moon',
        name: 'Moonphase',
        blurb: 'Tracks the moon, which tracks nothing.',
        colors: ['#2a3aa0', '#e8e0b0'],
      },
      {
        id: 'w_tourbillon',
        name: 'Tourbillon',
        blurb: 'Rotates to cancel gravity. Cannot cancel IV crush.',
        colors: ['#f4f4ff', '#6a5acd'],
      },
      {
        id: 'w_orbital',
        name: 'Orbital Time Standard',
        blurb: 'Synced to the exchange clock from orbit.',
        colors: ['#00e5ff', '#1a0033'],
      },
    ],
  },
  vehicles: {
    name: 'Vehicles',
    base: 60,
    growth: 1.5,
    items: [
      {
        id: 'v_hoverbike',
        name: 'Hover-Bike',
        blurb: 'Two seats, zero wheels, one very loud fan.',
        colors: ['#ff4f7b', '#222233'],
      },
      {
        id: 'v_roadster',
        name: 'Electric Roadster',
        blurb: '0 to 100 faster than an earnings gap.',
        colors: ['#47d7ff', '#101828'],
      },
      {
        id: 'v_skysedan',
        name: 'Sky Sedan',
        blurb: 'For commuting above the traffic and below the regulators.',
        colors: ['#e8e8f0', '#303050'],
      },
      {
        id: 'v_subyacht',
        name: 'Submarine Yacht',
        blurb: 'Goes under when the market does.',
        colors: ['#f0c040', '#0a2a40'],
      },
      {
        id: 'v_jet',
        name: 'Suborbital Jet',
        blurb: 'Tokyo open to London open in one coffee.',
        colors: ['#c0c8ff', '#202040'],
      },
      {
        id: 'v_orbital',
        name: 'Orbital Yacht',
        blurb: 'The last thing money can buy. Then more.',
        colors: ['#ff2fd0', '#0a0a24'],
      },
    ],
  },
};

export const COLLECTION_ORDER: CollectionId[] = ['art', 'watches', 'vehicles'];

/** Collections get pricier as they grow, so money always has somewhere to go. */
export function collectionPrice(col: CollectionId, owned: number): number {
  const c = COLLECTIONS[col];
  return Math.round(c.base * c.growth ** owned);
}

export type SetupTrack = 'monitors' | 'chair' | 'plants' | 'lighting';

export const SETUP_TRACKS: Record<SetupTrack, { name: string; levels: { name: string; cost: number }[] }> = {
  monitors: {
    name: 'Monitors',
    levels: [
      { name: 'One laptop', cost: 0 },
      { name: 'Two monitors', cost: 10 },
      { name: 'Three monitors', cost: 20 },
      { name: 'Four monitors', cost: 35 },
      { name: 'Six-monitor wall', cost: 60 },
    ],
  },
  chair: {
    name: 'Chair',
    levels: [
      { name: 'Folding chair', cost: 0 },
      { name: 'Mesh office chair', cost: 15 },
      { name: 'Racing chair', cost: 30 },
      { name: 'Leather throne', cost: 60 },
    ],
  },
  plants: {
    name: 'Plants',
    levels: [
      { name: 'None', cost: 0 },
      { name: 'Succulent', cost: 5 },
      { name: 'Fern', cost: 10 },
      { name: 'Indoor tree', cost: 25 },
    ],
  },
  lighting: {
    name: 'Lighting',
    levels: [
      { name: 'Fluorescent tube', cost: 0 },
      { name: 'Desk lamp', cost: 10 },
      { name: 'Neon strip', cost: 20 },
      { name: 'Aurora ceiling', cost: 45 },
    ],
  },
};

export const SETUP_ORDER: SetupTrack[] = ['monitors', 'chair', 'plants', 'lighting'];

// ---------------- cosmetics ----------------

export type CosmeticKind = 'theme' | 'cardback' | 'crt' | 'music' | 'deskitem';

export type Unlock =
  | { kind: 'free' }
  | { kind: 'rank'; rank: number }
  | { kind: 'bonus'; cost: number }
  | { kind: 'heat'; heat: number }
  | { kind: 'tutorial' }
  | { kind: 'tier'; tier: number };

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  /** The value stored in Settings when equipped. */
  value: string;
  name: string;
  unlock: Unlock;
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'theme_indigo', kind: 'theme', value: 'indigo', name: 'Neon Indigo', unlock: { kind: 'free' } },
  {
    id: 'theme_amber',
    kind: 'theme',
    value: 'amber',
    name: 'PC-98 Amber',
    unlock: { kind: 'rank', rank: 1 },
  },
  {
    id: 'theme_phosphor',
    kind: 'theme',
    value: 'phosphor',
    name: 'Phosphor Green',
    unlock: { kind: 'rank', rank: 4 },
  },
  {
    id: 'theme_vapor',
    kind: 'theme',
    value: 'vapor',
    name: 'Vapor Audit',
    unlock: { kind: 'heat', heat: 10 },
  },

  {
    id: 'back_standard',
    kind: 'cardback',
    value: 'standard',
    name: 'Desk Standard',
    unlock: { kind: 'free' },
  },
  { id: 'back_ines', kind: 'cardback', value: 'ines', name: "Ines's Notebook", unlock: { kind: 'tutorial' } },
  {
    id: 'back_circuit',
    kind: 'cardback',
    value: 'circuit',
    name: 'Circuit Board',
    unlock: { kind: 'bonus', cost: 30 },
  },
  {
    id: 'back_redacted',
    kind: 'cardback',
    value: 'redacted',
    name: 'Redacted',
    unlock: { kind: 'heat', heat: 3 },
  },
  {
    id: 'back_tape',
    kind: 'cardback',
    value: 'tape',
    name: 'Ticker Tape',
    unlock: { kind: 'rank', rank: 4 },
  },
  {
    id: 'back_hazard',
    kind: 'cardback',
    value: 'hazard',
    name: 'Hazard Stripes',
    unlock: { kind: 'tier', tier: 4 },
  },
  { id: 'back_gold', kind: 'cardback', value: 'gold', name: 'Gold Foil', unlock: { kind: 'rank', rank: 7 } },

  { id: 'crt_scanlines', kind: 'crt', value: 'scanlines', name: 'Scanlines', unlock: { kind: 'free' } },
  { id: 'crt_clean', kind: 'crt', value: 'clean', name: 'Clean LCD', unlock: { kind: 'free' } },
  {
    id: 'crt_aperture',
    kind: 'crt',
    value: 'aperture',
    name: 'Aperture Grille',
    unlock: { kind: 'rank', rank: 6 },
  },
  {
    id: 'crt_rolling',
    kind: 'crt',
    value: 'rolling',
    name: 'Rolling Bar',
    unlock: { kind: 'heat', heat: 6 },
  },

  { id: 'music_synthwave', kind: 'music', value: 'synthwave', name: 'Synthwave', unlock: { kind: 'free' } },
  {
    id: 'music_darkwave',
    kind: 'music',
    value: 'darkwave',
    name: 'Darkwave',
    unlock: { kind: 'rank', rank: 2 },
  },
  {
    id: 'music_chiptune',
    kind: 'music',
    value: 'chiptune',
    name: 'Chiptune',
    unlock: { kind: 'bonus', cost: 25 },
  },

  { id: 'item_mug', kind: 'deskitem', value: 'mug', name: "Ines's Mug", unlock: { kind: 'tutorial' } },
  {
    id: 'item_duck',
    kind: 'deskitem',
    value: 'duck',
    name: 'Rubber Duck',
    unlock: { kind: 'bonus', cost: 10 },
  },
  { id: 'item_bonsai', kind: 'deskitem', value: 'bonsai', name: 'Bonsai', unlock: { kind: 'rank', rank: 3 } },
  { id: 'item_lava', kind: 'deskitem', value: 'lava', name: 'Lava Lamp', unlock: { kind: 'heat', heat: 12 } },
  {
    id: 'item_bell',
    kind: 'deskitem',
    value: 'bell',
    name: 'Closing Bell',
    unlock: { kind: 'bonus', cost: 20 },
  },
  {
    id: 'item_trophy',
    kind: 'deskitem',
    value: 'trophy',
    name: 'Tier 8 Trophy',
    unlock: { kind: 'tier', tier: 8 },
  },
];

export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(
  COSMETICS.map((c) => [c.id, c]),
);

export function cosmeticFor(kind: CosmeticKind, value: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.kind === kind && c.value === value);
}

export function unlockText(u: Unlock): string {
  switch (u.kind) {
    case 'free':
      return 'Free';
    case 'rank':
      return `Reach ${RANKS[u.rank].name}`;
    case 'bonus':
      return `${u.cost} Bonus`;
    case 'heat':
      return `Clear a year at Heat ${u.heat}+`;
    case 'tutorial':
      return 'Finish the tutorial';
    case 'tier':
      return `Clear a year at Risk Tier ${u.tier}`;
  }
}

// ---------------- Compliance Rules (Heat) ----------------

export interface ComplianceMods {
  realism: Partial<Record<'fees' | 'liquidityLimits' | 'taxes' | 'approvalLevels', boolean>>;
  lineDelta: number;
  lineupDelta: number;
  rerollDelta: number;
  targetMult: number;
  startStress: number;
  marketOrdersDisabled: boolean;
  noSkips: boolean;
  noInterest: boolean;
}

export interface ComplianceRule {
  id: string;
  name: string;
  text: string;
  heat: number;
  mods: Partial<ComplianceMods>;
}

export const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: 'fees',
    name: 'Commission Schedule',
    text: 'Fees on ($0.65 per contract per leg).',
    heat: 1,
    mods: { realism: { fees: true } },
  },
  {
    id: 'taxes',
    name: 'The Tax Man',
    text: 'Taxes on (24% of each round’s gain set aside).',
    heat: 1,
    mods: { realism: { taxes: true } },
  },
  {
    id: 'liquidity',
    name: 'Thin Books',
    text: 'Liquidity limits on (10 contracts max, no wide markets).',
    heat: 1,
    mods: { realism: { liquidityLimits: true } },
  },
  {
    id: 'approval',
    name: 'Margin Department',
    text: 'Approval levels on (spreads need $2,000).',
    heat: 1,
    mods: { realism: { approvalLevels: true } },
  },
  {
    id: 'no_market',
    name: 'Best Execution Audit',
    text: 'Market orders disabled. Work limits.',
    heat: 1,
    mods: { marketOrdersDisabled: true },
  },
  {
    id: 'no_skip',
    name: 'Attendance Policy',
    text: 'Rounds cannot be skipped.',
    heat: 1,
    mods: { noSkips: true },
  },
  {
    id: 'no_interest',
    name: 'Hard Budget',
    text: 'No interest on shop cash.',
    heat: 1,
    mods: { noInterest: true },
  },
  {
    id: 'open_floor',
    name: 'Open Floor Plan',
    text: 'Start the run at 25 stress.',
    heat: 1,
    mods: { startStress: 25 },
  },
  {
    id: 'risk_committee',
    name: 'Risk Committee',
    text: 'Max-Loss Line 3% tighter.',
    heat: 2,
    mods: { lineDelta: -0.03 },
  },
  {
    id: 'hiring_freeze',
    name: 'Hiring Freeze',
    text: 'One fewer card in every lineup.',
    heat: 2,
    mods: { lineupDelta: -1 },
  },
  {
    id: 'budget_cuts',
    name: 'Budget Cuts',
    text: 'Two fewer lineup rerolls per round.',
    heat: 2,
    mods: { rerollDelta: -2 },
  },
  { id: 'guidance', name: 'Aggressive Guidance', text: 'Targets +20%.', heat: 2, mods: { targetMult: 1.2 } },
];

export const COMPLIANCE_BY_ID: Record<string, ComplianceRule> = Object.fromEntries(
  COMPLIANCE_RULES.map((r) => [r.id, r]),
);

export function heatOf(ids: readonly string[] | undefined): number {
  return (ids ?? []).reduce((a, id) => a + (COMPLIANCE_BY_ID[id]?.heat ?? 0), 0);
}

export function complianceMods(ids: readonly string[] | undefined): ComplianceMods {
  const out: ComplianceMods = {
    realism: {},
    lineDelta: 0,
    lineupDelta: 0,
    rerollDelta: 0,
    targetMult: 1,
    startStress: 0,
    marketOrdersDisabled: false,
    noSkips: false,
    noInterest: false,
  };
  for (const id of ids ?? []) {
    const m = COMPLIANCE_BY_ID[id]?.mods;
    if (!m) continue;
    Object.assign(out.realism, m.realism ?? {});
    out.lineDelta += m.lineDelta ?? 0;
    out.lineupDelta += m.lineupDelta ?? 0;
    out.rerollDelta += m.rerollDelta ?? 0;
    out.targetMult *= m.targetMult ?? 1;
    out.startStress += m.startStress ?? 0;
    out.marketOrdersDisabled ||= !!m.marketOrdersDisabled;
    out.noSkips ||= !!m.noSkips;
    out.noInterest ||= !!m.noInterest;
  }
  return out;
}

/** Heat milestones (the best Heat of a cleared year) unlock these cosmetics. */
export const HEAT_MILESTONES = COSMETICS.filter((c) => c.unlock.kind === 'heat')
  .map((c) => ({ heat: (c.unlock as { heat: number }).heat, cosmetic: c.id }))
  .sort((a, b) => a.heat - b.heat);

// ---------------- Daily and Contracts ----------------

/** The Daily's desk rotates through every desk, so everyone plays the same challenge. */
export const DAILY_DESKS: DeskId[] = [
  'verticals',
  'income',
  'condor',
  'verticals',
  'volatility',
  'calendar',
  'condor',
];

/** Contracts pay Bonus: a base for filling the request, and more when the trade makes money. */
export const CONTRACTS = {
  perWeek: 5,
  bonusPerCash: 3,
  profitBonusFrac: 0.5,
};
