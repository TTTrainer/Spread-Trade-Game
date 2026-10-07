/**
 * Points and chips on screen are the engine's ×10, so every number reads whole (107 chips and
 * 350 points instead of 10.7 and 35). Targets scale the same way, so the balance is unchanged.
 * The engine keeps both to a tenth (runScore), so the shown chips times the shown mult is the
 * shown total. Mult is shown as it is.
 */
export const SCORE_SCALE = 10;

/** Points (the round meter, targets, a trade's total), scaled and grouped: "1,280". */
export function pts(x: number): string {
  return Math.round(x * SCORE_SCALE).toLocaleString('en-US');
}

/** Points with a sign: "+350", "−120". */
export function ptsSigned(x: number): string {
  const v = Math.round(x * SCORE_SCALE);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')}`;
}

/** Chips, scaled to a whole number: "107". */
export function chipsText(x: number): string {
  return Math.round(x * SCORE_SCALE).toLocaleString('en-US');
}

/** Mult, to two decimals at most: "3.25", "4". */
export function multText(x: number): string {
  return String(Math.round(x * 100) / 100);
}
