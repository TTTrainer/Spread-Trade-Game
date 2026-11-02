import { describe, expect, it } from 'vitest';
import { cboeSymbol, mapCboe, mapCboeHistory, parseOcc } from '../../data-pipeline/live/cboe';
import { sessionBar } from '../../data-pipeline/schwab/map';

const occ = (root: string, exp: string, right: 'C' | 'P', strike: number) =>
  `${root}${exp.slice(2).replaceAll('-', '')}${right}${String(Math.round(strike * 1000)).padStart(8, '0')}`;

const opt = (option: string, bid: number, ask: number, iv = 0.2) => ({ option, bid, ask, iv });

describe("Cboe's delayed quotes", () => {
  it('reads OCC option names and spells indexes with an underscore', () => {
    expect(parseOcc('SPXW261106P06500000')).toEqual({
      root: 'SPXW',
      expiration: '2026-11-06',
      right: 'P',
      strike: 6500,
    });
    expect(parseOcc('SPY261211C00737500')?.strike).toBe(737.5);
    expect(parseOcc('nonsense')).toBeNull();
    expect(cboeSymbol('SPX')).toBe('_SPX');
    expect(cboeSymbol('AAPL')).toBe('AAPL');
  });

  it("maps today's candle so far and a chain with greeks, dated the session of the last trade", () => {
    const json = {
      timestamp: '2026-11-02 19:28:27',
      data: {
        current_price: 100,
        open: 98,
        high: 101,
        low: 97.5,
        close: 100,
        volume: 1234,
        last_trade_time: '2026-11-02T14:13:26',
        options: [
          opt(occ('MKTX', '2026-11-20', 'P', 95), 1.1, 1.2),
          opt(occ('MKTX', '2026-11-20', 'C', 105), 0.9, 1.0),
          // An adjusted contract after a split, a zero ask, and an expiration past 70 days: all left out.
          opt(occ('MKTX1', '2026-11-20', 'P', 95), 1.0, 1.3),
          opt(occ('MKTX', '2026-11-20', 'P', 80), 0, 0),
          opt(occ('MKTX', '2027-03-19', 'P', 95), 4, 4.2),
        ],
      },
    };
    const s = mapCboe(json, 'MKTX', 0.04, '2026-11-02');
    expect(s?.asOf).toBe('2026-11-02');
    expect(s?.quoteTime).toBe('14:13');
    expect(s?.bar).toMatchObject({
      date: '2026-11-02',
      open: 98,
      high: 101,
      low: 97.5,
      close: 100,
      volume: 1234,
    });
    expect(s?.chain?.quotes.map((q) => `${q.right}${q.strike}`)).toEqual(['P95', 'C105']);
    expect(s?.chain?.spot).toBe(100);
    expect(s?.chain?.quotes[0].delta).toBeLessThan(0);
    expect(s?.chain?.quotes[1].delta).toBeGreaterThan(0);
  });

  it("keeps an index's PM-settled weekly over its AM monthly on the same strike and day", () => {
    const json = {
      data: {
        current_price: 6800,
        last_trade_time: '2026-11-02T10:00:00',
        options: [
          opt(occ('SPX', '2026-11-20', 'P', 6500), 10, 10.4),
          opt(occ('SPXW', '2026-11-20', 'P', 6500), 10.1, 10.9),
        ],
      },
    };
    const q = mapCboe(json, 'SPX', 0.04, '2026-11-02')?.chain?.quotes;
    expect(q).toHaveLength(1);
    expect(q?.[0].ask).toBe(10.9);
  });

  it('reads the daily history (numbers come as text; early index rows have no open)', () => {
    const bars = mapCboeHistory({
      data: [
        {
          date: '2026-10-30',
          open: '7631.07',
          high: '7637.48',
          low: '7527.56',
          close: '7580.07',
          volume: '0.0',
        },
        { date: '1975-01-02', open: '0.000000', high: '70.92', low: '68.65', close: '70.23', volume: '0.0' },
        { date: '2026-11-01', open: '1', high: '1', low: '1', close: '1', volume: '0' },
      ],
    });
    expect(bars.map((b) => b.date)).toEqual(['1975-01-02', '2026-10-30']);
    expect(bars[0].open).toBe(70.23);
  });
});

describe("Schwab's live quote: today's candle so far", () => {
  const at = (iso: string) => Date.parse(iso);

  it('uses the session open, high, low and last trade, with the New York time of that trade', () => {
    const s = sessionBar(
      {
        underlyingPrice: 100.5,
        underlying: {
          last: 100.4,
          openPrice: 99,
          highPrice: 101,
          lowPrice: 98.5,
          totalVolume: 5000,
          tradeTime: at('2026-11-02T19:28:05Z'),
          delayed: false,
        },
      },
      '2026-11-02',
    );
    expect(s?.bar).toMatchObject({ open: 99, high: 101, low: 98.5, close: 100.4, volume: 5000 });
    expect(s?.time).toBe('14:28');
    expect(s?.delayed).toBe(false);
  });

  it("has no candle for today when the last trade was yesterday's (before the open)", () => {
    const s = sessionBar({ underlying: { last: 100, tradeTime: at('2026-10-30T20:00:00Z') } }, '2026-11-02');
    expect(s).toBeNull();
  });
});
