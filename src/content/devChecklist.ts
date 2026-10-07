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
  /** A screen outside the run: the paper month, or Settings › Data. */
  screen?: 'live' | 'settingsData';
  /** The Trade Builder: this ticker, the payoff, the full ticker list, or a LEARN OPTIONS lesson. */
  builder?: { ticker?: string; payoff?: boolean; tickers?: boolean; lesson?: string };
  /** Game settings to change first. */
  game?: Partial<Settings['game']>;
}

export type DevVersion = '1.7.0' | '1.8.0' | '1.8.1';

export interface DevCheck {
  id: string;
  group: 'Trade Builder' | 'Learn Options' | 'Bosses' | 'Month menu' | 'Tutorial' | 'Trading';
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
    id: 'learn-start',
    group: 'Learn Options',
    ver: '1.8.0',
    title: 'The course from the top',
    look: 'Go through the 13 lessons as if teaching a friend. Short and clear? Does each trade it sets up (call, put, short put, bull put, condor) show what the text says?',
    setup: { builder: { lesson: 'what' } },
  },
  {
    id: 'learn-quiz',
    group: 'Learn Options',
    ver: '1.8.0',
    title: 'A lesson with a question',
    look: 'NEXT waits for your answer, and the explanation teaches whether you were right or wrong. Are the questions fair?',
    setup: { builder: { lesson: 'call' } },
  },
  {
    id: 'learn-tasks',
    group: 'Learn Options',
    ver: '1.8.0',
    title: 'The hands-on lessons',
    look: "Move the strike, then (next lessons) drag DATE to expiration and slide IV down. The ✓ comes the moment it's done. Does delta, theta and vega click, or is it busywork?",
    setup: { builder: { lesson: 'delta' } },
  },
  {
    id: 'learn-pick',
    group: 'Learn Options',
    ver: '1.8.0',
    title: 'Pick the strike like a pro',
    look: 'EM and S/R are on. Move the short strike until POP reads 75–85%: is it past the expected move and a floor the chart respects?',
    setup: { builder: { lesson: 'pick' } },
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
    ver: '1.7.0',
    title: 'The practice trade',
    look: 'Ines explains a strike, marks a floor or ceiling on the chart and builds a practice trade past it. Is the position spelled out, does the POP bar aim at 80%, and is REROLL where she points?',
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
