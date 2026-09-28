import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';
import {
  adjustAction,
  closeAction,
  exerciseAction,
  forceCloseAtWindowEnd,
  rollAction,
  sellSharesAtOpen,
} from '../../src/engine/lifecycle/actions';
import {
  atClose,
  DEFAULT_REALISM,
  defaultPause,
  endOfDay,
  daysToExpiry,
  type DayContext,
} from '../../src/engine/lifecycle/daily';
import {
  defaultBrackets,
  mergeLegs,
  openPosition,
  plIfClosedAt,
  stockRatio,
} from '../../src/engine/lifecycle/position';
import type { DayBook, EntrySnapshot, Position } from '../../src/engine/lifecycle/types';
import type { Leg, OptionLeg } from '../../src/engine/strategies/types';
import { bookFromChain, flatBook, flatChain } from '../helpers/market';

const EXP = '2025-01-31';

const entry = (): EntrySnapshot => ({
  spot: 100,
  ivr: 45,
  iv: 0.3,
  hv20: 0.25,
  expectedMove: 6,
  expectedMovePct: 0.06,
  edgePercentile: 0.6,
  edgeTier: 'none',
  rewardToRisk: 0.4,
  pop: 0.7,
  maxProfitCents: 15000,
  maxLossCents: 35000,
  riskPct: 0.07,
  shortStrikes: [95],
  dte: 28,
  earningsInside: false,
  exDivInside: false,
  rsi: 50,
  trendSlope: 0,
  sma50Slope: 0,
  macdCrossDaysAgo: null,
  macdCrossDir: null,
  bollingerUpper: null,
  bollingerLower: null,
  trend5d: 0,
  ivVsHv: 5,
  atr: 2,
  credit: true,
  fillVsMidCents: 0,
});

const bullPut: Leg[] = [
  { kind: 'option', right: 'P', strike: 95, expiration: EXP, ratio: -1 },
  { kind: 'option', right: 'P', strike: 90, expiration: EXP, ratio: 1 },
];

function ctx(over: Partial<DayContext> = {}): DayContext {
  return {
    realism: { ...DEFAULT_REALISM },
    pause: defaultPause(),
    autoBrackets: false,
    suppressOnGap: false,
    rng: new Rng('ctx'),
    ...over,
  };
}

function open(legs = bullPut, qty = 2, fill = -1.5, book?: DayBook): Position {
  const b = book ?? flatBook({ date: '2025-01-03', spot: 100, expirations: [EXP] });
  return openPosition({
    id: 'p1',
    cardId: 'c1',
    windowId: 1,
    symbol: 'TEST',
    structureId: 'bull_put',
    legs,
    qty,
    date: b.date,
    fillNet: fill,
    midNet: fill - 0.02,
    feesCents: 0,
    collateralCents: 70000,
    brackets: defaultBrackets(fill),
    entry: entry(),
    book: b,
  });
}

const day = (date: string, spot: number, extra: Partial<DayBook> = {}, vol = 0.3) =>
  flatBook({ date, spot, vol, expirations: [EXP, '2025-02-28'] }, extra);

describe('opening and marking', () => {
  it('books the credit as integer cents and P/L = cash + value - fees', () => {
    const p = open();
    expect(p.cashCents).toBe(30000); // 1.50 x 100 shares x 2
    expect(Number.isInteger(p.marks[0].plCents)).toBe(true);
    expect(p.executionCents).toBe(-400); // filled 0.02 worse than mid on 2 contracts
    expect(plIfClosedAt(p, 0.5)).toBeCloseTo(1.0, 9);
    expect(defaultBrackets(-1.5)).toEqual({ targetPl: 0.75, stopPl: 1.5, targetPct: 0.5, stopMult: 2 });
    expect(defaultBrackets(2)).toMatchObject({ targetPl: 1, stopPl: 1 });
  });
});

