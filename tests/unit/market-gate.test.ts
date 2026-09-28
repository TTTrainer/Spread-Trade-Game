import { describe, expect, it } from 'vitest';
import { checkGate, gateSource, GATE_RULES } from '../../src/engine/market/gate';
import { LookaheadError, type MarketDataSource } from '../../src/engine/market/source';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';

describe('source gate', () => {
  it('blocks dated reads after the clock', () => {
    expect(() => checkGate('bars', ['X', '2024-01-01', '2024-01-11'], '2024-01-10')).toThrow(LookaheadError);
    expect(() => checkGate('chain', ['X', '2024-01-11'], '2024-01-10')).toThrow(LookaheadError);
    expect(() => checkGate('quotes', ['X', [], '2024-01-01', '2024-01-11'], '2024-01-10')).toThrow(
      LookaheadError,
    );
    expect(() => checkGate('earnings', ['X', '2024-01-01', '2024-01-11'], '2024-01-10')).toThrow(
      LookaheadError,
    );
    expect(() => checkGate('vix', ['2024-01-01', '2024-01-11'], '2024-01-10')).toThrow(LookaheadError);
    expect(() => checkGate('bars', ['X', '2024-01-01', '2024-01-10'], '2024-01-10')).not.toThrow();
  });

  it('lets announced schedules and calendars look ahead', () => {
    expect(() =>
      checkGate('earningsSchedule', ['X', '2024-01-01', '2024-06-01'], '2024-01-10'),
    ).not.toThrow();
    expect(() => checkGate('macro', ['2024-01-01', '2024-06-01'], '2024-01-10')).not.toThrow();
    expect(() => checkGate('tradingDays', ['2024-01-01', '2024-06-01'], '2024-01-10')).not.toThrow();
    // Dividends are declared a few weeks ahead, no more.
    expect(() => checkGate('dividends', ['X', '2024-01-01', '2024-02-10'], '2024-01-10')).not.toThrow();
    expect(() => checkGate('dividends', ['X', '2024-01-01', '2024-03-10'], '2024-01-10')).toThrow(
      LookaheadError,
    );
  });

  it('covers every source method', () => {
    const methods = Object.getOwnPropertyNames(SyntheticSource.prototype).filter(
      (m) => m !== 'constructor' && !['allWindows', 'volSeries', 'spreadPct'].includes(m),
    );
    for (const m of methods) expect(GATE_RULES, m).toHaveProperty(m);
  });

  it('wraps a source and throws before touching it', async () => {
    let touched = false;
    const fake = {
      bars: async () => {
        touched = true;
        return [];
      },
    } as unknown as MarketDataSource;
    const gated = gateSource(fake, () => '2024-01-10');
    await expect(async () => gated.bars('X', '2024-01-01', '2024-02-01')).rejects.toThrow(LookaheadError);
    expect(touched).toBe(false);
    await gated.bars('X', '2024-01-01', '2024-01-10');
    expect(touched).toBe(true);
  });
});
