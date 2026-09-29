import { useEffect, useMemo, useState } from 'react';
import type { SymbolInfo } from '../../engine/market/types';
import { lastMark } from '../../engine/lifecycle/position';
import { STRUCTURES } from '../../engine/strategies/structures';
import { diffDays } from '../../engine/calendar';
import { LIVE_MONTH_DAYS, liveMonthProgress } from '../../engine/trading/liveMonth';
import { sfx } from '../../audio/sfx';
import { Kbd, Modal, Pnl } from '../components/ui';
import { ipcSource } from '../data/ipcSource';
import { pnlText } from '../format';
import { useApp } from '../store/app';
import { liveClock, useLive } from '../store/live';
import { useTrading } from '../store/trading';
import { TradingLayout, TradingTopBar } from '../trading/TradingScreen';
import './screens.css';
import './modes.css';

/** Where the month stands: the day, your P/L and the market's move over the same days. */
function useMonth() {
  const { session, start, days, edge } = useLive();
  useTrading((s) => s.version);
  if (!session || !start || !edge) return null;
  const now = liveClock(session, start) ?? start;
  const prog = liveMonthProgress(days, start, now, edge);
  const startCents = session.config.startEquityCents;
  const plCents = session.markedEquityCents() - startCents;
  const card = session.cards[0];
  const bench = card ? session.view(card.id).benchmarkBars() : [];
  const base = [...bench].reverse().find((b) => b.date <= start);
  const last = bench[bench.length - 1];
  const benchPct = base && last ? last.close / base.close - 1 : null;
  return {
    ...prog,
    now,
    start,
    edge,
    plCents,
    plPct: startCents > 0 ? plCents / startCents : 0,
    benchPct,
    benchSym: session.config.benchmark ?? 'the market',
    started: session.dayIndex > 0 || session.positions.length > 0,
  };
}

const signedPct = (x: number) => `${x >= 0 ? '▲ +' : '▼ −'}${Math.abs(x * 100).toFixed(1)}%`;

export function LiveMonthCard({ compact = false }: { compact?: boolean }) {
  const m = useMonth();
  if (!m) return null;
  const vs = m.benchPct === null ? null : m.plPct - m.benchPct;
  return (
    <div
      className={`live-month ${m.caughtUp ? 'caught' : ''} ${compact ? 'compact' : ''}`}
      data-testid="live-month"
    >
      <div className="lm-head">
        <span className="section-title">This month</span>
        <span className="num dim">
          {m.start} → {m.edge}
        </span>
      </div>
      <div className="lm-day num" data-testid="live-day">
        {m.caughtUp ? '● CAUGHT UP' : `DAY ${m.day} OF ${m.total}`}
      </div>
      <div className="lm-bar" aria-label={`Day ${m.day} of ${m.total}`}>
        <i style={{ width: `${(m.total ? m.day / m.total : 0) * 100}%` }} />
      </div>
      <div className="lm-vs num">
        <span>
          <span className="dim">YOU</span>{' '}
          <span className={m.plCents >= 0 ? 'up-text' : 'down-text'}>{pnlText(m.plCents)}</span>{' '}
          <span className="dim">({signedPct(m.plPct)})</span>
        </span>
        {m.benchPct !== null && (
          <span>
            <span className="dim">{m.benchSym}</span>{' '}
            <span className={m.benchPct >= 0 ? 'up-text' : 'down-text'}>{signedPct(m.benchPct)}</span>
          </span>
        )}
      </div>
      {vs !== null && m.started && (
        <div className={`lm-verdict ${vs >= 0 ? 'ahead' : 'behind'}`} data-testid="live-verdict">
          {vs >= 0 ? '▲ AHEAD OF THE MARKET' : '▼ BEHIND THE MARKET'} by {Math.abs(vs * 100).toFixed(1)} pts
        </div>
      )}
      {!compact && (
        <p className="dim small lm-note">
          {m.caughtUp
            ? `You're at the latest close. Open trades wait here; each new trading day of data plays on from ${m.edge}.`
            : `The goal: finish the month ahead of simply holding ${m.benchSym}. Your P/L counts open trades at today's marks.`}
        </p>
      )}
    </div>
  );
}

