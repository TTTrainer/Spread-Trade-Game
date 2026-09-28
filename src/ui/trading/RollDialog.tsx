import { useEffect, useMemo, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { closeQuote, optionLegsOf } from '../../engine/lifecycle/position';
import { expirationsOf, quotesFor, stepStrike, mid } from '../../engine/strategies/structures';
import type { Position } from '../../engine/lifecycle/types';
import type { OptionLeg } from '../../engine/strategies/types';
import { price } from '../format';
import { Modal } from '../components/ui';
import { useTrading } from '../store/trading';

/** Pick a new expiration and strikes; shows the net credit or debit of the roll. */
export function RollDialog({
  pos,
  onClose,
  onRoll,
}: {
  pos: Position;
  onClose: () => void;
  onRoll?: (legs: OptionLeg[]) => void;
}) {
  const session = useTrading((s) => s.session);
  const rollPosition = useTrading((s) => s.rollPosition);
  const [exp, setExp] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const view = session?.view(pos.cardId);
  const [chain, setChain] = useState<Awaited<ReturnType<NonNullable<typeof view>['loadChain']>> | null>(null);
  useEffect(() => {
    if (!view) return;
    // Rolling needs today's full chain, fetched on demand (today is the clock, so it's allowed).
    void view.loadChain().then((c) => {
      setChain(c);
      const current = optionLegsOf(pos.legs)[0]?.expiration;
      setExp(
        expirationsOf(c).find((e) => current && diffDays(current, e) >= 7) ?? expirationsOf(c).at(-1) ?? null,
      );
    });
  }, [view, pos.id]);
  const legs = useMemo(() => {
    if (!chain || !exp) return null;
    const out: OptionLeg[] = [];
    for (const l of optionLegsOf(pos.legs)) {
      const listed = quotesFor(chain, exp, l.right).map((q) => q.strike);
      if (!listed.length) return null;
      let k = listed.reduce(
        (best, x) => (Math.abs(x - l.strike) < Math.abs(best - l.strike) ? x : best),
        listed[0],
      );
      if (shift) k = stepStrike(chain, exp, l.right, k, shift) ?? k;
      out.push({ ...l, expiration: exp, strike: k });
    }
    return out;
  }, [chain, exp, shift]);
  const net = useMemo(() => {
    if (!chain || !legs || !view) return null;
    const find = (l: OptionLeg) =>
      chain.quotes.find(
        (q) => q.expiration === l.expiration && q.right === l.right && Math.abs(q.strike - l.strike) < 1e-6,
      );
    let open = 0;
    for (const l of legs) {
      const q = find(l);
      if (!q) return null;
      open += l.ratio * mid(q);
    }
    const close = closeQuote(
      pos.legs,
      {
        date: view.now,
        spot: view.spot(),
        open: view.spot(),
        rate: view.rate(),
        divYield: 0,
        quote: (k) => view.quote(k),
        earningsTomorrow: false,
        exDivToday: null,
        exDivTomorrow: null,
        gapDay: false,
        atr: null,
      },
      pos.lastLegs,
    ).mid;
    return close + open;
  }, [chain, legs]);
  const exps = chain ? expirationsOf(chain).filter((e) => view && diffDays(view.now, e) >= 1) : [];
  return (
    <Modal onClose={onClose} testId="roll-dialog">
      <h2>Roll {pos.symbol}</h2>
      <div className="section-title">New expiration</div>
      <div className="chip-row">
        {exps.map((e) => (
          <button key={e} className={`exp-chip num ${exp === e ? 'sel' : ''}`} onClick={() => setExp(e)}>
            {view ? diffDays(view.now, e) : 0}d
          </button>
        ))}
      </div>
      <div className="section-title">Move strikes</div>
      <div className="stepper num">
        <button onClick={() => setShift(shift - 1)}>−</button>
        <span>{shift > 0 ? `+${shift}` : shift} strikes</span>
        <button onClick={() => setShift(shift + 1)}>+</button>
      </div>
      <div className="num roll-legs">
        {legs?.map((l, i) => (
          <div key={i}>
            {l.ratio < 0 ? 'SELL' : 'BUY'} {l.strike} {l.right === 'C' ? 'call' : 'put'}{' '}
            {view ? `${diffDays(view.now, l.expiration)}d` : ''}
          </div>
        ))}
        <div className={net !== null && net < 0 ? 'up' : 'down'}>
          {net === null
            ? '—'
            : net < 0
              ? `Net credit ${price(-net)}`
              : `Net debit ${price(net)} (rolling for a debit)`}
        </div>
      </div>
      <div className="modal-actions">
        <button
          className="pixel-btn primary"
          disabled={!legs}
          data-testid="roll-confirm"
          onClick={() => {
            if (!legs) return;
            if (onRoll) onRoll(legs);
            else void rollPosition(pos.id, legs);
            onClose();
          }}
        >
          ROLL
        </button>
        <button className="pixel-btn" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </Modal>
  );
}
