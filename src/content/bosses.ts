/**
 * The bosses: one per quarter, each a character riffing on one of the 12 pillars of institutional
 * financial planning. A boss brings a market (one of the Review market types, with its logo) and
 * exactly ONE twist, which blocks one piece of information or one mechanic and shows on the chart.
 * Bosses change the game layer only; prices, volatility, fills and events stay real.
 *
 * Q1-Q3 draw from the ready bosses of pillars 1-11 (no repeats within a year); Q4 is always the
 * Rebalancer. A boss is `ready: false` until its twist is built, and stays out of the draw.
 */

import type { StyleId } from '../engine/run/style';
import type { ReviewId } from './types';

export type BossId =
  | 'controller'
  | 'margin_clerk'
  | 'underwriter'
  | 'landlord'
  | 'early_retiree'
  | 'tax_man'
  | 'bursar'
  | 'allocator'
  | 'shell_company'
  | 'executor'
  | 'collector'
  | 'rebalancer';

/** Information a boss can seal for its round. */
export type SealedInfo = 'studies' | 'ivr' | 'pnl' | 'dte';

/** The single twist a boss applies. */
export type BossTwist =
  | { kind: 'riskCap'; mult: number }
  | { kind: 'lossMult'; mult: number }
  | { kind: 'shortWinTax'; days: number; mult: number }
  | { kind: 'leftCartOff' }
  | { kind: 'hide'; what: SealedInfo[] }
  | { kind: 'lossStreak'; step: number }
  | { kind: 'multCut'; keep: number }
  /** A second goal: open this many different structure types (all of them on a smaller desk). */
  | { kind: 'variety'; count: number }
  /** The year end: a bigger target, and the full victory needs this round to beat SPY. */
  | { kind: 'annual' }
  /** Designed, not built yet (waiting on a design answer or a later phase). */
  | { kind: 'pending' };

export interface BossDef {
  id: BossId;
  pillar: number;
  pillarName: string;
  /** The title the board uses ("The Underwriter"). */
  name: string;
  /** The person behind it, a normal name and job. */
  person: string;
  role: string;
  /** The market it brings: one of the Review market types (its filter and its logo). */
  market: ReviewId;
  twist: BossTwist;
  /** The twist in one plain line. */
  twistText: string;
  /** What it takes away, for the case file and the stamp on the chart. */
  blocks: string;
  /** Its opening line. */
  intro: string;
  /** The board's colors while it's on: accent, plus a dark tint for the backgrounds. */
  palette: { accent: string; tint: string };
  /** The style bonus: extra cash for playing the round this way (shown during the round). */
  style: StyleId;
  ready: boolean;
}

