/**
 * Dates are ISO strings (YYYY-MM-DD) everywhere in the engine. They sort lexically,
 * serialize cleanly into saves, and never drift with time zones.
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 (UTC). */
export function toDayNumber(d: ISODate): number {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, day) / MS_PER_DAY);
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDayNumber(toDayNumber(d) + n);
}

/** Calendar days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: ISODate): number {
  return (toDayNumber(d) + 4) % 7;
}

export function ymd(y: number, m: number, d: number): ISODate {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function toYyyymmdd(d: ISODate): number {
  return Number(d.slice(0, 4)) * 10000 + Number(d.slice(5, 7)) * 100 + Number(d.slice(8, 10));
}

export function fromYyyymmdd(n: number): ISODate {
  const y = Math.floor(n / 10000);
  const m = Math.floor((n % 10000) / 100);
  const d = n % 100;
  return ymd(y, m, d);
}

/** The n-th given weekday (0=Sun) of a month; n = -1 means the last one. */
export function nthWeekday(year: number, month: number, dow: number, n: number): ISODate {
  if (n > 0) {
    const first = ymd(year, month, 1);
    const offset = (dow - weekday(first) + 7) % 7;
    return addDays(first, offset + (n - 1) * 7);
  }
  const nextMonth = month === 12 ? ymd(year + 1, 1, 1) : ymd(year, month + 1, 1);
  const last = addDays(nextMonth, -1);
  const back = (weekday(last) - dow + 7) % 7;
  return addDays(last, -back);
}

function easterSunday(year: number): ISODate {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** Saturday holidays move to Friday, Sunday holidays to Monday (NYSE rule). */
function observed(d: ISODate): ISODate {
  const w = weekday(d);
  if (w === 6) return addDays(d, -1);
  if (w === 0) return addDays(d, 1);
  return d;
}

// One-off closures (national days of mourning).
const SPECIAL_CLOSURES = new Set<ISODate>(['2018-12-05', '2025-01-09']);

const holidayCache = new Map<number, Set<ISODate>>();

export function nyseHolidays(year: number): Set<ISODate> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const s = new Set<ISODate>();
  // New Year's Day: when it falls on Saturday, NYSE does not close the prior Friday.
  const ny = ymd(year, 1, 1);
  if (weekday(ny) !== 6) s.add(observed(ny));
  s.add(nthWeekday(year, 1, 1, 3)); // MLK
  s.add(nthWeekday(year, 2, 1, 3)); // Presidents
  s.add(addDays(easterSunday(year), -2)); // Good Friday
  s.add(nthWeekday(year, 5, 1, -1)); // Memorial
  if (year >= 2022) s.add(observed(ymd(year, 6, 19))); // Juneteenth
  s.add(observed(ymd(year, 7, 4)));
  s.add(nthWeekday(year, 9, 1, 1)); // Labor
  s.add(nthWeekday(year, 11, 4, 4)); // Thanksgiving
  s.add(observed(ymd(year, 12, 25)));
  for (const d of SPECIAL_CLOSURES) if (d.startsWith(String(year))) s.add(d);
  holidayCache.set(year, s);
  return s;
}

export function isTradingDay(d: ISODate): boolean {
  const w = weekday(d);
  if (w === 0 || w === 6) return false;
  return !nyseHolidays(Number(d.slice(0, 4))).has(d);
}

/** All trading days in [from, to] inclusive. */
export function tradingDaysBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const end = toDayNumber(to);
  for (let n = toDayNumber(from); n <= end; n++) {
    const d = fromDayNumber(n);
    if (isTradingDay(d)) out.push(d);
  }
  return out;
}

export function nextTradingDay(d: ISODate): ISODate {
  let x = addDays(d, 1);
  while (!isTradingDay(x)) x = addDays(x, 1);
  return x;
}

export function prevTradingDay(d: ISODate): ISODate {
  let x = addDays(d, -1);
  while (!isTradingDay(x)) x = addDays(x, -1);
  return x;
}

/** Shift a trading day by n trading days (n may be negative). */
export function shiftTradingDays(d: ISODate, n: number): ISODate {
  let x = d;
  for (let i = 0; i < Math.abs(n); i++) x = n > 0 ? nextTradingDay(x) : prevTradingDay(x);
  return x;
}

/** Standard monthly expiration: third Friday, or Thursday when Friday is a holiday. */
export function monthlyExpiration(year: number, month: number): ISODate {
  const f = nthWeekday(year, month, 5, 3);
  return isTradingDay(f) ? f : prevTradingDay(f);
}

export function isMonthlyExpiration(d: ISODate): boolean {
  return monthlyExpiration(Number(d.slice(0, 4)), Number(d.slice(5, 7))) === d;
}

/**
 * Listed expirations between minDte and maxDte calendar days after `date`.
 * Weekly names list every Friday; others list only monthlies. Holiday Fridays roll to Thursday.
 */
export function listedExpirations(
  date: ISODate,
  minDte: number,
  maxDte: number,
  weeklies: boolean,
): ISODate[] {
  const out: ISODate[] = [];
  const start = toDayNumber(date);
  for (let n = start + Math.max(0, minDte); n <= start + maxDte; n++) {
    const d = fromDayNumber(n);
    if (weekday(d) !== 5) continue;
    const exp = isTradingDay(d) ? d : prevTradingDay(d);
    if (diffDays(date, exp) < minDte) continue;
    if (weeklies || isMonthlyExpiration(exp)) out.push(exp);
  }
  return out;
}

/** Year fraction for option pricing (calendar days / 365). */
export function yearFraction(from: ISODate, to: ISODate): number {
  return Math.max(0, diffDays(from, to)) / 365;
}
