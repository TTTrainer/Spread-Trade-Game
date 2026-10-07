import { formatCents, type Cents } from '../engine/money';

export function money(c: Cents, sign = false): string {
  return formatCents(c, { sign });
}

/** P/L text always carries a glyph and a sign so it never relies on color alone. */
export function pnlText(c: Cents): string {
  if (c === 0) return '■ $0.00';
  return `${c > 0 ? '▲' : '▼'} ${formatCents(c, { sign: true })}`;
}

export function pnlClass(c: number): 'up' | 'down' | 'flat' {
  return c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
}

export function price(x: number | null | undefined, digits?: number): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const d = digits ?? (Math.abs(x) < 1 && x !== 0 ? 3 : 2);
  return x.toFixed(d);
}

export function pct(x: number | null | undefined, digits = 1, sign = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const v = (x * 100).toFixed(digits);
  return `${sign && x > 0 ? '+' : ''}${v}%`;
}

export function num(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function signed(x: number, digits = 2): string {
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`;
}

/**
 * Points and chips on screen are the engine's ×10, so every number reads whole (42 chips, 350
 * points instead of 4.2 and 35). Targets scale the same way, so nothing about the balance changes.
 * Mult is shown as it is.
 */
export const SCORE_SCALE = 10;

/** Points (the round meter, targets, a trade's total), scaled and grouped: "1,280". */
export function pts(x: number): string {
  return Math.round(x * SCORE_SCALE).toLocaleString('en-US');
}

/** Chips, scaled to a whole number: "107". */
export function chipsText(x: number): string {
  return Math.round(x * SCORE_SCALE).toLocaleString('en-US');
}

/** Mult, at most one decimal: "3.3", "4". */
export function multText(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
