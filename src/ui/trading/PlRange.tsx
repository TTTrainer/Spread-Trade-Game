/**
 * Where a trade's P/L sits on everything it can still do: the most it can lose on the left, the
 * most it can make on the right, the planned stop and target as ticks, today's P/L as the marker.
 * Each half has its own scale (a credit spread risks far more than it can make), so both stay
 * readable.
 */

import type { Position } from '../../engine/lifecycle/types';
import { money } from '../format';

export interface PlBounds {
  /** Positive cents. */
  maxLoss: number;
  /** Positive cents; null when the upside has no cap. */
  maxProfit: number | null;
  /** The planned stop and target as positive cents, when set. */
  stop: number | null;
  target: number | null;
}

export function boundsOf(p: Position): PlBounds {
  const perUnit = 100 * 100 * p.qty;
  return {
    maxLoss: Math.max(1, p.entry.maxLossCents),
    maxProfit: p.entry.maxProfitCents !== null ? Math.max(1, p.entry.maxProfitCents) : null,
    stop: p.brackets.stopPl !== null ? Math.max(1, Math.round(p.brackets.stopPl * perUnit)) : null,
    target: p.brackets.targetPl !== null ? Math.max(1, Math.round(p.brackets.targetPl * perUnit)) : null,
  };
}

/** P/L as a share of the most it could be on its side (0..1), or null with no cap. */
export function shareOfMax(cents: number, b: PlBounds): number | null {
  if (cents >= 0) return b.maxProfit ? Math.min(1, cents / b.maxProfit) : null;
  return Math.min(1, -cents / b.maxLoss);
}

/** "62% of max" / "40% of max loss" for a readout next to the bar. */
export function shareText(cents: number, b: PlBounds): string {
  const s = shareOfMax(cents, b);
  if (s === null) return 'no cap';
  return cents >= 0 ? `${Math.round(s * 100)}% of max` : `${Math.round(s * 100)}% of max loss`;
}

/** Position (0..100) of a P/L figure on the split track. */
function xOf(cents: number, b: PlBounds): number {
  const gainScale = b.maxProfit ?? Math.max(b.target ?? 0, Math.abs(cents), 1) * 1.5;
  return cents >= 0 ? 50 + Math.min(1, cents / gainScale) * 50 : 50 - Math.min(1, -cents / b.maxLoss) * 50;
}

export function PlRange({
  cents: maybe,
  bounds: b,
  size = 'hud',
}: {
  /** null: sealed by a boss (the ends, stop and target still show; where the trade sits doesn't). */
  cents: number | null;
  bounds: PlBounds;
  /** hud: the trade card · big: the take-profit dialog · mini: a table cell (no labels). */
  size?: 'hud' | 'big' | 'mini';
}) {
  const sealed = maybe === null;
  const cents = maybe ?? 0;
  const x = xOf(cents, b);
  const hot = sealed
    ? 'sealed'
    : b.stop !== null && cents <= -b.stop * 0.8
      ? 'near-stop'
      : b.target !== null && cents >= b.target * 0.8
        ? 'near-target'
        : '';
  const labels = size !== 'mini';
  const amounts = size === 'big';
  return (
    <div className={`tug rng ${size} ${hot}`} data-tip="g:tug_meter" data-testid="pl-range">
      {labels && <span className="tug-end down num">−{money(b.maxLoss)} MAX</span>}
      <span className="tug-track">
        <span className="tug-half loss" />
        <span className="tug-half gain" />
        {!sealed && (
          <span
            className={`rng-fill ${cents >= 0 ? 'gain' : 'loss'}`}
            style={cents >= 0 ? { left: '50%', width: `${x - 50}%` } : { left: `${x}%`, width: `${50 - x}%` }}
          />
        )}
        <span className="tug-mid" />
        {b.stop !== null && (
          <span className="rng-tick stop" style={{ left: `${xOf(-b.stop, b)}%` }}>
            {labels && <span className="rng-lab num">STOP{amounts ? ` −${money(b.stop)}` : ''}</span>}
          </span>
        )}
        {b.target !== null && (
          <span className="rng-tick target" style={{ left: `${xOf(b.target, b)}%` }}>
            {labels && <span className="rng-lab num">{amounts ? `TARGET +${money(b.target)}` : 'TGT'}</span>}
          </span>
        )}
        {sealed ? (
          <span className="rng-sealed num">?</span>
        ) : (
          <span className="tug-dot" style={{ left: `${x}%` }} />
        )}
      </span>
      {labels && (
        <span className="tug-end up num">
          {b.maxProfit !== null ? `MAX +${money(b.maxProfit)}` : 'NO CAP'}
        </span>
      )}
    </div>
  );
}
