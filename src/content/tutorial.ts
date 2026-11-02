/**
 * The tutorial's lessons, in order. The desk starts almost empty and each lesson lights up one
 * part of it: the goal first, then one trade step by step, then time, the score, the shop's
 * powerups, the remaining tools and finally the whole desk. Ines says two short sentences per
 * lesson and, where she can, waits for the player to do the thing instead of reading about it.
 * The flow that runs this script is src/ui/tutorial/flow.ts.
 */

/** Parts of the screen a lesson can hide, reveal or point at (selectors live in the flow). */
export type TutRegion =
  | 'goal'
  | 'maxloss'
  | 'stress'
  | 'cash'
  | 'tickets'
  | 'equity'
  | 'clock'
  | 'rail'
  | 'lineup'
  | 'controls'
  | 'client'
  | 'memos'
  | 'seats'
  | 'center'
  | 'charttabs'
  | 'ticker'
  | 'right'
  | 'ifwins'
  | 'analystdesk'
  | 'traytabs'
  | 'structures'
  | 'presets'
  | 'view'
  | 'expires'
  | 'short'
  | 'width'
  | 'size'
  | 'ordertype'
  | 'plan'
  | 'sell'
  | 'win-log'
  | 'win-carts'
  | 'win-build'
  | 'win-analysts'
  | 'win-memos'
  | 'win-pages'
  | 'win-voucher'
  | 'win-loadout';

export const TUT_REGIONS: readonly TutRegion[] = [
  'goal',
  'maxloss',
  'stress',
  'cash',
  'tickets',
  'equity',
  'clock',
  'rail',
  'lineup',
  'controls',
  'client',
  'memos',
  'seats',
  'center',
  'charttabs',
  'ticker',
  'right',
  'ifwins',
  'analystdesk',
  'traytabs',
  'structures',
  'presets',
  'view',
  'expires',
  'short',
  'width',
  'size',
  'ordertype',
  'plan',
  'sell',
  'win-log',
  'win-carts',
  'win-build',
  'win-analysts',
  'win-memos',
  'win-pages',
  'win-voucher',
  'win-loadout',
];

/** Where in the run a lesson belongs. */
export type TutPhase = 'round' | 'tally' | 'shop' | 'review_intro' | 'end';

/**
 * What moves a lesson on: GOT IT, a choice in the bubble, the player moving the strike, a placed
 * trade, a played day, or (for free-play hints) the game moving past the lesson's phase.
 */
export type TutWait = 'next' | 'view' | 'strike' | 'placed' | 'day' | 'phase';

/**
 * Something a lesson sets up as it opens. The practice ones mark a floor or ceiling on the chart
 * and build Ines's example trade beyond it (shown, never placed).
 */
export type TutEnter =
  'simpleChart' | 'emChart' | 'fullChart' | 'briefTab' | 'tradeTab' | 'practiceLevel' | 'practiceTrade';

/** A one-time lesson that interrupts the script the first time something happens. */
export type TutMomentKind = 'recap' | 'decision' | 'closed' | 'stress' | 'endRound';

interface LessonBase {
  id: string;
  /** Spotlight: a region name or a CSS selector. None: the bubble sits alone. */
  target?: TutRegion | string;
  title: string;
  /** Two short sentences. {side} reads "above" or "below" (the side of the line that wins). */
  text: string;
  /** Parts of the screen this lesson turns on (they stay on). '*' turns on everything. */
  reveal?: (TutRegion | '*')[];
  /** Dim everything outside the spotlight (default: on when there is a target). */
  dim?: boolean;
}

export interface TutStep extends LessonBase {
  part: number;
  at: { phase: TutPhase; round: number };
  wait: TutWait;
  enter?: TutEnter;
  /** The clock stays locked while this lesson is up (until the first trade is in). */
  holdClock?: boolean;
  /** Only makes sense before the first trade: skipped once one is placed. */
  beforeTrade?: boolean;
}

