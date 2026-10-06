import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ISODate } from '../../src/engine/calendar';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { builderLoad } from '../../data-pipeline/schwab/builderLoad';
import { schwabPull } from '../../data-pipeline/schwab/pull';
import { SchwabStore } from '../../data-pipeline/schwab/store';
import { afterClose, fakeSchwab } from '../helpers/fakeSchwab';

describe("the Trade Builder's data for a ticker", () => {
  const src = new SyntheticSource({ lastDate: '2021-06-30', symbols: ['MKTX', 'HLXR'] });
  const today: ISODate = '2021-06-01';
  const fake = fakeSchwab(src, () => today);

  it('asks Schwab first: two years of prices and today’s real chain', async () => {
    const r = await builderLoad({
      symbol: 'SPY',
      now: new Date(`${today}T15:00:00Z`),
      api: fake.api,
      store: null,
      game: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('schwab-live');
    expect(r.live).toBe(true);
    expect(r.modeledChain).toBe(false);
    expect(r.bundle.asOf).toBe(today);
    expect(r.bundle.chain?.source).toBe('real');
    expect(r.bundle.chain?.quotes.length).toBeGreaterThan(20);
    // Greeks are worked out for the real quotes.
    expect(r.bundle.chain?.quotes.some((q) => Math.abs(q.delta) > 0)).toBe(true);
    // About two years of daily bars, nothing past today.
    expect(r.bundle.bars[0].date >= '2019-05-01').toBe(true);
    expect(r.bundle.bars.at(-1)?.date).toBe(today);
    expect(r.bundle.name).toMatch(/SPDR/);
  });

  it('falls back to saved data when Schwab is unreachable, and says why', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stg-builder-'));
    const storePath = join(dir, 'schwab.db');
    await schwabPull({ storePath, api: fake.api, symbols: ['SPY'], now: afterClose('2021-05-28') });
    const store = new SchwabStore(storePath, { readOnly: true });
    const broken = {
      priceHistory: async () => {
        throw new Error('Schwab refused the login (401)');
      },
      chain: async () => null,
    };
    try {
      const r = await builderLoad({ symbol: 'SPY', now: afterClose(today), api: broken, store, game: null });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.source).toBe('schwab-saved');
      expect(r.live).toBe(false);
      expect(r.notes.join(' ')).toMatch(/Couldn't reach Schwab/);
      expect(r.bundle.asOf).toBe('2021-05-28');
      // That close's chain was saved, so it's real.
      expect(r.modeledChain).toBe(false);
    } finally {
      store.close();
    }
  });

  it('uses the game’s own data for tickers it carries, modeling the chain only when none is stored', async () => {
    const r = await builderLoad({
      symbol: 'MKTX',
      now: afterClose('2021-06-30'),
      api: null,
      store: null,
      game: src,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('game');
    expect(r.bundle.asOf).toBe('2021-06-30');
    expect(r.bundle.chain?.quotes.length).toBeGreaterThan(20);
  });

  it('says plainly when a ticker has no data at all', async () => {
    const r = await builderLoad({ symbol: 'QQQ', now: afterClose(today), api: null, store: null, game: src });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/Connect Schwab/);
  });
});
