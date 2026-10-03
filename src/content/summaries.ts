/**
 * One-glance summaries for shop cards and the loadout: WHEN it fires and what you GET, plus the
 * catch if there is one. The full rules text stays on each definition (and in the hover tooltip);
 * these exist so a card reads in a second, Balatro style, without a paragraph.
 */

import type { AnalystId, Family, MemoId, VoucherId } from './types';

/** What kind of reward a card gives; picks the badge color and glyph. */
export type EffectKind =
  'chips' | 'mult' | 'xmult' | 'cash' | 'calm' | 'info' | 'exec' | 'risk' | 'shield' | 'boost';

export interface Summary {
  when: string;
  get: string;
  kind: EffectKind;
  /** The downside, when there is one. */
  catch?: string;
}

export const EFFECT_GLYPH: Record<EffectKind, string> = {
  chips: '◆',
  mult: '✚',
  xmult: '✖',
  cash: '$',
  calm: '♥',
  info: '◉',
  exec: '⇄',
  risk: '▲',
  shield: '⛨',
  boost: '★',
};

export const EFFECT_LABEL: Record<EffectKind, string> = {
  chips: 'CHIPS',
  mult: 'MULT',
  xmult: 'X MULT',
  cash: 'CASH',
  calm: 'STRESS',
  info: 'INTEL',
  exec: 'FILLS',
  risk: 'RISK CAP',
  shield: 'SAFETY',
  boost: 'BOOST',
};

export const CARTRIDGE_SUMMARY: Record<string, Summary> = {
  theta_engine: { when: 'Short premium open and in profit', get: '+3 chips a day', kind: 'chips' },
  fifty_percent_club: { when: 'Close a credit trade at 50%+ profit, early', get: '+3 mult', kind: 'mult' },
  weekend_warrior: { when: 'Short premium held over a weekend', get: '+15 chips', kind: 'chips' },
  twenty_one_day_rule: {
    when: 'Close or roll a winner with 21 days or less left',
    get: '+2 mult',
    kind: 'mult',
    catch: 'Winners held into the last 7 days: −1 mult',
  },
  credit_where_due: { when: 'Credit is 1/3 of the width or more', get: '+2 mult', kind: 'mult' },
  ladder_up: {
    when: 'Each winning credit spread in a row',
    get: '+1 mult, stacking',
    kind: 'mult',
    catch: 'A loss resets it',
  },
  premium_printer: { when: 'Theta Engine trade closed at 50%+ profit', get: 'Its chips ×3', kind: 'xmult' },
  iv_crusher: { when: 'Sold at IV rank 50+, then IV falls 20%', get: '×2', kind: 'xmult' },
  vol_arb: {
    when: 'Opened while IV beats actual moves by 5+',
    get: '+2 mult (and shows IV−HV)',
    kind: 'mult',
  },
  long_gamma: { when: 'Straddle or strangle beats the expected move', get: '×1.5', kind: 'xmult' },
  term_structure_tap: { when: 'Calendar with front IV above back IV', get: '+3 mult', kind: 'mult' },
  crush_it: { when: 'Short premium through earnings, stock stays inside the move', get: '×3', kind: 'xmult' },
  earnings_sniper: {
    when: 'Long straddle held through earnings',
    get: '+100 chips × move / implied',
    kind: 'chips',
  },
  earnings_whisper: { when: 'Always', get: 'Earnings dates and implied moves', kind: 'info' },
  fed_watcher: {
    when: 'Close green the day after a Fed or CPI day',
    get: '+2 mult (and flags those days)',
    kind: 'mult',
  },
  dividend_radar: {
    when: 'A covered call collects a dividend',
    get: '+40 chips (and warns before ex-div)',
    kind: 'chips',
  },
  trend_rider: { when: 'Trade points with the 50-day trend', get: '+1 mult', kind: 'mult' },
  contrarian: { when: 'Right call against the 5-day trend', get: 'Call bonus ×2', kind: 'xmult' },
  bollinger_bouncer: { when: 'Short strike outside the Bollinger Band', get: '+30 chips', kind: 'chips' },
  rsi_radar: { when: 'Bear call won from RSI 70+, or bull put from RSI 30−', get: '+2 mult', kind: 'mult' },
  macd_cross: { when: 'Enter within 2 days of a MACD cross your way', get: '+1 mult', kind: 'mult' },
  gamma_scalper: { when: 'Right "big move" call', get: 'Call bonus ×2', kind: 'xmult' },
  diagonal_drift: { when: 'Diagonal pointed with the trend', get: '+1 mult', kind: 'mult' },
  stop_discipline: {
    when: 'Close a loser at or before its stop',
    get: 'Refund 30% of the lost chips',
    kind: 'shield',
    catch: 'Declining a stop: +10 stress',
  },
  iron_stomach: { when: 'Always', get: 'Stress gains halved', kind: 'calm' },
  patience_pays: {
    when: 'Each skipped round or unused ticket',
    get: '+1 mult on your next winner (max +3)',
    kind: 'mult',
  },
  roll_artist: { when: 'Each roll for a net credit', get: '+1 mult for the round', kind: 'mult' },
  right_sized: { when: 'Risking 3% of equity or less', get: '+25 chips', kind: 'chips' },
  breakout_insurance: {
    when: 'First gap through a short strike each round',
    get: 'Counts half',
    kind: 'shield',
  },
  level_ii_feed: { when: 'Limit orders', get: 'Fill 15% closer to mid', kind: 'exec' },
  smart_router: { when: 'Market orders', get: 'Pay 75% of the spread, not all', kind: 'exec' },
  legging_pro: { when: 'Rolls and adjustments', get: 'No extra slippage', kind: 'exec' },
  portfolio_margin: { when: 'Always', get: 'Risk cap +25%', kind: 'risk' },
  edge_hunter: { when: 'Edge Rank top 10%', get: '×2 instead of ×1.5', kind: 'xmult' },
  compound_interest: { when: 'Interest after each round', get: 'Cap +$5', kind: 'cash' },
  bonus_pool: { when: 'Every 100 points over the target', get: '+$1', kind: 'cash' },
  expense_account: { when: 'Shop rerolls', get: '$1 cheaper', kind: 'cash' },
  golden_parachute: {
    when: 'A failed round or a Max-Loss breach',
    get: 'Survive it, once',
    kind: 'shield',
    catch: 'Then it breaks',
  },
  two_x_leverage: {
    when: 'Always',
    get: 'Meter ×2, gains and losses',
    kind: 'xmult',
    catch: 'Max-Loss Line 2% tighter',
  },
  bag_holder: {
    when: 'Every winner',
    get: '+3 mult',
    kind: 'mult',
    catch: "Losers can't close before expiry",
  },
  meme_energy: {
    when: 'Winners on names with IV over 60%',
    get: '×2',
    kind: 'xmult',
    catch: '+10 stress per trade',
  },
  rivals_bet: { when: "Outscore Bradley's ghost this round", get: '+$10', kind: 'cash', catch: 'Lose: −$5' },
  the_wheel: { when: 'Covered call after a put assignment', get: '×1.5', kind: 'xmult' },
  covered_and_chill: { when: 'Covered call expires out of the money', get: '+2 mult', kind: 'mult' },
  assignment_artist: { when: 'You get assigned', get: '+50 chips, no stress', kind: 'chips' },
  delta_neutral: {
    when: 'Portfolio delta under 5 at every close',
    get: '+1 mult for the round',
    kind: 'mult',
  },
  wing_clipper: { when: 'Condor shorts both outside the expected move', get: '+40 chips', kind: 'chips' },
  pin_master: { when: 'Iron fly expires within 1% of its center', get: '×4', kind: 'xmult' },
  straddle_stack: { when: 'Each straddle this round', get: '+1 mult to the next one (max +2)', kind: 'mult' },
  double_time: { when: 'Double calendars', get: '+2 mult', kind: 'mult' },
};

