/**
 * Art slots: every picture the game can show, with its file name, size and a drawing idea. Jacob
 * (or an artist) uploads PNGs into `assets/art/` with these exact names; the game picks them up
 * at build time and falls back to its code-drawn look for anything missing. The checklist in
 * ASSETS_NEEDED.md is generated from this list (npm run assets:list).
 */

import { ANALYSTS } from './analysts';
import { CARTRIDGES } from './cartridges';
import { CLIENTS } from './clients';
import { DESKS, DESK_ORDER } from './desks';
import { ALL_FAMILIES, FAMILY_NAMES } from './families';
import { MEMOS, TAGS, VOUCHERS } from './items';
import { COSMETICS } from './meta';
import { REVIEWS } from './reviews';
import { ACHIEVEMENTS } from './achievements';
import { STRUCTURES } from '../engine/strategies/structures';

export type ArtCategory =
  | 'cartridge'
  | 'memo'
  | 'voucher'
  | 'analyst'
  | 'tag'
  | 'page'
  | 'review'
  | 'desk'
  | 'client'
  | 'family'
  | 'cardback'
  | 'achievement';

export interface ArtSize {
  w: number;
  h: number;
}

export const ART_SIZES: Record<ArtCategory, ArtSize> = {
  cartridge: { w: 64, h: 64 },
  memo: { w: 64, h: 64 },
  voucher: { w: 64, h: 64 },
  analyst: { w: 64, h: 64 },
  tag: { w: 64, h: 64 },
  page: { w: 64, h: 64 },
  review: { w: 96, h: 96 },
  desk: { w: 256, h: 96 },
  client: { w: 64, h: 64 },
  family: { w: 32, h: 32 },
  cardback: { w: 96, h: 128 },
  achievement: { w: 32, h: 32 },
};

export const ART_CATEGORY_TEXT: Record<ArtCategory, { title: string; where: string; priority: 1 | 2 | 3 }> = {
  cartridge: {
    title: 'Cartridges (the main powerups)',
    where: 'Shop cards, the cartridge rail at the top of a round, tally receipts',
    priority: 1,
  },
  memo: { title: 'Memos (one-use items)', where: 'Shop cards and the memo slots in a round', priority: 1 },
  voucher: {
    title: 'Vouchers (permanent for the run)',
    where: 'Shop cards and the vouchers list',
    priority: 1,
  },
  analyst: {
    title: 'Analysts (information you hire)',
    where: 'Shop cards and the analyst desk',
    priority: 1,
  },
  tag: {
    title: 'Tags (rewards for skipping a round)',
    where: 'The skip button and pending tags',
    priority: 1,
  },
  page: {
    title: 'Playbook Pages (structure level-ups)',
    where: 'Shop cards and the structure cards in the builder',
    priority: 1,
  },
  review: {
    title: 'Reviews (the bosses)',
    where: 'The Review announcement screen and the top bar during a Review',
    priority: 2,
  },
  desk: {
    title: 'Desks (strategy builds)',
    where: 'The desk cards on the Career screen (a wide banner)',
    priority: 2,
  },
  client: { title: 'Clients', where: 'The client card in a round and the Contracts board', priority: 2 },
  family: {
    title: 'Cartridge families (small badges)',
    where: 'Next to family counts and in tooltips',
    priority: 2,
  },
  cardback: {
    title: 'Card backs (cosmetics)',
    where: 'Lineup cards as they deal in, and the Settings preview',
    priority: 3,
  },
  achievement: { title: 'Achievement badges', where: 'The Achievements screen', priority: 3 },
};

