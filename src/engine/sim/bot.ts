/**
 * Headless players that drive a RunEngine through the same actions the UI sends. The balance
 * simulator runs them in bulk; tests and the E2E fast path use them to play whole runs.
 *
 * The four policies from the design (section 17):
 *  - disciplined: 20-30 delta credit spreads outside the expected move, only when IV rank is 30+,
 *    with the trend, closed at 50% of max profit or at a 2x stop; skips rounds with no setup;
 *    buys DISCIPLINE, THETA and EXECUTION cartridges.
 *  - hold: the same entries, no management at all (no brackets, holds every decision).
 *  - random: random structures, strikes, sizes, decisions and purchases.
 *  - greedy: always trades, maximum size, ignores stops.
 */

import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import { BALANCE } from '../../content/balance';

const BALANCE_RISK = BALANCE.risk.plannedRiskPct;
import type { Family } from '../../content/types';
import { diffDays } from '../calendar';
import type { DecisionAction, DecisionPoint } from '../lifecycle/types';
import { streamFor, type Rng } from '../rng';
import type { Bucket } from '../scoring/calls';
import { expirationsOf, STRUCTURES } from '../strategies/structures';
import type { BuildParams, StructureId } from '../strategies/types';
import { maxContracts, maxQtyFor, type TradePlan } from '../trading/plan';
import type { OrderSpec, TradingSession } from '../trading/session';
import type { RunEngine } from '../run/engine';
import type { RunAction, RunResult } from '../run/types';

export type BotKind = 'disciplined' | 'hold' | 'random' | 'greedy';

export interface BotOptions {
  kind: BotKind;
  /** How the bot shops: its preferred families (default), random purchases, or nothing. */
  shop?: 'families' | 'random' | 'none';
  /** Families the bot prefers in the shop. */
  families?: Family[];
  /** Fraction of equity to risk per trade (before the cap). */
  riskPct?: number;
  /** Route actions through something else (the UI store, so saves and the ledger stay current). */
  dispatch?: (a: RunAction) => Promise<unknown>;
}

const send = (engine: RunEngine, o: BotOptions, a: RunAction) =>
  o.dispatch ? o.dispatch(a) : engine.dispatch(a);

interface Pick {
  structureId: StructureId;
  plan: TradePlan;
  params: BuildParams;
  bucket: Bucket;
  confidence: number;
}

function planFor(
  engine: RunEngine,
  cardId: string,
  structureId: StructureId,
  params: BuildParams,
  qty: number,
): TradePlan | null {
  try {
    return engine.session?.planFor(cardId, structureId, params, qty) ?? null;
  } catch {
    return null;
  }
}

/** Short strikes beyond one expected move from spot (the disciplined seller's rule). */
function outsideEm(plan: TradePlan): boolean {
  const e = plan.entry;
  if (!e || e.expectedMove === null) return true;
  const em = e.expectedMove;
  for (const l of plan.legs) {
    if (l.kind !== 'option' || l.ratio >= 0) continue;
    if (l.right === 'P' && l.strike > e.spot - em + 1e-9) return false;
    if (l.right === 'C' && l.strike < e.spot + em - 1e-9) return false;
  }
  return true;
}

interface Setup {
  structureId: StructureId;
  bucket: Bucket;
  deltas: number[];
  /** A disciplined player only takes this setup when it passes. */
  qualifies: boolean;
}