export interface TutMoment extends LessonBase {
  when: TutMomentKind;
}

export const TUTORIAL_PARTS = [
  'The goal',
  'Your first trade',
  'Letting time pass',
  'The score',
  'Bonuses and powerups',
  'More tools',
  'More upgrades',
  'The whole desk',
] as const;

const R0 = { phase: 'round', round: 0 } as const;
const R1 = { phase: 'round', round: 1 } as const;
const R2 = { phase: 'round', round: 2 } as const;

export const TUTORIAL_STEPS: TutStep[] = [
  // ---- Part 1: the goal ----
  {
    id: 'welcome',
    part: 1,
    at: R0,
    wait: 'next',
    holdClock: true,
    title: 'Welcome to the desk',
    text: "I'm Ines. I'll show you one thing at a time, so most of the desk is switched off for now. You don't need to know anything about options yet.",
  },
  {
    id: 'goal',
    part: 1,
    at: R0,
    wait: 'next',
    holdClock: true,
    target: 'goal',
    reveal: ['goal'],
    title: 'Your goal: points',
    text: 'Each round has a points target. Winning trades earn points: fill this bar to pass the round.',
  },
  {
    id: 'maxloss',
    part: 1,
    at: R0,
    wait: 'next',
    holdClock: true,
    target: 'maxloss',
    reveal: ['maxloss'],
    title: 'Your safety line',
    text: "This is how much you can lose before the round is over. Win points, stay above the line: that's the whole game.",
  },
  // ---- Part 2: your first trade ----
  {
    id: 'lineup',
    part: 2,
    at: R0,
    wait: 'next',
    holdClock: true,
    target: 'lineup',
    reveal: ['lineup'],
    title: 'Pick a stock',
    text: 'Each card is a real stock at a real moment in history, with its name hidden. The first one is already picked for you.',
  },
  {
    id: 'chart',
    part: 2,
    at: R0,
    wait: 'next',
    holdClock: true,
    enter: 'simpleChart',
    target: 'center',
    reveal: ['center'],
    title: 'Read the chart',
    text: 'Each bar is one day of prices: green closed higher, red closed lower. The right edge is today, and nobody can see past it. Not even you.',
  },
  {
    id: 'spread',
    part: 2,
    at: R0,
    wait: 'next',
    holdClock: true,
    beforeTrade: true,
    title: 'The play: a cash-secured put',
    text: "You SELL a promise: 'if the stock drops under my price, I'll buy it there.' You're paid the moment it fills and keep the cash if it stays above. Think landlord, not gambler.",
  },
  {
    id: 'strikeword',
    part: 2,
    at: R0,
    wait: 'next',
    holdClock: true,
    beforeTrade: true,
    title: "What's a strike?",
    text: "A strike is the price your promise is about. Sell a 25 put and you're saying 'I'll buy it at 25 if it closes under.' Pick a strike the stock won't reach in time, at a price you'd be glad to own it.",
  },
  {
    id: 'level',
    part: 2,
    at: R0,
    wait: 'next',
    enter: 'practiceLevel',
    holdClock: true,
    beforeTrade: true,
    target: 'center',
    title: 'Watch me first',
    text: 'One thing I look for: this stock turned back at about {level}, {touches}. That is a {kind}: prices often respect one, so a strike past it has company.',
  },
  {
    id: 'example',
    part: 2,
    at: R0,
    wait: 'next',
    enter: 'practiceTrade',
    holdClock: true,
    beforeTrade: true,
    target: 'center',
    title: 'My practice trade',
    text: "I sell the {strike} {right}, past the {kind}. It wins if the stock stays {side} {strike}: POP {pop}. If it closes under, I'd buy the shares at {strike}. Not placed.",
  },
  {
    id: 'view',
    part: 2,
    at: R0,
    wait: 'view',
    holdClock: true,
    beforeTrade: true,
    target: 'center',
    title: 'Your turn: up or down?',
    text: 'Which way over the next few weeks? A cash-secured put wins if the stock rises, goes nowhere or dips a little: pick UP. (DOWN sells a covered call instead.)',
  },
  {
    id: 'line',
    part: 2,
    at: R0,
    wait: 'next',
    holdClock: true,
    beforeTrade: true,
    target: 'center',
    reveal: ['view'],
    title: 'Your line',
    text: "You're SELLING the {strike} {right}: the pink line. If the stock stays {side} this line until the end, you keep all the money.",
  },
  {
    id: 'pay',
    part: 2,
    at: R0,
    wait: 'next',
    holdClock: true,
    beforeTrade: true,
    target: '[data-testid="sell-button"]',
    reveal: ['sell'],
    title: 'Paid up front',
    text: 'SELL shows the credit you get now, what the trade risks and POP: the odds you keep money. For a first trade, aim for a POP near 80%.',
  },
  {
    id: 'strike',
    part: 2,
    at: R0,
    wait: 'strike',
    holdClock: true,
    beforeTrade: true,
    target: '[data-testid="strike-handle"]',
    reveal: ['short'],
    title: 'Grab the line',
    text: 'Drag the pink S tag (or the Short Δ slider). Further from the price: higher POP, less credit. Try to land near 80%.',
  },
  {
    id: 'safe',
    part: 2,
    at: R0,
    wait: 'next',
    enter: 'emChart',
    holdClock: true,
    beforeTrade: true,
    target: 'center',
    title: 'Safe or spicy?',
    text: 'Safe: line past the purple EM line (the move the market expects): POP 80%-ish, small credit. Spicy: near the price: more credit, coin-flip odds.',
  },
  {
    id: 'place',
    part: 2,
    at: R0,
    wait: 'placed',
    holdClock: true,
    target: '[data-testid="sell-button"]',
    title: 'Place it',
    text: 'Happy? Press SELL (or Alt+S). The credit lands in your account at once. Yes, before anything happens. Finance is strange.',
  },
  {
    id: 'placed',
    part: 2,
    at: R0,
    wait: 'next',
    target: '.lineup-card.has-open',
    title: "You're in",
    text: 'The card says IN TRADE with your P/L so far. On the chart, the box is your trade: green side wins, red side loses.',
  },
  // ---- Part 3: letting time pass ----
  {
    id: 'clock',
    part: 3,
    at: R0,
    wait: 'day',
    target: 'clock',
    reveal: ['clock'],
    title: 'Play a day',
    text: 'Now let time pass. Press SPACE (or the play button) to play one trading day.',
  },
  {
    id: 'exitplan',
    part: 3,
    at: R0,
    wait: 'next',
    target: '[data-testid="positions-dock"]',
    reveal: ['plan'],
    title: 'Your exit plan',
    text: 'Every trade has a plan: bank the win at half its max profit, cut the loss at 2× the credit. Hit either and the clock stops so you choose.',
  },
  {
    id: 'keep',
    part: 3,
    at: R0,
    wait: 'phase',
    dim: false,
    title: 'Keep going',
    text: "Press SPACE for each day, or pick 2X to let the days roll. I'll speak up when something new happens.",
  },
  // ---- Part 4: the score ----
  {
    id: 'tally',
    part: 4,
    at: { phase: 'tally', round: 0 },
    wait: 'next',
    target: '[data-testid="tally-receipt-0"]',
    dim: false,
    title: 'The tally',
    text: "Each closed trade prints a receipt: chips × mult = points. That's how trading well turns into score. Press CONTINUE when the count is done.",
  },
  {
    id: 'tallygo',
    part: 4,
    at: { phase: 'tally', round: 0 },
    wait: 'phase',
    dim: false,
    title: 'On to the shop',
    text: 'Press CONTINUE to see what the round paid you.',
  },
  // ---- Part 5: bonuses and powerups ----
  {
    id: 'shopcash',
    part: 5,
    at: { phase: 'shop', round: 0 },
    wait: 'next',
    target: '[data-testid="shop-cash-wrap"]',
    reveal: ['win-log'],
    title: 'Shop cash',
    text: 'Passing a round pays shop cash (LAST ROUND shows where it came from). Spend it here on upgrades that last the rest of this run.',
  },
  {
    id: 'carts',
    part: 5,
    at: { phase: 'shop', round: 0 },
    wait: 'next',
    target: 'win-carts',
    reveal: ['win-carts'],
    title: 'Cartridges',
    text: 'Cartridges are powerups: each one changes how your trades score. Hover one to read what it does.',
  },
  {
    id: 'loadout',
    part: 5,
    at: { phase: 'shop', round: 0 },
    wait: 'next',
    target: 'win-loadout',
    reveal: ['win-loadout'],
    title: 'Your desk',
    text: 'Everything you own sits here. When a trade scores, your cartridges fire left to right, so their order matters.',
  },
  {
    id: 'families',
    part: 5,
    at: { phase: 'shop', round: 0 },
    wait: 'next',
    target: 'win-build',
    reveal: ['win-build'],
    title: 'Families',
    text: 'Every cartridge belongs to a family. Own 2, 3 or 4 of the same family and you unlock extra bonuses: that is how builds are born.',
  },
  {
    id: 'buy',
    part: 5,
    at: { phase: 'shop', round: 0 },
    wait: 'phase',
    dim: false,
    title: 'Your call',
    text: 'Buy a cartridge you can afford, or save the cash. Then press NEXT ROUND.',
  },
  // ---- Part 6: more tools ----
  {
    id: 'tickets',
    part: 6,
    at: R1,
    wait: 'next',
    target: 'tickets',
    reveal: ['tickets', 'cash', 'equity'],
    title: 'Tickets',
    text: 'Tickets are how many trades you can open this round. You have more now: try two different stocks.',
  },
  {
    id: 'expires',
    part: 6,
    at: R1,
    wait: 'next',
    target: 'expires',
    reveal: ['expires'],
    title: 'How long',
    text: 'Expires sets how long the trade lasts. Short trades are over fast; longer ones pay more but take more days.',
  },
  {
    id: 'size',
    part: 6,
    at: R1,
    wait: 'next',
    target: 'size',
    reveal: ['size', 'width'],
    title: 'How big',
    text: 'Size is contracts; RISKING shows what one trade can lose. Careful: small, several trades. Bold: size up on your best idea.',
  },
  {
    id: 'brief',
    part: 6,
    at: R1,
    wait: 'next',
    enter: 'briefTab',
    target: 'right',
    reveal: ['right'],
    title: 'The brief',
    text: 'Each stock has a brief: news, earnings dates and how much it usually moves. Earnings can make a stock jump, so be careful holding through them.',
  },
  {
    id: 'payoff',
    part: 6,
    at: R1,
    wait: 'next',
    enter: 'tradeTab',
    target: 'right',
    title: 'The payoff picture',
    text: 'The TRADE tab draws what you make or lose at each price when the trade ends, and the chance it works.',
  },
  {
    id: 'controls',
    part: 6,
    at: R1,
    wait: 'next',
    target: 'controls',
    reveal: ['controls'],
    title: "Don't like the cards?",
    text: 'REROLL deals new stocks. SIT OUT skips the round and pays a small reward instead.',
  },
  {
    id: 'yourturn',
    part: 6,
    at: R1,
    wait: 'phase',
    dim: false,
    reveal: ['traytabs', 'charttabs', 'ticker'],
    title: 'Your turn',
    text: 'Open two trades on two different stocks, then play the round out. I will pop in when something new shows up.',
  },
  // ---- Part 7: more upgrades ----
  {
    id: 'analysts',
    part: 7,
    at: { phase: 'shop', round: 1 },
    wait: 'next',
    target: 'win-analysts',
    reveal: ['win-analysts'],
    title: 'Analysts',
    text: 'Analysts show you more about each stock: earnings dates, volatility, trends. Information, not luck.',
  },
  {
    id: 'memos',
    part: 7,
    at: { phase: 'shop', round: 1 },
    wait: 'next',
    target: 'win-memos',
    reveal: ['win-memos'],
    title: 'Memos',
    text: 'Memos are one-use tricks for a single round, like an extra reroll or a second look.',
  },
  {
    id: 'levels',
    part: 7,
    at: { phase: 'shop', round: 1 },
    wait: 'next',
    target: 'win-pages',
    reveal: ['win-pages', 'win-voucher'],
    title: 'Level ups',
    text: 'Playbook pages make one kind of trade score more. Vouchers are permanent upgrades for the rest of the run.',
  },
  {
    id: 'buy2',
    part: 7,
    at: { phase: 'shop', round: 1 },
    wait: 'phase',
    dim: false,
    title: 'Shop, then go',
    text: 'Pick what helps the way you like to trade, then press NEXT ROUND.',
  },
  // ---- Part 8: the Review and the whole desk ----
  {
    id: 'review',
    part: 8,
    at: { phase: 'review_intro', round: 2 },
    wait: 'next',
    dim: false,
    title: 'A Review',
    text: 'A boss round. COMPLY-3000 sets a rule and deals only stocks that match it. Pass it to finish the year.',
  },
  {
    id: 'rail',
    part: 8,
    at: R2,
    wait: 'next',
    target: 'rail',
    reveal: ['rail', 'seats', 'memos', 'client'],
    title: 'Your powerups in play',
    text: 'The cartridges you bought sit up here. When a trade scores, watch them fire one by one.',
  },
  {
    id: 'ifwins',
    part: 8,
    at: R2,
    wait: 'next',
    target: 'ifwins',
    reveal: ['ifwins', 'analystdesk'],
    title: "What it's worth",
    text: 'Before you trade, this shows the points it scores if it wins and which cartridges it sets off.',
  },
  {
    id: 'everything',
    part: 8,
    at: R2,
    wait: 'next',
    enter: 'fullChart',
    reveal: ['*'],
    title: "That's the whole desk",
    text: 'Trade types, presets, order types and chart studies are all on now. Hover anything to learn what it does. Good luck in the Review.',
  },
  {
    id: 'end',
    part: 8,
    at: { phase: 'end', round: 0 },
    wait: 'next',
    dim: false,
    title: "That's the loop",
    text: "Goal, trade, time, tally, shop, repeat. Ines's Mug is yours. Career is where it counts: every trade lands in your Stats.",
  },
];