describe('brackets and decision points', () => {
  it('asks to confirm the profit target, or fills it when brackets are automatic', () => {
    const p = open();
    const rally = day('2025-01-21', 112);
    const r = atClose(p, rally, ctx());
    expect(r.decisions.map((d) => d.kind)).toContain('target_hit');
    expect(r.decisions.find((d) => d.kind === 'target_hit')?.planned).toBe('close');
    const auto = atClose(p, rally, ctx({ autoBrackets: true }));
    expect(auto.autoClosed).toBe(true);
    expect(auto.pos.exitReason).toBe('target');
    expect(auto.pos.flags.closedAtPlan).toBe('target');
    // Closing at the planned target locks in (at least) 50% of the credit.
    expect(auto.pos.realizedCents).toBeGreaterThanOrEqual(15000);
  });

  it('asks to confirm the stop, or stops out at the natural price', () => {
    const p = open();
    const drop = day('2025-01-10', 88);
    const r = atClose(p, drop, ctx());
    expect(r.decisions.map((d) => d.kind)).toContain('stop_hit');
    expect(r.decisions.map((d) => d.kind)).toContain('short_touched');
    const auto = atClose(p, drop, ctx({ autoBrackets: true }));
    expect(auto.pos.exitReason).toBe('stop');
    expect(auto.pos.realizedCents).toBeLessThan(-30000);
  });

  it('flags 21 DTE, earnings tomorrow, ex-dividend with an ITM short call, and pin risk', () => {
    const p = open();
    const d21 = atClose(p, day('2025-01-10', 101), ctx());
    expect(d21.decisions.map((d) => d.kind)).toContain('dte21');
    const earn = atClose(p, day('2025-01-06', 101, { earningsTomorrow: true }), ctx());
    expect(earn.decisions.map((d) => d.kind)).toContain('earnings_tomorrow');
    expect(earn.pos.flags.earningsHeld).toBe(true);
    const bearCall: Leg[] = [
      { kind: 'option', right: 'C', strike: 100, expiration: EXP, ratio: -1 },
      { kind: 'option', right: 'C', strike: 105, expiration: EXP, ratio: 1 },
    ];
    const bc = open(bearCall, 1, -2);
    const ex = atClose(
      bc,
      day('2025-01-06', 102, { exDivTomorrow: { symbol: 'TEST', exDate: '2025-01-07', amount: 0.8 } }),
      ctx(),
    );
    expect(ex.decisions.map((d) => d.kind)).toContain('exdiv_itm_call');
    const pin = atClose(p, day(EXP, 92.5), ctx());
    expect(pin.decisions.map((d) => d.kind)).toContain('pin_risk');
  });

  it('respects the pause settings and gap-day suppression', () => {
    const p = open();
    const quiet = defaultPause();
    quiet.short_touched = false;
    quiet.stop_hit = false;
    const r = atClose(p, day('2025-01-10', 94), ctx({ pause: quiet }));
    expect(r.decisions.map((d) => d.kind)).not.toContain('short_touched');
    const g = atClose(p, day('2025-01-06', 95, { gapDay: true }), ctx({ suppressOnGap: true }));
    expect(g.decisions.filter((d) => d.kind === 'short_touched')).toHaveLength(0);
    expect(daysToExpiry(p, '2025-01-21')).toBe(10);
  });
});

