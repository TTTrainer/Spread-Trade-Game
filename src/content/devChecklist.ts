/**
 * The developer test checklist: what changed since 1.6, each with what to look for and a setup
 * the DEV panel runs in one click to take the playtester straight to it. Results and notes are
 * saved on this computer and SAVE AS FILE writes them out (with the playtest notes) for the dev.
 */

import type { Settings } from '../shared/settings';
import type { BossId } from './bosses';

export interface DevSetup {
  /** Start a fresh Verticals run first (a real one: a missed boss ends it). */
  run?: boolean;
  /** The run's rules (Challenge ids, as in COMPLIANCE_RULES). */
  compliance?: string[];
  /** Cash to add (dollars). */
  cash?: number;
  /** Close the month menu. */
  closeMenu?: boolean;
  /** Go straight to this boss's case file. */
  boss?: BossId;
  /** Accept the case file and clear the Review on the spot (to see the rewards). */
  clearReview?: boolean;
  /** Start the tutorial from its first lesson. */
  tutorial?: boolean;
  /** A screen outside the run: the paper month, Settings › Data, or Career. */
  screen?: 'live' | 'settingsData' | 'career';
  /** The Trade Builder: this ticker, the payoff, the full ticker list, or a LEARN OPTIONS lesson. */
  builder?: { ticker?: string; payoff?: boolean; tickers?: boolean; lesson?: string };
  /** Game settings to change first. */
  game?: Partial<Settings['game']>;
}

export type DevVersion = '1.7.0' | '1.8.0' | '1.8.1' | '1.8.2' | '1.8.3';

export interface DevCheck {
  id: string;
  group:
    | 'Cartridges and payout'
    | 'Trade Builder'
    | 'Learn Options'
    | 'Bosses'
    | 'Month menu'
    | 'Tutorial'
    | 'Trading';
  /** The release it came in. */
  ver: DevVersion;
  title: string;
  /** What to do and what should happen, in plain words. */
  look: string;
  setup?: DevSetup;
}

const boss = (id: BossId, slug: string, title: string, look: string, clearReview = false): DevCheck => ({
  id: `boss-${slug}`,
  group: 'Bosses',
  ver: '1.7.0',
  title,
  look,
  setup: { run: true, closeMenu: true, boss: id, clearReview },
});