export const ANALYST_SHORT: Record<AnalystId, string> = {
  quant: 'IV rank on every card',
  vol_surfer: 'Implied against actual volatility',
  earnings_whisperer: 'Earnings dates and past reactions',
  chartist: 'Nine more chart studies',
  skew_doctor: 'Which side is richer to sell',
  macro_desk: 'Market, VIX and the Fed calendar',
  ghost: 'How often a strike this far held',
  scout: 'Sector and size, +1 reroll',
  risk_officer: 'Portfolio Greeks and risk warnings',
};

export const MEMO_KIND: Record<MemoId, EffectKind> = {
  reroll: 'boost',
  extra_ticket: 'boost',
  time_skip: 'info',
  roll_voucher: 'exec',
  vacation: 'calm',
  lens: 'info',
  hedge: 'shield',
  analyst_loan: 'info',
  due_diligence: 'info',
  double_down: 'xmult',
  compliance_waiver: 'risk',
};

export const VOUCHER_KIND: Record<VoucherId, EffectKind> = {
  second_monitor: 'boost',
  terminal_pro: 'boost',
  prime_broker: 'boost',
  dma: 'exec',
  margin_upgrade: 'risk',
  algo_execution: 'exec',
  research_budget: 'boost',
  clearance: 'cash',
  seed_capital: 'cash',
  risk_committee: 'shield',
};

export const MEMO_WHEN: Record<'lineup' | 'anytime' | 'before_clock', string> = {
  lineup: 'On the lineup',
  anytime: 'Anytime',
  before_clock: 'Before the clock starts',
};

export const FAMILY_GLYPH: Record<Family, string> = {
  THETA: 'Θ',
  VEGA: 'ν',
  DELTA: 'Δ',
  DISC: '✓',
  EXEC: '⇄',
  EVENT: '◷',
  ECON: '$',
  CHAOS: '☢',
};
