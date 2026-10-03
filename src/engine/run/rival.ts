/**
 * The Early Retiree's duel: Chad trades the same cards in his own book, in lockstep with yours.
 * His book is a second trading session on the same windows (same real prices, same fill rules),
 * so his P/L is as real as yours; nothing he does touches your book or the market.
 *
 * Chad retired at 34 on lottery tickets: when the clock starts he buys an out-of-the-money bull
 * call spread (long leg about 25 delta) a few weeks out on his first cards, whatever the chart
 * says, one contract each, and holds them to the end with no stop and no target. Time decay works
 * against him most rounds; now and then a rally pays him big. A disciplined seller beats him by
 * banking steady premium and cutting losers.
 */

import { BALANCE } from '../../content/balance';
import { diffDays } from '../calendar';
import { lastMark } from '../lifecycle/position';
import type { MarketDataSource } from '../market/source';
import type { Cents } from '../money';
import { expirationsOf } from '../strategies/structures';
import type { StructureId } from '../strategies/types';
import { TradingSession, type SessionConfig } from '../trading/session';

export interface RivalTrade {
  symbol: string;
  structureId: StructureId;
  open: boolean;
  plCents: Cents;
}

export class Rival {
  private constructor(readonly session: TradingSession) {}

  /** Open Chad's book on these cards and place his trades (before the first day plays). */
  static async start(
    source: MarketDataSource,
    config: SessionConfig,
    cards: { cardId: string; windowId: number; timeSkip: number }[],
  ): Promise<Rival> {
    const s = new TradingSession(source, config);
    for (const c of cards)
      await s.dispatch({
        t: 'addCard',
        cardId: c.cardId,
        windowId: c.windowId,
        timeSkip: c.timeSkip || undefined,
      });
    const rival = new Rival(s);
    await rival.placeTrades();
    return rival;
  }

  private async placeTrades(): Promise<void> {
    const s = this.session;
    const d = BALANCE.duel;
    let placed = 0;
    for (const card of s.cards) {
      if (placed >= d.trades) break;
      const chain = s.chain(card.id);
      if (!chain) continue;
      const structureId: StructureId = 'bull_call';
      const exp = expirationsOf(chain)
        .filter((e) => diffDays(chain.date, e) >= 14)
        .sort(
          (a, b) => Math.abs(diffDays(chain.date, a) - d.dte) - Math.abs(diffDays(chain.date, b) - d.dte),
        )[0];
      if (!exp) continue;
      for (const width of [5, 2.5, 2, 1]) {
        const one = s.planFor(card.id, structureId, { expiration: exp, delta: d.delta, width }, 1);
        if (!one.ok || one.maxLossCents <= 0) continue;
        const capCents = s.equityCents() * s.config.riskCapPct * d.riskShare;
        const qty = Math.max(1, Math.min(d.maxQty, Math.floor(capCents / one.maxLossCents)));
        const plan = s.planFor(card.id, structureId, { expiration: exp, delta: d.delta, width }, qty);
        if (!plan.ok) continue;
        await s.dispatch({ t: 'call', cardId: card.id, bucket: 3, confidence: 0.6 });
        const res = await s.dispatch({
          t: 'place',
          cardId: card.id,
          structureId,
          params: { expiration: exp, delta: d.delta, width },
          qty,
          order: { type: 'market' },
          brackets: null,
          earningsAck: true,
        });
        if (res?.ok) placed++;
        break;
      }
    }
  }

  /** Play one day alongside yours. Chad holds through every decision. */
  async day(): Promise<void> {
    const s = this.session;
    if (s.isDone()) return;
    await s.dispatch({ t: 'begin' });
    for (let guard = 0; guard < 20 && s.decisions.length; guard++) {
      const dp = s.decisions[0];
      const action = dp.options.includes('hold') ? 'hold' : (dp.planned ?? dp.options[0]);
      await s.dispatch({ t: 'decide', dpId: dp.id, action });
    }
    if (s.inDay) await s.dispatch({ t: 'end' });
  }

  /** His P/L: realized, plus open trades at their latest mark. */
  pl(): Cents {
    return this.trades().reduce((a, t) => a + t.plCents, 0);
  }

  trades(): RivalTrade[] {
    return this.session.positions.map((p) => ({
      symbol: p.symbol,
      structureId: p.structureId,
      open: p.status === 'open',
      plCents: p.status === 'open' ? (lastMark(p)?.plCents ?? 0) : (p.realizedCents ?? 0),
    }));
  }
}