/** Drawing ideas. Short on purpose: the item's name and rules are in the checklist too. */
const IDEAS: Record<string, string> = {
  // cartridges
  theta_engine: 'a clock face welded into a car engine, steam rising',
  fifty_percent_club: 'a velvet-rope club door with a big "50%" sign',
  weekend_warrior: 'a calendar page Sat/Sun with a sword through it',
  twenty_one_day_rule: 'a stone tablet carved "21"',
  credit_where_due: 'a hand receiving a glowing credit coin',
  ladder_up: 'a pixel ladder climbing out of a chart',
  premium_printer: 'a money printer spitting option tickets (legendary shine)',
  iv_crusher: 'a hydraulic press flattening a spiky IV line',
  vol_arb: 'a balance scale with two different waves on each side',
  long_gamma: 'a coiled spring with a rocket on top',
  term_structure_tap: 'a beer tap pouring a curved term-structure line',
  crush_it: 'a fist crushing an earnings-report can',
  earnings_sniper: 'a scope crosshair over an "EPS" target',
  earnings_whisper: 'a mouth whispering into an ear, a tiny "EPS" note',
  fed_watcher: 'binoculars aimed at a columned central-bank building',
  dividend_radar: 'a radar screen with a dollar blip',
  trend_rider: 'a surfer riding a rising candle wave',
  contrarian: 'a salmon swimming upstream against arrows',
  bollinger_bouncer: 'a ball bouncing between two curved band lines',
  rsi_radar: 'a dial gauge 0–100 with a needle at 30',
  macd_cross: 'two lines crossing in an X with a spark',
  gamma_scalper: "a barber's razor slicing tiny candles",
  diagonal_drift: 'a paper boat drifting on a diagonal line',
  stop_discipline: 'a red stop sign with a salute',
  iron_stomach: 'an iron-plated stomach, unbothered',
  patience_pays: 'an hourglass filling with coins',
  roll_artist: 'a painter rolling a paint roller across expiry dates',
  right_sized: "a tailor's tape measure around a position box",
  breakout_insurance: 'an insurance shield with a gap arrow bouncing off',
  level_ii_feed: 'a green order-book ladder on a CRT',
  smart_router: 'a network router with glowing arrows',
  legging_pro: 'two legs in trading-floor trousers stepping in sync',
  portfolio_margin: 'a vault door slightly open, glowing',
  edge_hunter: 'a hunting knife with a percent sign on the blade',
  compound_interest: 'a snowball of coins rolling downhill',
  bonus_pool: 'a swimming pool full of bonus chips',
  expense_account: 'a fancy steak dinner on a corporate card',
  golden_parachute: 'a golden parachute (legendary shine)',
  two_x_leverage: 'a crowbar with "2x" stamped on it',
  bag_holder: 'a trader stuck holding a heavy money bag',
  meme_energy: 'a rocket with a cartoon dog in the window',
  rivals_bet: 'two handshake hands, one wearing a signet ring (Bradley)',
  the_wheel: "a ship's wheel made of coins",
  covered_and_chill: 'a beach chair under a stock-share umbrella',
  assignment_artist: 'a paintbrush painting 100 share certificates',
  delta_neutral: 'a perfectly level spirit bubble',
  wing_clipper: 'scissors trimming butterfly wings made of strikes',
  pin_master: 'a bowling pin balanced on a strike line (legendary)',
  straddle_stack: 'a tall stack of V-shaped payoffs',
  double_time: 'two clocks ticking at different speeds',
  // memos
  reroll: 'a pair of dice on a memo slip',
  extra_ticket: 'a torn admission ticket',
  time_skip: 'a fast-forward button on a calendar',
  roll_voucher: 'a coupon with a rolling arrow',
  vacation: 'a beach umbrella on an office desk',
  lens: 'a magnifying glass revealing a sector icon',
  hedge: 'a trimmed garden hedge shaped like a shield',
  analyst_loan: 'a borrowed name badge with a sticky note',
  due_diligence: 'a thick folder stamped "DD"',
  double_down: 'two stacked chips, one glowing',
  compliance_waiver: 'a signed waiver with a rubber stamp',
  // vouchers
  second_monitor: 'two CRT monitors side by side',
  terminal_pro: 'a pro keyboard with a gold key',
  prime_broker: 'a black credit card with a crown',
  dma: 'a lightning bolt straight into an exchange building',
  margin_upgrade: 'a stretching rubber band of money',
  algo_execution: 'a robot arm pressing a BUY key',
  research_budget: 'a stack of reports on a coin pile',
  clearance: 'a price tag slashed in half',
  seed_capital: 'a sprouting seed with a coin leaf',
  risk_committee: 'a committee table with one member winking',
  // analysts (portraits, like the character portraits)
  quant: 'a quant with glasses and a scrolling formula',
  vol_surfer: 'a surfer riding a volatility surface',
  earnings_whisperer: 'a trench-coat figure whispering, collar up',
  chartist: 'a chartist with a ruler and colored pencils',
  skew_doctor: 'a doctor with a stethoscope on a skew curve',
  macro_desk: 'a headset operator with a globe behind',
  ghost: 'a translucent ex-trader ghost holding a coffee',
  scout: 'a scout with binoculars and a sector map',
  risk_officer: 'a stern officer with a clipboard and red pen',
  // tags
  discipline: 'a salute badge',
  analyst_tag: 'a name-badge tag',
  cartridge_tag: 'a tag shaped like a cartridge',
  playbook: 'a tag shaped like a book page',
  investment: 'a tag with a small growing plant',
  double: 'a tag with "x2"',
  reroll_tag: 'a tag with dice',
  calm: 'a tag with a wave and a zen stone',
  // reviews (bosses)
  earnings_gauntlet: 'a gauntlet glove clutching a ticker tape',
  the_fed: 'a looming columned building with glowing eyes',
  the_chop: 'a meat cleaver over a sideways chart',
  trend_train: 'a steam train riding an upward trend line',
  vol_spike: 'a giant spike erupting from a flat line',
  dead_calm: 'a flat sea under a still moon',
  wide_markets: 'a huge gap between two hands reaching',
  assignment_week: 'a stack of assignment notices, stamped',
  gap_risk: 'a cliff with a chart falling off it',
  annual_review: "COMPLY-3000 behind a judge's bench",
  // desks (wide banners)
  verticals: 'two stacked strike lines like a vertical bar, neon',
  income: 'a mailbox stuffed with dividend envelopes',
  condor: 'a condor with iron wings over a range',
  volatility: 'a lightning storm over a price chart',
  calendar: 'a wall calendar with two expiry months circled',
  // card backs
  cardback_standard: 'indigo diagonal stripes with a small neon candlestick emblem',
  cardback_ines: "a page from Ines's notebook: ruled lines and a coffee ring",
  cardback_circuit: 'a green circuit board',
  cardback_redacted: 'a document with black redaction bars',
  cardback_tape: 'scrolling green ticker tape',
  cardback_hazard: 'yellow and black hazard stripes',
  cardback_gold: 'embossed gold foil with a crest',
  // families
  THETA: 'an hourglass',
  VEGA: 'a wave',
  DELTA: 'an arrow',
  DISC: 'a stop sign',
  EXEC: 'a lightning bolt',
  EVENT: 'a calendar with a star',
  ECON: 'a coin',
  CHAOS: 'a dice with a skull',
};