export const BOSSES: Record<BossId, BossDef> = {
  controller: {
    id: 'controller',
    pillar: 1,
    pillarName: 'Know Your Burn',
    name: 'The Controller',
    person: 'Dana Pruitt',
    role: 'Corporate Controller',
    market: 'dead_calm',
    twist: { kind: 'hide', what: ['pnl'] },
    twistText: 'Running P/L and equity are sealed until a trade closes.',
    blocks: 'Your running P/L and equity',
    intro: 'Every dollar has a job. You will find out what yours did at the end of the month.',
    palette: { accent: '#7fd4c1', tint: '#0b2a26' },
    style: 'plan_exits',
    ready: true,
  },
  margin_clerk: {
    id: 'margin_clerk',
    pillar: 2,
    pillarName: 'Emergency Liquidity',
    name: 'The Margin Clerk',
    person: 'Walt Osei',
    role: 'Margin Desk',
    market: 'vol_spike',
    twist: { kind: 'riskCap', mult: 0.5 },
    twistText: 'Half your usual risk per trade. The rest is held in reserve.',
    blocks: 'Half of your risk cap',
    intro: 'Six months of cash, minimum. Until I see it, you trade half size.',
    palette: { accent: '#ffd23e', tint: '#2a2208' },
    style: 'green',
    ready: true,
  },
  underwriter: {
    id: 'underwriter',
    pillar: 3,
    pillarName: 'Risk Management',
    name: 'The Underwriter',
    person: 'Gloria Haines',
    role: 'Senior Underwriter',
    market: 'gap_risk',
    twist: { kind: 'lossMult', mult: 2 },
    twistText: 'Losing trades count double against your score.',
    blocks: 'Cheap losses',
    intro: 'Every loss is a claim. This quarter, claims pay out double.',
    palette: { accent: '#ff5a4f', tint: '#2a0b0e' },
    style: 'no_loser',
    ready: true,
  },
  landlord: {
    id: 'landlord',
    pillar: 4,
    pillarName: 'Real Estate Cap',
    name: 'The Landlord',
    person: 'Rex Delacroix',
    role: 'Property Manager',
    market: 'trend_train',
    twist: { kind: 'multCut', keep: 0.65 },
    twistText: 'Your total mult is cut by 35%: the house takes its share.',
    blocks: '35% of your mult',
    intro: 'Put everything in the house. The house never goes down. I am the house.',
    palette: { accent: '#e39b5b', tint: '#2a1a0b' },
    style: 'three_wins',
    ready: true,
  },
  early_retiree: {
    id: 'early_retiree',
    pillar: 5,
    pillarName: 'Financial Independence',
    name: 'The Early Retiree',
    person: 'Chad Fenwick',
    role: 'Retired at 34',
    market: 'earnings_gauntlet',
    twist: { kind: 'pending' },
    twistText: 'Duel: beat his P/L on the same cards.',
    blocks: 'The cards to yourself',
    intro: 'I quit at thirty-four. Beat my number on your own cards, or keep the day job.',
    palette: { accent: '#4dff9a', tint: '#08261a' },
    style: 'green',
    ready: false,
  },
  tax_man: {
    id: 'tax_man',
    pillar: 6,
    pillarName: 'Tax-Balanced Balance Sheet',
    name: 'The Tax Man',
    person: 'Ira Tolliver',
    role: 'Tax Advisor',
    market: 'assignment_week',
    twist: { kind: 'shortWinTax', days: 2, mult: 0.75 },
    twistText: 'Wins closed in their first 2 trading days score 25% less.',
    blocks: 'Quick flips',
    intro: 'Short-term gains are taxed like a salary. Hold them a little, or pay me.',
    palette: { accent: '#9ad14b', tint: '#16240a' },
    style: 'hold_wins',
    ready: true,
  },
  bursar: {
    id: 'bursar',
    pillar: 7,
    pillarName: 'Education & CapEx Savings',
    name: 'The Bursar',
    person: 'Prudence Vale',
    role: 'Office of the Bursar',
    market: 'the_fed',
    twist: { kind: 'leftCartOff' },
    twistText: 'Your leftmost cartridge is switched off: that is tuition.',
    blocks: 'Your leftmost cartridge',
    intro: 'Tuition is due this quarter. I will be holding your first cartridge until it clears.',
    palette: { accent: '#5aa8ff', tint: '#0a1830' },
    style: 'two_wins',
    ready: true,
  },
  allocator: {
    id: 'allocator',
    pillar: 8,
    pillarName: 'The Portfolio Matrix',
    name: 'The Allocator',
    person: 'MATRIX-8',
    role: 'Allocation engine',
    market: 'the_chop',
    twist: { kind: 'variety', count: 3 },
    twistText: 'Second goal: trade 3 different structure types.',
    blocks: 'One-trick rounds',
    intro: 'Your allocation is a single cell. Diversify, or be rebalanced.',
    palette: { accent: '#c58bff', tint: '#1c0f30' },
    style: 'all_types_green',
    ready: true,
  },
  shell_company: {
    id: 'shell_company',
    pillar: 9,
    pillarName: 'Asset Protection',
    name: 'The Shell Company',
    person: 'Holdings Group LLC',
    role: 'No named officers',
    market: 'wide_markets',
    twist: { kind: 'hide', what: ['studies', 'ivr'] },
    twistText: 'Chart studies and IV rank are sealed for the round.',
    blocks: 'Chart studies and IV rank',
    intro: 'Who owns what is protected information. So is everything else.',
    palette: { accent: '#9aa3b5', tint: '#14161c' },
    style: 'no_stop',
    ready: true,
  },
  executor: {
    id: 'executor',
    pillar: 10,
    pillarName: 'Estate Planning',
    name: 'The Executor',
    person: 'Mortimer Graves',
    role: 'Estate Attorney',
    market: 'earnings_gauntlet',
    twist: { kind: 'hide', what: ['dte'] },
    twistText: 'Days to expiration stay sealed until the trade is open.',
    blocks: 'When your options expire',
    intro: 'The terms are read after the papers are signed. That is how wills work.',
    palette: { accent: '#b9a27a', tint: '#1f1a12' },
    style: 'no_expiry',
    ready: true,
  },
  collector: {
    id: 'collector',
    pillar: 11,
    pillarName: 'Debt Management',
    name: 'The Collector',
    person: 'Vince Moretti',
    role: 'Collections',
    market: 'vol_spike',
    twist: { kind: 'lossStreak', step: 1.25 },
    twistText: 'Losses in a row compound: each one costs 25% more than the last.',
    blocks: 'Shrugging off a losing streak',
    intro: 'Miss one payment, fine. Miss two in a row and the interest starts to compound.',
    palette: { accent: '#ff7ac8', tint: '#2a0b20' },
    style: 'no_streak',
    ready: true,
  },
  rebalancer: {
    id: 'rebalancer',
    pillar: 12,
    pillarName: 'Annual Rebalancing',
    name: 'The Rebalancer',
    person: 'Reba Lancing',
    role: 'Chair of the Board',
    market: 'annual_review',
    twist: { kind: 'annual' },
    twistText: 'Target x1.25, and the full victory needs this round to beat SPY.',
    blocks: 'Coasting into year end',
    intro: 'Once a year we put everything back where it belongs. Including you.',
    palette: { accent: '#ff3ea5', tint: '#24082a' },
    style: 'three_wins',
    ready: true,
  },
};

export const BOSS_IDS = Object.keys(BOSSES) as BossId[];

/** The bosses that can be drawn for Q1-Q3 (pillars 1-11, built). */
export function quarterBossPool(): BossId[] {
  return BOSS_IDS.filter((id) => id !== 'rebalancer' && BOSSES[id].ready);
}
