import { describe, expect, it } from 'vitest';
import { day, skip } from './sitout';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { computeTarget, RunEngine } from '../../src/engine/run/engine';
import { BALANCE } from '../../src/content/balance';
import type { RunConfig } from '../../src/engine/run/types';
import { DEFAULT_REALISM, defaultPause } from '../../src/engine/lifecycle/daily';
import { MEMO_IDS, TAG_IDS, VOUCHER_IDS } from '../../src/content/items';
import { REVIEWS } from '../../src/content/reviews';
import { BOSSES, BOSS_IDS, quarterBossPool } from '../../src/content/bosses';
import { matchesFilter } from '../../src/engine/market/filter';
import type { MemoId, TagId } from '../../src/content/types';
import { expirationsOf } from '../../src/engine/strategies/structures';
import { CLIENTS } from '../../src/content/clients';
import { clientChecks, clientFitsDesk } from '../../src/engine/run/clients';
import { DESK_ORDER } from '../../src/content/desks';

const src = new SyntheticSource();

function config(seed: string, over: Partial<RunConfig> = {}): RunConfig {
  return {
    seed,
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
    startingStress: 40,
    extraRerolls: 0,
    practice: false,
    ...over,
  };
}

async function withMemo(id: MemoId, seed = `memo-${id}`) {
  const e = await RunEngine.create(src, config(seed));
  e.state.memos = [id];
  return e;
}