/** What each desk's player reaches for on this card. */
function setupFor(engine: RunEngine, cardId: string, o: BotOptions, rng: Rng): Setup {
  const s = engine.session as TradingSession;
  const desk = DESKS[engine.state.config.deskId];
  const ctx = s.context(cardId);
  const ivr = ctx.ivr ?? 50;
  const slope = ctx.sma50Slope ?? 0;
  const bullish = slope >= 0;
  if (o.kind === 'random')
    return {
      structureId: rng.pick(desk.structures),
      bucket: rng.int(0, 4) as Bucket,
      deltas: [rng.pick([0.15, 0.2, 0.3, 0.4, 0.5])],
      qualifies: true,
    };
  const earnings = !!ctx.nextEarnings && diffDays(s.view(cardId).now, ctx.nextEarnings.reactionDate) <= 35;
  const greedy = o.kind === 'greedy';
  switch (desk.id) {
    case 'verticals':
      return {
        structureId: bullish ? 'bull_put' : 'bear_call',
        bucket: bullish ? 3 : 1,
        deltas: greedy ? [0.35] : [0.25, 0.2, 0.16],
        qualifies: ivr >= 30,
      };
    case 'income':
      return {
        structureId: 'cash_secured_put',
        bucket: 3,
        deltas: greedy ? [0.4] : bullish ? [0.25, 0.2] : [0.15, 0.12],
        qualifies: ivr >= 25,
      };
    case 'condor':
      return {
        structureId: 'iron_condor',
        bucket: 2,
        deltas: greedy ? [0.3] : [0.2, 0.16, 0.12],
        qualifies: ivr >= 30,
      };
    case 'volatility':
      return {
        structureId: earnings ? 'long_straddle' : 'long_strangle',
        bucket: bullish ? 4 : 0,
        deltas: [0.5, 0.3],
        qualifies: process.env.VOLMODE === 'earn' ? earnings : earnings || ivr <= 25,
      };
    case 'calendar':
      return {
        structureId: Math.abs(slope) < 0.1 ? 'calendar' : 'diagonal',
        bucket: Math.abs(slope) < 0.1 ? 2 : bullish ? 3 : 1,
        deltas: [0.5, 0.3],
        qualifies: ivr <= 50 && !earnings,
      };
  }
}

function chooseTrade(
  engine: RunEngine,
  cardId: string,
  o: BotOptions,
  rng: Rng,
  relax: boolean,
): Pick | null {
  const s = engine.session;
  if (!s) return null;
  const chain = s.chain(cardId);
  if (!chain) return null;
  const setup = setupFor(engine, cardId, o, rng);
  const picky = o.kind === 'disciplined' || o.kind === 'hold';
  if (picky && !setup.qualifies && !relax) return null;
  const now = s.view(cardId).now;
  const exps = expirationsOf(chain);
  const inRange = exps.filter((e) => diffDays(now, e) >= 5 && diffDays(now, e) <= 50);
  const def = STRUCTURES[setup.structureId];
  // Careful sellers finish before the next earnings report: pick the latest expiration before it.
  const ern = s.context(cardId).nextEarnings?.reactionDate ?? null;
  const beforeEarnings = (e: string) => !(picky && def.credit && ern && ern <= e);
  const afterEarnings = !def.credit && ern ? exps.find((e) => e > ern && diffDays(now, e) >= 7) : undefined;
  const exp =
    afterEarnings && o.kind !== 'random' && process.env.VOLMODE === 'earn'
      ? afterEarnings
      : o.kind === 'random'
        ? rng.pick(inRange.length ? inRange : exps)
        : (exps.find((e) => diffDays(now, e) >= 28 && diffDays(now, e) <= 45 && beforeEarnings(e)) ??
          [...exps]
            .reverse()
            .find((e) => diffDays(now, e) >= 7 && diffDays(now, e) < 28 && beforeEarnings(e)) ??
          (picky && def.credit && !relax
            ? undefined
            : (exps.find((e) => diffDays(now, e) >= 14) ?? exps[exps.length - 1])));
  if (!exp) return null;
  const back = def.twoExpiries ? exps.find((e) => diffDays(exp, e) >= 21) : undefined;
  if (def.twoExpiries && !back) return null;
  const widths =
    o.kind === 'random' ? rng.shuffle([1, 2, 3, 5]) : def.defaults.width === 0 ? [0] : [1, 2, 3, 4, 6];
  let fallback: Pick | null = null;
  let best: { pick: Pick; score: number } | null = null;
  for (const delta of setup.deltas) {
    for (const width of widths) {
      const params: BuildParams = {
        expiration: exp,
        backExpiration: back,
        delta,
        width,
        skip: def.defaults.skip,
      };
      const plan = planFor(engine, cardId, setup.structureId, params, 1);
      if (!plan?.ok) continue;
      const pick: Pick = {
        structureId: setup.structureId,
        plan,
        params,
        bucket: setup.bucket,
        confidence: o.kind === 'random' ? rng.pick([0.5, 0.6, 0.7, 0.8, 0.9]) : 0.6,
      };
      if (!picky) return pick;
      if (def.credit && !outsideEm(plan)) {
        fallback ??= pick;
        continue;
      }
      // Credit left after half the bid/ask, per dollar of max loss: what a careful seller compares.
      const mid = plan.mid ?? 0;
      const cost = Math.abs((plan.natural ?? mid) - mid) * 0.5;
      const w = plan.metrics?.width ?? 1;
      const score = def.credit ? (-mid - cost) / Math.max(0.01, w + mid) : -(mid + cost);
      if (!best || score > best.score) best = { pick, score };
    }
    if (best) return best.pick;
  }
  return relax ? fallback : null;
}

