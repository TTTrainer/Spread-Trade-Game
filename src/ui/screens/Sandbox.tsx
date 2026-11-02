import { useEffect, useMemo, useState } from 'react';
import { PlanSetup } from '../components/PlanSetup';
import type { SymbolInfo, WindowDef } from '../../engine/market/types';
import { defaultSessionConfig, TradingSession } from '../../engine/trading/session';
import { sfx } from '../../audio/sfx';
import { ipcSource } from '../data/ipcSource';
import { useApp } from '../store/app';
import { useTrading } from '../store/trading';
import { TradingLayout, TradingTopBar } from '../trading/TradingScreen';
import './screens.css';

interface Pick {
  symbol: string;
  window: WindowDef | null;
}

export function SandboxSetup() {
  const go = useApp((s) => s.go);
  const settings = useApp((s) => s.settings);
  const toast = useApp((s) => s.toast);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [picks, setPicks] = useState<Pick[]>([{ symbol: '', window: null }]);
  const [active, setActive] = useState(0);
  const [windows, setWindows] = useState<WindowDef[]>([]);
  const [filter, setFilter] = useState<'all' | 'earnings' | 'gaps' | 'highiv'>('all');
  const [idx, setIdx] = useState(0);
  const [capital, setCapital] = useState(settings.game.startingCapitalCents / 100);
  const [busy, setBusy] = useState(false);
  const src = useMemo(() => ipcSource(), []);

  useEffect(() => {
    void src.symbols().then((s) => {
      setSymbols(s);
      if (s.length && !picks[0].symbol)
        setPicks([{ symbol: s.find((x) => !x.isEtf)?.symbol ?? s[0].symbol, window: null }]);
    });
  }, []);

  const sym = picks[active]?.symbol;
  useEffect(() => {
    if (!sym) return;
    void src.windows({ symbols: [sym] }).then((w) => {
      setWindows(w);
      setIdx(Math.max(0, w.length - 1));
    });
  }, [sym]);

  const filtered = useMemo(() => {
    if (filter === 'earnings') return windows.filter((w) => w.tags.hasEarnings);
    if (filter === 'gaps') return windows.filter((w) => w.tags.maxGapAtr > 2);
    if (filter === 'highiv') return windows.filter((w) => w.tags.ivr >= 60);
    return windows;
  }, [windows, filter]);
  const chosen = filtered[Math.min(idx, filtered.length - 1)] ?? null;

  useEffect(() => {
    setPicks((p) => p.map((x, i) => (i === active ? { ...x, window: chosen } : x)));
  }, [chosen?.id, active]);

  const start = async () => {
    const ready = picks.filter((p) => p.window);
    if (!ready.length) return;
    setBusy(true);
    try {
      const meta = await src.meta();
      const session = new TradingSession(
        src,
        defaultSessionConfig({
          seed: `sandbox-${Date.now()}`,
          mode: 'sandbox',
          startEquityCents: Math.round(capital * 100),
          realism: { ...settings.realism },
          pause: { ...settings.game.pause },
          trustEarningsAck: true,
          benchmark: meta.benchmark,
          callMode: settings.game.bucketMode,
          blind: false,
        }),
      );
      for (let i = 0; i < ready.length; i++)
        await session.dispatch({
          t: 'addCard',
          cardId: `c${i + 1}`,
          windowId: (ready[i].window as WindowDef).id,
        });
      useTrading.getState().init(session, { recordMode: 'sandbox' });
      sfx('whoosh');
      go('trading');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'warn');
    } finally {
      setBusy(false);
    }
  };

  const info = symbols.find((s) => s.symbol === sym);
  return (
    <div className="screen sandbox-setup" data-testid="sandbox-setup">
      <h1 className="screen-title">SANDBOX</h1>
      <p className="screen-sub">
        Open mode: any ticker, any date, every tool, no score. Study the events that made or broke traders.
      </p>
      <div className="setup-grid">
        <div className="panel setup-col">
          <div className="section-title">Tickers ({picks.length}/3)</div>
          <div className="pick-tabs">
            {picks.map((p, i) => (
              <button
                key={i}
                className={`pixel-btn ${i === active ? 'primary' : ''}`}
                onClick={() => setActive(i)}
              >
                {p.symbol || '—'} {p.window ? p.window.entryDate : ''}
              </button>
            ))}
            {picks.length < 3 && (
              <button
                className="pixel-btn"
                onClick={() => (
                  setPicks([...picks, { symbol: symbols[0]?.symbol ?? '', window: null }]),
                  setActive(picks.length)
                )}
              >
                + ADD
              </button>
            )}
          </div>
          <div className="symbol-grid">
            {symbols.map((s) => (
              <button
                key={s.symbol}
                className={`sym-btn num ${s.symbol === sym ? 'sel' : ''}`}
                onClick={() => {
                  sfx('click');
                  setPicks(picks.map((p, i) => (i === active ? { symbol: s.symbol, window: null } : p)));
                }}
                data-testid={`sym-${s.symbol}`}
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
        <div className="panel setup-col">
          <div className="section-title">{info ? `${info.name} (${info.symbol})` : 'Pick a ticker'}</div>
          {info && <p className="dim">{info.reason}</p>}
          <div className="seg num">
            {(['all', 'earnings', 'gaps', 'highiv'] as const).map((f) => (
              <button key={f} className={filter === f ? 'sel' : ''} onClick={() => setFilter(f)}>
                {f === 'all'
                  ? 'ALL DATES'
                  : f === 'earnings'
                    ? 'EARNINGS AHEAD'
                    : f === 'gaps'
                      ? 'BIG GAPS AHEAD'
                      : 'IV RANK 60+'}
              </button>
            ))}
          </div>
          <div className="date-pick num">
            <input
              type="range"
              min={0}
              max={Math.max(0, filtered.length - 1)}
              value={Math.min(idx, filtered.length - 1)}
              onChange={(e) => setIdx(Number(e.target.value))}
              data-testid="date-slider"
            />
            <div className="date-label" data-testid="date-label">
              {chosen ? chosen.entryDate : 'no dates'} <span className="dim">({filtered.length} dates)</span>
            </div>
            {chosen && (
              <div className="dim">
                IVR {chosen.tags.ivr.toFixed(0)} · VIX {chosen.tags.vix.toFixed(1)} · ADX{' '}
                {chosen.tags.adx.toFixed(0)} {chosen.recent ? '· recent' : ''}
              </div>
            )}
            <div className="modal-actions">
              <button className="pixel-btn" onClick={() => setIdx(Math.max(0, filtered.length - 1))}>
                LATEST
              </button>
              <button
                className="pixel-btn"
                onClick={() => setIdx(Math.floor(Math.random() * filtered.length))}
              >
                RANDOM
              </button>
            </div>
          </div>
          <div className="section-title">Starting capital</div>
          <input
            className="num capital"
            type="number"
            min={1000}
            max={1000000}
            step={500}
            value={capital}
            onChange={(e) => setCapital(Math.max(1000, Math.min(1000000, Number(e.target.value))))}
          />
          {capital < 50000 && (
            <div className="dim small" data-testid="capital-hint">
              Cash-secured puts set aside the whole strike price: $50,000 or more recommended for them.
            </div>
          )}
          <div className="section-title" data-tip="g:plan_set">
            Your plan (every trade)
          </div>
          <PlanSetup compact />
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => void start()}
              disabled={busy || !picks.some((p) => p.window)}
              data-testid="sandbox-start"
            >
              {busy ? 'LOADING…' : 'OPEN THE DESK ▶'}
            </button>
            <button className="pixel-btn" onClick={() => useApp.getState().back()}>
              BACK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SandboxTrading() {
  const go = useApp((s) => s.go);
  const home = useApp((s) => s.home);
  return (
    <TradingLayout
      top={
        <TradingTopBar
          left={
            <>
              <button className="pixel-btn" onClick={home}>
                ◀ HOME
              </button>
              <div className="tb-item">
                <span className="amber-text">SANDBOX</span> <span className="dim">open mode · no score</span>
              </div>
            </>
          }
        />
      }
      onDone={
        <div className="modal-actions done-actions">
          <button
            className="pixel-btn primary"
            onClick={() => go('sandboxSetup')}
            data-testid="sandbox-again"
          >
            NEW SANDBOX
          </button>
          <button className="pixel-btn" onClick={home}>
            TITLE
          </button>
        </div>
      }
    />
  );
}
