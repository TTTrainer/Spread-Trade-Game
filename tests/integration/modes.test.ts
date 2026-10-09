import { describe, expect, it } from 'vitest';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { computeTarget, RunEngine } from '../../src/engine/run/engine';
import { BALANCE } from '../../src/content/balance';
import { CLIENT_BY_ID } from '../../src/content/clients';
import type { RunConfig } from '../../src/engine/run/types';
import { playRun } from '../../src/engine/sim/bot';
import { DEFAULT_REALISM, defaultPause } from '../../src/engine/lifecycle/daily';
import { defaultSessionConfig, TradingSession } from '../../src/engine/trading/session';
import { addDays } from '../../src/engine/calendar';
import {
  LIVE_LINEUP,
  LIVE_MONTH_DAYS,
  liveMonthProgress,
  liveMonthStart,
  pickLiveLineup,
} from '../../src/engine/trading/liveMonth';
import { contractBoard, contractPayout, contractStructures } from '../../src/engine/meta/contracts';
import { cartridgePoolFor, defaultProfile } from '../../src/engine/meta/profile';

const src = new SyntheticSource();

function config(over: Partial<RunConfig> = {}): RunConfig {
  return {
    seed: 'modes-1',
    deskId: 'verticals',
    mode: 'career',
    tier: 0,
    startEquityCents: 500_000,
    pureMarket: false,
    realism: { ...DEFAULT_REALISM },
    pause: defaultPause(),
    callMode: 'em',
    rescale: true,
    quarters: 4,
    benchmark: 'MKTX',
    startingStress: 0,
    extraRerolls: 0,
    practice: false,
    ...over,
  };
}

describe('Compliance Rules and Pad perks in a run', () => {
  it('apply every modifier the rules promise', async () => {
    const base = await RunEngine.create(src, config({ seed: 'comp-a' }));
    const e = await RunEngine.create(
      src,
      config({
        seed: 'comp-a',
        compliance: [
          'hiring_freeze',
          'budget_cuts',
          'guidance',
          'risk_committee',
          'no_skip',
          'open_floor',
          'fees',
          'no_market',
        ],
      }),
    );
    expect(e.session?.cards.length).toBe((base.session?.cards.length ?? 0) - 1);
    expect(e.state.round.rerolls).toBe(base.state.round.rerolls - 2);
    expect(e.state.round.target).toBe(Math.round((BALANCE.targets.q1[0] * 1.2) / 10) * 10);
    expect(e.state.round.maxLossLinePct).toBeCloseTo(base.state.round.maxLossLinePct - 0.03);
    expect(e.canSkip()).toBe(false);
    expect(base.canSkip()).toBe(true);
    expect(e.state.stress).toBe(25);
    const sc = e.sessionConfig();
    expect(sc.realism.fees).toBe(true);
    expect(sc.execution.marketOrdersDisabled).toBe(true);
  }, 60_000);

  it('Pad perks add starting cash and Month 1 rerolls', async () => {
    const base = await RunEngine.create(src, config({ seed: 'perk-a' }));
    const e = await RunEngine.create(
      src,
      config({ seed: 'perk-a', perks: { startCash: 2, month1Rerolls: 1, quarterStressRelief: 5 } }),
    );
    expect(e.state.cash).toBe(base.state.cash + 2);
    expect(e.state.round.rerolls).toBe(base.state.round.rerolls + 1);
  }, 60_000);

  it('the shop only offers cartridges from the unlocked pool', async () => {
    const pool = cartridgePoolFor(defaultProfile());
    const e = await RunEngine.create(src, config({ seed: 'pool-a', practice: true, cartridgePool: pool }));
    const offered = new Set<string>();
    await playRun(
      e,
      {
        kind: 'disciplined',
        shop: 'families',
        dispatch: async (a) => {
          const r = await e.dispatch(a);
          for (const it of e.state.shop?.items ?? []) if (it.kind === 'cartridge') offered.add(it.id);
          return r;
        },
      },
      400,
    );
    expect(offered.size).toBeGreaterThan(3);
    for (const id of offered) expect(pool).toContain(id);
  }, 240_000);
});

