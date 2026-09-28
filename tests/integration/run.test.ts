import { describe, expect, it } from 'vitest';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { RunEngine } from '../../src/engine/run/engine';
import type { RunConfig } from '../../src/engine/run/types';
import { playRound, playRun, shopTurn } from '../../src/engine/sim/bot';
import { DEFAULT_REALISM, defaultPause } from '../../src/engine/lifecycle/daily';
import { streamFor } from '../../src/engine/rng';

const src = new SyntheticSource();

function config(over: Partial<RunConfig> = {}): RunConfig {
  return {
    seed: 'run-test-1',
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

describe('career run loop', () => {
  it('plays a full 12-round Verticals year start to finish (practice)', async () => {
    const e = await RunEngine.create(src, config({ seed: 'full-year', practice: true }));
    expect(e.state.phase).toBe('round');
    expect(e.session?.cards.length).toBe(3);
    expect(e.state.round.target).toBe(150);
    const result = await playRun(e, { kind: 'disciplined' }, 400);
    expect(result).not.toBeNull();
    expect(['victory', 'survived']).toContain(result?.outcome);
    // 12 rounds recorded (skips count as rounds), each Review with its own rule.
    expect(e.state.history.length).toBe(12);
    expect(e.state.history.filter((h) => h.index === 2).map((h) => h.reviewId)).toContain('annual_review');
    expect(new Set(e.state.reviewsSeen).size).toBe(4);
    // Targets grow 1.6x a quarter.
    expect(e.state.history[3].target).toBe(240);
    expect(e.state.totals.trades).toBeGreaterThan(5);
    expect(e.state.brierScores.length).toBe(e.state.totals.trades);
  }, 240_000);

  it('replays exactly from the seed and action log', async () => {
    const a = await RunEngine.create(src, config({ seed: 'replay-1' }));
    const rng = streamFor('replay-1', 'bot');
    await playRound(a, { kind: 'disciplined' }, rng);
    if (a.state.phase === 'tally') await a.dispatch({ t: 'finishTally' });
    if (a.state.phase === 'shop') await shopTurn(a, { kind: 'disciplined' });
    const save = a.save();
    // Replay the full log from a fresh engine.
    const b = await RunEngine.create(src, config({ seed: 'replay-1' }));
    for (const act of save.log) await b.dispatch(act);
    expect(b.state).toEqual(a.state);
  }, 120_000);

  it('saves and resumes mid-round with the same state', async () => {
    const a = await RunEngine.create(src, config({ seed: 'resume-1' }));
    const rng = streamFor('resume-1', 'bot');
    // Place trades and advance a few days, then save mid-round.
    const s = a.session!;
    let placed = false;
    for (const c of s.cards) {
      await a.dispatch({ t: 's', a: { t: 'call', cardId: c.id, bucket: 3, confidence: 0.7 } });
      const chain = s.chain(c.id)!;
      const exp = [...new Set(chain.quotes.map((q) => q.expiration))]
        .sort()
        .find((x) => Date.parse(x) - Date.parse(chain.date) > 25 * 86400000);
      if (!exp) continue;
      for (const width of [5, 2, 1]) {
        const plan = s.planFor(c.id, 'bull_put', { expiration: exp, delta: 0.3, width }, 1);
        if (!plan.ok) continue;
        const r = await a.dispatch({
          t: 's',
          a: {
            t: 'place',
            cardId: c.id,
            structureId: 'bull_put',
            params: { expiration: exp, delta: 0.3, width },
            qty: 1,
            order: { type: 'market' },
            earningsAck: true,
          },
        });
        placed = !!r?.ok || placed;
        break;
      }
      if (placed) break;
    }
    expect(placed).toBe(true);
    for (let d = 0; d < 4 && a.state.phase === 'round'; d++) {
      await a.dispatch({ t: 's', a: { t: 'begin' } });
      for (const dp of a.session?.decisions.slice() ?? [])
        await a.dispatch({ t: 's', a: { t: 'decide', dpId: dp.id, action: 'hold' } });
      await a.dispatch({ t: 's', a: { t: 'end' } });
    }
    const save = JSON.parse(JSON.stringify(a.save()));
    expect(save.pending.length).toBeGreaterThan(0);
    const b = await RunEngine.resume(src, save);
    expect(b.state).toEqual(a.state);
    expect(b.session?.positions).toEqual(a.session?.positions);
    // Both continue identically.
    await playRound(a, { kind: 'disciplined' }, streamFor('x', 'y'));
    await playRound(b, { kind: 'disciplined' }, streamFor('x', 'y'));
    expect(b.state).toEqual(a.state);
    void rng;
  }, 120_000);

  it('enforces tickets, one position per card, the playbook and calls', async () => {
    const e = await RunEngine.create(src, config({ seed: 'rules-1' }));
    const s = e.session!;
    const c = s.cards[0];
    const chain = s.chain(c.id)!;
    const exp = [...new Set(chain.quotes.map((q) => q.expiration))]
      .sort()
      .find((x) => Date.parse(x) - Date.parse(chain.date) > 25 * 86400000)!;
    const place = (structureId: 'bull_put' | 'iron_condor') =>
      e.dispatch({
        t: 's',
        a: {
          t: 'place',
          cardId: c.id,
          structureId,
          params: { expiration: exp, delta: 0.3, width: 1 },
          qty: 1,
          order: { type: 'market' },
          earningsAck: true,
        },
      });
    let r = await place('bull_put');
    expect(r?.ok).toBe(false);
    expect(r?.reason).toMatch(/Call your shot/);
    await e.dispatch({ t: 's', a: { t: 'call', cardId: c.id, bucket: 3, confidence: 0.6 } });
    r = await place('iron_condor');
    expect(r?.reason).toMatch(/playbook/);
    r = await place('bull_put');
    expect(r?.ok).toBe(true);
    expect(e.state.round.ticketsUsed).toBe(1);
    r = await place('bull_put');
    expect(r?.reason).toMatch(/One position per card/);
    // Once the clock runs, no new trades and no skipping.
    await e.dispatch({ t: 's', a: { t: 'begin' } });
    expect(e.canSkip()).toBe(false);
    const c2 = s.cards[1];
    await e.dispatch({ t: 's', a: { t: 'call', cardId: c2.id, bucket: 1, confidence: 0.6 } });
    r = await e.dispatch({
      t: 's',
      a: {
        t: 'place',
        cardId: c2.id,
        structureId: 'bear_call',
        params: { expiration: exp, delta: 0.3, width: 1 },
        qty: 1,
        order: { type: 'market' },
        earningsAck: true,
      },
    });
    expect(r?.reason).toMatch(/clock is running/);
  }, 60_000);

  it('skips Month 1 for a tag, then deals Month 2 with no shop', async () => {
    const e = await RunEngine.create(src, config({ seed: 'skip-1' }));
    const tag = e.state.round.skipTag;
    expect(tag).not.toBeNull();
    const stress0 = e.state.stress;
    await e.dispatch({ t: 'skip' });
    expect(e.state.phase).toBe('round');
    expect(e.state.roundIndex).toBe(1);
    expect(e.state.pendingTags).toContain(tag);
    expect(e.state.stress).toBeLessThanOrEqual(stress0);
    expect(e.state.history[0].status).toBe('skipped');
    expect(e.state.round.target).toBe(250);
  }, 60_000);

  it('rerolls untraded cards and never repeats a window', async () => {
    const e = await RunEngine.create(src, config({ seed: 'reroll-1' }));
    const before = e.state.round.cards.map((c) => c.windowId);
    await e.dispatch({ t: 'reroll' });
    const after = e.state.round.cards.map((c) => c.windowId);
    expect(after.some((w) => before.includes(w))).toBe(false);
    expect(e.session?.cards.map((c) => c.id)).toEqual(e.state.round.cards.map((c) => c.cardId));
    expect(e.state.round.rerollsUsed).toBe(1);
    await e.dispatch({ t: 'reroll' });
    await e.dispatch({ t: 'reroll' });
    expect(e.state.round.rerollsUsed).toBe(2);
    expect(e.events.some((x) => /No rerolls left/.test(x.text))).toBe(true);
  }, 60_000);

  it('a normal run ends in victory or defeat and pays XP', async () => {
    const e = await RunEngine.create(src, config({ seed: 'normal-1' }));
    const result = await playRun(e, { kind: 'disciplined' }, 400);
    expect(result).not.toBeNull();
    expect(['victory', 'survived', 'defeat']).toContain(result?.outcome);
    expect(result!.xp).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result!.calGrade);
    expect(e.over).toBe(true);
  }, 240_000);

  it('burnout at 100 stress: next round has one fewer ticket and a silent analyst', async () => {
    const e = await RunEngine.create(src, config({ seed: 'burn-1' }));
    e.state.stress = 95;
    e.state.memos = ['compliance_waiver'];
    await e.dispatch({ t: 'memo', id: 'compliance_waiver' });
    expect(e.state.stress).toBe(50);
    expect(e.state.burnoutNext).toBe(true);
    expect(e.state.stressLog.some((x) => /BURNOUT/.test(x.reason))).toBe(true);
    await e.dispatch({ t: 'skip' });
    expect(e.state.round.tickets).toBe(2);
    expect(e.state.round.silentAnalyst).toBe('quant');
    expect(e.hasAnalyst('quant')).toBe(false);
  }, 60_000);

  it('skipping into a Review: COMPLY-3000 intro, +10 stress, filtered lineup', async () => {
    const e = await RunEngine.create(src, config({ seed: 'review-1' }));
    await e.dispatch({ t: 'skip' });
    await e.dispatch({ t: 'skip' });
    expect(e.state.phase).toBe('review_intro');
    const id = e.state.nextReview!;
    expect(id).not.toBe('annual_review');
    expect(e.state.stressLog.at(-1)?.reason).toMatch(/Entering a Review/);
    expect(e.canSkip()).toBe(false);
    await e.dispatch({ t: 'startReview' });
    expect(e.state.phase).toBe('round');
    expect(e.state.round.reviewId).toBe(id);
    expect(e.state.round.target).toBe(400);
    await e.dispatch({ t: 'skip' });
    expect(e.events.some((x) => /cannot be skipped/.test(x.text))).toBe(true);
  }, 60_000);

  it('arcade cartridges change the meter, never the ledger', async () => {
    const a = await RunEngine.create(src, config({ seed: 'ledger-1' }));
    await playRound(a, { kind: 'disciplined' }, streamFor('ledger-1', 'bot'));
    expect(a.state.phase).toBe('tally');
    const round1 = a.log.slice();
    const b = await RunEngine.create(src, config({ seed: 'ledger-1' }));
    b.state.cartridges = [
      'credit_where_due',
      'theta_engine',
      'trend_rider',
      'fifty_percent_club',
      'weekend_warrior',
    ];
    for (const act of round1) await b.dispatch(act);
    expect(b.state.phase).toBe('tally');
    expect(b.finishedSession?.positions).toEqual(a.finishedSession?.positions);
    expect(b.state.equityCents).toBe(a.state.equityCents);
    const winners = a.state.round.tallies.filter((t) => t.winner).length;
    if (winners > 0) expect(b.state.round.meter).toBeGreaterThan(a.state.round.meter);
  }, 60_000);

  it('every desk plays a full practice year with its own playbook', async () => {
    for (const deskId of ['verticals', 'income', 'condor', 'volatility', 'calendar'] as const) {
      const e = await RunEngine.create(src, config({ seed: `desk-${deskId}`, deskId, practice: true }));
      const result = await playRun(e, { kind: 'disciplined' }, 400);
      expect(result, deskId).not.toBeNull();
      expect(e.state.history.length, deskId).toBe(12);
      expect(e.state.totals.trades, deskId).toBeGreaterThan(5);
    }
  }, 240_000);
});
