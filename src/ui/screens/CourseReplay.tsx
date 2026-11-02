/**
 * The course's replay figure: the open ticker's chart cut at a day about a month back, with its
 * floor (or ceiling) marked. You drag your strike line past it and SELL, then PLAY the month out
 * one real candle at a time: a coin drops for every day no candle touches your line. TRY ANOTHER
 * MONTH steps the cut a month further back. In the coached lesson the strike comes from the trade
 * you built on today's chart, moved to the same distance from that day's price.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Bar } from '../../engine/market/types';
import { strikeIncrement } from '../../engine/pricing/chainModel';
import {
  REPLAY_DAYS,
  pastLevel,
  replayResult,
  replayWindow,
  safeDay,
  snapStrike,
  type ReplaySide,
} from '../../engine/teach/replay';
import { sfx } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';

const W = 360;
const H = 210;
const PAD_R = 58;
const SHOW = 40;

export interface ReplayOutcome {
  safeDays: number;
  touchedOn: number | null;
  endedPast: boolean;
}

export function CourseReplay({
  bars,
  side,
  fixedStrike,
  locked,
  onDone,
}: {
  bars: Bar[];
  side: ReplaySide;
  /** The coached lesson's strike as a fraction of the price (0.92 = 8% under); none: drag it. */
  fixedStrike?: number | null;
  /** Not ready to play yet (the coached checklist isn't done). */
  locked?: boolean;
  onDone: (o: ReplayOutcome) => void;
}) {
  const [months, setMonths] = useState(0);
  const w = useMemo(
    () => replayWindow(bars.slice(0, bars.length - months * REPLAY_DAYS), side),
    [bars, side, months],
  );
  const [strike, setStrike] = useState<number | null>(null);
  const [stage, setStage] = useState<'aim' | 'sold' | 'playing' | 'done'>('aim');
  const [shown, setShown] = useState(0);
  const fig = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // A fresh month: the line starts at the price (the player moves it), or at the coached distance.
  useEffect(() => {
    if (!w) return;
    setStrike(fixedStrike ? snapStrike(w.spot * fixedStrike, w.spot) : snapStrike(w.spot, w.spot));
    setStage(fixedStrike ? 'sold' : 'aim');
    setShown(0);
  }, [w, fixedStrike]);

  const play = w?.play.slice(0, shown) ?? [];
  // The scale follows what has been shown so far, so it never hints at days not yet played.
  const view = useMemo(() => {
    if (!w || strike === null) return null;
    const hist = w.history.slice(-SHOW);
    const seen = [...hist, ...play];
    let lo = Math.min(...seen.map((b) => b.low), strike, w.level?.price ?? Infinity);
    let hi = Math.max(...seen.map((b) => b.high), strike, w.level?.price ?? -Infinity);
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad;
    hi += pad;
    const slots = hist.length + REPLAY_DAYS;
    const cw = (W - PAD_R) / slots;
    const y = (p: number) => H - ((p - lo) / (hi - lo)) * H;
    const price = (py: number) => lo + ((H - py) / H) * (hi - lo);
    return { hist, cw, y, price };
  }, [w, strike, shown]);

  const ok = !!w && strike !== null && (fixedStrike ? true : pastLevel(strike, side, w.level));

  const runPlay = () => {
    if (!w || strike === null || stage === 'playing') return;
    setStage('playing');
    setShown(0);
    sfx('whoosh', 1.1, 0.6);
  };

  // One day every 160 ms, a coin (and a rising chime) for each safe one.
  useEffect(() => {
    if (stage !== 'playing' || !w || strike === null) return;
    if (shown >= w.play.length) {
      const r = replayResult(w.play, strike, side);
      setStage('done');
      if (r.touchedOn === null) {
        sfx('jackpot');
        burstAt(box.current, 'coins', 40);
      } else sfx(r.endedPast ? 'loss' : 'stop', 1, 0.8);
      onDone(r);
      return;
    }
    const id = window.setTimeout(() => {
      const b = w.play[shown];
      if (safeDay(b, strike, side)) sfx('chip', Math.min(2.2, Math.pow(2, shown / 12)), 0.7);
      else sfx('dud', 1, 0.9);
      setShown(shown + 1);
    }, 160);
    return () => window.clearTimeout(id);
  }, [stage, shown]);

  if (!w || !view || strike === null)
    return (
      <div className="cr-empty dim" data-testid="course-replay">
        This ticker needs a few months of history for the replay. Pick another one under ALL.
      </div>
    );

  const { hist, cw, y, price } = view;
  const x = (i: number) => i * cw + cw / 2;
  const entryX = hist.length * cw;
  const setFromPointer = (ev: ReactPointerEvent<SVGSVGElement>) => {
    const r = fig.current?.getBoundingClientRect();
    if (!r || stage !== 'aim') return;
    const py = ((ev.clientY - r.top) / r.height) * H;
    setStrike(snapStrike(price(py), w.spot));
  };
  const nudge = (dir: 1 | -1) => {
    if (stage !== 'aim') return;
    sfx('tick', dir > 0 ? 1.2 : 0.9, 0.6);
    setStrike((s) => (s === null ? s : snapStrike(s + dir * strikeIncrement(w.spot), w.spot)));
  };
  const res = stage === 'done' ? replayResult(w.play, strike, side) : null;
  const safeNow = play.filter((b) => safeDay(b, strike, side)).length;
  const right = side === 'put' ? 'PUT' : 'CALL';
  const lvlWord = side === 'put' ? 'FLOOR' : 'CEILING';

  return (
    <div className={`course-replay stage-${stage}`} ref={box} data-testid="course-replay">
      <svg
        ref={fig}
        viewBox={`0 0 ${W} ${H}`}
        className={`cr-fig ${stage === 'aim' ? 'aim' : ''}`}
        role="img"
        aria-label={`The chart a month back with your ${right.toLowerCase()} strike at ${strike}`}
        onPointerDown={(ev) => {
          dragging.current = true;
          (ev.target as Element).setPointerCapture?.(ev.pointerId);
          setFromPointer(ev);
        }}
        onPointerMove={(ev) => dragging.current && setFromPointer(ev)}
        onPointerUp={() => (dragging.current = false)}
      >
        <rect x={entryX} y={0} width={W - PAD_R - entryX} height={H} className="cr-future" />
        <line x1={entryX} x2={entryX} y1={0} y2={H} className="cr-entry" />
        <text x={entryX + 3} y={11} className="cr-small">
          THE NEXT MONTH
        </text>
        {/* The losing side of the line. */}
        <rect
          x={0}
          width={W - PAD_R}
          y={side === 'put' ? y(strike) : 0}
          height={side === 'put' ? H - y(strike) : y(strike)}
          className="cr-danger"
        />
        {w.level && (
          <g className="cr-level">
            <line x1={0} x2={W - PAD_R} y1={y(w.level.price)} y2={y(w.level.price)} />
            <text x={W - PAD_R + 3} y={y(w.level.price) + 4}>
              {lvlWord}
            </text>
          </g>
        )}
        {[...hist, ...play].map((b, i) => {
          const up = b.close >= b.open;
          const future = i >= hist.length;
          const safe = !future || safeDay(b, strike, side);
          return (
            <g key={b.date} className={`cr-bar ${up ? 'up' : 'down'} ${future && !safe ? 'touch' : ''}`}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} />
              <rect
                x={x(i) - Math.max(1, cw * 0.32)}
                width={Math.max(2, cw * 0.64)}
                y={y(Math.max(b.open, b.close))}
                height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
              />
              {future && safe && (
                <text
                  x={x(i)}
                  y={side === 'put' ? y(b.high) - 4 : y(b.low) + 11}
                  className="cr-coin"
                  textAnchor="middle"
                >
                  $
                </text>
              )}
            </g>
          );
        })}
        <g className={`cr-strike ${ok ? 'ok' : ''}`}>
          <line x1={0} x2={W - PAD_R} y1={y(strike)} y2={y(strike)} />
          <rect x={W - PAD_R + 1} y={y(strike) - 9} width={PAD_R - 2} height={18} />
          <text x={W - PAD_R + 5} y={y(strike) + 4}>
            {strike} {right[0]}
          </text>
        </g>
      </svg>
      <div className="cr-bar-row num">
        <span className="cr-safe" data-testid="course-days-safe">
          DAYS SAFE <b>{safeNow}</b> / {w.play.length}
        </span>
        {stage === 'aim' && (
          <span className="cr-nudge">
            <button className="pixel-btn small" onClick={() => nudge(-1)} aria-label="Lower the strike">
              ▼
            </button>
            <button className="pixel-btn small" onClick={() => nudge(1)} aria-label="Raise the strike">
              ▲
            </button>
          </span>
        )}
      </div>
      <div className="cr-actions">
        {stage === 'aim' && (
          <button
            className={`pixel-btn key k-go ${ok ? 'nudge' : ''}`}
            disabled={!ok}
            onClick={() => (sfx('fill'), setStage('sold'))}
            data-testid="course-sell"
            title={
              ok ? '' : `Drag your line ${side === 'put' ? 'under the floor' : 'over the ceiling'} first.`
            }
          >
            SELL THE {strike} {right}
          </button>
        )}
        {stage === 'sold' && (
          <button
            className={`pixel-btn key k-clock ${locked ? '' : 'nudge'}`}
            disabled={locked}
            onClick={runPlay}
            data-testid="course-play"
            title={locked ? 'Finish the checklist first.' : ''}
          >
            ▶ PLAY THE MONTH
          </button>
        )}
        {stage === 'done' && (
          <button
            className="pixel-btn"
            onClick={() => (
              sfx('deal'),
              setMonths((m) => (bars.length - (m + 2) * REPLAY_DAYS > 80 ? m + 1 : 0))
            )}
            data-testid="course-again"
          >
            ⟳ TRY ANOTHER MONTH
          </button>
        )}
      </div>
      {res && (
        <p
          className={`cr-result ${res.touchedOn === null ? 'win' : res.endedPast ? 'lose' : 'scare'}`}
          data-testid="course-result"
        >
          {res.touchedOn === null
            ? `KEPT IT: ${res.safeDays} of ${w.play.length} days safe. No candle touched your line, so the whole premium is yours.`
            : res.endedPast
              ? side === 'put'
                ? `ENDED UNDER YOUR LINE. You'd buy the shares at ${strike}: that's the deal a put seller signs, so pick a price you'd be glad to pay.`
                : `ENDED OVER YOUR LINE. Your shares would be sold at ${strike}: you keep the premium, but miss the rise past it.`
              : `TOUCHED ON DAY ${res.touchedOn}, THEN RECOVERED. You'd still keep the premium at expiration, but it was close. A line further away sleeps better.`}
        </p>
      )}
    </div>
  );
}
