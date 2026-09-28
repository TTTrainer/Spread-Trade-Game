import { useEffect, useMemo, useState } from 'react';
import { quotesFor, stepStrike, mid } from '../../engine/strategies/structures';
import type { Leg, OptionLeg } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { useHotkeys } from '../hotkeys';
import { useTrading } from '../store/trading';
import { chartBridge } from './chartBridge';

/**
 * Strikes for the selected expiration, lined up with the chart's price axis.
 * Click a strike to move the short (anchor) strike there; Shift+click to set the far strike.
 */
export function PriceLadder({ expiration, legs }: { expiration: string | null; legs: Leg[] }) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const ff = useTrading((s) => s.ff);
  const [, setTick] = useState(0);
  const [density, setDensity] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);

  useHotkeys({
    ladderIn: () => setDensity((d) => Math.max(1, Math.floor(d / 2))),
    ladderOut: () => setDensity((d) => Math.min(8, d * 2)),
    ladderReset: () => setDensity(1),
  });

  const chain = session && cardId ? session.chain(cardId) : null;
  const rows = useMemo(() => {
    if (!chain || !expiration) return [];
    const puts = quotesFor(chain, expiration, 'P');
    const calls = new Map(quotesFor(chain, expiration, 'C').map((q) => [q.strike, q] as const));
    return puts.map((p) => ({ strike: p.strike, put: p, call: calls.get(p.strike) ?? null }));
  }, [chain, expiration]);

  if (!chain || !expiration || ff !== 'idle') return null;
  const legAt = (k: number) => legs.filter((l): l is OptionLeg => l.kind === 'option' && Math.abs(l.strike - k) < 1e-6 && l.expiration === expiration);
  const h = chartBridge.paneHeight();
  const visible = rows
    .filter((_, i) => i % density === 0 || legAt(rows[i].strike).length > 0)
    .map((r) => ({ r, y: chartBridge.priceToY(r.strike) }))
    .filter((x): x is { r: (typeof rows)[number]; y: number } => x.y !== null && x.y > 8 && x.y < h - 8);

  const onPick = (strike: number, shift: boolean) => {
    sfx('click');
    const anchor = builder.anchor ?? legs.find((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0)?.strike ?? null;
    if (shift && anchor !== null) {
      const right = builder.structureId === 'bear_call' || builder.structureId === 'bull_call' ? 'C' : 'P';
      for (let steps = 1; steps <= 20; steps++) {
        const up = stepStrike(chain, expiration, right, anchor, steps);
        const dn = stepStrike(chain, expiration, right, anchor, -steps);
        if ((up !== null && Math.abs(up - strike) < 1e-6) || (dn !== null && Math.abs(dn - strike) < 1e-6)) {
          setBuilder({ width: steps, legs: null });
          return;
        }
      }
      return;
    }
    setBuilder({ anchor: strike, legs: null });
  };

  return (
    <div className="ladder" data-testid="price-ladder">
      <div className="ladder-head num">
        <span>PUT</span>
        <span>STRIKE</span>
        <span>CALL</span>
      </div>
      {visible.map(({ r, y }) => {
        const here = legAt(r.strike);
        const atm = Math.abs(r.strike - chain.spot) === Math.min(...rows.map((x) => Math.abs(x.strike - chain.spot)));
        return (
          <button
            key={r.strike}
            className={`ladder-row num ${atm ? 'atm' : ''} ${here.length ? 'has-leg' : ''}`}
            style={{ top: y - 9 }}
            onClick={(e) => onPick(r.strike, e.shiftKey)}
            title={`Put ${r.put.bid.toFixed(2)} x ${r.put.ask.toFixed(2)}  IV ${(r.put.iv * 100).toFixed(1)}%  Δ ${r.put.delta.toFixed(2)}\nCall ${r.call ? `${r.call.bid.toFixed(2)} x ${r.call.ask.toFixed(2)}  Δ ${r.call.delta.toFixed(2)}` : '—'}`}
          >
            <span className="lp">
              {here
                .filter((l) => l.right === 'P')
                .map((l, i) => (
                  <i key={i} className={l.ratio < 0 ? 'leg-s' : 'leg-l'}>
                    {l.ratio < 0 ? 'S' : 'L'}
                  </i>
                ))}
              {mid(r.put).toFixed(2)}
            </span>
            <span className="lk">{r.strike % 1 === 0 ? r.strike.toFixed(0) : r.strike.toFixed(1)}</span>
            <span className="lc">
              {r.call ? mid(r.call).toFixed(2) : '—'}
              {here
                .filter((l) => l.right === 'C')
                .map((l, i) => (
                  <i key={i} className={l.ratio < 0 ? 'leg-s' : 'leg-l'}>
                    {l.ratio < 0 ? 'S' : 'L'}
                  </i>
                ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
