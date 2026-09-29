/**
 * The end-of-day report: every trade's last few weeks of candles with its strikes, what the day did
 * to it, how close price is to the short strike, and the day's news. It stays until the next day
 * starts (Space), so there is always time to read it and decide.
 */

import { AnimatePresence, motion } from 'motion/react';
import type { Bar } from '../../engine/market/types';
import { optionLegsOf } from '../../engine/lifecycle/position';
import type { Position } from '../../engine/lifecycle/types';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { money, pnlClass, pnlText } from '../format';
import { Kbd } from '../components/ui';
import { useTrading, type DayRecap as Recap } from '../store/trading';

/** A small candlestick chart with the trade's strike lines. */
export function MiniCandles({
  bars,
  shorts,
  longs,
  width = 220,
  height = 96,
  ghost,
  tags = false,
}: {
  bars: Bar[];
  shorts: number[];
  longs: number[];
  width?: number;
  height?: number;
  /** Strikes being replaced (a roll's old legs), drawn faint and dashed. */
  ghost?: { shorts: number[]; longs: number[] };
  /** Print each strike at the right edge. */
  tags?: boolean;
}) {
  if (bars.length < 2) return null;
  const ks = [...shorts, ...longs, ...(ghost?.shorts ?? []), ...(ghost?.longs ?? [])];
  const lo = Math.min(...bars.map((b) => b.low), ...ks);
  const hi = Math.max(...bars.map((b) => b.high), ...ks);
  const pad = (hi - lo) * 0.06 || 1;
  const y = (p: number) => height - ((p - (lo - pad)) / (hi - lo + 2 * pad)) * height;
  const step = width / bars.length;
  const bw = Math.max(2, step * 0.6);
  return (
    <svg className="mini-candles" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {ghost?.shorts.map((k) => (
        <line key={`gs${k}`} x1={0} x2={width} y1={y(k)} y2={y(k)} className="mc-ghost-short" />
      ))}
      {ghost?.longs.map((k) => (
        <line key={`gl${k}`} x1={0} x2={width} y1={y(k)} y2={y(k)} className="mc-ghost-long" />
      ))}
      {shorts.map((k) => (
        <line key={`s${k}`} x1={0} x2={width} y1={y(k)} y2={y(k)} className="mc-short" />
      ))}
      {longs.map((k) => (
        <line key={`l${k}`} x1={0} x2={width} y1={y(k)} y2={y(k)} className="mc-long" />
      ))}
      {bars.map((b, i) => {
        const x = i * step + step / 2;
        const up = b.close >= b.open;
        const last = i === bars.length - 1;
        return (
          <g key={b.date} className={`${up ? 'mc-up' : 'mc-down'} ${last ? 'mc-today' : ''}`}>
            <line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} />
            <rect
              x={x - bw / 2}
              y={Math.min(y(b.open), y(b.close))}
              width={bw}
              height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
            />
          </g>
        );
      })}
      {tags &&
        [
          ...shorts.map((k) => ({ k, c: 'mc-tag-s' })),
          ...longs.map((k) => ({ k, c: 'mc-tag-l' })),
          ...(ghost?.shorts ?? []).map((k) => ({ k, c: 'mc-tag-g' })),
        ].map(({ k, c }) => (
          <text key={c + k} x={width - 3} y={y(k) - 3} className={`mc-tag ${c}`} textAnchor="end">
            {k}
          </text>
        ))}
    </svg>
  );
}

/** Credit in hand and what closing now would leave, the way a premium seller reads a spread. */
export function creditView(p: Position, openCents: number) {
  const credit = p.openNet < 0;
  const entryCents = Math.round(Math.abs(p.openNet) * 100 * 100 * p.qty);
  return credit
    ? { credit, label: 'IN HAND', entryCents, keepCents: entryCents + openCents }
    : { credit, label: 'PAID', entryCents, keepCents: entryCents + openCents };
}

const STATUS = (t: number, closed: boolean) =>
  closed
    ? { text: 'CLOSED', cls: 'closed' }
    : t >= 1
      ? { text: 'THROUGH THE SHORT STRIKE', cls: 'bad' }
      : t >= 0.8
        ? { text: 'TESTING THE SHORT STRIKE', cls: 'bad' }
        : t >= 0.5
          ? { text: 'GETTING CLOSE', cls: 'warn' }
          : { text: 'SAFE', cls: 'good' };

