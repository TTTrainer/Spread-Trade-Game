import { describe, expect, it } from 'vitest';
import { TUTORIAL_MOMENTS, TUTORIAL_PARTS, TUTORIAL_STEPS, TUT_REGIONS } from '../../src/content/tutorial';
import {
  REGION_SELECTORS,
  TUT_START,
  acknowledge,
  activeLesson,
  hiddenRegions,
  lessonText,
  settle,
  stage,
  tutorialCss,
  type TutCtx,
  type TutProgress,
} from '../../src/ui/tutorial/flow';

const ctx = (patch: Partial<TutCtx> = {}): TutCtx => ({
  phase: 'round',
  round: 0,
  placed: 0,
  closed: 0,
  day: 0,
  touched: false,
  recap: false,
  decision: false,
  stress: 0,
  canEndRound: false,
  strikeKey: 'k0',
  side: 'above',
  ...patch,
});

const at = (id: string): TutProgress => ({ ...TUT_START, idx: TUTORIAL_STEPS.findIndex((s) => s.id === id) });
const stepId = (p: TutProgress, c: TutCtx) => activeLesson(p, c)?.lesson.id ?? null;

describe('tutorial script', () => {
  it('is short, ordered and covers every part of the desk', () => {
    const ids = [...TUTORIAL_STEPS, ...TUTORIAL_MOMENTS].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [...TUTORIAL_STEPS, ...TUTORIAL_MOMENTS]) {
      // Two short sentences a new trader can take in at a glance.
      expect(s.text.length, s.id).toBeLessThanOrEqual(200);
      expect(s.title.length, s.id).toBeLessThan(32);
      for (const r of s.reveal ?? [])
        expect(r === '*' || TUT_REGIONS.includes(r), `${s.id}: ${r}`).toBe(true);
    }
    // Lessons run in the order the run does.
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) {
      const a = TUTORIAL_STEPS[i - 1];
      const b = TUTORIAL_STEPS[i];
      expect(stage(b.at.phase, b.at.round), b.id).toBeGreaterThanOrEqual(stage(a.at.phase, a.at.round));
      expect(b.part).toBeGreaterThanOrEqual(a.part);
    }
    expect(new Set(TUTORIAL_STEPS.map((s) => s.part)).size).toBe(TUTORIAL_PARTS.length);
    // The goal comes first, then the trade, then the powerups.
    const idx = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
    expect(idx('goal')).toBeLessThan(idx('view'));
    // The strategy is described before the player picks a side; safe vs bold before placing.
    expect(idx('spread')).toBeLessThan(idx('view'));
    // A strike is explained, and Ines shows a practice trade, before the player builds one.
    expect(idx('strikeword')).toBeLessThan(idx('level'));
    expect(idx('level')).toBeLessThan(idx('example'));
    expect(idx('example')).toBeLessThan(idx('view'));
    expect(idx('strike')).toBeLessThan(idx('safe'));
    expect(idx('safe')).toBeLessThan(idx('place'));
    expect(idx('place')).toBeLessThan(idx('carts'));
    // Every region has a selector, and the whole desk is on by the end.
    for (const r of TUT_REGIONS) expect(REGION_SELECTORS[r], r).toBeTruthy();
    expect(hiddenRegions({ ...TUT_START, idx: TUTORIAL_STEPS.length - 1 }, null)).toEqual([]);
    // The clock is only ever held before the first day.
    for (const s of TUTORIAL_STEPS.slice(idx('clock'))) expect(s.holdClock ?? false, s.id).toBe(false);
  });
});

