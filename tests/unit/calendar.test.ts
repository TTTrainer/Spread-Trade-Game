import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  fromYyyymmdd,
  isTradingDay,
  listedExpirations,
  monthlyExpiration,
  nextTradingDay,
  prevTradingDay,
  shiftTradingDays,
  toYyyymmdd,
  tradingDaysBetween,
  weekday,
  yearFraction,
} from '../../src/engine/calendar';

describe('trading calendar', () => {
  it('knows weekdays and date math', () => {
    expect(weekday('2024-01-01')).toBe(1); // Monday
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffDays('2024-01-01', '2024-12-31')).toBe(365);
    expect(fromYyyymmdd(toYyyymmdd('2023-07-04'))).toBe('2023-07-04');
    expect(yearFraction('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('closes on NYSE holidays', () => {
    const closed = [
      '2024-07-04',
      '2023-06-19',
      '2022-12-26',
      '2021-12-24',
      '2024-03-29',
      '2025-01-09',
      '2024-11-28',
      '2019-01-21',
      '2020-01-01',
    ];
    for (const d of closed) expect(isTradingDay(d), d).toBe(false);
    // New Year's Day on a Saturday: NYSE stays open the Friday before.
    expect(isTradingDay('2021-12-31')).toBe(true);
    expect(isTradingDay('2024-07-05')).toBe(true);
    expect(isTradingDay('2024-07-06')).toBe(false);
  });

  it('counts about 252 trading days a year', () => {
    const n = tradingDaysBetween('2023-01-01', '2023-12-31').length;
    expect(n).toBe(250);
    expect(tradingDaysBetween('2024-01-01', '2024-12-31').length).toBe(252);
  });

  it('steps across weekends and holidays', () => {
    expect(nextTradingDay('2024-07-03')).toBe('2024-07-05');
    expect(prevTradingDay('2024-07-08')).toBe('2024-07-05');
    expect(shiftTradingDays('2024-07-01', 5)).toBe('2024-07-09');
    expect(shiftTradingDays('2024-07-09', -5)).toBe('2024-07-01');
  });

  it('finds monthly expirations, moving holiday Fridays to Thursday', () => {
    expect(monthlyExpiration(2024, 3)).toBe('2024-03-15');
    expect(monthlyExpiration(2025, 4)).toBe('2025-04-17'); // Good Friday
    expect(monthlyExpiration(2026, 6)).toBe('2026-06-18'); // Juneteenth Friday
  });

  it('lists weekly and monthly expirations inside a DTE range', () => {
    const weekly = listedExpirations('2024-03-04', 1, 45, true);
    expect(weekly[0]).toBe('2024-03-08');
    expect(weekly.every((e) => weekday(e) === 5 || weekday(e) === 4)).toBe(true);
    const monthly = listedExpirations('2024-03-04', 1, 70, false);
    expect(monthly).toEqual(['2024-03-15', '2024-04-19']);
    // Good Friday: that week's weekly expires Thursday instead.
    expect(listedExpirations('2024-03-26', 0, 3, true)).toEqual(['2024-03-28']);
  });
});
