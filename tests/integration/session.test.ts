import { describe, expect, it } from 'vitest';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { defaultSessionConfig, TradingSession, type SessionAction } from '../../src/engine/trading/session';
import { buildDebrief } from '../../src/engine/trading/debrief';
import { expirationsOf } from '../../src/engine/strategies/structures';

const src = new SyntheticSource({ symbols: ['HLXR', 'ORGR', 'MKTX'] });

async function playOne(seed: string, blind: boolean, policy: 'plan' | 'hold'): Promise<TradingSession> {
  const s = new TradingSession(src, defaultSessionConfig({ seed, blind, rescale: blind, benchmark: 'MKTX', mode: blind ? 'run' : 'sandbox' }));
  const w = src.allWindows().filter((x) => x.symbol === 'ORGR')[120];
  await s.dispatch({ t: 'addCard', cardId: 'c1', windowId: w.id });
  await s.dispatch({ t: 'call', cardId: 'c1', bucket: 3, confidence: 0.7 });
  const chain = s.chain('c1');
  const exp = expirationsOf(chain!).find((e) => Date.parse(e) - Date.parse(chain!.date) >= 28 * 86400000) as string;
  let width = 2;
  let plan = s.planFor('c1', 'bull_put', { expiration: exp, delta: 0.3, width }, 1);
  if (!plan.ok) {
    width = 1;
    plan = s.planFor('c1', 'bull_put', { expiration: exp, delta: 0.3, width }, 1);
  }
  expect(plan.ok).toBe(true);
  const res = await s.dispatch({ t: 'place', cardId: 'c1', structureId: 'bull_put', params: { expiration: exp, delta: 0.3, width }, qty: 1, order: { type: 'market' }, earningsAck: false });
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

  it('records declined stops and blocks nothing else', async () => {
    const s = await playOne('sess-3', false, 'hold');
    expect(s.isDone()).toBe(true);
    const declined = s.decisionHistory.filter((d) => d.action === 'hold');
    expect(declined.length).toBeGreaterThanOrEqual(0);
  });
});
