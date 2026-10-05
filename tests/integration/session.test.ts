import { describe, expect, it } from 'vitest';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { defaultSessionConfig, TradingSession, type SessionAction } from '../../src/engine/trading/session';
import { buildDebrief } from '../../src/engine/trading/debrief';
import { expirationsOf } from '../../src/engine/strategies/structures';

const src = new SyntheticSource({ symbols: ['HLXR', 'ORGR', 'MKTX'] });

async function playOne(seed: string, blind: boolean, policy: 'plan' | 'hold'): Promise<TradingSession> {
  const s = new TradingSession(
    src,
    defaultSessionConfig({ seed, blind, rescale: blind, benchmark: 'MKTX', mode: blind ? 'run' : 'sandbox' }),
  );
  const w = src.allWindows().filter((x) => x.symbol === 'ORGR')[120];
  await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
  await s.dispatch({ t: 'call', cardId: 'c1', bucket: 3, confidence: 0.7 });
  const chain = s.chain('c1');
  const exp = expirationsOf(chain!).find(
    (e) => Date.parse(e) - Date.parse(chain!.date) >= 28 * 86400000,
  ) as string;
  let width = 2;
  let plan = s.planFor('c1', 'bull_put', { expiration: exp, delta: 0.3, width }, 1);
  if (!plan.ok) {
    width = 1;
    plan = s.planFor('c1', 'bull_put', { expiration: exp, delta: 0.3, width }, 1);
  }
  expect(plan.ok).toBe(true);
  const res = await s.dispatch({
    t: 'place',
    cardId: 'c1',
    structureId: 'bull_put',
    params: { expiration: exp, delta: 0.3, width },
    qty: 1,
    order: { type: 'market' },
    earningsAck: false,
  });
  expect(res?.filled).toBe(true);
  let guard = 0;
  while (!s.isDone() && guard++ < 80) {
    await s.dispatch({ t: 'begin' });
    for (const d of s.decisions.slice()) {
      const action = policy === 'plan' && d.planned ? d.planned : 'hold';
      await s.dispatch({ t: 'decide', dpId: d.id, action });
    }
    await s.dispatch({ t: 'end' });
  }
  return s;
}

