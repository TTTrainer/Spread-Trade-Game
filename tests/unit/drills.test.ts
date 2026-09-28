import { describe, expect, it } from 'vitest';
import {
  adaptiveRegimeWeights,
  adaptiveWeights,
  dealQuestion,
  detectSetup,
  DRILL_KINDS,
  gradeAnswer,
  releaseQuestion,
  summarize,
  type DrillAnswer,
  type DrillQuestion,
} from '../../src/engine/drills/drills';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { Rng } from '../../src/engine/rng';
import type { Bar } from '../../src/engine/market/types';

const source = new SyntheticSource({ symbols: ['HLXR', 'ORGR', 'MEMX', 'MKTX'] });
const windows = source.allWindows();

function answerFor(q: DrillQuestion): DrillAnswer {
  switch (q.kind) {
    case 'blind_call':
      return { kind: 'blind_call', bucket: 2, confidence: 0.6 };
    case 'guess_iv':
      return { kind: 'guess_iv', iv: q.answerIv };
    case 'greeks':
      return { kind: 'greeks', index: q.answerIndex };
    case 'setup':
      return { kind: 'setup', choice: q.answer };
    case 'em_darts':
      return { kind: 'em_darts', low: q.spot - 3 * q.em, high: q.spot + 3 * q.em };
  }
}

describe('drills', () => {
  it('deals and grades every kind of question', async () => {
    const rng = new Rng('drills');
    for (const kind of DRILL_KINDS) {
      const q = await dealQuestion(kind, { source, windows, rng, allowFlip: true, history: [] });
      expect(q.kind).toBe(kind);
      if (kind !== 'greeks') expect(q.bars.length).toBeGreaterThan(100);
      const r = await gradeAnswer(q, answerFor(q));
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.explanation.length).toBeGreaterThan(10);
      if (kind === 'guess_iv' || kind === 'greeks' || kind === 'setup') expect(r.correct).toBe(true);
      if (kind === 'em_darts') expect(r.correct).toBe(true);
      releaseQuestion(q.id);
    }
  });

  it('reveals the future only after the answer, from the same view', async () => {
    const rng = new Rng('reveal');
    const q = await dealQuestion('blind_call', { source, windows, rng, allowFlip: false, history: [] });
    expect(q.bars[q.bars.length - 1].date).toBe(q.date);
    const r = await gradeAnswer(q, { kind: 'blind_call', bucket: 3, confidence: 0.9 });
    expect(r.revealBars[r.revealBars.length - 1].date > q.date).toBe(true);
    expect(r.brier).toBeGreaterThanOrEqual(0);
  });

  it('grades the greeks round with a correct reprice among distractors', async () => {
    const q = await dealQuestion('greeks', {
      source,
      windows,
      rng: new Rng('g'),
      allowFlip: false,
      history: [],
    });
    if (q.kind !== 'greeks') throw new Error('kind');
    expect(new Set(q.choices).size).toBe(4);
    expect((await gradeAnswer(q, { kind: 'greeks', index: (q.answerIndex + 1) % 4 })).correct).toBe(false);
  });

  it('detects setups from past bars only', () => {
    const flat: Bar[] = Array.from({ length: 200 }, (_, i) => {
      const c = 100 + Math.sin(i / 6) * (i < 180 ? 8 : 0.3);
      return { date: `d${i}`, open: c, high: c + 0.2, low: c - 0.2, close: c, volume: 1, source: 'real' };
    });
    expect(detectSetup(flat)).toBe('bb_squeeze');
    expect(detectSetup(flat.slice(0, 50))).toBe('none');
  });

  it('adapts only the drill mix toward weak skills', () => {
    const w = adaptiveWeights([
      { kind: 'greeks', score: 95 },
      { kind: 'guess_iv', score: 10 },
    ]);
    expect(w.guess_iv).toBeGreaterThan(w.greeks);
    expect(w.setup).toBeCloseTo(0.9, 9);
    const r = adaptiveRegimeWeights([{ kind: 'blind_call', score: 5, regime: 'volatile' }]);
    expect(r.volatile).toBeGreaterThan(r.calm);
  });

  it('summarizes streaks, Brier and calibration', () => {
    const s = summarize([
      {
        questionId: 'a',
        kind: 'blind_call',
        correct: true,
        score: 80,
        brier: 0.3,
        detail: { bucket: 3, confidence: 0.7 },
        revealBars: [],
        explanation: '',
      },
      {
        questionId: 'b',
        kind: 'blind_call',
        correct: true,
        score: 80,
        brier: 0.3,
        detail: { bucket: 3, confidence: 0.7 },
        revealBars: [],
        explanation: '',
      },
      {
        questionId: 'c',
        kind: 'greeks',
        correct: false,
        score: 0,
        detail: {},
        revealBars: [],
        explanation: '',
      },
    ]);
    expect(s.bestStreak).toBe(2);
    expect(s.meanBrier).toBeCloseTo(0.3, 9);
    expect(s.calibration.find((c) => c.confidence === 0.7)?.hitRate).toBe(1);
    expect(s.byKind.greeks?.avg).toBe(0);
  });
});