function sizeFor(engine: RunEngine, pick: Pick, o: BotOptions, rng: Rng): number {
  const s = engine.session;
  if (!s) return 1;
  const max = Math.min(
    maxQtyFor(pick.plan.structureId),
    maxContracts(pick.plan, s.equityCents(), s.config.riskCapPct, s.reservedCents()),
  );
  if (max < 1) return 0;
  if (o.kind === 'greedy') return max;
  if (o.kind === 'random') return rng.int(1, max);
  // Spread the same total risk budget over however many tickets the desk gets.
  const perTicket =
    (o.riskPct ?? BALANCE_RISK) * (BALANCE.run.ticketsPerRound / Math.max(1, engine.state.round.tickets));
  const budget = s.equityCents() * perTicket;
  // A careful player passes when even one contract is well over budget.
  if (pick.plan.riskCents > budget * 1.6) return 0;
  const want = Math.floor(budget / Math.max(1, pick.plan.riskCents));
  return Math.max(1, Math.min(max, want));
}

function decide(dp: DecisionPoint, o: BotOptions, rng: Rng, longPremium = false): DecisionAction {
  const pick = (a: DecisionAction) => (dp.options.includes(a) ? a : dp.options[0]);
  if (o.kind === 'random') return rng.pick(dp.options);
  if (o.kind === 'hold' || o.kind === 'greedy') return pick('hold');
  if (dp.planned) return dp.planned;
  switch (dp.kind) {
    case 'assigned_shares':
      return pick('sell_shares');
    case 'earnings_tomorrow':
      // Premium sellers step aside before a report; premium buyers are there for it.
      return longPremium ? pick('hold') : pick('close');
    case 'pin_risk':
    case 'exdiv_itm_call':
      return pick('close');
    default:
      return pick('hold');
  }
}

function order(engine: RunEngine, pick: Pick): OrderSpec {
  // Bots take the natural price: a resting limit only fills when the market moves against it.
  // Wide Markets disables market orders; a limit at the natural price always fills.
  return engine.session?.config.execution.marketOrdersDisabled
    ? { type: 'limit', limit: pick.plan.natural ?? undefined }
    : { type: 'market' };
}

export async function playRound(engine: RunEngine, o: BotOptions, rng: Rng): Promise<void> {
  const s = engine.session;
  if (!s || engine.state.phase !== 'round') return;
  const r = engine.state.round;
  const cards = () => engine.session?.cards ?? [];
  const untraded = () => cards().filter((c) => !c.positionIds.length && !c.orderIds.length);
  const tradable = () => untraded().filter((c) => chooseTrade(engine, c.id, o, rng, false));
  const place = async (cardId: string, relax: boolean): Promise<boolean> => {
    const pick = chooseTrade(engine, cardId, o, rng, relax);
    if (!pick) return false;
    const qty = sizeFor(engine, pick, o, rng);
    if (qty < 1) return false;
    await send(engine, o, {
      t: 's',
      a: { t: 'call', cardId, bucket: pick.bucket, confidence: pick.confidence },
    });
    const res = await send(engine, o, {
      t: 's',
      a: {
        t: 'place',
        cardId,
        structureId: pick.structureId,
        params: pick.params,
        qty,
        order: order(engine, pick),
        brackets: o.kind === 'disciplined' ? undefined : null,
        earningsAck: true,
      },
    });
    return !!(res as { ok?: boolean } | null)?.ok;
  };
  if (!r.clockStarted) {
    if ((o.kind === 'disciplined' || o.kind === 'hold') && engine.canSkip()) {
      // Skip only when neither the lineup nor its rerolls offer a single setup.
      for (let k = 0; !tradable().length && r.rerollsUsed < r.rerolls && k < 3; k++)
        await send(engine, o, { t: 'reroll' });
      if (!tradable().length) {
        await send(engine, o, { t: 'skip' });
        return;
      }
    }
    // Trade what qualifies, then reroll the rest looking for more setups.
    for (let pass = 0; pass < 4 && r.ticketsUsed < r.tickets; pass++) {
      for (const c of untraded()) {
        if (r.ticketsUsed >= r.tickets) break;
        await place(c.id, false);
      }
      if (
        r.ticketsUsed >= r.tickets ||
        r.rerollsUsed >= r.rerolls ||
        o.kind === 'random' ||
        o.kind === 'greedy'
      )
        break;
      if (!untraded().length) break;
      await send(engine, o, { t: 'reroll' });
    }
    // Reviews can't be skipped: with nothing traded, take the best available trade anyway.
    if (!engine.session?.positions.length)
      for (const c of untraded()) if (r.ticketsUsed < r.tickets && (await place(c.id, true))) break;
  }
  if (!engine.session || engine.state.phase !== 'round') return;
  if (!engine.session.positions.length && !engine.session.orders.length) {
    await send(engine, o, engine.canSkip() ? { t: 'skip' } : { t: 'endRound' });
    return;
  }
  let guard = 0;
  while (engine.state.phase === 'round' && engine.session && guard++ < 400) {
    const sess: TradingSession = engine.session;
    await send(engine, o, { t: 's', a: { t: 'begin' } });
    if (engine.session !== sess || engine.state.phase !== 'round') break;
    for (const dp of sess.decisions.slice()) {
      const pos = sess.position(dp.positionId);
      const longPremium = !!pos && !STRUCTURES[pos.structureId].credit;
      await send(engine, o, {
        t: 's',
        a: { t: 'decide', dpId: dp.id, action: decide(dp, o, rng, longPremium) },
      });
      if (engine.session !== sess) break;
    }
    if (engine.session !== sess || engine.state.phase !== 'round') break;
    await send(engine, o, { t: 's', a: { t: 'end' } });
  }
}

