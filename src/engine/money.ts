/**
 * Money is integer cents. Option prices are dollars per share (they come from the market
 * that way); they turn into cents exactly once, at a fill or a mark, and are summed as integers.
 */

export type Cents = number;

export const SHARES_PER_CONTRACT = 100;

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

/** Cents for `units` contracts at a per-share price (1.25 × 100 shares × 2 contracts = 25000¢). */
export function contractCents(perShare: number, units: number): Cents {
  return Math.round(perShare * SHARES_PER_CONTRACT * 100 * units);
}

export function centsToDollars(c: Cents): number {
  return c / 100;
}

export function assertCents(c: number, what = 'amount'): void {
  if (!Number.isInteger(c)) throw new Error(`${what} must be integer cents, got ${c}`);
}

/** Percent of equity as a decimal (0.05 = 5%). */
export function pctOf(c: Cents, equity: Cents): number {
  return equity === 0 ? 0 : c / equity;
}

export function formatCents(c: Cents, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  const neg = c < 0;
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body =
    dollars.toLocaleString('en-US') + (opts.decimals === false ? '' : `.${String(rem).padStart(2, '0')}`);
  const sign = neg ? '−' : opts.sign ? '+' : '';
  return `${sign}$${body}`;
}
