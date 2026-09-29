/**
 * The option chain, full screen: every listed expiration, calls and puts side by side with bid,
 * ask, IV and all four Greeks. Your legs are marked, the at-the-money row and the expected-move
 * edges are highlighted, and clicking a bid sells there (a credit spread anchored on that strike)
 * while clicking an ask buys there.
 */

import { useEffect, useRef, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import type { OptionQuote } from '../../engine/market/types';
import { expirationsOf, mid, quotesFor } from '../../engine/strategies/structures';
import type { OptionLeg, StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { price } from '../format';
import { Kbd } from '../components/ui';
import { useApp } from '../store/app';
import { tradeOpen, useTrading } from '../store/trading';

const g = (x: number | undefined, d = 2) => (x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));

export function ChainScreen({ onClose }: { onClose: () => void }) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  const builder = useTrading((s) => s.builder);
  const allowed = useTrading((s) => s.allowed);
  const plan = useTrading((s) => s.plan)();
  const [exp, setExp] = useState<string | null>(builder.expiration);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const wrap = useRef<HTMLDivElement>(null);
  // Open centred on the price, where the tradable strikes are.
  useEffect(() => {
    const w = wrap.current;
    const row = w?.querySelector<HTMLElement>('tr.spot-row');
    if (w && row) w.scrollTop = row.offsetTop - w.clientHeight / 2;
  }, [exp]);
  if (!session || !cardId) return null;
  const chain = session.chain(cardId);
  if (!chain) return null;
  const now = session.view(cardId).now;
  const exps = expirationsOf(chain).filter((e) => diffDays(now, e) >= 1);
  const e = exp && exps.includes(exp) ? exp : (exps[0] ?? null);
  if (!e) return null;
  const calls = quotesFor(chain, e, 'C');
  const puts = new Map(quotesFor(chain, e, 'P').map((q) => [q.strike, q] as const));
  const spot = chain.spot;
  const atmK = calls.reduce(
    (b, q) => (Math.abs(q.strike - spot) < Math.abs(b - spot) ? q.strike : b),
    calls[0]?.strike ?? spot,
  );
  const atmC = calls.find((q) => q.strike === atmK);
  const atmP = puts.get(atmK);
  const em = atmC && atmP ? mid(atmC) + mid(atmP) : null;
  const legs = (plan?.legs ?? []).filter((l): l is OptionLeg => l.kind === 'option' && l.expiration === e);
  const legAt = (k: number, right: 'C' | 'P') => legs.find((l) => l.strike === k && l.right === right);
  const can = (id: StructureId) => !allowed || allowed.includes(id);

  const pick = (q: OptionQuote, side: 'sell' | 'buy') => {
    if (!tradeOpen(useTrading.getState())) return;
    const id: StructureId =
      q.right === 'P'
        ? side === 'sell'
          ? 'bull_put'
          : 'bear_put'
        : side === 'sell'
          ? 'bear_call'
          : 'bull_call';
    if (!can(id)) {
      useApp.getState().toast("That structure isn't in your playbook yet.", 'warn');
      sfx('error');
      return;
    }
    const t = useTrading.getState();
    if (t.builder.structureId !== id) t.setStructure(id);
    t.setBuilder({ expiration: e, anchor: q.strike, legs: null });
    sfx('stamp');
    useApp
      .getState()
      .toast(
        `${side === 'sell' ? 'Selling' : 'Buying'} the ${q.strike}${q.right} (${diffDays(now, e)} days).`,
        'good',
      );
  };

  const side = (q: OptionQuote | undefined, right: 'C' | 'P') => {
    if (!q)
      return (
        <td colSpan={7} className="dim">
          —
        </td>
      );
    const cells = [
      <td key="d" className={`cg cd ${right === 'P' ? 'p' : ''}`}>
        <span className="dbar" style={{ width: `${Math.min(1, Math.abs(q.delta)) * 100}%` }} />
        <span className="dv">{g(q.delta)}</span>
      </td>,
      <td key="g" className="cg">
        {g(q.gamma, 3)}
      </td>,
      <td key="t" className="cg">
        {g(q.theta)}
      </td>,
      <td key="v" className="cg">
        {g(q.vega)}
      </td>,
      <td key="iv">{(q.iv * 100).toFixed(1)}</td>,
      <td
        key="b"
        className="cb"
        onClick={() => pick(q, 'sell')}
        data-tip-title="Sell here"
        data-tip-body="A credit spread with this strike as the short leg."
      >
        {price(q.bid)}
      </td>,
      <td
        key="a"
        className="ca"
        onClick={() => pick(q, 'buy')}
        data-tip-title="Buy here"
        data-tip-body="A debit spread with this strike as the long leg."
      >
        {price(q.ask)}
      </td>,
    ];
    // Puts mirror the calls around the strike, with bid still before ask.
    return <>{right === 'C' ? cells : [5, 6, 4, 3, 2, 1, 0].map((i) => cells[i])}</>;
  };

  return (
    <div className="chain-embed" data-testid="chain-screen">
      <div className="chain-head">
        <h2>
          Option chain · {session.card(cardId).displaySymbol}{' '}
          <span className="num dim">{spot.toFixed(2)}</span>
        </h2>
        <span className="dim num">
          {em !== null && `Expected move to this date ±${price(em)} (${((em / spot) * 100).toFixed(1)}%)`}
        </span>
        <button className="pixel-btn" onClick={onClose}>
          ◂ CHART <Kbd>Esc</Kbd>
        </button>
      </div>
      <div className="chain-exps num">
        {exps.map((x) => (
          <button
            key={x}
            className={`exp-chip ${x === e ? 'sel' : ''}`}
            onClick={() => (sfx('click'), setExp(x))}
            data-testid={`chain-exp-${diffDays(now, x)}`}
          >
            {diffDays(now, x)}d{session.config.blind ? '' : ` ${x.slice(5)}`}
          </button>
        ))}
      </div>
      <div className="chain-full-wrap" ref={wrap}>
        <table className="chain-full num">
          <thead>
            <tr>
              <th colSpan={7} className="side-h">
                CALLS
              </th>
              <th />
              <th colSpan={7} className="side-h">
                PUTS
              </th>
            </tr>
            <tr>
              <th data-tip="g:pos_delta">Δ</th>
              <th data-tip="g:gamma">Γ</th>
              <th data-tip="g:pos_theta">Θ</th>
              <th data-tip="g:pos_vega">Vega</th>
              <th data-tip="g:iv">IV</th>
              <th data-tip="g:bid">Bid</th>
              <th data-tip="g:ask">Ask</th>
              <th>Strike</th>
              <th data-tip="g:bid">Bid</th>
              <th data-tip="g:ask">Ask</th>
              <th data-tip="g:iv">IV</th>
              <th data-tip="g:pos_vega">Vega</th>
              <th data-tip="g:pos_theta">Θ</th>
              <th data-tip="g:gamma">Γ</th>
              <th data-tip="g:pos_delta">Δ</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c, i) => {
              const p = puts.get(c.strike);
              const prev = calls[i - 1]?.strike;
              const spotRow =
                prev !== undefined && prev < spot && c.strike >= spot ? (
                  <tr key="spot" className="spot-row">
                    <td colSpan={15}>
                      <span>▶ PRICE NOW {spot.toFixed(2)} ◀</span>
                    </td>
                  </tr>
                ) : null;
              const lc = legAt(c.strike, 'C');
              const lp = legAt(c.strike, 'P');
              const edge =
                em !== null &&
                (Math.abs(c.strike - (spot + em)) < em * 0.15 ||
                  Math.abs(c.strike - (spot - em)) < em * 0.15);
              return [
                spotRow,
                <tr
                  key={c.strike}
                  className={`${c.strike === atmK ? 'atm' : ''} ${edge ? 'em-edge' : ''} ${c.strike < spot ? 'itm-c' : 'itm-p'}`}
                >
                  {side(c, 'C')}
                  <td className="strike">
                    {lc && <i className={lc.ratio < 0 ? 'leg-s' : 'leg-l'}>{lc.ratio < 0 ? 'S' : 'L'}</i>}
                    {c.strike}
                    {lp && <i className={lp.ratio < 0 ? 'leg-s' : 'leg-l'}>{lp.ratio < 0 ? 'S' : 'L'}</i>}
                  </td>
                  {side(p, 'P')}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="dim chain-note">
        Click a bid to sell there (the short strike of a credit spread), an ask to buy. Shaded: in the money.
        Gold rows: about one expected move away.
      </p>
    </div>
  );
}