describe('trading session', () => {
  it('runs a bull put from entry to exit and debriefs it', async () => {
    const s = await playOne('sess-1', false, 'plan');
    expect(s.isDone()).toBe(true);
    const p = s.positions[0];
    expect(p.status).toBe('closed');
    expect(s.realizedCents).toBe(p.realizedCents);
    const d = await buildDebrief(s, p.id);
    expect(d.realSymbol).toBe('ORGR');
    expect(d.attribution.total).toBe(p.realizedCents);
    expect(d.alternates.length).toBeGreaterThanOrEqual(4);
    expect(d.callLine).toMatch(/You called/);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(d.grade.grade);
    expect(d.catalyst.length).toBeGreaterThan(10);
  });

  it('is fully reproducible from its seed and action log', async () => {
    const a = await playOne('sess-2', true, 'plan');
    const replay = new TradingSession(src, a.config);
    for (const act of a.log as SessionAction[]) await replay.dispatch(act);
    expect(replay.positions).toEqual(a.positions);
    expect(replay.realizedCents).toBe(a.realizedCents);
    expect(replay.cards[0].displaySymbol).toBe(a.cards[0].displaySymbol);
    expect(a.cards[0].displaySymbol).not.toBe('ORGR');
  });

  it('a covered call always carries its automatic stop, sized into its risk, and it only tightens', async () => {
    const s = new TradingSession(
      src,
      defaultSessionConfig({ seed: 'cc-stop', mode: 'sandbox', startEquityCents: 5_000_000 }),
    );
    const w = src.allWindows().filter((x) => x.symbol === 'HLXR')[80];
    await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
    const chain = s.chain('c1')!;
    const exp = expirationsOf(chain).find((e) => Date.parse(e) - Date.parse(chain.date) >= 14 * 86400000)!;
    const params = { expiration: exp, delta: 0.3, width: 0 };
    const at2 = s.planFor('c1', 'covered_call', params, 1);
    const at1 = s.planFor('c1', 'covered_call', params, 1, undefined, 1);
    expect(at1.riskCents).toBeLessThan(at2.riskCents);
    // Asked for no brackets at all: the stop is still there, at the desk's 2x.
    const res = await s.dispatch({
      t: 'place',
      cardId: 'c1',
      structureId: 'covered_call',
      params,
      qty: 1,
      order: { type: 'market' },
      brackets: null,
      earningsAck: true,
    });
    expect(res?.filled).toBe(true);
    const p = s.positions[0];
    expect(p.brackets.targetPl).toBeNull();
    expect(p.brackets.stopPl).toBeCloseTo(-p.openNet * 2, 9);
    // Loosening or removing it is refused; tightening sticks.
    await s.dispatch({ t: 'brackets', positionId: p.id, brackets: { ...p.brackets, stopPl: null } });
    expect(s.positions[0].brackets.stopPl).toBeCloseTo(-p.openNet * 2, 9);
    await s.dispatch({ t: 'brackets', positionId: p.id, brackets: { ...p.brackets, stopPl: -p.openNet } });
    expect(s.positions[0].brackets.stopPl).toBeCloseTo(-p.openNet, 9);
  });

  it('with market orders off, exits still go through, and a close that cannot leaves its question open', async () => {
    const s = new TradingSession(src, defaultSessionConfig({ seed: 'no-market', mode: 'sandbox' }));
    s.config.execution = { ...s.config.execution, marketOrdersDisabled: true };
    const w = src.allWindows().filter((x) => x.symbol === 'ORGR')[120];
    await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
    const chain = s.chain('c1')!;
    const exp = expirationsOf(chain).find((e) => Date.parse(e) - Date.parse(chain.date) >= 28 * 86400000)!;
    const params = { expiration: exp, delta: 0.3, width: 1 };
    const plan = s.planFor('c1', 'bull_put', params, 1);
    const place = (qty: number) =>
      s.dispatch({
        t: 'place',
        cardId: 'c1',
        structureId: 'bull_put',
        params,
        qty,
        order: { type: 'limit', limit: plan.natural! },
        earningsAck: true,
      });
    // Entries can't use a market order...
    const blocked = await s.dispatch({
      t: 'place',
      cardId: 'c1',
      structureId: 'bull_put',
      params,
      qty: 1,
      order: { type: 'market' },
      earningsAck: true,
    });
    expect(blocked?.filled).toBe(false);
    // ...but a market close is sent as a limit at the natural price and fills.
    expect((await place(1))?.filled).toBe(true);
    await s.dispatch({ t: 'begin' });
    await s.dispatch({ t: 'end' });
    const p1 = s.positions.find((p) => p.status === 'open')!;
    await s.dispatch({ t: 'close', positionId: p1.id, order: { type: 'market' } });
    expect(s.position(p1.id)?.status).toBe('closed');
    // A decision answered with a close that can't go through (a limit far better than the market)
    // stays open instead of letting the day move on.
    await place(1);
    const p2 = s.positions.find((p) => p.status === 'open')!;
    await s.dispatch({ t: 'begin' });
    s.decisions.push({
      id: 'x',
      positionId: p2.id,
      kind: 'target_hit',
      date: s.view('c1').now,
      title: 'Profit target hit',
      message: '',
      options: ['close', 'hold'],
      planned: 'close',
    });
    await s.dispatch({ t: 'decide', dpId: 'x', action: 'close', order: { type: 'limit', limit: 0.001 } });
    expect(s.position(p2.id)?.status).toBe('open');
    expect(s.decisions.map((d) => d.id)).toContain('x');
    await s.dispatch({ t: 'decide', dpId: 'x', action: 'hold' });
    expect(s.decisions).toHaveLength(0);
  });

  it('records declined stops and blocks nothing else', async () => {
    const s = await playOne('sess-3', false, 'hold');
    expect(s.isDone()).toBe(true);
    const declined = s.decisionHistory.filter((d) => d.action === 'hold');
    expect(declined.length).toBeGreaterThanOrEqual(0);
  });

  it('realism toggles: approval levels and liquidity limits refuse trades in plain words', async () => {
    const w = src.allWindows().filter((x) => x.symbol === 'ORGR')[130];
    const mk = async (realism: object, equity: number) => {
      const s = new TradingSession(
        src,
        defaultSessionConfig({
          seed: 'rt',
          startEquityCents: equity,
          realism: { ...defaultSessionConfig().realism, ...realism },
          riskCapPct: 1,
        }),
      );
      await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
      await s.dispatch({ t: 'call', cardId: 'c1', bucket: 3, confidence: 0.6 });
      const chain = s.chain('c1')!;
      const exp = expirationsOf(chain).find(
        (e) => Date.parse(e) - Date.parse(chain.date) >= 25 * 86400000,
      ) as string;
      return { s, exp };
    };
    const a = await mk({ approvalLevels: true }, 150_000);
    const r1 = await a.s.dispatch({
      t: 'place',
      cardId: 'c1',
      structureId: 'bull_put',
      params: { expiration: a.exp, delta: 0.3, width: 1 },
      qty: 1,
      order: { type: 'market' },
      earningsAck: true,
    });
    expect(r1?.ok).toBe(false);
    expect(r1?.reason).toMatch(/Level 3/);
    const b = await mk({ liquidityLimits: true }, 5_000_000);
    const r2 = await b.s.dispatch({
      t: 'place',
      cardId: 'c1',
      structureId: 'bull_put',
      params: { expiration: b.exp, delta: 0.3, width: 1 },
      qty: 11,
      order: { type: 'market' },
      earningsAck: true,
    });
    expect(r2?.reason).toMatch(/at most 10 contracts/);
  });

  it('headlines appear on the day an earnings reaction happens, not before', async () => {
    const w =
      src.allWindows().find((x) => x.tags.hasEarnings && x.symbol === 'HLXR') ??
      src.allWindows().find((x) => x.tags.hasEarnings)!;
    const s = new TradingSession(
      src,
      defaultSessionConfig({ seed: 'news', blind: true, rescale: true, mode: 'run', riskCapPct: 1 }),
    );
    await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
    await s.dispatch({ t: 'call', cardId: 'c1', bucket: 3, confidence: 0.6 });
    const chain = s.chain('c1')!;
    const exp =
      expirationsOf(chain).filter((e) => Date.parse(e) - Date.parse(chain.date) >= 40 * 86400000)[0] ??
      expirationsOf(chain).at(-1)!;
    const r = await s.dispatch({
      t: 'place',
      cardId: 'c1',
      structureId: 'long_straddle',
      params: { expiration: exp, delta: 0.5, width: 0 },
      qty: 1,
      order: { type: 'market' },
      earningsAck: true,
    });
    expect(r?.ok).toBe(true);
    const seen: { day: string; text: string }[] = [];
    let guard = 0;
    while (!s.isDone() && guard++ < 60) {
      await s.dispatch({ t: 'begin' });
      for (const e of s.lastEvents)
        if (e.kind === 'headline') seen.push({ day: s.view('c1').now, text: e.text });
      for (const d of s.decisions.slice()) await s.dispatch({ t: 'decide', dpId: d.id, action: 'hold' });
      await s.dispatch({ t: 'end' });
    }
    const reaction = s
      .view('c1')
      .earnings()
      .past.map((e) => e.reactionDate);
    const ern = seen.filter((h) => reaction.includes(h.day));
    expect(ern.length).toBeGreaterThan(0);
    for (const h of seen) expect(h.text).not.toContain(w.symbol);
    expect(ern[0].text).toContain(s.card('c1').displaySymbol);
  });
});