async function placeOn(e: RunEngine, cardIndex = 0) {
  const s = e.session!;
  const c = s.cards[cardIndex];
  await e.dispatch({ t: 's', a: { t: 'call', cardId: c.id, bucket: 3, confidence: 0.6 } });
  const chain = s.chain(c.id)!;
  const exp = expirationsOf(chain).find((x) => Date.parse(x) - Date.parse(chain.date) > 25 * 86400000)!;
  for (const width of [5, 2, 1]) {
    const plan = s.planFor(c.id, 'bull_put', { expiration: exp, delta: 0.3, width }, 1);
    if (!plan.ok) continue;
    return e.dispatch({
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
  }
  return null;
}

describe('memos', () => {
  const cases: Record<MemoId, (e: RunEngine) => Promise<void>> = {
    reroll: async (e) => {
      const before = e.state.round.cards.map((c) => c.windowId).join();
      await e.dispatch({ t: 'memo', id: 'reroll' });
      expect(e.state.round.cards.map((c) => c.windowId).join()).not.toBe(before);
      expect(e.state.round.rerollsUsed).toBe(0);
    },
    extra_ticket: async (e) => {
      await e.dispatch({ t: 'memo', id: 'extra_ticket' });
      expect(e.state.round.tickets).toBe(4);
    },
    time_skip: async (e) => {
      const first = e.state.round.cards[0];
      const day0 = e.session!.view(first.cardId).now;
      await e.dispatch({ t: 'memo', id: 'time_skip', cardId: first.cardId });
      const next = e.state.round.cards[0];
      expect(next.windowId).toBe(first.windowId);
      expect(next.timeSkip).toBe(2);
      expect(e.session!.view(next.cardId).now > day0).toBe(true);
    },
    roll_voucher: async (e) => {
      await e.dispatch({ t: 'memo', id: 'roll_voucher' });
      expect(e.state.round.memo.rollAtMid).toBe(true);
    },
    vacation: async (e) => {
      await e.dispatch({ t: 'memo', id: 'vacation' });
      expect(e.state.stress).toBe(10);
    },
    lens: async (e) => {
      await e.dispatch({ t: 'memo', id: 'lens' });
      expect(e.state.round.memo.lens).toBe(true);
    },
    hedge: async (e) => {
      await e.dispatch({ t: 'memo', id: 'hedge' });
      expect(e.state.round.memo.hedge).toBe(true);
    },
    analyst_loan: async (e) => {
      expect(e.hasAnalyst('ghost')).toBe(false);
      await e.dispatch({ t: 'memo', id: 'analyst_loan', analyst: 'ghost' });
      expect(e.hasAnalyst('ghost')).toBe(true);
    },
    due_diligence: async (e) => {
      const id = e.state.round.cards[1].cardId;
      await e.dispatch({ t: 'memo', id: 'due_diligence', cardId: id });
      expect(e.state.round.memo.dueDiligence).toEqual([id]);
    },
    double_down: async (e) => {
      await e.dispatch({ t: 'memo', id: 'double_down' });
      expect(e.state.round.memo.doubleDown).toBe(true);
      const r = await placeOn(e);
      expect(r?.ok).toBe(true);
      expect(e.state.round.doubleDownFor).toBe(r?.positionId);
    },
    compliance_waiver: async (e) => {
      await e.dispatch({ t: 'memo', id: 'compliance_waiver' });
      expect(e.state.round.memo.waiver).toBe(true);
      expect(e.state.stress).toBe(60);
    },
  };
  it('covers every memo', () => expect(Object.keys(cases).sort()).toEqual([...MEMO_IDS].sort()));
  for (const id of MEMO_IDS)
    it(`${id} works and is used up`, async () => {
      const e = await withMemo(id);
      await cases[id](e);
      expect(e.state.memos).toEqual([]);
    }, 30_000);
});

describe('vouchers', () => {
  it('each voucher changes what it says', async () => {
    const e = await RunEngine.create(src, config('vouchers'));
    const base = {
      slots: e.cartridgeSlots(),
      seats: e.analystSeats(),
      p: e.passives(),
      cfg: e.sessionConfig(),
    };
    e.state.vouchers = [...VOUCHER_IDS];
    const p = e.passives();
    expect(p.lineupAdd).toBe(1);
    expect(e.analystSeats()).toBe(base.seats + 1);
    expect(e.cartridgeSlots()).toBe(base.slots + 1);
    expect(p.execution.marketImprove).toBeGreaterThan(base.p.execution.marketImprove);
    expect(p.riskCapMult).toBeCloseTo(1.2);
    expect(p.autoBrackets).toBe(true);
    expect(e.sessionConfig().autoBrackets).toBe(true);
    expect(e.sessionConfig().riskCapPct).toBeCloseTo(base.cfg.riskCapPct * 1.2);
    expect(p.analystOffersAdd).toBe(1);
    expect(p.priceMult).toBeCloseTo(0.75);
    expect(p.interestCapAdd).toBe(1);
    expect(p.maxLossLineDelta).toBeCloseTo(0.01);
  }, 30_000);

  it('Seed Capital pays $10 when bought; Second Monitor deals a fourth card next round', async () => {
    const e = await RunEngine.create(src, config('voucher-buy'));
    await skip(e);
    // Set up a shop by finishing a (skipped) round the normal way: skip Month 2, then fake a shop.
    e.state.phase = 'shop';
    e.state.cash = 30;
    e.state.shop = {
      items: [
        { kind: 'voucher', id: 'seed_capital', price: 10, sold: false },
        { kind: 'voucher', id: 'second_monitor', price: 10, sold: false },
      ],
      rerolls: 0,
      freeRerolls: 0,
    };
    await e.dispatch({ t: 'buy', index: 0 });
    expect(e.state.cash).toBe(30);
    await e.dispatch({ t: 'buy', index: 1 });
    await e.dispatch({ t: 'leaveShop' });
    await e.dispatch({ t: 'startReview' });
    expect(e.session?.cards.length).toBe(Math.min(BALANCE.run.lineupMax, BALANCE.run.lineupSize + 1));
  }, 30_000);
});

describe('tags', () => {
  const effects: Record<TagId, (e: RunEngine, before: { stress: number; cash: number }) => void> = {
    discipline: (e, b) => {
      expect(e.state.cash).toBe(b.cash + 4);
      expect(e.state.stress).toBe(Math.max(0, b.stress - 10 - 20));
    },
    analyst: (e) => expect(e.state.tagEffects.freeAnalyst).toBe(1),
    cartridge: (e) => expect(e.state.tagEffects.freeUncommon).toBe(1),
    playbook: (e) => expect(Object.values(e.state.levels).reduce((a, b) => a + ((b ?? 1) - 1), 0)).toBe(2),
    investment: (e) => expect(e.state.tagEffects.investment).toBe(15),
    double: (e) => expect(e.state.tagEffects.doubleNext).toBe(true),
    reroll: (e) => expect(e.state.tagEffects.freeRerolls).toBe(2),
    calm: (e) => expect(e.state.round.maxLossLinePct).toBeCloseTo(BALANCE.risk.maxLossLinePct + 0.02),
  };
  for (const tag of TAG_IDS)
    it(`${tag} tag`, async () => {
      const e = await RunEngine.create(src, config(`tag-${tag}`));
      e.state.round.skipTag = tag;
      const before = { stress: e.state.stress, cash: e.state.cash };
      await skip(e);
      effects[tag](e, before);
    }, 30_000);

  it('Double copies the next tag', async () => {
    const e = await RunEngine.create(src, config('tag-double-2'));
    e.state.round.skipTag = 'double';
    await skip(e);
    e.state.round.skipTag = 'reroll';
    await skip(e);
    expect(e.state.tagEffects.freeRerolls).toBe(4);
  }, 30_000);
});

describe('bosses', () => {
  for (const id of BOSS_IDS)
    it(`${id}: deals its market, drops the old Review rule, applies one twist`, async () => {
      const boss = BOSSES[id];
      const e = await RunEngine.create(src, config(`boss-${id}`, id === 'rebalancer' ? { quarters: 1 } : {}));
      // Pin this quarter's boss (normally drawn when the quarter starts).
      e.state.bosses = [{ quarter: 1, id }];
      const monthCap = e.sessionConfig().riskCapPct;
      await skip(e);
      await skip(e);
      expect(e.state.phase).toBe('review_intro');
      expect(e.state.round.bossId).toBe(id);
      // Skipping rounds can hand out a Calm Tag (a looser line next round): not what this checks.
      e.state.tagEffects.calm = 0;
      await e.dispatch({ t: 'startReview' });
      const r = e.state.round;
      expect(r.reviewId).toBe(boss.market);
      expect(r.bossId).toBe(id);
      const rv = REVIEWS[boss.market];
      const windows = await src.windows({});
      const dealt = r.cards.map((c) => windows.find((w) => w.id === c.windowId)!);
      if (boss.market !== 'annual_review' && !r.filterRelaxed) {
        const matching = dealt.filter((w) => matchesFilter(w, rv.filter));
        // The Fed swaps one card for the index.
        expect(matching.length).toBeGreaterThanOrEqual(
          boss.market === 'the_fed' ? dealt.length - 1 : dealt.length,
        );
      }
      if (boss.market === 'the_fed')
        expect(dealt.some((w) => w.symbol === 'MKTX' || w.symbol === 'INDX')).toBe(true);
      // The market type's old rule is gone: one twist only.
      const cfg = e.sessionConfig();
      expect(cfg.execution.marketOrdersDisabled).toBe(false);
      expect(cfg.suppressOnGap).toBe(false);
      expect(r.maxLossLinePct).toBeCloseTo(BALANCE.risk.maxLossLinePct);
      expect(r.target).toBe(computeTarget(1, 2, boss.market, e.state.config, false, id));
      // The twist itself.
      const t = boss.twist;
      if (t.kind === 'riskCap') expect(cfg.riskCapPct).toBeCloseTo(monthCap * t.mult);
      else expect(cfg.riskCapPct).toBeCloseTo(monthCap);
      if (t.kind === 'leftCartOff') {
        expect(e.state.cartridges.length).toBeGreaterThan(0);
        expect(e.activeCartridges()).not.toContain(e.state.cartridges[0]);
      } else expect(e.activeCartridges()).toEqual(e.state.cartridges);
      if (t.kind === 'annual')
        expect(r.target).toBe(computeTarget(1, 2, 'annual_review', e.state.config, false, 'rebalancer'));
    }, 30_000);

  it('picks Q1-Q3 bosses from the built ones without repeats in a year, and Q4 is the Rebalancer', async () => {
    for (const seed of ['pick-a', 'pick-b', 'pick-c']) {
      const e = await RunEngine.create(src, config(seed));
      const picks = [1, 2, 3, 4].map((q) => e.bossFor(q));
      expect(picks[3]).toBe('rebalancer');
      expect(new Set(picks.slice(0, 3)).size).toBe(3);
      for (const p of picks.slice(0, 3)) expect(quarterBossPool()).toContain(p);
      // Asking again gives the same boss (it is remembered, not redrawn).
      expect(e.bossFor(2)).toBe(picks[1]);
    }
  });
});

describe('boss goals', () => {
  async function inBossRound(id: (typeof BOSS_IDS)[number], seed: string) {
    const e = await RunEngine.create(src, config(seed));
    await e.dispatch({ t: 'dev', op: { k: 'boss', id } });
    expect(e.state.phase).toBe('review_intro');
    await e.dispatch({ t: 'startReview' });
    expect(e.state.round.bossId).toBe(id);
    return e;
  }

  it('the Allocator needs 3 structure types as well as the target', async () => {
    const e = await inBossRound('allocator', 'goal-alloc');
    expect(e.secondGoal()).toEqual({ need: 3, have: 0, met: false });
    await placeOn(e, 0);
    expect(e.secondGoal()?.have).toBe(1);
    // The target alone isn't enough.
    await e.dispatch({ t: 'dev', op: { k: 'meter', delta: e.state.round.target * 3 } });
    for (let i = 0; i < 40 && e.state.phase === 'round'; i++) await day(e);
    expect(e.state.phase).toBe('tally');
    expect(e.state.round.status).toBe('failed');
  }, 60_000);

  it('the Rebalancer records the race against SPY each day', async () => {
    const e = await RunEngine.create(src, config('goal-rebal', { quarters: 1 }));
    await e.dispatch({ t: 'dev', op: { k: 'boss', id: 'rebalancer' } });
    await e.dispatch({ t: 'startReview' });
    expect(e.rule().beatSpy).toBe(true);
    await placeOn(e, 0);
    const before = e.race();
    expect(before).not.toBeNull();
    await day(e);
    await day(e);
    const race = e.state.round.race ?? [];
    expect(race.length).toBe(2);
    // The race is the trades' P/L against the same capital in SPY.
    expect(race[1]).toEqual(e.race());
    // Other bosses keep no race.
    const o = await inBossRound('underwriter', 'goal-under');
    expect(o.race()).toBeNull();
  }, 60_000);

  it('a boss round reports its style and pays for it when met', async () => {
    const e = await inBossRound('underwriter', 'goal-style');
    expect(e.bossStyle()).toMatchObject({ id: 'no_loser', state: 'on_track', cash: BALANCE.run.styleCash });
  }, 30_000);
});

describe('the month menu', () => {
  it('comes up over each Month (not a Review, the tutorial or the simulator) and closes once', async () => {
    const e = await RunEngine.create(src, config('menu-1'));
    expect(e.state.round.boardSeen).toBe(false);
    await e.dispatch({ t: 'boardDone' });
    expect(e.state.round.boardSeen).toBe(true);
    await skip(e);
    expect(e.state.round.boardSeen).toBe(false);
    await skip(e);
    expect(e.state.phase).toBe('review_intro');
    await e.dispatch({ t: 'startReview' });
    expect(e.state.round.boardSeen).toBe(true);
    for (const mode of ['tutorial', 'sim'] as const)
      expect((await RunEngine.create(src, config(`menu-${mode}`, { mode }))).state.round.boardSeen).toBe(
        true,
      );
  });

  it('sets the run-wide exit plan: clamped, saved, and used by new trades', async () => {
    const e = await RunEngine.create(src, config('menu-plan'));
    const before = e.exitPlan();
    expect(before.creditTargetPct).toBeCloseTo(BALANCE.brackets.creditTargetPct);
    await e.dispatch({ t: 'setPlan', plan: { creditTargetPct: 0.75, creditStopMult: 9 } });
    const after = e.exitPlan();
    expect(after.creditTargetPct).toBeCloseTo(0.75);
    // Out-of-range values are held to the sensible range; untouched ones stay.
    expect(after.creditStopMult).toBe(4);
    expect(after.debitStopPct).toBeCloseTo(before.debitStopPct);
    expect(e.state.plan).toEqual(after);
    expect(e.session!.config.bracketDefaults).toEqual(after);
    expect(e.sessionConfig().bracketDefaults).toEqual(after);
  });

  it('rerolls the quarter’s boss once, for the listed price, before the clock starts', async () => {
    const e = await RunEngine.create(src, config('menu-reroll'));
    e.state.cash = 30;
    const first = e.bossFor(1);
    expect(e.bossReroll()).toEqual({ cost: BALANCE.run.bossRerollCosts[0] });
    await e.dispatch({ t: 'rerollBoss' });
    const now = e.knownBoss(1)!;
    expect(now).not.toBe(first);
    expect(quarterBossPool()).toContain(now);
    expect(e.state.cash).toBe(30 - BALANCE.run.bossRerollCosts[0]);
    // Once per boss.
    expect(e.bossReroll()).toHaveProperty('blocked');
    await e.dispatch({ t: 'rerollBoss' });
    expect(e.knownBoss(1)).toBe(now);
    expect(e.state.cash).toBe(30 - BALANCE.run.bossRerollCosts[0]);
    // Q2's boss costs the next price, and not after its Month's clock has started.
    const e2 = await RunEngine.create(src, config('menu-reroll-2'));
    e2.state.cash = 100;
    e2.state.quarter = 2;
    e2.bossFor(2);
    expect(e2.bossReroll()).toEqual({ cost: BALANCE.run.bossRerollCosts[1] });
    e2.state.round.clockStarted = true;
    expect(e2.bossReroll()).toHaveProperty('blocked');
    // The year-end Rebalancer stays.
    const e3 = await RunEngine.create(src, config('menu-reroll-3', { quarters: 1 }));
    e3.state.cash = 100;
    expect(e3.bossFor(1)).toBe('rebalancer');
    expect(e3.bossReroll()).toHaveProperty('blocked');
    // Too little cash.
    const e4 = await RunEngine.create(src, config('menu-reroll-4'));
    e4.state.cash = 5;
    e4.bossFor(1);
    expect(e4.bossReroll()).toHaveProperty('blocked');
  });
});

describe('clients', () => {
  it('every desk can be offered at least one client, and checks read in plain words', () => {
    for (const d of DESK_ORDER)
      expect(
        CLIENTS.some((c) => clientFitsDesk(c, d)),
        d,
      ).toBe(true);
    const t = CLIENTS.find((c) => c.id === 'treasury7')!;
    const checks = clientChecks(
      t.request,
      {
        structureId: 'bull_put',
        maxLossCents: 20_000,
        pop: 0.75,
        dte: 30,
        credit: true,
        rewardToRisk: 0.5,
        edgeTier: 'none',
      },
      500_000,
    );
    expect(checks.every((c) => c.pass)).toBe(true);
    expect(checks.map((c) => c.label)).toContain('Max loss ≤ $300.00');
    const miss = clientChecks(
      t.request,
      {
        structureId: 'bull_put',
        maxLossCents: 40_000,
        pop: 0.6,
        dte: 30,
        credit: true,
        rewardToRisk: 0.5,
        edgeTier: 'none',
      },
      500_000,
    );
    expect(miss.filter((c) => !c.pass).length).toBe(2);
  });

  it('a filled client pays cash and reputation at round end; a missed one costs reputation', async () => {
    const e = await RunEngine.create(src, config('client-1'));
    e.state.round.client = { id: 'crypto_kyle', status: 'open' };
    // Kyle wants 10 DTE or less: place a monthly, so it stays open.
    await placeOn(e);
    expect(e.state.round.client.status).toBe('open');
    e.state.round.client = { id: 'dr_penny', status: 'open' };
    await placeOn(e, 1);
    const status = e.state.round.client.status;
    // Finish the round.
    let guard = 0;
    while (e.state.phase === 'round' && guard++ < 120) {
      await e.dispatch({ t: 's', a: { t: 'begin' } });
      for (const dp of e.session?.decisions.slice() ?? [])
        await e.dispatch({ t: 's', a: { t: 'decide', dpId: dp.id, action: dp.planned ?? 'hold' } });
      if (e.state.phase === 'round') await e.dispatch({ t: 's', a: { t: 'end' } });
    }
    await e.dispatch({ t: 'finishTally' });
    if (status === 'filled') {
      expect(e.state.reputation).toBe(1);
      expect(e.state.round.payouts.some((p) => p.label.includes('Dr. Penny'))).toBe(true);
    } else expect(e.state.reputation).toBe(-1);
  }, 60_000);
});
