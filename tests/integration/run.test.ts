import { describe, expect, it } from 'vitest';
import { day, skip } from './sitout';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { computeTarget, RunEngine } from '../../src/engine/run/engine';
import { BALANCE } from '../../src/content/balance';
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
    expect(e.session?.cards.length).toBe(BALANCE.run.lineupSize);
    expect(e.state.round.target).toBe(computeTarget(1, 0, null, e.state.config));
    const result = await playRun(e, { kind: 'disciplined' }, 400);
    expect(result).not.toBeNull();
    expect(['victory', 'survived']).toContain(result?.outcome);
    // 12 rounds recorded (skips count as rounds), each Review with its own rule.
    expect(e.state.history.length).toBe(12);
    expect(e.state.history.filter((h) => h.index === 2).map((h) => h.reviewId)).toContain('annual_review');
    expect(new Set(e.state.reviewsSeen).size).toBe(4);
    // Targets grow 1.6x a quarter.
    expect(e.state.history[3].target).toBe(computeTarget(2, 0, null, e.state.config));
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
    expect(r?.reason).toMatch(/One trade per card/);
    // Once the clock runs: no skipping, and a new trade waits for the close, then may start on a
    // later day (the untraded card moved with the clock and has today's chain).
    await e.dispatch({ t: 's', a: { t: 'begin' } });
    expect(e.canSkip()).toBe(false);
    const c2 = s.cards[1];
    await e.dispatch({ t: 's', a: { t: 'call', cardId: c2.id, bucket: 1, confidence: 0.6 } });
    const placeOn = (cardId: string) => {
      const ch = s.chain(cardId)!;
      const ex = [...new Set(ch.quotes.map((q) => q.expiration))]
        .sort()
        .find((x) => Date.parse(x) - Date.parse(ch.date) > 25 * 86400000)!;
      return e.dispatch({
        t: 's',
        a: {
          t: 'place',
          cardId,
          structureId: 'bear_call',
          params: { expiration: ex, delta: 0.3, width: 1 },
          qty: 1,
          order: { type: 'market' },
          earningsAck: true,
        },
      });
    };
    r = await placeOn(c2.id);
    expect(r?.reason).toMatch(/Wait for the close/);
    for (const d of s.decisions.slice())
      await e.dispatch({ t: 's', a: { t: 'decide', dpId: d.id, action: 'hold' } });
    if (s.inDay) await e.dispatch({ t: 's', a: { t: 'end' } });
    const day1 = s.view(c2.id).now;
    expect(s.chain(c2.id)!.date).toBe(day1);
    r = await placeOn(c2.id);
    expect(r?.ok).toBe(true);
    expect(e.state.round.ticketsUsed).toBe(2);
    // After the trading window, new trades wait for the next round.
    while (e.session === s && s.dayIndex < BALANCE.run.tradeWindowDays) await day(e);
    if (e.session === s) {
      const c3 = s.cards[2];
      await e.dispatch({ t: 's', a: { t: 'call', cardId: c3.id, bucket: 3, confidence: 0.6 } });
      r = await placeOn(c3.id);
      expect(r?.reason).toMatch(/trading window closed/);
    }
  }, 60_000);

  it('names why a trade is blocked and tracks the goal with open trades', async () => {
    const e = await RunEngine.create(src, config({ seed: 'goal-1' }));
    const s = e.session!;
    const c = s.cards[0];
    expect(e.tradeBlock(c.id, 'bull_put')).toBeNull();
    expect(e.tradeBlock(c.id, 'iron_condor')).toMatch(/playbook/);
    const g0 = e.goalOutlook();
    expect(g0).toMatchObject({ meter: 0, toGo: e.state.round.target, openCount: 0, openPoints: 0 });
    const chain = s.chain(c.id)!;
    const exp = [...new Set(chain.quotes.map((q) => q.expiration))]
      .sort()
      .find((x) => Date.parse(x) - Date.parse(chain.date) > 25 * 86400000)!;
    await e.dispatch({ t: 's', a: { t: 'call', cardId: c.id, bucket: 3, confidence: 0.6 } });
    const r = await e.dispatch({
      t: 's',
      a: {
        t: 'place',
        cardId: c.id,
        structureId: 'bull_put',
        params: { expiration: exp, delta: 0.3, width: 1 },
        qty: 1,
        order: { type: 'market' },
        earningsAck: true,
      },
    });
    expect(r?.ok).toBe(true);
    expect(e.tradeBlock(c.id, 'bull_put')).toMatch(/One trade per card/);
    await day(e);
    const g = e.goalOutlook();
    expect(g.openCount).toBe(1);
    // Open trades count their P/L chips only: 1% of round-start equity is 100 points before mults.
    const expected = (g.openPlCents / e.state.round.startEquityCents) * BALANCE.scoring.chipsPerUnit;
    const scaled = g.openPlCents > 0 ? expected : expected * BALANCE.scoring.lossChipsScale;
    expect(g.openPoints).toBe(Math.round(scaled));
  }, 60_000);

  it('a card whose trade closed keeps moving with the clock (its chart never freezes)', async () => {
    const e = await RunEngine.create(src, config({ seed: 'settled-1' }));
    const s = e.session!;
    const c = s.cards[0];
    const chain = s.chain(c.id)!;
    const exp = [...new Set(chain.quotes.map((q) => q.expiration))]
      .sort()
      .find((x) => Date.parse(x) - Date.parse(chain.date) > 25 * 86400000)!;
    await e.dispatch({ t: 's', a: { t: 'call', cardId: c.id, bucket: 3, confidence: 0.6 } });
    const r = await e.dispatch({
      t: 's',
      a: {
        t: 'place',
        cardId: c.id,
        structureId: 'bull_put',
        params: { expiration: exp, delta: 0.3, width: 1 },
        qty: 1,
        order: { type: 'market' },
        earningsAck: true,
      },
    });
    expect(r?.ok).toBe(true);
    await day(e);
    const pos = s.openPositions()[0];
    await e.dispatch({ t: 's', a: { t: 'close', positionId: pos.id, order: { type: 'market' } } });
    expect(s.settledCardIds()).toContain(c.id);
    const closedOn = s.view(c.id).now;
    const bars = s.view(c.id).bars().length;
    await day(e);
    expect(e.session).toBe(s); // the trading window keeps the round open
    expect(s.view(c.id).now > closedOn).toBe(true);
    expect(s.view(c.id).bars().length).toBe(bars + 1);
    expect(s.chain(c.id)?.date).toBe(s.view(c.id).now);
  }, 60_000);

  it('skips Month 1 for a tag, then deals Month 2 with no shop', async () => {
    const e = await RunEngine.create(src, config({ seed: 'skip-1' }));
    const tag = e.state.round.skipTag;
    expect(tag).not.toBeNull();
    const stress0 = e.state.stress;
    // A skip is a sit-out: the round runs its days with trading locked, then the Tag pays.
    await e.dispatch({ t: 'skip' });
    expect(e.state.round.sitOut?.days).toBe(BALANCE.run.sitOutDays);
    expect(e.state.pendingTags).not.toContain(tag);
    const s = e.session!;
    const c = s.cards[0];
    await e.dispatch({ t: 's', a: { t: 'call', cardId: c.id, bucket: 3, confidence: 0.6 } });
    const blocked = await e.dispatch({
      t: 's',
      a: {
        t: 'place',
        cardId: c.id,
        structureId: 'bull_put',
        params: { expiration: s.chain(c.id)!.quotes[0].expiration, delta: 0.3, width: 1 },
        qty: 1,
        order: { type: 'market' },
        earningsAck: true,
      },
    });
    expect(blocked?.reason).toMatch(/sitting this round out/);
    for (let d = 1; d < BALANCE.run.sitOutDays; d++) {
      await e.dispatch({ t: 's', a: { t: 'begin' } });
      await e.dispatch({ t: 's', a: { t: 'end' } });
      expect(e.state.roundIndex).toBe(0);
    }
    await e.dispatch({ t: 's', a: { t: 'begin' } });
    await e.dispatch({ t: 's', a: { t: 'end' } });
    expect(e.state.phase).toBe('round');
    expect(e.state.roundIndex).toBe(1);
    expect(e.state.pendingTags).toContain(tag);
    expect(e.state.stress).toBeLessThanOrEqual(stress0);
    expect(e.state.history[0].status).toBe('skipped');
    expect(e.state.round.target).toBe(computeTarget(1, 1, null, e.state.config));
  }, 60_000);

  it('developer levers change the game layer, are logged, and survive a resume', async () => {
    const e = await RunEngine.create(src, config({ seed: 'dev-1' }));
    const cash0 = e.state.cash;
    await e.dispatch({ t: 'dev', op: { k: 'cash', delta: 50 } });
    await e.dispatch({ t: 'dev', op: { k: 'cartridge', id: 'theta_engine' } });
    await e.dispatch({ t: 'dev', op: { k: 'tickets', delta: 2 } });
    await e.dispatch({ t: 'dev', op: { k: 'meter', delta: 25 } });
    expect(e.state.dev).toBe(true);
    expect(e.state.cash).toBe(cash0 + 50);
    expect(e.state.cartridges).toContain('theta_engine');
    expect(e.state.round.tickets).toBe(BALANCE.run.ticketsPerRound + 2);
    const again = await RunEngine.resume(src, e.save());
    expect(again.state.cash).toBe(e.state.cash);
    expect(again.state.cartridges).toEqual(e.state.cartridges);
    expect(again.state.round.meter).toBe(25);
  }, 60_000);

  it('rerolls untraded cards and never repeats a window', async () => {
    const e = await RunEngine.create(src, config({ seed: 'reroll-1' }));
    const before = e.state.round.cards.map((c) => c.windowId);
    await e.dispatch({ t: 'reroll' });
    const after = e.state.round.cards.map((c) => c.windowId);
    expect(after.some((w) => before.includes(w))).toBe(false);
    expect(e.session?.cards.map((c) => c.id)).toEqual(e.state.round.cards.map((c) => c.cardId));
    expect(e.state.round.rerollsUsed).toBe(1);
    for (let k = 1; k < e.state.round.rerolls; k++) await e.dispatch({ t: 'reroll' });
    expect(e.state.round.rerollsUsed).toBe(e.state.round.rerolls);
    await e.dispatch({ t: 'reroll' });
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
    await skip(e);
    expect(e.state.round.tickets).toBe(2);
    expect(e.state.round.silentAnalyst).toBe('quant');
    expect(e.hasAnalyst('quant')).toBe(false);
  }, 60_000);

  it('skipping into a Review: COMPLY-3000 intro, +10 stress, filtered lineup', async () => {
    const e = await RunEngine.create(src, config({ seed: 'review-1' }));
    await skip(e);
    await skip(e);
    expect(e.state.phase).toBe('review_intro');
    const id = e.state.nextReview!;
    expect(id).not.toBe('annual_review');
    expect(e.state.stressLog.at(-1)?.reason).toMatch(/Entering a Review/);
    expect(e.canSkip()).toBe(false);
    await e.dispatch({ t: 'startReview' });
    expect(e.state.phase).toBe('round');
    expect(e.state.round.reviewId).toBe(id);
    expect(e.state.round.target).toBe(computeTarget(1, 2, id, e.state.config));
    await skip(e);
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
