import { describe, expect, it } from 'vitest';
import { LONG_ANCHOR, STRUCTURE_COACH } from '../../src/content/structureCoach';
import { STRUCTURES } from '../../src/engine/strategies/structures';

describe('first-use structure coach', () => {
  it('explains every structure, short and plain', () => {
    for (const id of Object.keys(STRUCTURES) as (keyof typeof STRUCTURES)[]) {
      const c = STRUCTURE_COACH[id];
      expect(c, id).toBeDefined();
      expect(c.pitch.length, id).toBeLessThanOrEqual(100);
      expect(c.controls.exp, id).toBeTruthy();
      for (const t of Object.values(c.controls)) expect(t!.length, id).toBeLessThanOrEqual(110);
    }
  });

  it('says "buy" for the strike slider exactly where that slider places a bought leg', () => {
    for (const id of LONG_ANCHOR) {
      const t = STRUCTURE_COACH[id].controls.strike;
      if (t) expect(t, id).toMatch(/BUY/);
    }
    expect(STRUCTURE_COACH.bull_put.controls.strike).toMatch(/sell/);
  });
});
