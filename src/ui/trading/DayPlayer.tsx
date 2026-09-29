/**
 * The day playback on screen: a shared progress clock for the forming candle, live prices and
 * P/L that move with it, the trade card over the chart (P/L, a stop-versus-target meter, CLOSE
 * and ROLL), and the pace controls. The engine has already settled each day; this only replays it.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { lastMark, optionLegsOf } from '../../engine/lifecycle/position';
import type { Position } from '../../engine/lifecycle/types';
import { STRUCTURES } from '../../engine/strategies/structures';
import type { DayPace } from '../../shared/settings';
import { sfx } from '../../audio/sfx';
import { money, pnlClass, pnlText } from '../format';
import { Kbd } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { liveCardId, useTrading, type DayAnim } from '../store/trading';
import { livePl, priceAt } from './dayPath';
import { RollDialog } from './RollDialog';

/** Progress (0..1) of the day being played, redrawn about 30 times a second; null between days. */
export function useDayProgress(): { anim: DayAnim; t: number } | null {
  const anim = useTrading((s) => s.dayAnim);
  const [frame, setFrame] = useState<{ id: number; t: number }>({ id: -1, t: 0 });
  useEffect(() => {
    if (!anim || anim.ms <= 0) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - anim.startedAt) / anim.ms));
      if (now - last > 33 || t >= 1) {
        last = now;
        setFrame({ id: anim.id, t });
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim?.id]);
  if (!anim) return null;
  return { anim, t: anim.ms <= 0 ? 1 : frame.id === anim.id ? frame.t : 0 };
}

/** The card's price as the candle forms (its settled close otherwise). */
export function useLivePrice(cardId: string, settled: number): number {
  const p = useDayProgress();
  const c = p?.anim.cards[cardId];
  return c ? priceAt(c.path, p.t) : settled;
}

/** A position's open P/L as the candle forms (its settled P/L otherwise). */
export function useLivePl(positionId: string, settledCents: number): number {
  const p = useDayProgress();
  const x = p?.anim.positions[positionId];
  const c = x ? p.anim.cards[x.cardId] : undefined;
  return x && c ? livePl(x, priceAt(c.path, p.t), p.t) : settledCents;
}

export function LivePnl({ pos }: { pos: Position }) {
  const settled = pos.status === 'open' ? (lastMark(pos)?.plCents ?? 0) : (pos.realizedCents ?? 0);
  const cents = useLivePl(pos.id, settled);
  return <span className={`pnl num ${pnlClass(cents)}`}>{pnlText(cents)}</span>;
}

// ---------------- the trade card over the chart ----------------

function planCents(p: Position): { stop: number; target: number } {
  const perShare = 100 * p.qty * 100;
  const stop = p.brackets.stopPl !== null ? Math.round(p.brackets.stopPl * perShare) : p.entry.maxLossCents;
  const target =
    p.brackets.targetPl !== null
      ? Math.round(p.brackets.targetPl * perShare)
      : (p.entry.maxProfitCents ?? p.entry.maxLossCents);
  return { stop: Math.max(1, stop), target: Math.max(1, target) };
}

/** Stop on the left, target on the right, today's P/L as the marker. */
function TugMeter({ cents, stop, target }: { cents: number; stop: number; target: number }) {
  const x = cents >= 0 ? 50 + Math.min(1, cents / target) * 50 : 50 - Math.min(1, -cents / stop) * 50;
  const hot = cents <= -stop * 0.8 ? 'near-stop' : cents >= target * 0.8 ? 'near-target' : '';
  return (
    <div className={`tug ${hot}`} data-tip="g:tug_meter">
      <span className="tug-end down num">STOP −{money(stop)}</span>
      <span className="tug-track">
        <span className="tug-half loss" />
        <span className="tug-half gain" />
        <span className="tug-mid" />
        <span className="tug-dot" style={{ left: `${x}%` }} />
      </span>
      <span className="tug-end up num">+{money(target)} TARGET</span>
    </div>
  );
}

