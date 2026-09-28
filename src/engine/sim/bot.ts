/**
 * Headless players that drive a RunEngine through the same actions the UI sends. The balance
 * simulator runs them in bulk; tests and the E2E fast path use them to play whole runs.
 */

import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import type { Family } from '../../content/types';
import { diffDays } from '../calendar';
import type { DecisionAction, DecisionPoint, Position } from '../lifecycle/types';
import { streamFor, type Rng } from '../rng';
import type { Bucket } from '../scoring/calls';
import { expirationsOf } from '../strategies/structures';
import type { StructureId } from '../strategies/types';
import { maxContracts, type TradePlan } from '../trading/plan';
import type { OrderSpec, TradingSession } from '../trading/session';
import type { RunEngine } from '../run/engine';
import type { RunAction, RunResult } from '../run/types';

export type BotKind = 'disciplined' | 'hold' | 'random' | 'greedy';

export interface BotOptions {
  kind: BotKind;
  /** Families the bot prefers in the shop. */
  families?: Family[];
  /** Fraction of equity to risk per trade (before the cap). */
  riskPct?: number;
  /** Skip rounds whose lineup looks poor (Month 1 and 2 only). */
  skips?: boolean;
  /** Route actions through something else (the UI store, so saves and the ledger stay current). */
  dispatch?: (a: RunAction) => Promise<unknown>;
}

const send = (engine: RunEngine, o: BotOptions, a: RunAction) =>
  o.dispatch ? o.dispatch(a) : engine.dispatch(a);

interface Pick {
  structureId: StructureId;
  plan: TradePlan;
  expiration: string;
  delta: number;
  width: number;
  bucket: Bucket;
}

function planFor(
  engine: RunEngine,
  cardId: string,
  structureId: StructureId,
  expiration: string,
  delta: number,
  width: number,
  qty: number,
): TradePlan | null {
  try {
    return engine.session?.planFor(cardId, structureId, { expiration, delta, width }, qty) ?? null;
  } catch {
    return null;
  }
}

function chooseTrade(engine: RunEngine, cardId: string, o: BotOptions, rng: Rng): Pick | null {
  const s = engine.session;
  if (!s) return null;
  const chain = s.chain(cardId);
  if (!chain) return null;
  const ctx = s.context(cardId);
  const now = s.view(cardId).now;
  const exps = expirationsOf(chain);
  const desk = DESKS[engine.state.config.deskId];
  const slope = ctx.sma50Slope ?? 0;
  const bullish = o.kind === 'random' ? rng.chance(0.5) : slope >= 0;
  let structureId: StructureId;
  if (o.kind === 'random') structureId = rng.pick(desk.structures);
  else if (desk.id === 'verticals') {
    const ivr = ctx.ivr ?? 50;
    const sell = o.kind !== 'disciplined' || ivr >= 30;
    structureId = sell ? (bullish ? 'bull_put' : 'bear_call') : bullish ? 'bull_call' : 'bear_put';
  } else structureId = desk.structures[0];
  const exp =
    o.kind === 'random'
      ? rng.pick(
          exps.filter((e) => diffDays(now, e) >= 5 && diffDays(now, e) <= 50).length
            ? exps.filter((e) => diffDays(now, e) >= 5 && diffDays(now, e) <= 50)
            : exps,
        )
      : (exps.find((e) => diffDays(now, e) >= 28 && diffDays(now, e) <= 45) ??
        exps.find((e) => diffDays(now, e) >= 14) ??
        exps[exps.length - 1]);
  if (!exp) return null;
  const delta =
    o.kind === 'random' ? rng.pick([0.15, 0.2, 0.3, 0.4, 0.5]) : o.kind === 'greedy' ? 0.35 : 0.25;
  const widths = o.kind === 'random' ? rng.shuffle([1, 2, 5]) : [5, 2.5, 2, 1];
  for (const width of widths) {
    const plan = planFor(engine, cardId, structureId, exp, delta, width, 1);
    if (plan?.ok)
      return { structureId, plan, expiration: exp, delta, width, bucket: (bullish ? 3 : 1) as Bucket };
  }
  return null;
}

function sizeFor(engine: RunEngine, pick: Pick, o: BotOptions, rng: Rng): number {
  const s = engine.session;
  if (!s) return 1;
  const max = maxContracts(pick.plan, s.equityCents(), s.config.riskCapPct, s.reservedCents());
  if (max < 1) return 0;
  if (o.kind === 'greedy') return max;
  if (o.kind === 'random') return rng.int(1, max);
  const want = Math.floor((s.equityCents() * (o.riskPct ?? 0.04)) / Math.max(1, pick.plan.riskCents));
  return Math.max(1, Math.min(max, want));
}

