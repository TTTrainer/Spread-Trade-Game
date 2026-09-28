/**
 * Black–Scholes–Merton for European options with a continuous dividend yield.
 * Conventions: time in years, rates/vols/yields as decimals, theta per calendar day,
 * vega and rho per 1 point (0.01) change.
 */

import type { OptionRight } from '../market/types';

const INV_SQRT_2PI = 0.3989422804014327;

/** Standard normal density. */
export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/** Standard normal CDF, Hart (1968) double-precision algorithm (|error| < 1e-14). */
export function normCdf(x: number): number {
  const ax = Math.abs(x);
  let c: number;
  if (ax > 37) {
    c = 0;
  } else {
    const e = Math.exp((-ax * ax) / 2);
    if (ax < 7.07106781186547) {
      let b = 3.52624965998911e-2 * ax + 0.700383064443688;
      b = b * ax + 6.37396220353165;
      b = b * ax + 33.912866078383;
      b = b * ax + 112.079291497871;
      b = b * ax + 221.213596169931;
      b = b * ax + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * ax + 1.75566716318264;
      b = b * ax + 16.064177579207;
      b = b * ax + 86.7807322029461;
      b = b * ax + 296.564248779674;
      b = b * ax + 637.333633378831;
      b = b * ax + 793.826512519948;
      b = b * ax + 440.413735824752;
      c = c / b;
    } else {
      let b = ax + 0.65;
      b = ax + 4 / b;
      b = ax + 3 / b;
      b = ax + 2 / b;
      b = ax + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** Inverse normal CDF (Acklam), used for POP bands and synthetic quantiles. */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number;
  let r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= 1 - pl) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export interface BsmInput {
  right: OptionRight;
  spot: number;
  strike: number;
  t: number; // years
  vol: number;
  rate: number;
  divYield: number;
}

export interface BsmResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export function bsmPrice(i: BsmInput): number {
  return bsm(i).price;
}

export function bsm(i: BsmInput): BsmResult {
  const { right, spot: S, strike: K, t: T, vol: v, rate: r, divYield: q } = i;
  if (T <= 0 || v <= 0) {
    const intrinsic = right === 'C' ? Math.max(0, S - K) : Math.max(0, K - S);
    const itm = right === 'C' ? S > K : K > S;
    return {
      price: intrinsic,
      delta: itm ? (right === 'C' ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = (dq * pdf) / (S * v * sqrtT);
  const vega = (S * dq * pdf * sqrtT) / 100;
  const decay = (-S * dq * pdf * v) / (2 * sqrtT);
  if (right === 'C') {
    const nd1 = normCdf(d1);
    const nd2 = normCdf(d2);
    return {
      price: S * dq * nd1 - K * dr * nd2,
      delta: dq * nd1,
      gamma,
      theta: (decay - r * K * dr * nd2 + q * S * dq * nd1) / 365,
      vega,
      rho: (K * T * dr * nd2) / 100,
    };
  }
  const nmd1 = normCdf(-d1);
  const nmd2 = normCdf(-d2);
  return {
    price: K * dr * nmd2 - S * dq * nmd1,
    delta: -dq * nmd1,
    gamma,
    theta: (decay + r * K * dr * nmd2 - q * S * dq * nmd1) / 365,
    vega,
    rho: (-K * T * dr * nmd2) / 100,
  };
}

/**
 * Implied volatility from a price. Newton steps with a bisection safety net.
 * Returns null when the price is outside no-arbitrage bounds.
 */
export function impliedVol(price: number, i: Omit<BsmInput, 'vol'>): number | null {
  const { right, spot: S, strike: K, t: T, rate: r, divYield: q } = i;
  if (T <= 0) return null;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const lower = right === 'C' ? Math.max(0, S * dq - K * dr) : Math.max(0, K * dr - S * dq);
  const upper = right === 'C' ? S * dq : K * dr;
  if (price < lower - 1e-9 || price > upper + 1e-9) return null;
  if (price - lower < 1e-10) return 1e-4;
  let lo = 1e-4;
  let hi = 5;
  let v = 0.3;
  for (let iter = 0; iter < 100; iter++) {
    const res = bsm({ ...i, vol: v });
    const diff = res.price - price;
    if (Math.abs(diff) < 1e-10) return v;
    if (diff > 0) hi = v;
    else lo = v;
    const vegaFull = res.vega * 100;
    let next = vegaFull > 1e-8 ? v - diff / vegaFull : NaN;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - v) < 1e-12) return next;
    v = next;
  }
  return v;
}

/** Forward price used for moneyness. */
export function forward(spot: number, t: number, rate: number, divYield: number): number {
  return spot * Math.exp((rate - divYield) * t);
}
