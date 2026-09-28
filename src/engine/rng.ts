/**
 * Seeded randomness. Every random decision in the game goes through here so a run
 * is reproducible from its seed plus its action log.
 *
 * Streams are forked by label (e.g. "deal:q1r2", "fill:order-7") so adding a random
 * call in one subsystem never shifts the numbers another subsystem sees.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** FNV-1a hash of a string to a 32-bit unsigned int. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private s: RngState;

  constructor(seed: string | number | RngState) {
    if (typeof seed === 'object') {
      this.s = { ...seed };
      return;
    }
    const sm = splitmix32(typeof seed === 'number' ? seed >>> 0 : hashString(seed));
    this.s = { a: sm(), b: sm(), c: sm(), d: sm() };
    if ((this.s.a | this.s.b | this.s.c | this.s.d) === 0) this.s.a = 1;
  }

  /** sfc32: fast, small state, good statistical quality for games. */
  nextU32(): number {
    let { a, b, c, d } = this.s;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    this.s = { a: a >>> 0, b, c, d };
    return t;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max ${max} < min ${min}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Standard normal via Box–Muller. */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Student-t with `df` degrees of freedom, scaled to unit variance: fat tails for returns. */
  studentT(df: number): number {
    const z = this.normal();
    let chi = 0;
    for (let i = 0; i < df; i++) {
      const n = this.normal();
      chi += n * n;
    }
    const t = z / Math.sqrt(chi / df);
    return df > 2 ? t * Math.sqrt((df - 2) / df) : t;
  }

  state(): RngState {
    return { ...this.s };
  }

  /** Deterministic child stream: same parent seed + label always gives the same child. */
  fork(label: string): Rng {
    const h = hashString(label);
    return new Rng({
      a: (this.s.a ^ h) >>> 0,
      b: (this.s.b + Math.imul(h, 0x9e3779b1)) >>> 0,
      c: (this.s.c ^ (h << 7) ^ (h >>> 3)) >>> 0,
      d: (this.s.d + 0x6d2b79f5) >>> 0 || 1,
    }).warm();
  }

  private warm(): Rng {
    for (let i = 0; i < 12; i++) this.nextU32();
    return this;
  }
}

/** Convenience: a stream for (seed, label) without holding a parent. */
export function streamFor(seed: string, label: string): Rng {
  return new Rng(`${seed}::${label}`);
}
