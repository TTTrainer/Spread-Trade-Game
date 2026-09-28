import { describe, expect, it } from 'vitest';
import { Rng, hashString, streamFor } from '../../src/engine/rng';

describe('seeded rng', () => {
  it('is reproducible from its seed', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    const xs = Array.from({ length: 50 }, () => a.next());
    const ys = Array.from({ length: 50 }, () => b.next());
    expect(xs).toEqual(ys);
  });

  it('differs across seeds', () => {
    expect(new Rng('a').next()).not.toEqual(new Rng('b').next());
  });

  it('forks independent, deterministic child streams', () => {
    const parent = new Rng(42);
    const c1 = parent.fork('deal');
    const c2 = new Rng(42).fork('deal');
    const c3 = new Rng(42).fork('fill');
    expect(c1.next()).toEqual(c2.next());
    expect(new Rng(42).fork('deal').next()).not.toEqual(c3.next());
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng('uniform');
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]++;
    }
    for (const b of buckets) expect(Math.abs(b - 2000)).toBeLessThan(200);
  });

  it('int, pick, weighted and shuffle behave', () => {
    const r = new Rng('ops');
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
    expect(['x']).toContain(r.pick(['x']));
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 5000; i++) counts[r.weighted(['a', 'b'] as const, (k) => (k === 'a' ? 3 : 1))]++;
    expect(counts.a / 5000).toBeGreaterThan(0.7);
    expect(counts.a / 5000).toBeLessThan(0.8);
    const s = r.shuffle([1, 2, 3, 4, 5]);
    expect(s.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(() => r.pick([])).toThrow();
    expect(() => r.int(5, 1)).toThrow();
  });

  it('normal and student-t have unit-ish variance', () => {
    const r = new Rng('normal');
    let s = 0;
    let s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = r.normal();
      s += x;
      s2 += x * x;
    }
    expect(Math.abs(s / n)).toBeLessThan(0.05);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
    let t2 = 0;
    for (let i = 0; i < n; i++) t2 += r.studentT(5) ** 2;
    expect(Math.abs(t2 / n - 1)).toBeLessThan(0.15);
  });

  it('state round-trips', () => {
    const r = new Rng('state');
    r.next();
    const saved = r.state();
    const x = r.next();
    expect(new Rng(saved).next()).toEqual(x);
    expect(hashString('abc')).toEqual(hashString('abc'));
    expect(streamFor('s', 'l').next()).toEqual(streamFor('s', 'l').next());
  });
});