describe('expiration', () => {
  it('lets out-of-the-money spreads expire worthless for the full credit', () => {
    const p = open();
    const r = endOfDay(p, day(EXP, 104), ctx());
    expect(r.pos.status).toBe('closed');
    expect(r.pos.exitReason).toBe('expired');
    expect(r.pos.realizedCents).toBe(30000);
  });

  it('settles a spread with both legs in the money at max value', () => {
    const p = open();
    const r = endOfDay(p, day(EXP, 80), ctx());
    expect(r.pos.status).toBe('closed');
    expect(r.pos.realizedCents).toBe(30000 - 100000); // credit minus the 5-wide x 2
    expect(stockRatio(r.pos.legs)).toBe(0);
  });

  it('assigns the short leg when the price finishes between the strikes, then sells at the next open', () => {
    const p = open();
    const r = endOfDay(p, day(EXP, 92.8), ctx());
    expect(r.assignedToday).toBe(true);
    expect(r.pos.status).toBe('open');
    expect(stockRatio(r.pos.legs)).toBe(1); // long 200 shares (1 per unit x 2 units)
    const next = atClose(r.pos, day('2025-02-03', 93, { open: 92 }), ctx());
    expect(next.decisions.map((d) => d.kind)).toContain('assigned_shares');
    const sold = sellSharesAtOpen(next.pos, {
      book: day('2025-02-03', 93, { open: 92 }),
      rng: new Rng('x'),
      feesOn: false,
      bidAsk: true,
    });
    expect(sold.pos.status).toBe('closed');
    // Paid 95 for shares, sold at 92: -3 x 200 = -600, plus the 300 credit.
    expect(sold.pos.realizedCents).toBe(30000 - 60000);
  });

  it('flips a seeded coin for pin risk within 0.5% of a short strike', () => {
    const csp: Leg[] = [{ kind: 'option', right: 'P', strike: 95, expiration: EXP, ratio: -1 }];
    let assigned = 0;
    for (let i = 0; i < 400; i++) {
      const r = endOfDay(open(csp, 1, -1), day(EXP, 95.2), ctx({ rng: new Rng(`pin${i}`) }));
      if (r.assignedToday) assigned++;
    }
    expect(assigned).toBeGreaterThan(150);
    expect(assigned).toBeLessThan(250);
    const again = endOfDay(open(csp, 1, -1), day(EXP, 95.2), ctx({ rng: new Rng('pin7') })).assignedToday;
    expect(endOfDay(open(csp, 1, -1), day(EXP, 95.2), ctx({ rng: new Rng('pin7') })).assignedToday).toBe(
      again,
    );
  });

  it('cash-settles at intrinsic when expiration mechanics are off', () => {
    const p = open();
    const r = endOfDay(
      p,
      day(EXP, 92.8),
      ctx({ realism: { ...DEFAULT_REALISM, expirationMechanics: false } }),
    );
    expect(r.pos.status).toBe('closed');
    expect(r.pos.realizedCents).toBe(30000 - 44000);
  });
});

describe('early assignment and dividends', () => {
  it("assigns an ITM short call whose extrinsic is below tomorrow's dividend", () => {
    const call: Leg[] = [{ kind: 'option', right: 'C', strike: 90, expiration: EXP, ratio: -1 }];
    const p = open(call, 1, -10.5);
    const book = flatBook(
      { date: '2025-01-28', spot: 101, vol: 0.05, expirations: [EXP] },
      { exDivTomorrow: { symbol: 'T', exDate: '2025-01-29', amount: 1 } },
    );
    const r = endOfDay(p, book, ctx());
    expect(r.assignedToday).toBe(true);
    expect(stockRatio(r.pos.legs)).toBe(-1);
    // Short stock pays the dividend on the ex-date.
    const exd = atClose(
      r.pos,
      flatBook(
        { date: '2025-01-29', spot: 100, expirations: [EXP] },
        { exDivToday: { symbol: 'T', exDate: '2025-01-29', amount: 1 } },
      ),
      ctx(),
    );
    expect(exd.pos.flags.dividendsCents).toBe(-10000); // short 100 shares pays $1 each
  });

  it('can assign deep in-the-money short puts early (seeded)', () => {
    const csp: Leg[] = [{ kind: 'option', right: 'P', strike: 110, expiration: EXP, ratio: -1 }];
    let n = 0;
    for (let i = 0; i < 200; i++)
      if (
        endOfDay(
          open(csp, 1, -3),
          flatBook({ date: '2025-01-15', spot: 90, vol: 0.02, expirations: [EXP] }),
          ctx({ rng: new Rng(`ea${i}`) }),
        ).assignedToday
      )
        n++;
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(65);
    const off = endOfDay(
      open(csp, 1, -3),
      flatBook({ date: '2025-01-15', spot: 90, vol: 0.02, expirations: [EXP] }),
      ctx({ realism: { ...DEFAULT_REALISM, earlyAssignment: false } }),
    );
    expect(off.assignedToday).toBe(false);
  });
});