function RecapTrade({ t }: { t: Recap['trades'][number] }) {
  const session = useTrading((s) => s.session);
  const closePosition = useTrading((s) => s.closePosition);
  const ff = useTrading((s) => s.ff);
  const p = session?.position(t.positionId);
  if (!session || !p) return null;
  const view = session.view(t.cardId);
  const bars = view.bars().slice(-26);
  const legs = optionLegsOf(p.legs);
  const shorts = legs.filter((l) => l.ratio < 0).map((l) => l.strike);
  const longs = legs.filter((l) => l.ratio > 0).map((l) => l.strike);
  const spot = view.spot();
  const nearest = shorts.length
    ? shorts.reduce((a, k) => (Math.abs(k - spot) < Math.abs(a - spot) ? k : a))
    : null;
  const room = nearest !== null ? Math.abs(spot - nearest) / spot : null;
  const st = STATUS(t.tension, t.closed);
  const today = t.finalCents - t.prevCents;
  const cv = creditView(p, t.finalCents);
  return (
    <div className={`recap-trade ${st.cls}`} data-testid={`recap-${t.positionId}`}>
      <MiniCandles bars={bars} shorts={shorts} longs={longs} />
      <div className="rt-info">
        <div className="rt-head">
          <span className="rt-sym">{p.symbol}</span>
          <span className={`rt-move num ${t.movePct >= 0 ? 'up' : 'down'}`}>
            {t.movePct >= 0 ? '▲' : '▼'} {(Math.abs(t.movePct) * 100).toFixed(1)}% today
          </span>
        </div>
        <div className="rt-struct dim num">
          {STRUCTURES[p.structureId].name} {p.entry.shortStrikes.join('/')}
        </div>
        <div className={`rt-status ${st.cls}`}>
          ● {st.text}
          {room !== null && !t.closed && (
            <span className="num"> · {(room * 100).toFixed(1)}% from the short strike</span>
          )}
        </div>
        {t.closed ? (
          <div className="rt-money num">
            Realized <b className={pnlClass(p.realizedCents ?? 0)}>{pnlText(p.realizedCents ?? 0)}</b>
          </div>
        ) : (
          <div className="rt-money num" data-tip="g:credit_view">
            {cv.label} {money(cv.entryCents)} · if closed now{' '}
            <b className={pnlClass(t.finalCents)}>{pnlText(t.finalCents)}</b>
            <span className="dim">
              {' '}
              ({today >= 0 ? '+' : '−'}
              {money(Math.abs(today))} today, not locked in)
            </span>
          </div>
        )}
        {!t.closed && ff === 'paused' && (
          <button
            className="pixel-btn small danger"
            onClick={() => {
              sfx('stamp');
              void closePosition(p.id);
            }}
          >
            CLOSE {p.symbol}
          </button>
        )}
      </div>
    </div>
  );
}

export function DayRecapPanel() {
  const recap = useTrading((s) => s.recap);
  const session = useTrading((s) => s.session);
  const ff = useTrading((s) => s.ff);
  const toggle = useTrading((s) => s.toggle);
  const dismiss = useTrading((s) => s.dismissRecap);
  const pace = useTrading((s) => s.pace);
  const show = recap && (ff === 'paused' || ff === 'decision');
  return (
    <AnimatePresence>
      {show && recap && (
        <motion.div
          key={recap.id}
          className="day-recap"
          data-testid="day-recap"
          initial={{ y: 40, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <div className="dr-head">
            <span className="dr-title">DAY {recap.day} · CLOSE</span>
            {recap.spyPct !== null && (
              <span className={`num ${recap.spyPct >= 0 ? 'up' : 'down'}`} data-tip="g:brief_market">
                MARKET {recap.spyPct >= 0 ? '▲' : '▼'} {(Math.abs(recap.spyPct) * 100).toFixed(1)}%
              </span>
            )}
            <button className="dr-x" onClick={() => dismiss()} aria-label="Hide the recap">
              ×
            </button>
          </div>
          <div className="dr-trades">
            {recap.trades.map((t) => (
              <RecapTrade key={t.positionId} t={t} />
            ))}
          </div>
          {recap.watch.length > 0 && (
            <div className="dr-watch num" data-testid="recap-watch">
              <span
                className="dr-k"
                data-tip-title="Watchlist"
                data-tip-body="Cards you haven't traded move with the clock. Pick one to trade it today."
              >
                WATCHLIST
              </span>
              {recap.watch.map((w) => (
                <button
                  key={w.cardId}
                  className={`dr-w ${w.movePct >= 0 ? 'up' : 'down'}`}
                  onClick={() => {
                    sfx('select');
                    useTrading.getState().select(w.cardId);
                    dismiss();
                  }}
                >
                  {session?.card(w.cardId).displaySymbol} {w.movePct >= 0 ? '▲' : '▼'}
                  {(Math.abs(w.movePct) * 100).toFixed(1)}%
                </button>
              ))}
            </div>
          )}
          {recap.news.length > 0 && (
            <div className="dr-news">
              {recap.news.map((n, i) => (
                <div key={i} className={`dr-item ${n.tone}`}>
                  {n.tone === 'good' ? '▲' : n.tone === 'bad' ? '▼' : n.tone === 'warn' ? '⚠' : '•'} {n.text}
                </div>
              ))}
            </div>
          )}
          {ff === 'paused' && (
            <div className="dr-actions">
              <button className="pixel-btn primary" onClick={() => toggle()} data-testid="recap-next">
                {pace === 'step' ? 'NEXT DAY' : 'KEEP GOING'} <Kbd>Space</Kbd>
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
