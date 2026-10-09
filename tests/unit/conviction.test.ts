import { describe, expect, it } from 'vitest';
import {
  CONVICTION,
  convictionQty,
  convictionStep,
  impliedBucket,
} from '../../src/engine/trading/conviction';
import type { OptionLeg } from '../../src/engine/strategies/types';

const put = (strike: number, ratio: number): OptionLeg => ({
  kind: 'option',
  right: 'P',
  strike,
  expiration: '2024-06-21',
  ratio,
});
const call = (strike: number, ratio: number): OptionLeg => ({ ...put(strike, ratio), right: 'C' });

describe('conviction', () => {
  it('sizes to the share of the risk cap it commits', () => {
    // $10,000 equity, 10% cap: $1,000 at ALL IN, $200 at a FEELER. $190 max loss per contract.
    expect(convictionQty(19_000, 1_000_000, 0.1, 0.9)).toBe(5);
    expect(convictionQty(19_000, 1_000_000, 0.1, 0.5)).toBe(1);
    expect(convictionQty(19_000, 1_000_000, 0.1, 0.7)).toBe(3);
    // Never below one contract.
    expect(convictionQty(90_000, 1_000_000, 0.1, 0.5)).toBe(1);
  });

  it('uses more of the cap as conviction rises', () => {
    const qs = CONVICTION.map((c) => convictionQty(5_000, 2_000_000, 0.1, c.confidence));
    for (let i = 1; i < qs.length; i++) expect(qs[i]).toBeGreaterThanOrEqual(qs[i - 1]);
    expect(convictionStep(0.74).confidence).toBe(0.7);
  });

  it('reads the call from the trade', () => {
    // Bull put below the price: up. Sold above the price: needs a big rise.
    expect(impliedBucket('bull_put', [put(95, -1), put(90, 1)], 100, 0.06)).toBe(3);
    expect(impliedBucket('bull_put', [put(102, -1), put(97, 1)], 100, 0.06)).toBe(4);
    expect(impliedBucket('bear_call', [call(105, -1), call(110, 1)], 100, 0.06)).toBe(1);
    expect(impliedBucket('bear_call', [call(99, -1), call(104, 1)], 100, 0.06)).toBe(0);
    // A bull call bought well out of the money calls a big move.
    expect(impliedBucket('bull_call', [call(100, 1), call(105, -1)], 100, 0.06)).toBe(3);
    expect(impliedBucket('bull_call', [call(106, 1), call(110, -1)], 100, 0.06)).toBe(4);
    expect(impliedBucket('iron_condor', [], 100, 0.06)).toBe(2);
    expect(impliedBucket('long_straddle', [], 100, 0.06)).toBe(4);
    expect(impliedBucket('long_straddle', [], 100, 0.06, true)).toBe(0);
  });
});