describe('player actions', () => {
  const env = (b: DayBook) => ({ book: b, rng: new Rng('act'), feesOn: true, bidAsk: true });

  it('closes at market (natural) with fees and records execution cost', () => {
    const p = open();
    const b = day('2025-01-10', 100);
    const r = closeAction(p, { type: 'market' }, env(b));
    expect(r.fill.filled).toBe(true);
    expect(r.pos.status).toBe('closed');
    expect(r.pos.feesCents).toBe(260);
    expect(r.executionCents).toBeLessThan(0);
    expect(r.pos.realizedCents).toBe(r.pos.cashCents - r.pos.feesCents);
    const noSpread = closeAction(p, { type: 'market' }, { ...env(b), bidAsk: false });
    expect(noSpread.executionCents).toBe(0);
  });

  it('rolls out in time for a net credit or debit and keeps P/L consistent', () => {
    const p = open();
    const b = day('2025-01-24', 95.5);
    const newLegs: OptionLeg[] = [
      { kind: 'option', right: 'P', strike: 93, expiration: '2025-02-28', ratio: -1 },
      { kind: 'option', right: 'P', strike: 88, expiration: '2025-02-28', ratio: 1 },
    ];
    const r = rollAction(p, newLegs, { type: 'market' }, env(b));
    expect(r.fill.filled).toBe(true);
    expect(r.pos.flags.rolls).toBe(1);
    expect(r.pos.legs).toHaveLength(2);
    expect((r.pos.legs[0] as OptionLeg).expiration).toBe('2025-02-28');
    const before = atClose(p, b, ctx()).pos.marks.at(-1)?.plCents ?? 0;
    const after = r.pos.marks.at(-1)?.plCents ?? 0;
    // Rolling costs only execution and fees versus holding the old legs at mid.
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThan(5000);
    const missing = rollAction(
      p,
      [{ kind: 'option', right: 'P', strike: 1, expiration: '2025-02-28', ratio: -1 }],
      { type: 'market' },
      env(b),
    );
    expect(missing.fill.filled).toBe(false);
  });

  it('adjusts by removing a leg, exercises long options, and force-closes at the window end', () => {
    const p = open();
    const b = day('2025-01-10', 100);
    const r = adjustAction(p, [], [bullPut[1]], { type: 'market' }, env(b));
    expect(r.pos.legs).toHaveLength(1);
    const all = adjustAction(p, [], bullPut, { type: 'market' }, env(b));
    expect(all.pos.status).toBe('closed');
    const longCall = open([{ kind: 'option', right: 'C', strike: 90, expiration: EXP, ratio: 1 }], 1, 10.5);
    const ex = exerciseAction(longCall, longCall.legs[0] as OptionLeg, '2025-01-10', day('2025-01-10', 104));
    expect(stockRatio(ex.legs)).toBe(1);
    expect(ex.flags.exercised).toBe(true);
    const fc = forceCloseAtWindowEnd(p, env(b));
    expect(fc.exitReason).toBe('window_end');
    expect(fc.status).toBe('closed');
  });

  it('merges identical legs', () => {
    const merged = mergeLegs([
      { kind: 'stock', ratio: 1 },
      { kind: 'stock', ratio: -1 },
      { kind: 'option', right: 'C', strike: 100, expiration: EXP, ratio: 1 },
      { kind: 'option', right: 'C', strike: 100, expiration: EXP, ratio: -1 },
      { kind: 'option', right: 'P', strike: 90, expiration: EXP, ratio: 1 },
    ]);
    expect(merged).toEqual([{ kind: 'option', right: 'P', strike: 90, expiration: EXP, ratio: 1 }]);
  });

  it('models a mark when a quote is missing', () => {
    const p = open();
    const sparse = bookFromChain(
      flatChain({ date: '2025-01-10', spot: 60, expirations: [EXP], strikes: [50, 55, 60] }),
    );
    const r = atClose(p, sparse, ctx());
    expect(r.pos.marks.at(-1)?.modeled).toBe(true);
    expect(r.pos.marks.at(-1)?.value).toBeCloseTo(-5, 1);
  });
});
