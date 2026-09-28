import { describe, expect, it } from 'vitest';
import {
  HEADLINE_KEYS,
  TEMPLATES,
  templateHeadlines,
  earningsMagnitude,
  macroMagnitude,
  type HeadlineEvent,
} from '../../src/content/headlines';
import { CHARACTERS, LINES, LINE_COUNT, pickLine, type Trigger } from '../../src/content/characters';
import { EXPRESSIONS, portrait, PORTRAIT_SIZE } from '../../src/content/portraits';
import { ACHIEVEMENTS, evaluateAchievements } from '../../src/content/achievements';
import { Rng } from '../../src/engine/rng';
import type { RunRow, TradeRow } from '../../src/shared/userData';

const VARS = {
  sym: 'QFUJ',
  move: '+6.2%',
  absmove: '6.2%',
  implied: '±4.1%',
  ratio: '1.5x',
  gap: '3.1',
  yield: '0.6%',
  event: 'FOMC',
  vix: '31.0',
  vixchg: '+24.0%',
  volx: '3.2x',
  days: '6',
};

describe('headline library', () => {
  it('has 8+ templates for every event type x magnitude x direction', () => {
    const expected = [
      ...['inside', 'beyond', 'blowout'].flatMap((m) => ['up', 'down'].map((d) => `earnings:${m}:${d}`)),
      ...['big', 'huge'].flatMap((m) => ['up', 'down'].map((d) => `gap:${m}:${d}`)),
      'exdiv:regular:none',
      'exdiv:rich:none',
      ...['fomc', 'cpi'].flatMap((k) =>
        ['calm', 'move', 'shock'].flatMap((m) => ['up', 'down'].map((d) => `${k}:${m}:${d}`)),
      ),
      'vix:spike:up',
      'vix:panic:up',
      'high:new:up',
      'low:new:down',
      'volume:surge:up',
      'volume:surge:down',
      'streak:run:up',
      'streak:run:down',
      'cross:golden:up',
      'cross:death:down',
    ];
    expect([...HEADLINE_KEYS].sort()).toEqual(expected.sort());
    for (const k of HEADLINE_KEYS) {
      const list = TEMPLATES[k] ?? [];
      expect(list.length, k).toBeGreaterThanOrEqual(8);
      expect(new Set(list).size, k).toBe(list.length);
    }
  });

  it('fills every placeholder and never quotes a dollar price', () => {
    for (const k of HEADLINE_KEYS)
      for (const t of TEMPLATES[k] ?? []) {
        const filled = t.replace(/\{(\w+)\}/g, (_, v: string) => {
          expect(Object.keys(VARS), `${k}: {${v}}`).toContain(v);
          return VARS[v as keyof typeof VARS];
        });
        expect(filled).not.toMatch(/[{}]/);
        expect(filled).not.toMatch(/\$\d/);
      }
  });

  it('open mode states only facts about real companies', () => {
    const e: HeadlineEvent = {
      kind: 'earnings',
      magnitude: 'blowout',
      direction: 'down',
      vars: { ...VARS, sym: 'AAPL' },
    };
    const open = templateHeadlines.headline(e, new Rng('h'), 'open');
    expect(open).toBe('AAPL reported earnings; shares moved +6.2% against an options-implied move of ±4.1%.');
    const blind = templateHeadlines.headline(e, new Rng('h'), 'blind');
    expect(
      TEMPLATES['earnings:blowout:down']?.some(
        (t) =>
          blind ===
          t.replace(/\{(\w+)\}/g, (_, v: string) => ({ ...VARS, sym: 'AAPL' })[v as keyof typeof VARS]),
      ),
    ).toBe(true);
  });

  it('classifies magnitudes against the implied move', () => {
    expect(earningsMagnitude(3, 4)).toBe('inside');
    expect(earningsMagnitude(-6, 4)).toBe('beyond');
    expect(earningsMagnitude(12, 4)).toBe('blowout');
    expect(macroMagnitude(0.004)).toBe('calm');
    expect(macroMagnitude(-0.02)).toBe('move');
    expect(macroMagnitude(0.05)).toBe('shock');
  });
});