describe('Endless', () => {
  it('continues a Career victory into Year 2 with faster-growing targets', async () => {
    let e: RunEngine | null = null;
    for (let i = 0; i < 25 && !e; i++) {
      const x = await RunEngine.create(src, config({ seed: `endless-${i}` }));
      await playRun(x, { kind: 'disciplined', shop: 'families' }, 600);
      if (x.state.result?.outcome === 'victory') e = x;
    }
    expect(e).not.toBeNull();
    if (!e) return;
    const banked = e.state.result;
    expect(e.over).toBe(true);
    await e.dispatch({ t: 'endless' });
    expect(e.state.endless).toBe(true);
    expect(e.state.phase).toBe('shop');
    expect(e.over).toBe(false);
    await e.dispatch({ t: 'leaveShop' });
    expect(e.state.quarter).toBe(5);
    expect(e.state.stats.year).toBe(2);
    expect(e.state.round.target).toBe(computeTarget(5, 0, null, e.state.config));
    expect(e.state.round.target).toBeGreaterThan(
      computeTarget(4, 0, null, e.state.config) * BALANCE.targets.quarterGrowth,
    );
    await playRun(e, { kind: 'disciplined', shop: 'families' }, 600);
    // Endless can only end in the year's banked victory, with more rounds on the record.
    expect(e.state.result?.outcome).toBe('victory');
    expect(e.state.history.length).toBeGreaterThan(12);
    expect(e.state.result?.xp).toBeGreaterThanOrEqual(banked?.xp ?? 0);
    // A second 'endless' is refused.
    const before = e.state.phase;
    await e.dispatch({ t: 'endless' });
    expect(e.state.phase).toBe(before);
  }, 600_000);

  it('is not offered after a defeat or in practice', async () => {
    const e = await RunEngine.create(src, config({ seed: 'endless-no', practice: true, quarters: 1 }));
    await playRun(e, { kind: 'disciplined' }, 200);
    await e.dispatch({ t: 'endless' });
    expect(e.state.endless).toBe(false);
  }, 120_000);
});

describe('Daily', () => {
  it('is one quarter, and the same seed plays out the same way (the ghost)', async () => {
    const cfg = config({ seed: 'daily-2026-09-28', mode: 'daily', quarters: 1 });
    const a = await RunEngine.create(src, cfg);
    await playRun(a, { kind: 'disciplined', shop: 'families' }, 200);
    const b = await RunEngine.create(src, cfg);
    await playRun(b, { kind: 'disciplined', shop: 'families' }, 200);
    expect(a.over).toBe(true);
    expect(a.state.history.length).toBeLessThanOrEqual(3);
    expect(a.state.history.map((h) => h.meter)).toEqual(b.state.history.map((h) => h.meter));
    expect(a.state.totals.points).toBe(b.state.totals.points);
    if (a.state.history.length === 3) expect(a.state.history[2].reviewId).toBe('annual_review');
  }, 240_000);
});

describe('Live sessions', () => {
  it('stop at the live edge, never force-close there, and pick up after the edge moves', async () => {
    const meta = await src.meta();
    const days = await src.tradingDays(addDays(meta.lastDate, -200), meta.lastDate);
    const start = days[days.length - 60];
    const edge1 = days[days.length - 55];
    const edge2 = days[days.length - 50];
    const syms = (await src.symbols()).filter((s) => !s.isEtf);
    const mk = (edge: string) =>
      new TradingSession(
        src,
        defaultSessionConfig({ seed: 'live-t', mode: 'live', liveEdge: edge, benchmark: 'MKTX' }),
      );
    const s = mk(edge1);
    let placed = false;
    for (const sym of syms) {
      await s.dispatch({ t: 'addLive', cardId: `L-${sym.symbol}`, symbol: sym.symbol, entryDate: start });
      const cardId = `L-${sym.symbol}`;
      expect(s.card(cardId).displaySymbol).toBe(sym.symbol);
      await s.dispatch({ t: 'call', cardId, bucket: 3, confidence: 0.6 });
      const chain = s.chain(cardId);
      const exp = [...new Set(chain?.quotes.map((q) => q.expiration) ?? [])]
        .sort()
        .find((x) => x > addDays(start, 25));
      if (!exp) continue;
      const r = await s.dispatch({
        t: 'place',
        cardId,
        structureId: 'bull_put',
        params: { expiration: exp, delta: 0.25, width: 2 },
        qty: 1,
        order: { type: 'market' },
        brackets: null,
        earningsAck: true,
      });
      if (r?.filled) {
        placed = true;
        break;
      }
    }
    expect(placed).toBe(true);
    let guard = 0;
    while (!s.atLiveEdge() && guard++ < 20) {
      await s.dispatch({ t: 'begin' });
      for (const d of s.decisions.slice()) await s.dispatch({ t: 'decide', dpId: d.id, action: 'hold' });
      await s.dispatch({ t: 'end' });
    }
    expect(s.atLiveEdge()).toBe(true);
    expect(s.openPositions()).toHaveLength(1);
    const logLen = s.log.length;
    await s.dispatch({ t: 'begin' });
    expect(s.log.length).toBe(logLen); // refused and not logged
    expect(s.openPositions()).toHaveLength(1);
    expect(s.lastEvents[0]?.kind).toBe('reject');

    // After a "sync" the same log replays and the clock can run to the new edge.
    const t = mk(edge2);
    for (const a of s.log) await t.dispatch(a);
    expect(t.positions.map((p) => p.openNet)).toEqual(s.positions.map((p) => p.openNet));
    expect(t.atLiveEdge()).toBe(false);
    guard = 0;
    while (!t.atLiveEdge() && t.openPositions().length && guard++ < 20) {
      await t.dispatch({ t: 'begin' });
      for (const d of t.decisions.slice()) await t.dispatch({ t: 'decide', dpId: d.id, action: 'hold' });
      await t.dispatch({ t: 'end' });
    }
    const card = t.cards.find((c) => c.positionIds.length);
    expect(card && t.view(card.id).now > edge1).toBe(true);
  }, 120_000);
});

