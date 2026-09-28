/** Desks: one kind of trade per run, each with its own playbook, passive and starting kit. */

import { BALANCE } from './balance';
import type { DeskDef, DeskId } from './types';

export const DESKS: Record<DeskId, DeskDef> = {
  verticals: {
    id: 'verticals',
    name: 'Verticals',
    blurb: 'Home desk. Bull put and bear call credit spreads, plus debit spreads when premium is cheap.',
    structures: ['bull_put', 'bear_call', 'bull_call', 'bear_put'],
    passiveText: 'Credit spreads that expire worthless or close at 50%+ of max profit: +1 mult.',
    startingAnalysts: ['quant'],
    startingCartridges: ['stop_discipline'],
    unlockCost: 0,
    passive: (f) =>
      f.win && f.family === 'vertical' && f.credit && (f.expiredWorthless || (f.pctOfMaxProfit ?? 0) >= 0.5)
        ? [{ label: 'Verticals desk', kind: 'desk', op: 'add', value: BALANCE.scoring.verticalsPassiveMult }]
        : [],
  },
  income: {
    id: 'income',
    name: 'Income',
    blurb: 'Covered calls, cash-secured puts and the wheel. Get paid to own stocks you like.',
    structures: ['cash_secured_put', 'covered_call'],
    passiveText: 'Assignment is not a loss event (no stress). Dividends pay +25 chips each.',
    startingAnalysts: [],
    startingCartridges: ['dividend_radar'],
    unlockCost: 100,
    priceRange: [6, 18],
    passive: (f) =>
      f.win && f.dividendsCollected > 0
        ? [
            {
              label: `Income desk: ${f.dividendsCollected} dividend${f.dividendsCollected > 1 ? 's' : ''}`,
              kind: 'desk',
              op: 'chips',
              value: 25 * f.dividendsCollected,
            },
          ]
        : [],
  },
  condor: {
    id: 'condor',
    name: 'Condor',
    blurb: 'Iron condors, iron flies and broken wings. Sell the range and defend it.',
    structures: ['iron_condor', 'iron_fly', 'bwb_condor'],
    passiveText: 'Correct "flat" calls pay double call bonus. +1 ticket and +1 card every round.',
    startingAnalysts: [],
    startingCartridges: ['wing_clipper'],
    unlockCost: 150,
    ticketsAdd: 1,
    lineupAdd: 1,
    passive: (f) =>
      f.win && f.callFlat && f.callExact && f.callBonus > 0
        ? [{ label: 'Condor desk (flat call x2)', kind: 'desk', op: 'add', value: f.callBonus }]
        : [],
  },
  volatility: {
    id: 'volatility',
    name: 'Volatility',
    blurb: 'Long straddles and strangles. Buy movement before the market prices it.',
    structures: ['long_straddle', 'long_strangle'],
    passiveText:
      'Earnings events show the implied move. Long premium held through an event: +50 chips. +3 tickets and +2 cards every round.',
    startingAnalysts: ['earnings_whisperer'],
    startingCartridges: [],
    unlockCost: 200,
    ticketsAdd: 3,
    lineupAdd: 2,
    priceRange: [10, 50],
    brackets: { debitTargetPct: 0.15, debitStopPct: 0.45 },
    passive: (f) =>
      f.win && f.longPremiumThroughEvent
        ? [{ label: 'Volatility desk (held through the event)', kind: 'desk', op: 'chips', value: 50 }]
        : [],
  },
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Calendars, diagonals and double calendars. Trade time and the volatility term structure.',
    structures: ['calendar', 'diagonal', 'double_calendar'],
    passiveText: 'The IV term-structure panel is always on. +1 ticket and +1 card every round.',
    startingAnalysts: [],
    startingCartridges: ['term_structure_tap'],
    unlockCost: 250,
    ticketsAdd: 1,
    lineupAdd: 1,
    priceRange: [10, 60],
    brackets: { debitTargetPct: 0.15, debitStopPct: 0.45 },
  },
};

export const DESK_ORDER: DeskId[] = ['verticals', 'income', 'condor', 'volatility', 'calendar'];
