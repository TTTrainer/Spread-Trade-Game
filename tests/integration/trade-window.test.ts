import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';
import { buildContext } from '../../src/engine/market/context';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { openTransform, blindTransform } from '../../src/engine/market/transform';
import { MarketView } from '../../src/engine/market/view';
import { atClose, DEFAULT_REALISM, defaultPause, endOfDay } from '../../src/engine/lifecycle/daily';
import { openPosition } from '../../src/engine/lifecycle/position';
import { forceCloseAtWindowEnd } from '../../src/engine/lifecycle/actions';
import { dayBook } from '../../src/engine/trading/book';
import { maxContracts, planTrade } from '../../src/engine/trading/plan';
import { attribute } from '../../src/engine/scoring/attribution';
import { attemptFill } from '../../src/engine/orders/fill';
import type { Position } from '../../src/engine/lifecycle/types';
import type { WindowDef } from '../../src/engine/market/types';

const src = new SyntheticSource({ symbols: ['HLXR', 'ORGR', 'MKTX'] });

async function runBullPut(w: WindowDef, blind: boolean, seed: string): Promise<{ pos: Position; scale: number }> {
  const probe = await src.bars(w.symbol, w.entryDate, w.entryDate);
  const t = blind ? blindTransform(w.symbol, w.entryDate, probe[0].close, new Rng(seed)) : openTransform(w.symbol, w.entryDate);
  const view = await MarketView.open({ source: src, window: w, transform: t, benchmark: 'MKTX' });
  const chain = await view.loadChain();
  const e = view.earnings();
  const ctx = buildContext({ bars: view.bars(), vol: view.vol(), upcomingEarnings: e.upcoming, pastEarnings: e.past, dividends: view.dividends(), macro: view.macro(), vix: null });
  const exps = [...new Set(chain.quotes.map((q) => q.expiration))].sort();
  const exp = exps.find((x) => Date.parse(x) - Date.parse(chain.date) >= 25 * 86400000) ?? exps[exps.length - 1];
  // Widest width (in strikes) whose single contract fits the risk cap.
  let base = { structureId: 'bull_put' as const, params: { expiration: exp, delta: 0.3, width: 3 }, chain, ctx, equityCents: 500_000, riskCapPct: 0.1, reservedCents: 0, rate: view.rate() };
  let one = planTrade({ ...base, qty: 1 });
  for (const width of [2, 1]) {
    if (one.ok) break;
    base = { ...base, params: { ...base.params, width } };
    one = planTrade({ ...base, qty: 1 });
  }
  expect(one.metrics).not.toBeNull();
  const qty = Math.max(1, maxContracts(one, 500_000, 0.1, 0));
  const plan = planTrade({ ...base, qty });
  expect(plan.reason ?? 'ok').toBe('ok');
  const fill = attemptFill({ mid: plan.mid as number, natural: plan.natural as number }, { type: 'market' }, new Rng(seed));
  let pos = openPosition({
    id: 'p',
    cardId: 'c',
    windowId: w.id,
    symbol: t.displaySymbol,
    structureId: 'bull_put',
    legs: plan.legs,
    qty,
    date: view.now,
    fillNet: fill.price,
    midNet: plan.mid as number,
    feesCents: 0,
    collateralCents: plan.collateralCents,
    brackets: { targetPl: null, stopPl: null, targetPct: null, stopMult: null },
    entry: plan.entry as NonNullable<typeof plan.entry>,
    book: dayBook(view, 0),
  });
  await view.track(plan.legs.filter((l) => l.kind === 'option') as never);
  const dctx = { realism: DEFAULT_REALISM, pause: defaultPause(), autoBrackets: false, suppressOnGap: false, rng: new Rng(seed) };
  while (pos.status === 'open') {
    if (!(await view.advance())) {
      pos = forceCloseAtWindowEnd(pos, { book: dayBook(view, 0), rng: new Rng(seed), feesOn: false, bidAsk: true });
      break;
    }
    const book = dayBook(view, 0);
    pos = atClose(pos, book, dctx).pos; // hold through every decision point
    pos = endOfDay(pos, book, dctx).pos;
    if (pos.status === 'open' && pos.flags.assignedPending === false && pos.legs.every((l) => l.kind === 'stock')) {
      pos = forceCloseAtWindowEnd(pos, { book, rng: new Rng(seed), feesOn: false, bidAsk: true });
    }
  }
  return { pos, scale: t.scale };
}

describe('a bull put through a real window', () => {
  it('holds to expiry, and attribution sums to the actual P/L with a small residual', async () => {
    const wins = src.allWindows().filter((w) => w.symbol === 'HLXR' && !w.tags.hasEarnings);
    let checked = 0;
    expect(wins.length).toBeGreaterThan(3);
    for (const w of [wins[0], wins[Math.floor(wins.length / 2)], wins[wins.length - 1]]) {
      const { pos } = await runBullPut(w, false, `t${w.id}`);
      expect(pos.status).toBe('closed');
      expect(Number.isInteger(pos.realizedCents)).toBe(true);
      const a = attribute(pos);
      expect(a.direction + a.time + a.volatility + a.execution + a.fees + a.residual).toBe(a.total);
      expect(a.total).toBe(pos.realizedCents);
      // The Greeks explain most of a plain vertical's P/L.
      expect(Math.abs(a.residual)).toBeLessThan(Math.max(8000, Math.abs(a.total) * 0.6));
      checked++;
    }
    expect(checked).toBe(3);
  });

  it('gives the same percentage result in blind (rescaled) mode', async () => {
    const w = src.allWindows().filter((x) => x.symbol === 'ORGR')[300];
    const open = await runBullPut(w, false, 'same');
    const blind = await runBullPut(w, true, 'same');
    expect(blind.scale).not.toBe(1);
    // Split-style rescale: contracts scale inversely, so risk-adjusted results line up.
    const r1 = (open.pos.realizedCents as number) / open.pos.entry.maxLossCents;
    const r2 = (blind.pos.realizedCents as number) / blind.pos.entry.maxLossCents;
    expect(Math.abs(r1 - r2)).toBeLessThan(0.25);
  });
});