/** The four moves, over the chart until the first trade (or until dismissed). */
function HowTo() {
  const session = useLive((s) => s.session);
  useTrading((s) => s.version);
  const [hidden, setHidden] = useState(false);
  if (!session || hidden || session.positions.length > 0) return null;
  return (
    <div className="panel coach live-howto" data-testid="live-howto" role="note">
      <div>
        <div className="coach-step">LIVE · HOW TO TRADE</div>
        <ol className="num">
          <li>
            Pick a card on the left <Kbd>Alt+1–5</Kbd>
          </li>
          <li>
            Your view: <Kbd>4</Kbd> up (a bull put) · <Kbd>2</Kbd> down (a bear call)
          </li>
          <li>
            Sell the spread <Kbd>Alt+S</Kbd> (the SELL button, bottom right)
          </li>
          <li>
            Play a day <Kbd>Space</Kbd>. Watching a few days first is fine.
          </li>
        </ol>
      </div>
      <button className="pixel-btn" onClick={() => setHidden(true)} title="Hide these steps">
        ✕
      </button>
    </div>
  );
}

export function LiveScreen() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const { session, edge, start, synthetic, simEnd, busy, open, addTicker, sync, reset } = useLive();
  useTrading((s) => s.version);
  const month = useMonth();
  const schwab = useApp((s) => s.data?.notes.some((n) => n.includes('Schwab')) ?? false);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void open();
    void ipcSource()
      .symbols()
      .then((x) => setSymbols([...x.filter((s) => !s.isEtf), ...x.filter((s) => s.isEtf)]));
  }, []);

  const positions = session?.positions ?? [];
  const openPos = positions.filter((p) => p.status === 'open');
  const closed = positions.filter((p) => p.status === 'closed');
  const onDesk = new Set(session?.cards.map((c) => c.realSymbol) ?? []);
  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return f ? symbols.filter((s) => s.symbol.includes(f) || s.sector.toUpperCase().includes(f)) : symbols;
  }, [symbols, filter]);
  const openDesk = () => {
    sfx('whoosh');
    go('liveTrading');
  };
  const primary = !month
    ? 'OPEN THE DESK ▶'
    : !month.started
      ? '▶ START THE MONTH'
      : month.caughtUp
        ? '▶ OPEN THE DESK'
        : `▶ CONTINUE · DAY ${month.day}`;

  return (
    <div className="screen live" data-testid="live-screen">
      <h1 className="screen-title">LIVE · THE LAST MONTH</h1>
      <p className="screen-sub">
        The market you trade for real, one recent month at a time: real names, real dates, no hindsight. Paper
        only; nothing connects to a broker account.
      </p>
      <div className="live-grid">
        <div className="panel mode-card">
          <LiveMonthCard />
          {!start && edge && (
            <div className="num big-line" data-testid="live-edge">
              AS OF {edge}
            </div>
          )}
          {busy && !session && <div className="num big-line">LOADING…</div>}
          <div className="modal-actions live-actions">
            <button
              className="pixel-btn primary live-go"
              onClick={openDesk}
              disabled={!session || !session.cards.length}
              data-testid="live-open-desk"
            >
              {primary}
            </button>
            <button
              className="pixel-btn"
              onClick={() => void sync()}
              disabled={busy}
              data-testid="live-sync"
              data-tip-title="Check for new days"
              data-tip-body={
                synthetic
                  ? `The SIM market has no new data to download, so this moves its calendar forward one week (through ${simEnd}).`
                  : 'Pulls the newest trading days from DoltHub (and from Schwab, when connected in Settings › Data), then plays on from where the month stopped.'
              }
            >
              {busy ? 'CHECKING…' : '⟳ CHECK FOR NEW DAYS'}
            </button>
            <button className="pixel-btn" onClick={() => setConfirmReset(true)} disabled={busy}>
              NEW MONTH
            </button>
          </div>
          <p className="dim small">
            {synthetic
              ? 'SIM market (practice data). Build real data in Settings › Data to play the real last month.'
              : `Real data through ${edge ?? '…'}.${schwab ? ' Schwab fills in the newest days.' : ' Connect Schwab in Settings › Data to reach today.'}`}
          </p>
          <div className="section-title">Open trades ({openPos.length})</div>
          {openPos.length === 0 ? (
            <p className="dim">None yet.</p>
          ) : (
            <table className="live-positions num" data-testid="live-positions">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Trade</th>
                  <th>Opened</th>
                  <th>Marked</th>
                  <th>DTE</th>
                  <th>P/L</th>
                </tr>
              </thead>
              <tbody>
                {openPos.map((p) => {
                  const m = lastMark(p);
                  const card = session?.cards.find((c) => c.id === p.cardId);
                  return (
                    <tr key={p.id}>
                      <td>{card?.displaySymbol}</td>
                      <td>
                        {p.qty}× {STRUCTURES[p.structureId].short}
                      </td>
                      <td>{p.openedOn}</td>
                      <td>{m?.date ?? '—'}</td>
                      <td>{m ? Math.max(0, p.entry.dte - diffDays(p.openedOn, m.date)) : '—'}</td>
                      <td>
                        <Pnl cents={m?.plCents ?? 0} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {closed.length > 0 && (
            <>
              <div className="section-title">Closed ({closed.length}) · in Stats under Live</div>
              <table className="live-positions num">
                <tbody>
                  {closed.slice(-8).map((p) => (
                    <tr key={p.id}>
                      <td>{session?.cards.find((c) => c.id === p.cardId)?.displaySymbol}</td>
                      <td>{STRUCTURES[p.structureId].short}</td>
                      <td>
                        {p.openedOn} → {p.closedOn}
                      </td>
                      <td>{p.exitReason}</td>
                      <td>
                        <Pnl cents={p.realizedCents ?? 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="panel mode-card">
          <div className="section-title">How Live works</div>
          <ol className="live-steps">
            <li>
              <b>Start {LIVE_MONTH_DAYS} trading days back</b> with a dealt lineup: the market (
              {month?.benchSym ?? 'SPY'}) and a few real stocks.
            </li>
            <li>
              <b>Trade like any desk.</b> Pick a card, press <Kbd>4</Kbd> for up (a bull put) or <Kbd>2</Kbd>{' '}
              for down (a bear call), then <Kbd>Alt+S</Kbd> to sell it.
            </li>
            <li>
              <b>Play the month.</b> <Kbd>Space</Kbd> plays a day. Any day can start a new trade.
            </li>
            <li>
              <b>Catch up to today.</b> At the latest close the clock waits. Open trades stay open, and each
              new day of data plays on from there, so the month never runs out.
            </li>
          </ol>
          <div className="section-title">Add a ticker to the desk</div>
          <input
            className="live-filter"
            placeholder="Filter by ticker or sector"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="live-filter"
          />
          <div className="symbol-grid live-symbols">
            {shown.map((s) => (
              <button
                key={s.symbol}
                className={`sym-btn num ${onDesk.has(s.symbol) ? 'sel' : ''}`}
                disabled={!session || busy}
                onClick={async () => {
                  sfx('click');
                  if (await addTicker(s.symbol)) go('liveTrading');
                }}
                data-testid={`live-sym-${s.symbol}`}
              >
                <b>{s.symbol}</b>
                <span className="dim">
                  {onDesk.has(s.symbol) ? 'ON THE DESK · ' : s.kind === 'synthetic' ? 'SIM · ' : ''}
                  {s.sector}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="pixel-btn" onClick={back}>
          BACK
        </button>
      </div>
      {confirmReset && (
        <Modal onClose={() => setConfirmReset(false)} testId="live-reset-confirm">
          <h2>Start a new month?</h2>
          <p>
            A fresh lineup, {LIVE_MONTH_DAYS} trading days before the latest close. Open paper trades are
            dropped; closed trades stay in your Stats. There is no undo.
          </p>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => {
                setConfirmReset(false);
                void reset();
              }}
              data-testid="live-reset-go"
            >
              NEW MONTH
            </button>
            <button className="pixel-btn" onClick={() => setConfirmReset(false)}>
              KEEP PLAYING
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function LiveTrading() {
  const go = useApp((s) => s.go);
  const edge = useLive((s) => s.edge);
  const start = useLive((s) => s.start);
  const recordClosed = useLive((s) => s.recordClosed);
  const version = useTrading((s) => s.version);
  const month = useMonth();
  useEffect(() => {
    void recordClosed();
  }, [version]);
  const toLive = () => {
    useTrading.getState().pause();
    go('live');
  };
  return (
    <>
      {start && <HowTo />}
      <TradingLayout
        top={
          <TradingTopBar
            left={
              <>
                <button className="pixel-btn" onClick={toLive} data-testid="live-back">
                  ◀ LIVE
                </button>
                <div className="tb-item">
                  <span className="amber-text">LIVE</span>{' '}
                  {month ? (
                    <span className="num">
                      {month.caughtUp ? (
                        <span className="chip good" data-testid="live-caught-up">
                          CAUGHT UP · {edge}
                        </span>
                      ) : (
                        <span className="dim">
                          day {month.day}/{month.total} · {month.now}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="dim">as of {edge} · paper only</span>
                  )}
                </div>
              </>
            }
          />
        }
        leftPinned={start ? <LiveMonthCard compact /> : undefined}
        onDone={
          <div className="modal-actions done-actions">
            <button className="pixel-btn primary" onClick={toLive}>
              BACK TO LIVE
            </button>
          </div>
        }
      />
    </>
  );
}
