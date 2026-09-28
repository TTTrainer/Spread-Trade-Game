/**
 * Why did this trade make or lose money? Day by day, each leg's Greeks from the previous close
 * times what changed: direction (delta and gamma on the stock move), time (theta), volatility
 * (vega on the IV change), plus execution and fees. Whatever the Greeks don't explain is shown
 * honestly as the residual, so the parts always sum to the real P/L.
 */

import { diffDays } from '../calendar';
import { contractCents, type Cents } from '../money';
import type { Position } from '../lifecycle/types';

export interface Attribution {
  direction: Cents;
  time: Cents;
  volatility: Cents;
  execution: Cents;
  fees: Cents;
  residual: Cents;
  total: Cents;
}

export function attribute(pos: Position): Attribution {
  const total = pos.realizedCents ?? (pos.marks.length ? pos.marks[pos.marks.length - 1].plCents : 0);
  let dir = 0;
  let time = 0;
  let vol = 0;
  const marks = pos.marks;
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1];
    const b = marks[i];
    // Legs changed in between (roll, assignment): that day's change is left to the residual.
    if (a.ratios.join() !== b.ratios.join() || a.legs.length !== b.legs.length) continue;
    const dS = b.spot - a.spot;
    const days = Math.max(0, diffDays(a.date, b.date));
    for (let k = 0; k < a.legs.length; k++) {
      const ratio = a.ratios[k];
      const s0 = a.legs[k];
      const s1 = b.legs[k];
      if (s0.stock) {
        dir += ratio * dS;
        continue;
      }
      dir += ratio * (s0.delta * dS + 0.5 * s0.gamma * dS * dS);
      time += ratio * s0.theta * days;
      vol += ratio * s0.vega * ((s1.iv - s0.iv) * 100);
    }
  }
  const direction = contractCents(dir, pos.qty);
  const t = contractCents(time, pos.qty);
  const v = contractCents(vol, pos.qty);
  const execution = pos.executionCents;
  const fees = -pos.feesCents;
  const residual = total - direction - t - v - execution - fees;
  return { direction, time: t, volatility: v, execution, fees, residual, total };
}
