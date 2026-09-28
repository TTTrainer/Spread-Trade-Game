import type { MacroEvent } from './types';

/**
 * FOMC statement days and CPI release days, 2019 to 2026.
 * Compiled offline from the Federal Reserve and BLS published schedules. The cloud
 * session that built this could not reach federalreserve.gov or bls.gov, so every row is
 * marked unverified; `npm run data:build` re-checks them when those sites are reachable.
 * Scheduled dates may be shown ahead of time; market reactions appear only on the day.
 */

const FOMC: Record<number, string[]> = {
  2019: ['01-30', '03-20', '05-01', '06-19', '07-31', '09-18', '10-30', '12-11'],
  2020: ['01-29', '03-03', '03-15', '04-29', '06-10', '07-29', '09-16', '11-05', '12-16'],
  2021: ['01-27', '03-17', '04-28', '06-16', '07-28', '09-22', '11-03', '12-15'],
  2022: ['01-26', '03-16', '05-04', '06-15', '07-27', '09-21', '11-02', '12-14'],
  2023: ['02-01', '03-22', '05-03', '06-14', '07-26', '09-20', '11-01', '12-13'],
  2024: ['01-31', '03-20', '05-01', '06-12', '07-31', '09-18', '11-07', '12-18'],
  2025: ['01-29', '03-19', '05-07', '06-18', '07-30', '09-17', '10-29', '12-10'],
  2026: ['01-28', '03-18', '04-29', '06-17', '07-29', '09-16', '10-28', '12-09'],
};

const CPI: Record<number, string[]> = {
  2019: [
    '01-11',
    '02-13',
    '03-12',
    '04-10',
    '05-10',
    '06-12',
    '07-11',
    '08-13',
    '09-12',
    '10-10',
    '11-13',
    '12-11',
  ],
  2020: [
    '01-14',
    '02-13',
    '03-11',
    '04-10',
    '05-12',
    '06-10',
    '07-14',
    '08-12',
    '09-11',
    '10-13',
    '11-12',
    '12-10',
  ],
  2021: [
    '01-13',
    '02-10',
    '03-10',
    '04-13',
    '05-12',
    '06-10',
    '07-13',
    '08-11',
    '09-14',
    '10-13',
    '11-10',
    '12-10',
  ],
  2022: [
    '01-12',
    '02-10',
    '03-10',
    '04-12',
    '05-11',
    '06-10',
    '07-13',
    '08-10',
    '09-13',
    '10-13',
    '11-10',
    '12-13',
  ],
  2023: [
    '01-12',
    '02-14',
    '03-14',
    '04-12',
    '05-10',
    '06-13',
    '07-12',
    '08-10',
    '09-13',
    '10-12',
    '11-14',
    '12-12',
  ],
  2024: [
    '01-11',
    '02-13',
    '03-12',
    '04-10',
    '05-15',
    '06-12',
    '07-11',
    '08-14',
    '09-11',
    '10-10',
    '11-13',
    '12-11',
  ],
  2025: ['01-15', '02-12', '03-12', '04-10', '05-13', '06-11', '07-15', '08-12', '09-11', '10-24', '12-18'],
  2026: ['01-13', '02-11', '03-11', '04-10', '05-12', '06-10', '07-14', '08-12', '09-11'],
};

const UNSCHEDULED_FOMC = new Set(['2020-03-03', '2020-03-15']);

export function macroCalendar(): MacroEvent[] {
  const out: MacroEvent[] = [];
  for (const [y, days] of Object.entries(FOMC)) {
    for (const md of days) {
      const date = `${y}-${md}`;
      out.push({
        date,
        kind: 'FOMC',
        label: UNSCHEDULED_FOMC.has(date) ? 'Emergency FOMC action' : 'FOMC rate decision',
        verified: false,
      });
    }
  }
  for (const [y, days] of Object.entries(CPI)) {
    for (const md of days)
      out.push({ date: `${y}-${md}`, kind: 'CPI', label: 'CPI release', verified: false });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));
}