function HudRow({
  p,
  selected,
  floats,
}: {
  p: Position;
  selected: boolean;
  floats: { id: number; cents: number; thetaCents: number }[];
}) {
  const session = useTrading((s) => s.session);
  const view = session?.view(p.cardId);
  const settled = p.status === 'open' ? (lastMark(p)?.plCents ?? 0) : (p.realizedCents ?? 0);
  const cents = useLivePl(p.id, settled);
  const spot = useLivePrice(p.cardId, view?.spot() ?? 0);
  const { stop, target } = planCents(p);
  const shorts = optionLegsOf(p.legs).filter((l) => l.ratio < 0);
  const nearest = shorts.length
    ? shorts.reduce((a, l) => (Math.abs(l.strike - spot) < Math.abs(a.strike - spot) ? l : a))
    : null;
  const room =
    nearest && spot > 0
      ? (nearest.right === 'P' ? spot - nearest.strike : nearest.strike - spot) / spot
      : null;
  const dte =
    view && optionLegsOf(p.legs).length
      ? Math.min(...optionLegsOf(p.legs).map((l) => diffDays(view.now, l.expiration)))
      : null;
  const theta = (lastMark(p)?.greeks.theta ?? 0) * p.qty;
  return (
    <div className={`hud-row ${selected ? 'sel' : ''} ${p.status}`} data-testid={`hud-${p.id}`}>
      <div className="hud-head">
        <span className="hud-sym">{p.symbol}</span>
        <span className="hud-struct dim">
          {STRUCTURES[p.structureId].short} {p.entry.shortStrikes.join('/')}
          {p.qty > 1 ? ` ×${p.qty}` : ''}
        </span>
        <span className="hud-inhand num dim" data-tip="g:credit_view">
          {p.openNet < 0 ? 'IN HAND' : 'PAID'} {money(Math.round(Math.abs(p.openNet) * 100 * 100 * p.qty))}
        </span>
        <span className={`hud-pl num ${pnlClass(cents)}`} data-tip="g:credit_view">
          <span className="hud-pl-k">{p.status === 'open' ? 'IF CLOSED' : 'REALIZED'}</span> {pnlText(cents)}
        </span>
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.id}
              className={`hud-float unreal num ${f.cents >= 0 ? 'up' : 'down'}`}
              initial={{ y: 6, opacity: 0, scale: 0.8 }}
              animate={{ y: -18, opacity: [0, 1, 1, 0], scale: 1 }}
              transition={{ duration: 1.6, ease: 'easeOut' }}
            >
              {pnlText(f.cents)}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      {p.status === 'open' ? (
        <>
          <TugMeter cents={cents} stop={stop} target={target} />
          <div className="hud-facts num dim">
            {dte !== null && <span data-tip="g:dte">{dte} DTE</span>}
            <span data-tip="g:pos_theta" className={theta >= 0 ? 'up' : 'down'}>
              Θ {theta >= 0 ? '+' : '−'}${Math.abs(theta).toFixed(0)}/day
            </span>
            {room !== null && (
              <span data-tip="g:to_short" className={room < 0.01 ? 'down' : ''}>
                {room >= 0
                  ? `${(room * 100).toFixed(1)}% to short ${nearest!.strike}`
                  : `${(-room * 100).toFixed(1)}% through short ${nearest!.strike}`}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="hud-facts num">
          <span className={settled >= 0 ? 'up' : 'down'}>CLOSED · {p.exitReason}</span>
        </div>
      )}
    </div>
  );
}

/** The live trade card in the corner of the chart while the clock is running. */
export function PositionHud() {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const ff = useTrading((s) => s.ff);
  const selectedCard = useTrading(liveCardId);
  const floats = useTrading((s) => s.floats);
  const note = useTrading((s) => s.testNote);
  const anim = useTrading((s) => s.dayAnim);
  const closePosition = useTrading((s) => s.closePosition);
  const [rolling, setRolling] = useState<Position | null>(null);
  const recap = useTrading((s) => s.recap);
  // The day recap covers the same ground (and more) while it is up.
  if (!session || ff === 'idle' || ff === 'done' || (recap && (ff === 'paused' || ff === 'decision')))
    return null;
  // Open trades, plus any that closed during the day being played.
  const rows = session.positions.filter((p) => p.status === 'open' || (anim && anim.positions[p.id]));
  if (!rows.length) return null;
  rows.sort((a, b) => Number(b.cardId === selectedCard) - Number(a.cardId === selectedCard));
  const focus =
    rows.find((p) => p.status === 'open' && p.cardId === selectedCard) ??
    rows.find((p) => p.status === 'open');
  const waiting = ff === 'paused';
  return (
    <div className={`pos-hud ${anim && anim.tension >= 0.7 ? 'tense' : ''}`} data-testid="pos-hud">
      {note && waiting && (
        <div className="hud-note" data-testid="test-note">
          ⚠ {note} <Kbd>Space</Kbd> keep going · <Kbd>Alt+F</Kbd> close
        </div>
      )}
      {rows.slice(0, 3).map((p) => (
        <HudRow
          key={p.id}
          p={p}
          selected={p.cardId === selectedCard}
          floats={floats.filter((f) => f.positionId === p.id)}
        />
      ))}
      {waiting && focus && (
        <div className="hud-actions">
          <button
            className="pixel-btn small danger"
            data-testid="hud-close"
            data-tip="g:close_pos"
            onClick={() => {
              sfx('stamp');
              void closePosition(focus.id);
            }}
          >
            CLOSE {focus.symbol} <Kbd>Alt+F</Kbd>
          </button>
          <button className="pixel-btn small" data-tip="g:roll" onClick={() => setRolling(focus)}>
            ROLL
          </button>
        </div>
      )}
      {rolling && <RollDialog pos={rolling} onClose={() => setRolling(null)} />}
    </div>
  );
}

// ---------------- pace ----------------

const PACE_LABEL: Record<DayPace, string> = { step: 'DAY', '1': '1×', '2': '2×', '4': '4×' };
const PACE_ORDER: DayPace[] = ['step', '1', '2', '4'];

export function PaceControls() {
  const pace = useTrading((s) => s.pace);
  const setPace = useTrading((s) => s.setPace);
  const nextDay = useTrading((s) => s.nextDay);
  const ff = useTrading((s) => s.ff);
  const session = useTrading((s) => s.session);
  const busy = useRef(false);
  const shift = (d: number) => setPace(PACE_ORDER[Math.max(0, Math.min(3, PACE_ORDER.indexOf(pace) + d))]);
  useHotkeys({
    nextDay: () => nextDay(),
    slower: () => shift(-1),
    faster: () => shift(1),
  });
  const canNext = (ff === 'paused' || (ff === 'idle' && !!session?.clockStarted)) && !busy.current;
  return (
    <span className="pace num" data-testid="pace">
      <span className="seg" data-tip="g:pace">
        {PACE_ORDER.map((p) => (
          <button
            key={p}
            className={pace === p ? 'sel' : ''}
            onClick={() => setPace(p)}
            data-testid={`pace-${p}`}
          >
            {PACE_LABEL[p]}
            {p === 'step' && <span className="pace-wide"> BY DAY</span>}
          </button>
        ))}
      </span>
      {/* In day-by-day the main button already says NEXT DAY. */}
      {pace !== 'step' && (
        <button
          className="pixel-btn"
          onClick={() => nextDay()}
          disabled={!canNext}
          data-testid="next-day"
          data-tip="g:step_day"
        >
          NEXT DAY <span className="kbd">N</span>
        </button>
      )}
    </span>
  );
}
