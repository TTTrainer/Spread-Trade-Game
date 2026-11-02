import { describe, expect, it } from 'vitest';
import { testedShort } from '../../src/engine/run/collector';
import type { Leg } from '../../src/engine/strategies/types';

const EXP = '2025-01-31';
const opt = (right: 'C' | 'P', strike: number, ratio: number): Leg => ({
  kind: 'option',
  right,
  strike,
  expiration: EXP,
  ratio,
});

describe("the Collector's test: at or past a strike you sold", () => {
  it('a bull put is tested once the price reaches its short put (or touches it)', () => {
    const bullPut = [opt('P', 95, -1), opt('P', 90, 1)];
    expect(testedShort(bullPut, 100)).toBeNull();
    expect(testedShort(bullPut, 95.4)).toEqual({ strike: 95, right: 'P' });
    expect(testedShort(bullPut, 93)).toEqual({ strike: 95, right: 'P' });
    expect(testedShort(bullPut, 96)).toBeNull();
  });

  it('a bear call from below; a condor on either side; long legs never count', () => {
    const bearCall = [opt('C', 105, -1), opt('C', 110, 1)];
    expect(testedShort(bearCall, 104.6)).toEqual({ strike: 105, right: 'C' });
    expect(testedShort(bearCall, 103)).toBeNull();
    const condor = [opt('P', 90, 1), opt('P', 95, -1), opt('C', 105, -1), opt('C', 110, 1)];
    expect(testedShort(condor, 100)).toBeNull();
    expect(testedShort(condor, 94)?.right).toBe('P');
    expect(testedShort(condor, 106)?.right).toBe('C');
    const straddle = [opt('C', 100, 1), opt('P', 100, 1)];
    expect(testedShort(straddle, 100)).toBeNull();
  });
});