describe('Live month', () => {
  it('deals a lineup a month back, moves the whole desk with the clock and waits at the latest close', async () => {
    const meta = await src.meta();
    const days = await src.tradingDays(addDays(meta.lastDate, -200), meta.lastDate);
    const edge = days[days.length - 40];
    const start = liveMonthStart(days, edge);
    expect(days.filter((d) => d > start && d <= edge)).toHaveLength(LIVE_MONTH_DAYS);
    const symbols = await src.symbols();
    const lineup = pickLiveLineup(symbols, meta.benchmark, 'month-1', start);
    expect(lineup).toEqual(pickLiveLineup(symbols, meta.benchmark, 'month-1', start));
    expect(lineup.length).toBeGreaterThanOrEqual(LIVE_LINEUP);
    expect(new Set(lineup).size).toBe(lineup.length);
    const s = new TradingSession(
      src,
      defaultSessionConfig({
        seed: 'month-1',
        mode: 'live',
        liveEdge: edge,
        benchmark: meta.benchmark,
        advanceIdle: true,
      }),
    );
    s.holdOpen = true;
    for (const [i, sym] of lineup.entries())
      await s.dispatch({ t: 'addLive', cardId: `L${i + 1}`, symbol: sym, entryDate: start });
    expect(s.atLiveEdge()).toBe(false);
    // No trades: the untraded desk still plays day by day up to the latest close, then waits.
    let guard = 0;
    while (!s.atLiveEdge() && guard++ < 40) {
      await s.dispatch({ t: 'begin' });
      await s.dispatch({ t: 'end' });
    }
    expect(s.atLiveEdge()).toBe(true);
    for (const c of s.cards) expect(s.view(c.id).now).toBe(edge);
    expect(liveMonthProgress(days, start, edge, edge)).toEqual({
      day: LIVE_MONTH_DAYS,
      total: LIVE_MONTH_DAYS,
      caughtUp: true,
    });
    expect(s.isDone()).toBe(false);
  }, 120_000);
});

describe('Contracts board', () => {
  it('deals five clients on blind windows, the same all week', async () => {
    const windows = await src.windows({});
    const index = new Set((await src.symbols()).filter((s) => s.isEtf).map((s) => s.symbol));
    const a = contractBoard(windows, index, '2026-W40');
    const b = contractBoard(windows, index, '2026-W40');
    const c = contractBoard(windows, index, '2026-W41');
    expect(a).toHaveLength(5);
    expect(a).toEqual(b);
    expect(a.map((x) => x.clientId)).not.toEqual(c.map((x) => x.clientId));
    expect(new Set(a.map((x) => windows.find((w) => w.id === x.windowId)?.symbol)).size).toBe(5);
    for (const k of a) {
      expect(k.reward).toBeGreaterThan(0);
      expect(k.desks.length).toBeGreaterThan(0);
      expect(index.has(windows.find((w) => w.id === k.windowId)?.symbol ?? '')).toBe(false);
    }
  });

  it('allows only the structures of unlocked desks that fit, and pays for filling plus profit', () => {
    const bear = CLIENT_BY_ID.garage;
    expect(contractStructures(bear, ['verticals'])).toEqual(['bear_call', 'bear_put']);
    // A covered call pays while the stock stays below its strike: a bearish trade here.
    expect(contractStructures(bear, ['income'])).toEqual(['covered_call']);
    // With Income unlocked first, the defined-risk spreads still come first (the one picked for you).
    expect(contractStructures(bear, ['income', 'verticals'])).toEqual([
      'bear_call',
      'bear_put',
      'covered_call',
    ]);
    expect(contractPayout(15, true, 500)).toBe(23);
    expect(contractPayout(15, true, -500)).toBe(15);
    expect(contractPayout(15, false, 500)).toBe(0);
  });
});