describe('characters and dialogue', () => {
  it('has 150+ lines, every situation covered, placeholders known', () => {
    expect(LINE_COUNT).toBeGreaterThanOrEqual(150);
    const known = ['desk', 'target', 'tickets', 'points', 'stress'];
    for (const [trigger, lines] of Object.entries(LINES)) {
      expect(lines.length, trigger).toBeGreaterThanOrEqual(3);
      for (const l of lines) {
        expect(CHARACTERS[l.who]).toBeDefined();
        for (const m of l.text.matchAll(/\{(\w+)\}/g)) expect(known, `${trigger}: ${l.text}`).toContain(m[1]);
      }
    }
    for (const who of Object.keys(CHARACTERS))
      expect(
        Object.values(LINES)
          .flat()
          .filter((l) => l.who === who).length,
        who,
      ).toBeGreaterThanOrEqual(20);
  });

  it('picks lines deterministically and fills them', () => {
    const a = pickLine('run_start', new Rng('x'), { desk: 'Verticals', target: 150 });
    const b = pickLine('run_start', new Rng('x'), { desk: 'Verticals', target: 150 });
    expect(a).toEqual(b);
    expect(a.text).not.toMatch(/[{}]/);
    const k = pickLine('review_intro' as Trigger, new Rng('y'), { target: 400 }, 'kessler');
    expect(k.who).toBe('kessler');
  });

  it('draws a 64x64 portrait for each character and expression, each expression distinct', () => {
    for (const id of Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]) {
      const maps = EXPRESSIONS.map((m) => portrait(id, m));
      for (const p of maps) {
        expect(p.pixels.length).toBe(PORTRAIT_SIZE * PORTRAIT_SIZE);
        expect(Math.max(...p.pixels)).toBeLessThan(p.palette.length);
        expect(p.pixels.filter((x) => x !== 0).length).toBeGreaterThan(1200);
      }
      const keys = new Set(maps.map((p) => Array.from(p.pixels).join('')));
      expect(keys.size, id).toBe(EXPRESSIONS.length);
    }
  });
});

describe('achievements', () => {
  it('has about 40, unique, none unlocked on a fresh profile', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const fresh = evaluateAchievements({ trades: [], runs: [], drills: [], flags: {} });
    expect(fresh.filter((a) => a.done)).toEqual([]);
  });

  it('unlocks from the ledger and runs', () => {
    const t = (over: Partial<TradeRow>): TradeRow => ({
      id: Math.random().toString(),
      mode: 'career',
      runId: 'r',
      desk: 'verticals',
      closedOn: '2024-01-01',
      openedOn: '2023-12-01',
      symbol: 'X',
      displaySymbol: 'X',
      structure: 'bull_put',
      qty: 1,
      realizedCents: 1000,
      riskCents: 5000,
      benchmarkCents: 0,
      alphaCents: 1000,
      exitReason: 'stop',
      grade: 'A',
      tags: [],
      callBucket: 3,
      callConf: 0.9,
      callActual: 3,
      brier: 0.2,
      regime: { vix: 15, ivr: 40, trend: 0, adx: 20, earnings: false },
      recordedAt: '',
      data: { pctMax: 0.6, ivCrushWin: true, edge: 0.95 },
      ...over,
    });
    const run: RunRow = {
      id: 'r',
      mode: 'career',
      desk: 'verticals',
      seed: 's',
      tier: 0,
      startedAt: '',
      endedAt: '',
      result: 'victory',
      rounds: 12,
      score: 5000,
      calGrade: 'A',
      alphaCents: 100,
      xp: 100,
      bonus: 10,
      data: { stats: { cartTriggers: { pin_master: 1 }, maxStress: 20, stopDeclines: 0, maxMult: 12 } },
    };
    const r = evaluateAchievements({ trades: [t({})], runs: [run], drills: [], flags: {} });
    const done = new Set(r.filter((a) => a.done).map((a) => a.def.id));
    for (const id of [
      'first_blood',
      'called_it',
      'first_victory',
      'desk_verticals',
      'zen',
      'no_override',
      'pin_master',
      'big_mult',
    ])
      expect(done.has(id), id).toBe(true);
    expect(done.has('fifty_club')).toBe(false);
  });
});
