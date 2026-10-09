/**
 * LEARN OPTIONS: a short course inside the Trade Builder, starting from selling. Each lesson sets
 * up a real trade on the ticker you have open (the legs, the view, the studies), says what to look
 * at in two or three sentences, and has you do something: sell an option on last month's chart
 * and play the days out (a coin for every day no candle touches your line), move the strike,
 * answer one question, or build a first trade with a checklist. It goes cash-secured put, the
 * payoff, a safer strike, the covered call, a coached first trade, then the vertical; the older
 * lessons (time decay, IV, condors, managing, events) follow as MORE LESSONS. It never teaches
 * buying calls.
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
  /**
   * Play an option out on the last month of real days: the player drags the strike ('drag'), or
   * the lesson tests the strike they built on today's chart at the same distance ('today').
   */
  replay?: { side: 'put' | 'call'; strike: 'drag' | 'today' };
  /** The coached first trade: a checklist the builder's trade must meet. */
  checklist?: boolean;
  /** One of the extra lessons after the course proper. */
  more?: boolean;
}

export const OPTIONS_COURSE: CourseLesson[] = [
  {
    id: 'wait',
    title: 'Get paid to wait',
    text: "Sell a put and you promise: 'if {symbol} drops under my line, I'll buy it there.' You're paid up front. Here is a month ago: drag your line under the floor, SELL, then PLAY. Every day no candle touches the line drops a coin.",
    structure: 'cash_secured_put',
    delta: 0.25,
    view: 'chart',
    replay: { side: 'put', strike: 'drag' },
  },
  {
    id: 'picture',
    title: 'The same trade as a picture',
    text: "Today's {strike} put on the P/L chart. Above the strike at expiration you keep all {premium}. Below it the line slopes down: each $1 under costs $100. Hover the chart to read any price.",
    structure: 'cash_secured_put',
    delta: 0.25,
    view: 'payoff',
    quiz: {
      q: 'Where does this put start losing money at expiration?',
      options: ['At the strike', 'At the strike minus the premium', "Anywhere below today's price"],
      answer: 1,
      why: 'The premium you kept cushions the drop, so it only loses below strike minus premium ({be} here). Above the strike you keep all of it.',
    },
  },
  {
    id: 'pop',
    title: 'Pick a safer line',
    text: 'A lower strike pays less but keeps the money more often. POP is the odds you keep money. Move the short strike down until POP reads 75% to 85%: past the expected move and under a floor.',
    structure: 'cash_secured_put',
    delta: 0.4,
    view: 'chart',
    studies: ['em', 'sr'],
    task: { kind: 'pop', lo: 0.75, hi: 0.85 },
  },
  {
    id: 'cc',
    title: 'The covered call',
    text: 'You own 100 shares. Sell a call over a ceiling the chart keeps failing at: if no candle touches the line, you keep the premium and the shares. Drag the line over the ceiling, SELL, then PLAY.',
    structure: 'covered_call',
    delta: 0.25,
    view: 'chart',
    replay: { side: 'call', strike: 'drag' },
  },
  {
    id: 'coached',
    title: 'Your first trade, coached',
    text: "Now build one on today's chart. Each step checks off as you do it: a cash-secured put, under a floor, 25 to 45 days out, POP 75% to 85%. Then test the same setup on last month.",
    structure: 'cash_secured_put',
    delta: 0.4,
    view: 'chart',
    studies: ['em', 'sr'],
    checklist: true,
    replay: { side: 'put', strike: 'today' },
  },
  {
    id: 'vertical',
    title: 'Cap the risk: the vertical',
    text: 'Buy a cheaper put below the one you sell and the loss stops there: max loss is the width minus the credit. This is the bull put spread, the workhorse of income traders, and the rest of the game.',
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
    id: 'delta',
    more: true,
    title: 'Strikes and delta',
    text: 'Delta is roughly the odds an option ends in the money. A .25 delta put sits further from the price than a .50: less premium, better odds. Move the short strike (the slider or LEGS) and watch POP change.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    task: { kind: 'strike' },
  },
  {
    id: 'theta',
    more: true,
    title: 'Time decay',
    text: 'Drag DATE under the payoff to expiration. The dashed "today" curve settles onto the expiration line: that drift is theta, the premium a seller earns each day the stock stays put.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    task: { kind: 'days' },
  },
  {
    id: 'vega',
    more: true,
    title: 'Implied volatility',
    text: 'Slide IV down. A seller gains when implied volatility falls (vega). That’s why premium sellers like a high IV rank, and why options lose value the morning after earnings: the IV crush.',
    legs: [{ right: 'P', side: 'sell', delta: 0.25 }],
    view: 'payoff',
    task: { kind: 'iv' },
  },
  {
    id: 'em',
    more: true,
    title: 'The expected move',
    text: 'The violet lines are the move the options market expects by expiration: about two times in three the price ends inside ±1σ, nineteen in twenty inside 2σ. A strike past them is a high-probability sale.',
    structure: 'bull_put',
    delta: 0.2,
    view: 'chart',
    studies: ['em', 'em2'],
  },
  {
    id: 'condor',
    more: true,
    title: 'A range: the iron condor',
    text: 'A bull put plus a bear call: you win while {symbol} stays between the short strikes. Two credits for one risk, since only one side can lose at expiration. Best when the chart is going sideways.',
    structure: 'iron_condor',
    delta: 0.2,
    view: 'payoff',
  },
  {
    id: 'manage',
    more: true,
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
    more: true,
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