describe('tutorial flow', () => {
  it('starts on an almost empty desk and lights it up one lesson at a time', () => {
    const c = ctx();
    expect(stepId(TUT_START, c)).toBe('welcome');
    const hidden0 = hiddenRegions(TUT_START, activeLesson(TUT_START, c));
    for (const r of ['goal', 'lineup', 'center', 'right', 'sell', 'rail', 'stress'] as const)
      expect(hidden0).toContain(r);
    const p1 = acknowledge(TUT_START, activeLesson(TUT_START, c));
    expect(stepId(p1, c)).toBe('goal');
    expect(hiddenRegions(p1, activeLesson(p1, c))).not.toContain('goal');
    expect(hiddenRegions(p1, activeLesson(p1, c))).toContain('lineup');
    expect(tutorialCss(['lineup'], [])).toContain('[data-testid="lineup"]');
    expect(tutorialCss(['lineup'], [])).toContain('visibility: hidden');
  });

  it('moves on when the player does the thing', () => {
    // Up or down: shaping the trade (the bubble buttons or the number keys) answers it.
    expect(settle(at('view'), ctx({ touched: true }), null).idx).toBe(at('line').idx);
    // Moving the strike since the lesson opened.
    expect(settle(at('strike'), ctx({ strikeKey: 'k0' }), 'k0').idx).toBe(at('strike').idx);
    expect(settle(at('strike'), ctx({ strikeKey: 'k1' }), 'k0').idx).toBe(at('safe').idx);
    // A trade placed early skips the rest of the how-to-trade lessons.
    expect(settle(at('line'), ctx({ placed: 1, touched: true }), null).idx).toBe(at('placed').idx);
    expect(settle(at('clock'), ctx({ placed: 1, day: 1 }), null).idx).toBe(at('exitplan').idx);
    // Explaining lessons wait for GOT IT.
    expect(settle(at('goal'), ctx(), null).idx).toBe(at('goal').idx);
  });

  it('skips lessons whose part of the run has passed and waits for ones still ahead', () => {
    const shop = ctx({ phase: 'shop', round: 0 });
    const p = settle(at('keep'), shop, null);
    expect(TUTORIAL_STEPS[p.idx].id).toBe('shopcash');
    expect(stepId(p, shop)).toBe('shopcash');
    // In the shop the Month 2 lessons wait (no bubble once the shop's are done).
    expect(stepId(at('tickets'), shop)).toBeNull();
    // A sit-out (no shop) passes straight to Month 2.
    expect(TUTORIAL_STEPS[settle(at('carts'), ctx({ round: 1 }), null).idx].id).toBe('tickets');
  });

  it('shows one-time lessons when something first happens, after the first trade', () => {
    const decision = ctx({ placed: 1, day: 3, decision: true });
    expect(activeLesson(at('lineup'), decision)?.kind).toBe('step');
    const a = activeLesson(at('keep'), decision);
    expect(a?.kind).toBe('moment');
    expect(a?.lesson.id).toBe('m-decision');
    const seen = acknowledge(at('keep'), a);
    expect(seen.seen).toContain('m-decision');
    expect(stepId(seen, decision)).toBe('keep');
    // Stress turns its gauge on when it first rises.
    const stress = activeLesson(at('keep'), ctx({ placed: 1, day: 3, stress: 4 }));
    expect(stress?.lesson.id).toBe('m-stress');
    expect(hiddenRegions(at('keep'), stress)).not.toContain('stress');
  });

  it('turns everything on when the player skips the lessons', () => {
    const p = { ...TUT_START, skipped: true };
    expect(activeLesson(p, ctx())).toBeNull();
    expect(hiddenRegions(p, null)).toEqual([]);
  });

  it('words the winning side of the line by direction', () => {
    const line = TUTORIAL_STEPS.find((s) => s.id === 'line')!.text;
    expect(lessonText(line, { side: 'above' })).toContain('stays above this line');
    expect(lessonText(line, { side: 'below' })).toContain('stays below this line');
    // The position is spelled out: which strike, put or call, and that you are selling it.
    expect(lessonText(line, { side: 'above', vars: { strike: '95', right: 'put' } })).toContain(
      "You're SELLING the 95 put",
    );
    // A word with nothing to fill it never shows as a raw placeholder.
    expect(lessonText('POP {pop}', { side: 'above' })).toBe('POP —');
    const example = TUTORIAL_STEPS.find((s) => s.id === 'example')!.text;
    expect(
      lessonText(example, { side: 'above', vars: { strike: '94', right: 'put', kind: 'floor', pop: '81%' } }),
    ).toMatch(/sell the 94 put, past the floor.*POP 81%/);
  });
});