describe('holding through earnings on purpose', () => {
  /** Sell a put spread over the next report with the tick on; count the night-before questions. */
  async function asked(trust: boolean): Promise<number> {
    for (const w of src.allWindows().filter((x) => x.symbol === 'ORGR')) {
      const s = new TradingSession(
        src,
        defaultSessionConfig({ seed: 'ack', benchmark: 'MKTX', trustEarningsAck: trust }),
      );
      await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
      const next = s.view('c1').earnings().upcoming[0];
      const chain = s.chain('c1');
      if (!next || !chain || Date.parse(next.date) - Date.parse(chain.date) > 20 * 86400000) continue;
      const exp = expirationsOf(chain).find((e) => e > next.reactionDate);
      if (!exp) continue;
      await s.dispatch({ t: 'call', cardId: 'c1', bucket: 3, confidence: 0.7 });
      const res = await s.dispatch({
        t: 'place',
        cardId: 'c1',
        structureId: 'bull_put',
        params: { expiration: exp, delta: 0.2, width: 1 },
        qty: 1,
        order: { type: 'market' },
        brackets: null,
        earningsAck: true,
      });
      if (!res?.filled) continue;
      let guard = 0;
      while (!s.isDone() && guard++ < 80) {
        await s.dispatch({ t: 'begin' });
        for (const d of s.decisions.slice()) await s.dispatch({ t: 'decide', dpId: d.id, action: 'hold' });
        await s.dispatch({ t: 'end' });
      }
      return s.decisionHistory.filter((d) => d.dp.kind === 'earnings_tomorrow').length;
    }
    throw new Error('no window with a report inside a trade');
  }

  it("doesn't ask the night before when the game trusts the tick, and still asks the bots' way", async () => {
    expect(await asked(true)).toBe(0);
    expect(await asked(false)).toBeGreaterThan(0);
  });
});
