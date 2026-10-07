import { describe, expect, it } from 'vitest';
import { BOSSES } from '../../src/content/bosses';
import { BUILDER_BY_SYMBOL } from '../../src/content/builderTickers';
import { DEV_CHECKS } from '../../src/content/devChecklist';
import { COMPLIANCE_RULES } from '../../src/content/meta';
import { OPTIONS_COURSE } from '../../src/content/optionsCourse';

describe('developer test checklist', () => {
  it('covers only what changed since 1.6, in plain words, with unique ids', () => {
    expect(new Set(DEV_CHECKS.map((c) => c.id)).size).toBe(DEV_CHECKS.length);
    for (const c of DEV_CHECKS) {
      expect(['1.7.0', '1.8.0', '1.8.1', '1.8.2'], c.id).toContain(c.ver);
      expect(c.look.length, c.id).toBeLessThanOrEqual(220);
      expect(c.title.length, c.id).toBeLessThan(44);
    }
    for (const v of ['1.7.0', '1.8.1', '1.8.2'])
      expect(
        DEV_CHECKS.some((c) => c.ver === v),
        v,
      ).toBe(true);
  });

  it('every SET UP points at something real', () => {
    const rules = new Set(COMPLIANCE_RULES.map((r) => r.id));
    const lessons = new Set(OPTIONS_COURSE.map((l) => l.id));
    for (const c of DEV_CHECKS) {
      const s = c.setup;
      expect(s, `${c.id} takes you there`).toBeTruthy();
      if (!s) continue;
      if (s.boss) expect(BOSSES[s.boss]?.ready, c.id).toBe(true);
      for (const r of s.compliance ?? []) expect(rules.has(r), `${c.id}: ${r}`).toBe(true);
      if (s.builder?.lesson) expect(lessons.has(s.builder.lesson), c.id).toBe(true);
      if (s.builder?.ticker) expect(BUILDER_BY_SYMBOL[s.builder.ticker], c.id).toBeTruthy();
      if (s.clearReview) expect(s.boss, c.id).toBeTruthy();
    }
  });
});
