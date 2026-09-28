/** Analysts: information you earn. Real tools, so hiring one teaches it. */

import type { AnalystDef, AnalystId } from './types';

export const ANALYSTS: Record<AnalystId, AnalystDef> = {
  quant: {
    id: 'quant',
    name: 'The Quant',
    price: 5,
    reveals: 'IV rank and IV percentile on lineup cards, plus an IV rank history sparkline.',
    level2: 'Adds the IV percentile history and where today ranks against the last 5 years.',
  },
  vol_surfer: {
    id: 'vol_surfer',
    name: 'The Vol Surfer',
    price: 6,
    reveals:
      '20-day realized volatility against implied (the volatility risk premium) and the IV term structure.',
    level2: 'Adds the 60-day realized volatility and the term structure slope in plain words.',
  },
  earnings_whisperer: {
    id: 'earnings_whisperer',
    name: 'The Earnings Whisperer',
    price: 7,
    reveals:
      'Earnings date, the implied move from the ATM straddle, and the last 8 reactions against their implied moves.',
    level2: 'Adds the average IV crush after each report.',
  },
  chartist: {
    id: 'chartist',
    name: 'The Chartist',
    price: 5,
    reveals:
      'Extra studies: SMA 20/50/200, EMA 9/21, ATR(14), Keltner Channels, support and resistance, relative volume.',
    level2: 'Flags a Bollinger-inside-Keltner squeeze on the lineup card.',
  },
  skew_doctor: {
    id: 'skew_doctor',
    name: 'The Skew Doctor',
    price: 6,
    reveals: 'Put/call skew by delta, highlighting the richer side to sell.',
    level2: 'Adds skew against its own recent average.',
  },
  macro_desk: {
    id: 'macro_desk',
    name: 'The Macro Desk',
    price: 6,
    reveals: 'An SPY and VIX panel with the FOMC and CPI calendar.',
    level2: 'Adds how the stock moved on the last 4 Fed days.',
  },
  ghost: {
    id: 'ghost',
    name: 'The Ghost',
    price: 8,
    reveals:
      "Base rates: how often this stock's price stayed beyond your short strike's distance over the same number of days, using only history before today.",
    level2: 'Adds the base rate for setups with a similar IV rank.',
  },
  scout: {
    id: 'scout',
    name: 'The Scout',
    price: 5,
    reveals: 'Sector and size tier on lineup cards (semi-blind), and +1 reroll per round.',
    level2: 'Another +1 reroll per round.',
    extraRerolls: 1,
  },
  risk_officer: {
    id: 'risk_officer',
    name: 'The Risk Officer',
    price: 7,
    reveals:
      'A portfolio Greeks dashboard, correlated-risk warnings across open positions, and bracket suggestions.',
    level2: 'Adds the portfolio P/L if every stock moves one expected move against you.',
  },
};

export const ANALYST_IDS = Object.keys(ANALYSTS) as AnalystId[];
