/**
 * The developer test checklist: things for a playtester to try, each with what to look for and
 * (where it helps) a setup the DEV panel can run in one click. Results and notes are saved on
 * this computer and can be copied out as a list.
 */

import type { BossId } from './bosses';

export interface DevSetup {
  /** Start a fresh Verticals run first (a real one: a missed boss ends it). */
  run?: boolean;
  /** Cash to add (dollars). */
  cash?: number;
  /** Close the month menu. */
  closeMenu?: boolean;
  /** Go straight to this boss's case file. */
  boss?: BossId;
  /** Accept the case file and clear the Review on the spot (to see the rewards). */
  clearReview?: boolean;
}

export interface DevCheck {
  id: string;
  group: 'Month menu' | 'Bosses' | 'Rewards' | 'Run';
  title: string;
  /** What to do and what should happen, in plain words. */
  look: string;
  setup?: DevSetup;
}

const boss = (id: BossId, title: string, look: string): DevCheck => ({
  id: `boss-${id}`,
  group: 'Bosses',
  title,
  look,
  setup: { run: true, closeMenu: true, boss: id },
});

export const DEV_CHECKS: DevCheck[] = [
  {
    id: 'menu-basics',
    group: 'Month menu',
    title: 'The month menu',
    look: 'Shows the three rounds with targets and payouts, the boss card, your build and the exit plan. Enter starts the month; the clock waits until you do.',
    setup: { run: true },
  },
  {
    id: 'menu-reroll',
    group: 'Month menu',
    title: 'Reroll the boss',
    look: 'REROLL BOSS costs $10 the first time, swaps the boss for another, and greys out after one use.',
    setup: { run: true, cash: 30 },
  },
  {
    id: 'menu-plan',
    group: 'Month menu',
    title: 'Change the exit plan',
    look: 'Move Take profit and Stop, start the month, place a trade: its plan uses the new levels. Trades already open keep theirs.',
    setup: { run: true },
  },
  boss(
    'controller',
    'The Controller',
    'Equity, the room above the loss line and every running P/L show SEALED. Brackets still fire; a closed trade shows its result.',
  ),
  boss(
    'margin_clerk',
    'The Margin Clerk',
    'Your risk per trade is half; the builder shows how much is held in reserve.',
  ),
  boss('underwriter', 'The Underwriter', 'A losing trade costs double the points.'),
  boss(
    'landlord',
    'The Landlord',
    'Winners keep 65% of their total mult (the score breakdown shows the cut).',
  ),
  boss(
    'early_retiree',
    'The Early Retiree (duel)',
    'Chad opens his book when the clock starts: a YOU vs CHAD race and his trades under the banner. Finish ahead of his P/L and the round scores x1.5; behind him, x0.75.',
  ),
  boss(
    'tax_man',
    'The Tax Man',
    'A win closed in its first 2 trading days scores 25% less; the trade card counts the days down.',
  ),
  boss('bursar', 'The Bursar', 'Your leftmost cartridge is stamped TUITION and does nothing this round.'),
  boss(
    'allocator',
    'The Allocator',
    'The second goal chip counts structure types (3 needed, a 4th ticket to do it). Missing it fails the Review even with the points.',
  ),
  boss('shell_company', 'The Shell Company', 'Chart studies and IV rank are sealed.'),
  boss(
    'executor',
    'The Executor',
    'Expiries show as "? days" and numbered terms until the trade is open; the chart shows EXP ? instead of the line. Max profit and loss still show.',
  ),
  boss(
    'collector',
    'The Collector',
    'Each loss in a row costs 25% more; the banner shows the next multiplier.',
  ),
  boss(
    'rebalancer',
    'The Rebalancer',
    'Target x1.25 and a YOU vs SPY race on the chart. Behind SPY at the end of the year = survived, not victory.',
  ),
  {
    id: 'boss-fail',
    group: 'Run',
    title: 'Failing a boss ends the run',
    look: 'Take a boss round and miss the target: the run ends (practice runs keep going).',
    setup: { run: true, closeMenu: true, boss: 'underwriter' },
  },
  {
    id: 'rewards-spoils',
    group: 'Rewards',
    title: 'Boss rewards',
    look: 'The tally pays the boss bounty; the shop opens with the spoils (take 1 of 3 free cartridges) and the trophy appears on YOUR DESK.',
    setup: { run: true, closeMenu: true, boss: 'underwriter', clearReview: true },
  },
  {
    id: 'rewards-style',
    group: 'Rewards',
    title: 'Style bonus',
    look: 'Under the boss banner: the style condition with ON TRACK / MET / MISSED. Met at the end of a cleared boss = +$3 in the payouts.',
    setup: { run: true, closeMenu: true, boss: 'landlord' },
  },
  {
    id: 'shop-next-boss',
    group: 'Rewards',
    title: 'Next boss in the shop',
    look: "After a Review, the shop's taskbar names next quarter's boss with its reroll price.",
    setup: { run: true, closeMenu: true, boss: 'underwriter', clearReview: true },
  },
  {
    id: 'run-endless',
    group: 'Run',
    title: 'Endless showdown',
    look: 'After a won year, choose Endless: Year 2 bosses say SHOWDOWN I and their twists are harsher (e.g. losses x2.5).',
  },
];
