import { useEffect, useRef, useState } from 'react';
import { nearestStrike, quotesFor, stepStrike } from '../../engine/strategies/structures';
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

/**
 * The strike nearest `target` that still leaves room for the spread's far strike `steps` listed
 * strikes away in direction `dir`. Dragging past the listed strikes stops at the last buildable
 * one instead of breaking the trade (which made every line vanish).
 */
function buildable(strikes: number[], target: number, dir: number, steps: number): number | null {
  if (!strikes.length) return null;
  let i = 0;
  for (let k = 1; k < strikes.length; k++)
    if (Math.abs(strikes[k] - target) < Math.abs(strikes[i] - target)) i = k;
  if (dir > 0) i = Math.min(i, strikes.length - 1 - steps);
  if (dir < 0) i = Math.max(i, steps);
  return i >= 0 && i < strikes.length ? strikes[i] : null;
}

function Handle({
  leg,
  kind,
  onPick,
  onWheel,
  readout,
  testId,
  room,
}: {
  leg: OptionLeg;
  kind: 'anchor' | 'far';
  onPick: (strike: number) => void;
  onWheel: (dir: 1 | -1) => void;
  readout: string | null;
  testId: string;
  /** Where the spread's far strike sits from this one: direction and listed steps. */
  room?: { dir: number; steps: number };
}) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const setDragging = useTrading((s) => s.setDragging);
  const [drag, setDrag] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const chain = session && cardId ? session.chain(cardId) : null;
  const raw = chartBridge.priceToY(leg.strike);
  const h = chartBridge.paneHeight();
  if (!chain || raw === null || h <= 0) return null;
  // A strike past the top or bottom of the chart stays grabbable at the edge (with an arrow),
  // so a drag never loses its line; the chart rescales to show it once the drag ends.
  const y = Math.max(12, Math.min(h - 12, raw));
  const edge = raw < 12 ? 'up' : raw > h - 12 ? 'down' : null;
  const pick = (clientY: number) => {
    const top = host.current?.parentElement?.getBoundingClientRect().top ?? 0;
    const p = chartBridge.yToPrice(clientY - top);
    if (p === null) return;
    const strikes = quotesFor(chain, leg.expiration, leg.right)
      .map((q) => q.strike)
      .sort((a, b) => a - b);
    const k = room
      ? buildable(strikes, p, room.dir, room.steps)
      : (nearestStrike(chain, leg.expiration, leg.right, p)?.strike ?? null);
    if (k !== null && Math.abs(k - leg.strike) > 1e-6) {
      sfx('tick', 0.9 + Math.min(0.6, Math.abs(k - chain.spot) / chain.spot / 0.2));
      onPick(k);
    }
  };
  return (
    <div
      ref={host}
      className={`strike-handle num ${drag ? 'drag' : ''} ${leg.ratio < 0 ? 'short' : 'long'} ${kind} ${edge ? 'edge' : ''}`}
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
        setDragging(true);
        sfx('select');
      }}
      onPointerMove={(e) => drag && pick(e.clientY)}
      onPointerUp={() => {
        setDrag(false);
        setDragging(false);
        sfx('click');
      }}
      onPointerCancel={() => {
        setDrag(false);
        setDragging(false);
      }}
      onWheel={(e) => onWheel(e.deltaY < 0 ? 1 : -1)}
    >
      <span className="sh-grip">{edge === 'up' ? '▲' : edge === 'down' ? '▼' : '⇕'}</span>
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
  if (!open || !lead || !chain) return null;
  if (['iron_condor', 'bwb_condor'].includes(builder.structureId)) {
    // A condor has two short strikes to move: the put side and the call side.
    const sp = opts.find((l) => l.ratio < 0 && l.right === 'P');
    const sc = opts.find((l) => l.ratio < 0 && l.right === 'C');
    const pop = plan?.metrics ? `POP ${pct(plan.metrics.pop, 0)}` : null;
    return (
      <>
        {sp && (
          <Handle
            leg={sp}
            kind="anchor"
            testId="strike-handle"
            readout={pop}
            room={{ dir: -1, steps: builder.width }}
            onPick={(k) => (sc && k >= sc.strike ? undefined : setBuilder({ anchor: k, legs: null }))}
            onWheel={(d) => {
              const next = stepStrike(chain, sp.expiration, 'P', sp.strike, d);
              if (next !== null && (!sc || next < sc.strike)) setBuilder({ anchor: next, legs: null });
            }}
          />
        )}
        {sc && (
          <Handle
            leg={sc}
            kind="anchor"
            testId="call-handle"
            room={{ dir: 1, steps: builder.width + (builder.structureId === 'bwb_condor' ? 1 : 0) }}
            readout={
              plan?.mid !== null && plan?.mid !== undefined && plan.mid < 0 ? `+${price(-plan.mid)}` : null
            }
            onPick={(k) => (sp && k <= sp.strike ? undefined : setBuilder({ callAnchor: k, legs: null }))}
            onWheel={(d) => {
              const next = stepStrike(chain, sc.expiration, 'C', sc.strike, d);
              if (next !== null && (!sp || next > sp.strike)) setBuilder({ callAnchor: next, legs: null });
            }}
          />
        )}
      </>
    );
  }
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
        room={far ? { dir: Math.sign(far.strike - lead.strike), steps: builder.width } : undefined}
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