const USEFUL_VOUCHERS = new Set([
  'risk_committee',
  'dma',
  'margin_upgrade',
  'prime_broker',
  'clearance',
  'seed_capital',
]);

export async function shopTurn(
  engine: RunEngine,
  o: BotOptions,
  rng: Rng = streamFor(engine.state.config.seed, 'shop-bot'),
): Promise<void> {
  const shop = engine.state.shop;
  if (!shop) return;
  const mode = o.shop ?? (o.kind === 'random' ? 'random' : 'families');
  if (mode !== 'none') {
    const prefer = new Set<Family>(o.families ?? ['DISC', 'THETA', 'EXEC']);
    const deskStructures = new Set<StructureId>(DESKS[engine.state.config.deskId].structures);
    const items = shop.items.map((it, i) => ({ it, i, roll: rng.next() })).filter(({ it }) => !it.sold);
    const score = ({ it, roll }: (typeof items)[number]): number => {
      if (mode === 'random') return it.kind === 'cartridge' ? 10 + roll : roll * 5;
      switch (it.kind) {
        case 'cartridge':
          return CARTRIDGE_BY_ID[it.id]?.families.some((f) => prefer.has(f)) ? 12 : 3;
        case 'page':
          return deskStructures.has(it.id) ? 7 : 0;
        case 'voucher':
          return USEFUL_VOUCHERS.has(it.id) ? 6 : 1;
        case 'memo':
          return it.id === 'vacation' && engine.state.stress >= 60 ? 8 : it.id === 'extra_ticket' ? 4 : 0;
        case 'analyst':
          return 1;
      }
    };
    items.sort((a, b) => score(b) - score(a));
    for (const x of items) {
      if (score(x) < 2) continue;
      if (engine.state.cash >= x.it.price) await send(engine, o, { t: 'buy', index: x.i });
    }
  }
  await send(engine, o, { t: 'leaveShop' });
}

/** Play until the run ends. Returns the result, or null if the guard tripped. */
export async function playRun(engine: RunEngine, o: BotOptions, maxSteps = 400): Promise<RunResult | null> {
  const rng = streamFor(engine.state.config.seed, `bot:${o.kind}`);
  for (let i = 0; i < maxSteps && !engine.over; i++) {
    switch (engine.state.phase) {
      case 'round':
        // Memos when they help: Vacation Day when stressed, Extra Ticket before the clock.
        for (const m of engine.state.memos.slice())
          if (
            (m === 'vacation' && engine.state.stress >= 60) ||
            (m === 'extra_ticket' && !engine.state.round.clockStarted)
          )
            await send(engine, o, { t: 'memo', id: m });
        await playRound(engine, o, rng);
        break;
      case 'tally':
        await send(engine, o, { t: 'finishTally' });
        break;
      case 'shop':
        await shopTurn(engine, o, rng);
        break;
      case 'review_intro':
        await send(engine, o, { t: 'startReview' });
        break;
      default:
        break;
    }
  }
  return engine.state.result;
}