function decide(dp: DecisionPoint, pos: Position | undefined, o: BotOptions, rng: Rng): DecisionAction {
  if (o.kind === 'hold' || o.kind === 'greedy') return dp.options.includes('hold') ? 'hold' : dp.options[0];
  if (o.kind === 'random') return rng.pick(dp.options);
  if (dp.planned) return dp.planned;
  if (dp.kind === 'assigned_shares' && dp.options.includes('sell_shares')) return 'sell_shares';
  if (
    (dp.kind === 'earnings_tomorrow' || dp.kind === 'pin_risk' || dp.kind === 'exdiv_itm_call') &&
    pos &&
    dp.options.includes('close')
  )
    return 'close';
  return 'hold';
}

function order(engine: RunEngine): OrderSpec {
  // Wide Markets disables market orders; a limit at the natural price always fills.
  return engine.session?.config.execution.marketOrdersDisabled ? { type: 'limit' } : { type: 'market' };
}

export async function playRound(engine: RunEngine, o: BotOptions, rng: Rng): Promise<void> {
  const s = engine.session;
  if (!s || engine.state.phase !== 'round') return;
  const r = engine.state.round;
  // Rerolls: swap the lineup once if nothing on it is tradable.
  const tradable = () => s.cards.filter((c) => chooseTrade(engine, c.id, o, rng));
  if (!r.clockStarted && !tradable().length && r.rerollsUsed < r.rerolls)
    await send(engine, o, { t: 'reroll' });
  const session = engine.session;
  if (!session) return;
  if (o.skips && engine.canSkip() && !tradable().length) {
    await send(engine, o, { t: 'skip' });
    return;
  }
  for (const c of session.cards.slice()) {
    if (r.ticketsUsed >= r.tickets || r.clockStarted) break;
    const pick = chooseTrade(engine, c.id, o, rng);
    if (!pick) continue;
    const qty = sizeFor(engine, pick, o, rng);
    if (qty < 1) continue;
    await send(engine, o, {
      t: 's',
      a: {
        t: 'call',
        cardId: c.id,
        bucket: pick.bucket,
        confidence: o.kind === 'random' ? rng.pick([0.5, 0.6, 0.7, 0.8, 0.9]) : 0.6,
      },
    });
    const ord = order(engine);
    const limit = ord.type === 'limit' ? (pick.plan.natural ?? undefined) : undefined;
    await send(engine, o, {
      t: 's',
      a: {
        t: 'place',
        cardId: c.id,
        structureId: pick.structureId,
        params: { expiration: pick.expiration, delta: pick.delta, width: pick.width },
        qty,
        order: { ...ord, limit },
        brackets: o.kind === 'disciplined' ? undefined : null,
        earningsAck: true,
      },
    });
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
      const act = decide(dp, sess.position(dp.positionId), o, rng);
      await send(engine, o, { t: 's', a: { t: 'decide', dpId: dp.id, action: act } });
      if (engine.session !== sess) break;
    }
    if (engine.session !== sess || engine.state.phase !== 'round') break;
    await send(engine, o, { t: 's', a: { t: 'end' } });
  }
}

export async function shopTurn(engine: RunEngine, o: BotOptions): Promise<void> {
  const shop = engine.state.shop;
  if (!shop) return;
  const prefer = new Set(o.families ?? ['DISC', 'THETA', 'EXEC']);
  const order = shop.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.sold);
  const score = ({ it }: { it: (typeof shop.items)[number] }) => {
    if (it.kind === 'cartridge')
      return 10 + (CARTRIDGE_BY_ID[it.id]?.families.some((f) => prefer.has(f)) ? 5 : 0);
    if (it.kind === 'page') return 6;
    if (it.kind === 'voucher') return 4;
    if (it.kind === 'analyst') return 2;
    return 1;
  };
  order.sort((a, b) => score(b) - score(a));
  for (const { it, i } of order) {
    if (it.kind === 'memo') continue;
    if (engine.state.cash - it.price < 2 && it.kind !== 'cartridge') continue;
    if (engine.state.cash >= it.price) await send(engine, o, { t: 'buy', index: i });
  }
  await send(engine, o, { t: 'leaveShop' });
}

/** Play until the run ends. Returns the result, or null if the guard tripped. */
export async function playRun(engine: RunEngine, o: BotOptions, maxSteps = 200): Promise<RunResult | null> {
  const rng = streamFor(engine.state.config.seed, `bot:${o.kind}`);
  for (let i = 0; i < maxSteps && !engine.over; i++) {
    switch (engine.state.phase) {
      case 'round':
        await playRound(engine, o, rng);
        break;
      case 'tally':
        await send(engine, o, { t: 'finishTally' });
        break;
      case 'shop':
        await shopTurn(engine, o);
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
