import { useEffect, useRef, useState } from 'react';
import { nearestStrike } from '../../engine/strategies/structures';
import type { OptionLeg } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { pct, price } from '../format';
import { useTrading } from '../store/trading';
import { chartBridge } from './chartBridge';

/**
 * A handle on the chart at the trade's anchor strike (the short strike of a credit spread).
 * Drag it up or down: it snaps to listed strikes, ticks as it moves, and shows the credit and
 * POP of the spread under your finger. The mouse wheel moves it one strike at a time.
 */
export function StrikeHandle() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const nudgeStrike = useTrading((s) => s.nudgeStrike);
  const ff = useTrading((s) => s.ff);
  const plan = useTrading((s) => s.plan)();
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  // Follow the chart as it scrolls and zooms.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);

  const lead = plan?.legs.find((l): l is OptionLeg => l.kind === 'option');
  const chain = session && cardId ? session.chain(cardId) : null;
  if (ff !== 'idle' || !lead || !chain || ['iron_condor', 'bwb_condor'].includes(builder.structureId))
    return null;
  const y = chartBridge.priceToY(lead.strike);
  const h = chartBridge.paneHeight();
  if (y === null || y < 6 || y > h - 6) return null;

  const pick = (clientY: number) => {
    const top = host.current?.parentElement?.getBoundingClientRect().top ?? 0;
    const p = chartBridge.yToPrice(clientY - top);
    if (p === null) return;
    const q = nearestStrike(chain, lead.expiration, lead.right, p);
    if (q && Math.abs(q.strike - lead.strike) > 1e-6) {
      sfx('tick', 0.9 + Math.min(0.6, Math.abs(q.strike - chain.spot) / chain.spot / 0.2));
      setBuilder({ anchor: q.strike, legs: null });
    }
  };
  const credit = plan?.mid !== null && plan?.mid !== undefined ? plan.mid : null;
  return (
    <div
      ref={host}
      className={`strike-handle num ${drag ? 'drag' : ''} ${lead.ratio < 0 ? 'short' : 'long'}`}
      style={{ top: y - 11 }}
      data-testid="strike-handle"
      data-tip-title="Drag your strike"
      data-tip-body="Drag up or down to move the strike (it snaps to listed strikes), or scroll the wheel for one strike at a time. The arrow keys work too."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        sfx('select');
      }}
      onPointerMove={(e) => drag && pick(e.clientY)}
      onPointerUp={() => {
        setDrag(false);
        sfx('click');
      }}
      onWheel={(e) => nudgeStrike(e.deltaY < 0 ? 1 : -1)}
    >
      <span className="sh-grip">⇕</span>
      <span className="sh-k">
        {lead.ratio < 0 ? 'S' : 'L'} {lead.strike}
        {lead.right}
      </span>
      {credit !== null && (
        <span className="sh-read">
          {credit < 0 ? `+${price(-credit)}` : `−${price(credit)}`}
          {plan?.metrics ? ` · POP ${pct(plan.metrics.pop, 0)}` : ''}
        </span>
      )}
    </div>
  );
}