export const DEV_CHECKS: DevCheck[] = [
  {
    id: 'shop-objects',
    group: 'Cartridges and payout',
    ver: '1.8.3',
    title: 'The shop as objects',
    look: 'Take the spoils and look at the shop: cartridges, a clipped memo, a coupon, a game manual and an ID badge, text underneath, no boxes. Does buying feel better?',
    setup: { run: true, closeMenu: true, boss: 'underwriter', clearReview: true },
  },
  {
    id: 'shop-later',
    group: 'Cartridges and payout',
    ver: '1.8.3',
    title: 'Spoils you put off keep flashing',
    look: 'Press DECIDE LATER on the spoils: ★ NEW CARTRIDGE · CHOOSE flashes in the taskbar until you take one. With 5 slots full, SELL flashes to make room.',
    setup: { run: true, closeMenu: true, boss: 'underwriter', clearReview: true },
  },
  {
    id: 'run-keys',
    group: 'Trading',
    ver: '1.8.3',
    title: 'Keycap buttons that flash when it matters',
    look: 'SELL, PLAY, NEXT ROUND and BUY are chunky keys that press down (hotkeys too). The one that matters flashes: SELL before your first trade, PLAY once one is placed.',
    setup: { run: true, closeMenu: true },
  },
  {
    id: 'run-icons',
    group: 'Trading',
    ver: '1.8.3',
    title: 'Top bar icons and alarms',
    look: 'Cash, tickets and stress have beveled icons. Stress at 75 or more, and a target slipping out of reach, pulse red.',
    setup: { run: true, closeMenu: true },
  },
  {
    id: 'tb-payoff-col',
    group: 'Trading',
    ver: '1.8.3',
    title: 'The payoff opens in the TRADE column',
    look: 'Build a trade and press PAYOFF: the full graph and its numbers open in the TRADE column and the chart stays. During a LEARN lesson it opens over the chart.',
    setup: { builder: { payoff: true } },
  },
  {
    id: 'cart-row',
    group: 'Cartridges and payout',
    ver: '1.8.2',
    title: 'The Joker Row',
    look: 'Your cartridges along the top as game cartridges, colored by rarity. Build a trade: the ones a win would fire glow and say what they add.',
    setup: { run: true, closeMenu: true },
  },
  {
    id: 'cart-payout',
    group: 'Cartridges and payout',
    ver: '1.8.2',
    title: 'Register, coin, jackpot',
    look: 'Cash out a winner: the receipt prints into CHIPS × MULT, the coin hits each cartridge, the jackpot slams in. Is your eye always in the right place?',
    setup: { run: true, closeMenu: true },
  },
  {
    id: 'cart-numbers',
    group: 'Cartridges and payout',
    ver: '1.8.2',
    title: 'Whole numbers',
    look: 'Chips, points and targets are 10× bigger and whole (2,000 to clear Month 1). Does the jackpot math add up on screen?',
    setup: { run: true, closeMenu: true },
  },
  {
    id: 'career-income',
    group: 'Cartridges and payout',
    ver: '1.8.3',
    title: 'Income desk first',
    look: 'Career lists Income first and picks it by default (Verticals is free too). It remembers the desk you last played.',
    setup: { screen: 'career' },
  },
  {
    id: 'tb-badge',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: "Today's data and the freshness badge",
    look: 'With Schwab connected the badge says ● LIVE in market hours, ✔ CURRENT after the close; otherwise ⚠ OUT OF DATE with how many trading days old. The ticker name sits top-left on the chart.',
    setup: { builder: {} },
  },
  {
    id: 'tb-build',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: 'Build any strategy',
    look: "Try a bull put, iron condor, iron fly, calendar and straddle; change a leg under LEGS (TRADE tab). Do credit, max loss, breakevens and POP match thinkorswim's Analyze tab?",
    setup: { builder: {} },
  },
  {
    id: 'tb-payoff',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: 'The full-size payoff',
    look: "Hover across prices; slide DATE and IV. Can you read breakevens, max profit and loss, today vs expiration and the expected move at a glance? What's missing?",
    setup: { builder: { payoff: true } },
  },
  {
    id: 'tb-studies',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: 'Studies on and off',
    look: 'Toggle BB, EM, 2σ, S/R, SMA, EMA, Keltner, RSI, MACD, ATR and volume in the tray. Are these the studies you use?',
    setup: { builder: {} },
  },
  {
    id: 'tb-copy',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: 'COPY ORDER',
    look: "Press COPY ORDER (Alt+C) and paste it into a note: does it read like thinkorswim's order line, every leg right? Nothing is ever sent.",
    setup: { builder: {} },
  },
  {
    id: 'tb-tickers',
    group: 'Trade Builder',
    ver: '1.8.1',
    title: 'The ticker list: 50 in all',
    look: "ALL lists the game's 25, the 25 added for the builder (QQQ to SHOP) and the four index options. 1.8.0's second 25 (EEM to RDDT) are gone.",
    setup: { builder: { tickers: true } },
  },
  {
    id: 'tb-index',
    group: 'Trade Builder',
    ver: '1.8.1',
    title: 'Index options',
    look: "With Schwab connected, SPX (and XSP, NDX, RUT) load like any ticker, marked CASH-SETTLED. Do strikes and credits match thinkorswim's SPX weeklies? Without Schwab it says so plainly.",
    setup: { builder: { ticker: 'SPX' } },
  },
  {
    id: 'tb-paper',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: 'The paper month',
    look: 'The old Live month, now Trade Builder › PAPER MONTH: it starts 20 trading days back and plays to the latest close.',
    setup: { screen: 'live' },
  },
  {
    id: 'tb-pull',
    group: 'Trade Builder',
    ver: '1.7.0',
    title: 'PULL FROM SCHWAB',
    look: "Run PULL FROM SCHWAB: it saves two years for the builder's tickers and the latest close's chains. Then open a few in the Trade Builder. Any that fail?",
    setup: { screen: 'settingsData' },
  },
  {
    id: 'tb-game-data',
    group: 'Trade Builder',
    ver: '1.8.1',
    title: 'Game data built from Schwab',
    look: "Only if you use it: BUILD GAME DATA FROM SCHWAB, then start a Career run. The lineups deal only the game's 25 tickers (no QQQ, SOFI or SPX).",
    setup: { screen: 'settingsData' },
  },
  {
    id: 'learn-wait',
    group: 'Learn Options',
    ver: '1.8.3',
    title: 'Get paid to wait (the replay)',
    look: 'Drag your line under the floor, SELL, then PLAY the month: a coin for every day no candle touches the line. Fun, or homework? Try another month too.',
    setup: { builder: { lesson: 'wait' } },
  },
  {
    id: 'learn-picture',
    group: 'Learn Options',
    ver: '1.8.3',
    title: 'The same trade as a picture',
    look: "Today's put on the P/L chart, and one question on where it starts losing. Does the picture click after the replay?",
    setup: { builder: { lesson: 'picture' } },
  },
  {
    id: 'learn-pop',
    group: 'Learn Options',
    ver: '1.8.3',
    title: 'Pick a safer line',
    look: 'EM and S/R are on. Move the short strike until POP reads 75–85%: is it past the expected move and under a floor?',
    setup: { builder: { lesson: 'pop' } },
  },
  {
    id: 'learn-cc',
    group: 'Learn Options',
    ver: '1.8.3',
    title: 'The covered call replay',
    look: 'The same game upside down: your call line over the ceiling, and the month plays out. Clear why it is safe when you own the shares?',
    setup: { builder: { lesson: 'cc' } },
  },
  {
    id: 'learn-coached',
    group: 'Learn Options',
    ver: '1.8.3',
    title: 'Your first trade, coached',
    look: "Build a put on today's chart: each checklist step ticks as you do it, then PLAY tests the setup on last month. Does the badge feel earned?",
    setup: { builder: { lesson: 'coached' } },
  },
  {
    id: 'learn-more',
    group: 'Learn Options',
    ver: '1.8.3',
    title: 'More lessons',
    look: 'After the vertical: delta, time decay, IV, the expected move, condors, managing and events. The call and put buying lessons are gone.',
    setup: { builder: { lesson: 'delta' } },
  },
  boss(
    'collector',
    'collector',
    "The Collector's interest notice",
    'Leave a losing trade at or past a strike you sold through a close: an INTEREST NOTICE takes 5% of its risk off your score each day. Costly enough to make you close it?',
  ),
  boss(
    'margin_clerk',
    'margin-clerk',
    'Margin Clerk: the width cap',
    'The Width slider stops at the widest spread whose one contract fits your risk cap.',
  ),
  boss(
    'tax_man',
    'tax-man',
    'Tax Man: the first week',
    'A win closed within its first 5 trading days scores 25% less; the trade card counts the days down.',
  ),
  boss(
    'underwriter',
    'underwriter',
    'Underwriter trophy: 5%',
    "The Review is cleared for you: the bounty pays, and the trophy screen shows the Underwriter's trophy at 5%. A prize worth having?",
    true,
  ),
  boss(
    'shell_company',
    'shell-company',
    'Shell Company trophy: $2 off rerolls',
    'The Review is cleared for you: the trophy takes $2 off every reroll, and the shop prices show it.',
    true,
  ),
  boss(
    'rebalancer',
    'rebalancer',
    'Rebalancer: the bigger race chart',
    'The YOU vs SPY race on the chart is bigger and easy to read while you trade.',
  ),
  boss(
    'early_retiree',
    'early-retiree',
    'Early Retiree: the bigger duel',
    "The YOU vs CHAD race and Chad's trades are bigger and easy to follow.",
  ),
  {
    id: 'menu-emblems',
    group: 'Month menu',
    ver: '1.7.0',
    title: 'Emblems and the deal-in',
    look: 'Each round has an emblem and a name, dealt in like cards. Flashier, and still quick?',
    setup: { run: true },
  },
  {
    id: 'menu-exit',
    group: 'Month menu',
    ver: '1.7.0',
    title: 'The exit plan, shown',
    look: 'Slide Take profit and Stop: the sample spread under YOUR BUILD shows what the plan does. After a few closes, the scorecard shows how your exits went.',
    setup: { run: true },
  },
  {
    id: 'menu-stamps',
    group: 'Month menu',
    ver: '1.7.0',
    title: 'How each trade closed',
    look: 'Close one at its target, take a planned stop, close one by hand: each payout is stamped TARGET BANKED, STOP TAKEN · saved $X or CLOSED BY HAND. Different enough?',
    setup: { run: true, closeMenu: true },
  },
  {
    id: 'tut-practice',
    group: 'Tutorial',
    ver: '1.8.3',
    title: 'Ines teaches a cash-secured put',
    look: 'The tutorial runs on the Income desk: Ines marks a floor and sells a put under it, then you sell your own. Is it clear what happens if it ends under the strike?',
    setup: { tutorial: true },
  },
  {
    id: 'run-rules',
    group: 'Trading',
    ver: '1.7.0',
    title: 'Controls follow the rules',
    look: "Thin Books, Best Execution Audit and Attendance Policy are on: the size slider stops at 10, there's no market order, and no SIT OUT.",
    setup: { run: true, compliance: ['liquidity', 'no_market', 'no_skip'], closeMenu: true },
  },
  {
    id: 'run-cashout',
    group: 'Trading',
    ver: '1.7.0',
    title: 'Cashing out with market orders off',
    look: 'Open two trades. When one hits its target, CASH OUT, then close the other: both go through and nothing gets stuck.',
    setup: { run: true, compliance: ['no_market'], closeMenu: true },
  },
  {
    id: 'run-recap',
    group: 'Trading',
    ver: '1.8.1',
    title: 'One day recap at a time',
    look: "Open a trade and play several days quickly: yesterday's recap leaves before today's arrives, never two stacked.",
    setup: { run: true, closeMenu: true },
  },
];
