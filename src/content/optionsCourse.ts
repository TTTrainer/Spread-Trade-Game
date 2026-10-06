/**
 * LEARN OPTIONS: a short course inside the Trade Builder. Each lesson sets up a real trade on the
 * ticker you have open (the legs, the view, the studies), says what to look at in two or three
 * sentences, and either asks you to do one thing with the tools (move the strike, slide the date)
 * or asks one question. It builds from a single call to the credit spreads and condors the game is
 * about, then managing the trade and the events that move it.
 */

import type { StructureId } from '../engine/strategies/types';
import type { CourseLegSpec, CourseTask } from '../engine/teach/course';

export interface CourseQuiz {
  q: string;
  options: string[];
  answer: number;
  /** Why the answer is right, shown after any pick. */
  why: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  /**
   * What to look at. {symbol}, {strike}, {premium}, {pop} and {be} fill in from the trade on
   * screen.
   */
  text: string;
  /** The trade the lesson sets up: a strategy, or legs picked by delta. None: leave it. */
  structure?: StructureId;
  legs?: CourseLegSpec[];
  /** The short strike's delta for a strategy set up by the lesson. */
  delta?: number;
  /** What fills the center: the chart or the full-size payoff. */
  view?: 'chart' | 'payoff';
  /** Studies the lesson turns on (others stay as they were). */
  studies?: ('em' | 'em2' | 'sr' | 'bb')[];
  task?: CourseTask;
  quiz?: CourseQuiz;
}

export const OPTIONS_COURSE: CourseLesson[] = [
  {
    id: 'what',
    title: 'Options in one minute',
    text: 'An option is a contract on 100 shares. A call gains when the stock rises, a put when it falls. You either buy one (you pay a premium) or sell one (you collect it). Everything else is built from those four moves.',
    view: 'chart',
  },
  {
    id: 'call',
    title: 'Buying a call',
    text: 'Here is one {symbol} call at {strike}, bought for {premium}. Below the strike at expiration it is worth nothing and you lose what you paid; above it you gain $100 for every $1 the stock rises.',
    legs: [{ right: 'C', side: 'buy', delta: 0.5 }],
    view: 'payoff',
    quiz: {
      q: 'Where does a bought call break even at expiration?',
      options: [
        'At the strike',
        'At the strike plus the premium paid',
        'At the strike minus the premium paid',
      ],
      answer: 1,
      why: 'The stock has to rise past the strike by enough to pay back the premium: strike + premium ({be} here).',
    },
  },
  {
    id: 'put',
    title: 'Buying a put',
    text: 'The mirror image: one {symbol} put at {strike} for {premium}. It pays as the stock falls below the strike, and loses only the premium if it doesn’t. Traders buy puts to bet on a drop or to insure shares.',
    legs: [{ right: 'P', side: 'buy', delta: 0.5 }],
    view: 'payoff',
  },
  {
    id: 'sell',
    title: 'Selling instead',
    text: 'Selling flips the picture. This sells a {strike} put for {premium}: you keep it all if {symbol} stays above the strike, but below it the loss keeps growing. Sellers win more often, in smaller amounts.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    quiz: {
      q: 'When does a sold put keep its whole premium?',
      options: [
        'When the stock ends above the strike',
        'When the stock ends below the strike',
        'Only when the stock rises',
      ],
      answer: 0,
      why: 'Above the strike the put expires worthless, so the premium you collected is all profit. The stock can even fall a little, as long as it stays above.',
    },
  },
  {
    id: 'delta',
    title: 'Strikes and delta',
    text: 'Delta is roughly the odds an option ends in the money. A .25 delta put sits further from the price than a .50: less premium, better odds. Move the short strike (the slider or LEGS) and watch POP change.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    task: { kind: 'strike' },
  },
  {
    id: 'theta',
    title: 'Time decay',
    text: 'Drag DATE under the payoff to expiration. The dashed "today" curve settles onto the expiration line: that drift is theta, the premium a seller earns each day the stock stays put.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    task: { kind: 'days' },
  },
  {
    id: 'vega',
    title: 'Implied volatility',
    text: 'Slide IV down. A seller gains when implied volatility falls (vega). That’s why premium sellers like a high IV rank, and why options lose value the morning after earnings: the IV crush.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    task: { kind: 'iv' },
  },
  {
    id: 'em',
    title: 'The expected move',
    text: 'The violet lines are the move the options market expects by expiration: about two times in three the price ends inside ±1σ, nineteen in twenty inside 2σ. A strike past them is a high-probability sale.',
    structure: 'bull_put',
    delta: 0.2,
    view: 'chart',
    studies: ['em', 'em2'],
  },
  {
    id: 'vertical',
    title: 'Cap the risk: the vertical',
    text: 'Buy a cheaper put below the one you sell and the loss stops there: max loss is the width minus the credit. This is the bull put spread, the workhorse of income traders, and the game’s first strategy.',
    structure: 'bull_put',
    delta: 0.25,
    view: 'payoff',
    quiz: {
      q: 'A $5-wide spread sold for $1.20: what is the most it can lose (one contract)?',
      options: ['$120', '$380', '$500'],
      answer: 1,
      why: 'Width minus credit: ($5.00 − $1.20) × 100 = $380. The $120 credit is the most it can make.',
    },
  },
  {
    id: 'pick',
    title: 'Pick the strike like a pro',
    text: 'Aim for about 80% POP: past the expected move, and past a floor the chart keeps respecting (S/R is on). Move the short strike until POP reads between 75% and 85%.',
    structure: 'bull_put',
    delta: 0.4,
    view: 'chart',
    studies: ['em', 'sr'],
    task: { kind: 'pop', lo: 0.75, hi: 0.85 },
  },
  {
    id: 'condor',
    title: 'A range: the iron condor',
    text: 'A bull put plus a bear call: you win while {symbol} stays between the short strikes. Two credits for one risk, since only one side can lose at expiration. Best when the chart is going sideways.',
    structure: 'iron_condor',
    delta: 0.2,
    view: 'payoff',
  },
  {
    id: 'manage',
    title: 'Managing the trade',
    text: 'Plan the exit before you enter: take profit around half the credit, cut the loss around 2× the credit. Holding a loser past the stop is how a small loss becomes the max loss.',
    structure: 'bull_put',
    delta: 0.25,
    view: 'payoff',
    quiz: {
      q: 'You sold a spread for $1.00. It now costs $3.00 to close, and your plan said stop at 2× the credit. What now?',
      options: [
        'Close it: the plan has been hit',
        'Hold it for a bounce',
        'Roll it out for more credit, no plan',
      ],
      answer: 0,
      why: 'At $3.00 you’ve lost $2.00, which is the 2× stop you planned. Taking it keeps the loss small; hoping turns it into the max loss more often than not.',
    },
  },
  {
    id: 'events',
    title: 'Earnings and assignment',
    text: 'Earnings make IV jump before the report and crush after; the stock can gap past both strikes overnight. Near expiration, a short option in the money can be assigned: close or roll it before the last day.',
    view: 'chart',
    quiz: {
      q: 'Your short put is in the money the day before expiration. The safest move?',
      options: ['Close or roll it before the close', 'Let it expire and see', 'Sell another put to cover it'],
      answer: 0,
      why: 'An in-the-money short option can be assigned (you’d buy 100 shares per contract). Closing or rolling it on your terms avoids the surprise.',
    },
  },
];