export const TUTORIAL_MOMENTS: TutMoment[] = [
  {
    id: 'm-recap',
    when: 'recap',
    target: '[data-testid="day-recap"]',
    title: "The day's recap",
    text: 'After each day you see how every trade stands. A trade you sold earns a little each quiet day: that is time decay working for you.',
  },
  {
    id: 'm-decision',
    when: 'decision',
    target: '[data-testid="decision-modal"], [data-testid="decision-dock"]',
    title: 'Decision time',
    text: 'Your plan says close. Taking your planned exit scores a bonus and keeps stress down. Holding a loser past its stop costs you more.',
  },
  {
    id: 'm-closed',
    when: 'closed',
    target: 'goal',
    title: 'Trade closed',
    text: 'Done. A winner adds points to your goal bar; a loser costs money but only a few points.',
  },
  {
    id: 'm-stress',
    when: 'stress',
    target: 'stress',
    reveal: ['stress'],
    title: 'Stress',
    text: 'Losses and broken plans raise stress, and high stress makes the year harder. Taking your planned exits calms it down.',
  },
  {
    id: 'm-endround',
    when: 'endRound',
    target: '[data-testid="end-round"]',
    reveal: ['controls'],
    title: 'Nothing open',
    text: 'Your trades are closed. Open another while the window lasts, or press END ROUND to score the round now.',
  },
];
