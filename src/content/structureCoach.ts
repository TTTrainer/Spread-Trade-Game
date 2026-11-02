/**
 * The first time you pick each structure, a short card says what each control does for it. The
 * colors match the chart: amber is when it ends, magenta is what you sell, cyan is what you buy.
 */

import type { StructureId } from '../engine/strategies/types';

export type CoachControl = 'exp' | 'back' | 'strike' | 'width' | 'size';

export interface StructureCoach {
  /** One line: what the trade is betting on. */
  pitch: string;
  /** What each control moves for this structure, in the order the sliders appear. */
  controls: Partial<Record<CoachControl, string>>;
}

/** Structures whose strike slider places the leg you buy (the rest place the leg you sell). */
export const LONG_ANCHOR: StructureId[] = ['bull_call', 'bear_put', 'long_straddle', 'long_strangle'];

const SIZE = 'How many contracts. Each one adds the same risk again.';

export const STRUCTURE_COACH: Record<StructureId, StructureCoach> = {
  bull_put: {
    pitch: 'Paid up front to bet the stock stays above your strike.',
    controls: {
      exp: 'When it ends. Sooner decays faster but leaves less time to be wrong.',
      strike: 'The put you sell. Lower Δ sits farther below: safer, smaller credit.',
      width: 'The put you buy below it as a floor. Wider pays more and risks more.',
      size: SIZE,
    },
  },
  bear_call: {
    pitch: 'Paid up front to bet the stock stays below your strike.',
    controls: {
      exp: 'When it ends. Sooner decays faster but leaves less time to be wrong.',
      strike: 'The call you sell. Lower Δ sits farther above: safer, smaller credit.',
      width: 'The call you buy above it as a ceiling. Wider pays more and risks more.',
      size: SIZE,
    },
  },
  bull_call: {
    pitch: 'You pay to bet the stock rises. The most you lose is what you paid.',
    controls: {
      exp: 'When it ends. More time costs more but gives the move room.',
      strike: 'The call you BUY (cyan). Higher Δ is closer to the money: pricier, likelier.',
      width: 'The call you sell above it (magenta) to cut the cost. It also caps the win.',
      size: SIZE,
    },
  },
  bear_put: {
    pitch: 'You pay to bet the stock falls. The most you lose is what you paid.',
    controls: {
      exp: 'When it ends. More time costs more but gives the move room.',
      strike: 'The put you BUY (cyan). Higher Δ is closer to the money: pricier, likelier.',
      width: 'The put you sell below it (magenta) to cut the cost. It also caps the win.',
      size: SIZE,
    },
  },
  iron_condor: {
    pitch: 'Paid to bet the stock stays inside a range: a bull put and a bear call together.',
    controls: {
      exp: 'When it ends. Both sides decay together.',
      strike: 'Both strikes you sell, one each side. Lower Δ is a wider range: safer, less credit.',
      width: 'Both wings you buy outside them. Wider pays more and risks more.',
      size: SIZE,
    },
  },
  iron_fly: {
    pitch: 'Paid more to bet the stock pins near today’s price.',
    controls: {
      exp: 'When it ends. It pays most if the stock sits still into expiration.',
      strike: 'Both short strikes sit at the money.',
      width: 'How far out the protective wings sit. Wider pays more and risks more.',
      size: SIZE,
    },
  },
  bwb_condor: {
    pitch: 'A condor with one wing farther out: less risk on the side you lean away from.',
    controls: {
      exp: 'When it ends. Both sides decay together.',
      strike: 'Both strikes you sell. Lower Δ is a wider range.',
      width: 'The wings you buy. The call wing sits one strike farther out.',
      size: SIZE,
    },
  },
  long_straddle: {
    pitch: 'You pay to bet on a big move, either way.',
    controls: {
      exp: 'When it ends. Time works against you: each day costs premium.',
      size: SIZE,
    },
  },
  long_strangle: {
    pitch: 'A cheaper bet on a big move, either way: both options sit out of the money.',
    controls: {
      exp: 'When it ends. Time works against you: each day costs premium.',
      strike: 'Both options you BUY (cyan). Lower Δ is cheaper but needs a bigger move.',
      size: SIZE,
    },
  },
  covered_call: {
    pitch: 'Paid to cap the upside on shares you already own.',
    controls: {
      exp: 'When it ends. Sooner pays less but resets sooner.',
      strike: 'The call you sell above the price. Lower Δ: less income, less chance of being called away.',
      size: 'Contracts, one per 100 shares you own (at most 5).',
    },
  },
  cash_secured_put: {
    pitch: 'Paid to agree to buy the stock lower, with the cash set aside.',
    controls: {
      exp: 'When it ends. Sooner pays less but resets sooner.',
      strike: 'The put you sell. Lower Δ: less income, less chance of being assigned.',
      size: 'Contracts. Each one sets aside cash for 100 shares.',
    },
  },
  calendar: {
    pitch: 'Sell a near option and buy the same strike later: paid by the near one decaying faster.',
    controls: {
      exp: 'The near expiration you sell. It should decay faster than the back.',
      back: 'The later expiration you buy. Further out holds value longer.',
      strike: 'The shared strike. It pays most if the stock sits near it.',
      size: SIZE,
    },
  },
  diagonal: {
    pitch: 'A calendar with the bought option at a lower strike: leans bullish.',
    controls: {
      exp: 'The near expiration you sell.',
      back: 'The later expiration you buy.',
      strike: 'The strike you sell in the near month.',
      width: 'How far below it the bought back-month strike sits (cyan).',
      size: SIZE,
    },
  },
  double_calendar: {
    pitch: 'Two calendars, one each side of the price: a wider zone to sit in.',
    controls: {
      exp: 'The near expiration you sell.',
      back: 'The later expiration you buy.',
      strike: 'Where both calendars sit. Lower Δ spreads them farther apart.',
      size: SIZE,
    },
  },
};
