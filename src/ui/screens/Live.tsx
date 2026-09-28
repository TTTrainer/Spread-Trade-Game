import { useEffect, useState } from 'react';
import type { SymbolInfo } from '../../engine/market/types';
import { lastMark } from '../../engine/lifecycle/position';
import { STRUCTURES } from '../../engine/strategies/structures';
import { diffDays } from '../../engine/calendar';
import { sfx } from '../../audio/sfx';
import { Modal, Pnl } from '../components/ui';
import { ipcSource } from '../data/ipcSource';
import { useApp } from '../store/app';
import { useLive } from '../store/live';
import { useTrading } from '../store/trading';
import { TradingLayout, TradingTopBar } from '../trading/TradingScreen';
import './screens.css';
import './modes.css';

export function LiveScreen() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const { session, edge, synthetic, simEnd, busy, open, addTicker, sync, reset } = useLive();
  useTrading((s) => s.version);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void open();
    void ipcSource()
      .symbols()
      .then((x) => setSymbols([...x.filter((s) => !s.isEtf), ...x.filter((s) => s.isEtf)]));
  }, []);

  const positions = session?.positions ?? [];
  const openPos = positions.filter((p) => p.status === 'open');
  const closed = positions.filter((p) => p.status === 'closed');

  return (
    <div className="screen live" data-testid="live-screen">
      <h1 className="screen-title">LIVE</h1>
      <p className="screen-sub">
        Paper spreads on the latest end-of-day chain, real names, no hindsight. Positions update after each
        data sync and score at expiration. Nothing connects to a broker, ever.
      </p>
      <div className="live-grid">
        <div className="panel mode-card">
          <div className="section-title">Market</div>
          <div className="num big-line" data-testid="live-edge">
            {edge ? `AS OF ${edge}` : busy ? 'LOADING…' : '—'}
          </div>
          {synthetic ? (
            <p className="dim">
              SIM market: there is no new data to download, so SYNC moves the simulated calendar forward one
              week (through {simEnd}). Build real data in Settings &gt; Data to trade this week's real market.
            </p>
          ) : (
            <p className="dim">
              Real data. SYNC pulls the newest days from DoltHub, then catches your positions up.
            </p>
          )}
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => void sync()}
              disabled={busy}
              data-testid="live-sync"
            >
              {busy ? 'SYNCING…' : '⟳ SYNC DATA'}
            </button>
            <button
              className="pixel-btn"
              onClick={() => {
                sfx('whoosh');
                go('liveTrading');
              }}
              disabled={!session || !session.cards.length}
              data-testid="live-open-desk"
            >
              OPEN THE DESK ▶
            </button>
            <button className="pixel-btn" onClick={() => setConfirmReset(true)} disabled={busy}>
              RESET LIVE
            </button>
          </div>
          <div className="section-title">Open positions ({openPos.length})</div>
          {openPos.length === 0 ? (
            <p className="dim">None. Pick a ticker to trade at today's close.</p>
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
          <div className="section-title">Trade a ticker at {edge ?? 'the latest close'}</div>
          <div className="symbol-grid">
            {symbols.map((s) => (
              <button
                key={s.symbol}
                className="sym-btn num"
                disabled={!session || busy}
                onClick={async () => {
                  sfx('click');
                  if (await addTicker(s.symbol)) go('liveTrading');
                }}
                data-testid={`live-sym-${s.symbol}`}
              >
                <b>{s.symbol}</b>
                <span className="dim">
                  {s.kind === 'synthetic' ? 'SIM · ' : ''}
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
          <h2>Reset Live?</h2>
          <p>Open paper positions are dropped. Closed trades stay in your Stats. There is no undo.</p>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => {
                setConfirmReset(false);
                void reset();
              }}
            >
              RESET
            </button>
            <button className="pixel-btn" onClick={() => setConfirmReset(false)}>
              KEEP
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
  const recordClosed = useLive((s) => s.recordClosed);
  const version = useTrading((s) => s.version);
  useEffect(() => {
    void recordClosed();
  }, [version]);
  const toLive = () => {
    useTrading.getState().pause();
    go('live');
  };
  return (
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
                <span className="dim">as of {edge} · paper only</span>
              </div>
            </>
          }
        />
      }
      onDone={
        <div className="modal-actions done-actions">
          <button className="pixel-btn primary" onClick={toLive}>
            BACK TO LIVE
          </button>
        </div>
      }
    />
  );
}