export interface ArtSlot {
  /** File name inside assets/art/ (PNG). */
  file: string;
  key: string;
  category: ArtCategory;
  id: string;
  name: string;
  what: string;
  idea: string;
}

const slot = (category: ArtCategory, id: string, name: string, what: string, ideaKey = id): ArtSlot => ({
  file: `${category}-${id}.png`,
  key: `${category}-${id}`,
  category,
  id,
  name,
  what,
  idea: IDEAS[ideaKey] ?? '',
});

export const ART_SLOTS: ArtSlot[] = [
  ...CARTRIDGES.map((c) => slot('cartridge', c.id, c.name, c.text)),
  ...Object.values(MEMOS).map((m) => slot('memo', m.id, m.name, m.text)),
  ...Object.values(VOUCHERS).map((v) => slot('voucher', v.id, v.name, v.text)),
  ...Object.values(ANALYSTS).map((a) => slot('analyst', a.id, a.name, a.reveals)),
  ...Object.values(TAGS).map((t) =>
    slot(
      'tag',
      t.id,
      t.name,
      t.text,
      t.id === 'analyst'
        ? 'analyst_tag'
        : t.id === 'cartridge'
          ? 'cartridge_tag'
          : t.id === 'reroll'
            ? 'reroll_tag'
            : t.id,
    ),
  ),
  ...Object.values(STRUCTURES)
    .map((s) => slot('page', s.id, `Playbook: ${s.name}`, `Level-up page for the ${s.name}.`))
    .map((s) => ({
      ...s,
      idea: s.idea || `a page with the ${s.name.replace('Playbook: ', '')} payoff shape drawn on it`,
    })),
  ...Object.values(REVIEWS).map((r) => slot('review', r.id, r.name, `${r.filterText} ${r.ruleText}`)),
  ...DESK_ORDER.map((d) => slot('desk', d, DESKS[d].name, DESKS[d].blurb)),
  ...CLIENTS.map((c) => slot('client', c.id, c.name, c.persona)).map((s) => ({
    ...s,
    idea: s.idea || `a portrait of ${s.name}: ${s.what}`,
  })),
  ...ALL_FAMILIES.map((f) => slot('family', f, FAMILY_NAMES[f], `Badge for the ${FAMILY_NAMES[f]} family.`)),
  ...COSMETICS.filter((c) => c.kind === 'cardback').map((c) =>
    slot('cardback', c.value, c.name, 'A card back pattern (the whole card).', `cardback_${c.value}`),
  ),
  ...ACHIEVEMENTS.map((a) => ({
    ...slot('achievement', a.id, a.name, a.text),
    idea: `a small medal for: ${a.text}`,
  })),
];

export const ART_BY_KEY: Record<string, ArtSlot> = Object.fromEntries(ART_SLOTS.map((s) => [s.key, s]));
