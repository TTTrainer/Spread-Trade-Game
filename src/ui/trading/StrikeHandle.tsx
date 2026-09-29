import { useEffect, useRef, useState } from 'react';
import { nearestStrike, quotesFor } from '../../engine/strategies/structures';
import type { OptionLeg } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { pct, price } from '../format';
import { liveCardId, tradeOpen, useTrading } from '../store/trading';
import { chartBridge } from './chartBridge';

/** Follow the chart as it scrolls and zooms. */
function useChartTick(ms = 150): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function Handle({
  leg,
  kind,
  onPick,
  onWheel,
  readout,
  testId,
}: {
  leg: OptionLeg;
  kind: 'anchor' | 'far';
  onPick: (strike: number) => void;
  onWheel: (dir: 1 | -1) => void;
  readout: string | null;
  testId: string;
}) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const [drag, setDrag] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const chain = session && cardId ? session.chain(cardId) : null;
  const y = chartBridge.priceToY(leg.strike);
  const h = chartBridge.paneHeight();
  if (!chain || y === null || y < 6 || y > h - 6) return null;
  const pick = (clientY: number) => {
    const top = host.current?.parentElement?.getBoundingClientRect().top ?? 0;
    const p = chartBridge.yToPrice(clientY - top);
    if (p === null) return;
    const q = nearestStrike(chain, leg.expiration, leg.right, p);
    if (q && Math.abs(q.strike - leg.strike) > 1e-6) {
      sfx('tick', 0.9 + Math.min(0.6, Math.abs(q.strike - chain.spot) / chain.spot / 0.2));
      onPick(q.strike);
    }
  };
  return (
    <div
      ref={host}
      className={`strike-handle num ${drag ? 'drag' : ''} ${leg.ratio < 0 ? 'short' : 'long'} ${kind}`}
      style={{ top: y - 11 }}
      data-testid={testId}
      data-tip-title={kind === 'anchor' ? 'Drag your strike' : 'Drag the far strike'}
      data-tip-body={
        kind === 'anchor'
          ? 'Drag up or down to move the strike (it snaps to listed strikes), or scroll the wheel. The arrow keys work too.'
          : 'Drag to set how wide the spread is. Wider collects more, and risks more.'
      }
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
      onWheel={(e) => onWheel(e.deltaY < 0 ? 1 : -1)}
    >
      <span className="sh-grip">⇕</span>
      <span className="sh-k">
        {leg.ratio < 0 ? 'S' : 'L'} {leg.strike}
        {leg.right}
      </span>
      {readout && <span className="sh-read">{readout}</span>}
    </div>
  );
}

/**
 * Handles on the chart at the trade's strikes: the anchor (the short strike of a credit spread)
 * and, for spreads, the far strike. Drag them: they snap to listed strikes, tick as they move and
 * show the credit and POP of the spread under your finger.
 */
export function StrikeHandle() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const nudgeStrike = useTrading((s) => s.nudgeStrike);
  const open = useTrading(tradeOpen);
  const plan = useTrading((s) => s.plan)();
  useChartTick();
  const opts = plan?.legs.filter((l): l is OptionLeg => l.kind === 'option') ?? [];
  const lead = opts[0];
  const chain = session && cardId ? session.chain(cardId) : null;
  if (!open || !lead || !chain || ['iron_condor', 'bwb_condor'].includes(builder.structureId)) return null;
  // A two-leg spread on one expiration and one side has a far strike that sets the width.
  const far =
    opts.length === 2 && opts[1].right === lead.right && opts[1].expiration === lead.expiration
      ? opts[1]
      : null;
  const credit = plan?.mid !== null && plan?.mid !== undefined ? plan.mid : null;
  const readout =
    credit !== null
      ? `${credit < 0 ? `+${price(-credit)}` : `−${price(credit)}`}${plan?.metrics ? ` · POP ${pct(plan.metrics.pop, 0)}` : ''}`
      : null;
  const setWidthTo = (strike: number) => {
    if (!far) return;
    const ks = quotesFor(chain, lead.expiration, lead.right).map((q) => q.strike);
    const a = ks.findIndex((k) => Math.abs(k - lead.strike) < 1e-6);
    const b = ks.findIndex((k) => Math.abs(k - strike) < 1e-6);
    const dir = Math.sign(far.strike - lead.strike);
    // The far strike stays on its own side of the anchor.
    if (a < 0 || b < 0 || Math.sign(b - a) !== dir) return;
    setBuilder({ width: Math.max(1, Math.min(12, Math.abs(b - a))), legs: null });
  };
  return (
    <>
      <Handle
        leg={lead}
        kind="anchor"
        testId="strike-handle"
        readout={readout}
        onPick={(k) => setBuilder({ anchor: k, legs: null })}
        onWheel={(d) => nudgeStrike(d)}
      />
      {far && (
        <Handle
          leg={far}
          kind="far"
          testId="far-handle"
          readout={plan?.metrics ? `$${price(plan.metrics.width)} wide` : null}
          onPick={setWidthTo}
          onWheel={(d) =>
            setBuilder({
              width: Math.max(1, Math.min(12, builder.width + d * Math.sign(far.strike - lead.strike))),
              legs: null,
            })
          }
        />
      )}
    </>
  );
}
