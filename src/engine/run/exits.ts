/**
 * How each trade closed, kept for the whole run, so the exit plan has a scorecard: targets banked,
 * stops taken (and what each stop saved against the trade's max loss), expiries and closes by hand.
 * This is the feedback loop for "take the planned stop": the month menu shows it beside the plan.
 */

export type ExitKind = 'target' | 'stop' | 'expired' | 'manual' | 'other';

export interface ExitLine {
  n: number;
  /** Realized P/L of these closes. */
  cents: number;
  /** Stops only: the max loss these trades could have reached, minus what they lost. */
  savedCents: number;
}

export type ExitLog = Partial<Record<ExitKind, ExitLine>>;

/** Plan exits win: a close the plan made is a target or a stop, whatever the order said. */
export function exitKind(
  closedAtPlan: 'target' | 'stop' | null | undefined,
  exitReason?: string | null,
): ExitKind {
  if (closedAtPlan) return closedAtPlan;
  if (exitReason === 'expired' || exitReason === 'assigned') return 'expired';
  if (exitReason === 'manual') return 'manual';
  return 'other';
}

export function recordExit(
  log: ExitLog,
  kind: ExitKind,
  realizedCents: number,
  maxLossCents: number,
): ExitLog {
  const prev = log[kind] ?? { n: 0, cents: 0, savedCents: 0 };
  const saved = kind === 'stop' ? Math.max(0, maxLossCents - Math.max(0, -realizedCents)) : 0;
  return {
    ...log,
    [kind]: { n: prev.n + 1, cents: prev.cents + realizedCents, savedCents: prev.savedCents + saved },
  };
}

/**
 * What the exit plan does to an example credit spread, in cents, so the menu can show the plan's
 * effect as the sliders move: the banked win at the target and the capped loss at the stop.
 */
export function planExample(
  creditCents: number,
  widthCents: number,
  targetPct: number,
  stopMult: number,
): { targetCents: number; stopCents: number; maxLossCents: number; maxProfitCents: number } {
  const maxLossCents = Math.max(0, widthCents - creditCents);
  return {
    maxProfitCents: creditCents,
    targetCents: Math.round(creditCents * targetPct),
    stopCents: -Math.min(maxLossCents, Math.round(creditCents * stopMult)),
    maxLossCents: -maxLossCents,
  };
}
