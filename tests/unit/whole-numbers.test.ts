import { describe, expect, it } from 'vitest';
import { CARTRIDGES } from '../../src/content/cartridges';
import { DESKS } from '../../src/content/desks';
import { CARTRIDGE_SUMMARY } from '../../src/content/summaries';
import { runScore, type ScoreStep } from '../../src/engine/scoring/mult';
import { SCORE_SCALE, chipsText, multText, pts, ptsSigned } from '../../src/engine/scoring/points';

/**
 * Whole numbers on screen: chips and points are shown ×10, so a payout reads "107 × 3.25 = 348"
 * rather than "10.7 × 3.25 = 35". The engine keeps both to a tenth, so the shown chips times the
 * shown mult is the shown total.
 */
describe('whole numbers', () => {
  it('formats points, chips and mult', () => {
    expect(SCORE_SCALE).toBe(10);
    expect(pts(47.4)).toBe('474');
    expect(pts(200)).toBe('2,000');
    expect(ptsSigned(-3.2)).toBe('−32');
    expect(ptsSigned(12.5)).toBe('+125');
    expect(chipsText(10.73)).toBe('107');
    expect(multText(3.25)).toBe('3.25');
    expect(multText(2)).toBe('2');
    expect(multText(1.3333)).toBe('1.33');
  });

  it('the chips and mult on screen multiply to the total on screen', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 400; n++) {
      const steps: ScoreStep[] = [
        { label: 'base', kind: 'base', op: 'chips', value: Math.round(rnd() * 400) / 10 },
        { label: 'add', kind: 'call', op: 'add', value: Math.round(rnd() * 8) / 4 },
        { label: 'mul', kind: 'cartridge', op: 'mul', value: [1, 1.5, 2, 3][Math.floor(rnd() * 4)] },
        { label: 'meter', kind: 'memo', op: 'meter', value: [1, 2, 0.5][Math.floor(rnd() * 3)] },
      ];
      const pl = Math.round((rnd() - 0.3) * 40_000);
      const r = runScore(pl, 500_000, steps, rnd());
      const meter = r.trace.filter((t) => t.op === 'meter').reduce((a, t) => a * t.value, 1);
      const shownChips = Math.round(r.chips * SCORE_SCALE);
      const shownTotal = Math.round(r.points * SCORE_SCALE);
      expect(shownTotal).toBe(Math.round(shownChips * r.mult * meter));
      // Points are kept to a tenth: whole at ×10.
      expect(Math.abs(r.points * 10 - Math.round(r.points * 10))).toBeLessThan(1e-9);
    }
  });

  it('every chip and point number in the content text is on the ×10 scale', () => {
    const texts = [
      ...Object.values(CARTRIDGE_SUMMARY).flatMap((s) => [s.when, s.get, s.catch ?? '']),
      ...CARTRIDGES.map((c) => c.text),
      ...Object.values(DESKS).map((d) => d.passiveText ?? ''),
    ];
    const bad: string[] = [];
    for (const t of texts)
      for (const m of t.matchAll(/([\d,]+)\+? (chips|points)/g)) {
        // "IV beats HV by 5+ points" is volatility, not score.
        if (/HV by/.test(t)) continue;
        if (Number(m[1].replace(/,/g, '')) % SCORE_SCALE !== 0) bad.push(t);
      }
    expect(bad).toEqual([]);
  });
});
