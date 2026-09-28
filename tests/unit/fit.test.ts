import { describe, expect, it } from 'vitest';
import { fitStructure } from '../../src/engine/strategies/fit';

describe('the call picks the structure', () => {
  it('flips to a structure that leans the way you called', () => {
    expect(fitStructure('bear_call', 3, null)).toBe('bull_put');
    expect(fitStructure('bull_put', 0, null)).toBe('bear_call');
    expect(fitStructure('bull_put', 2, null)).toBe('iron_condor');
  });

  it('keeps a structure that already fits', () => {
    expect(fitStructure('bull_call', 4, null)).toBe('bull_call');
    expect(fitStructure('bear_put', 1, null)).toBe('bear_put');
  });

  it("stays inside the desk's playbook", () => {
    expect(fitStructure('bull_put', 1, ['bull_put', 'bull_call', 'bear_put'])).toBe('bear_put');
    // Nothing neutral in the playbook: keep what you had.
    expect(fitStructure('bull_put', 2, ['bull_put', 'bear_call'])).toBe('bull_put');
  });
});
