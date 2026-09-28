import { useEffect, useState } from 'react';
import type { DataStatus } from '../../shared/rpc';
import { bridge, hasBridge } from '../bridge';
import './title.css';

const MENU = [
  'Career',
  'Daily',
  'Drills',
  'Live',
  'Contracts',
  'Sandbox',
  'Stats',
  'The Pad',
  'Settings',
  'Credits',
];

export function TitleScreen() {
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<DataStatus | null>(null);

  useEffect(() => {
    if (!hasBridge()) return;
    void bridge()
      .invoke('data.status')
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') setSel((s) => (s + 1) % MENU.length);
      if (e.key === 'ArrowUp') setSel((s) => (s - 1 + MENU.length) % MENU.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="title-screen" data-testid="title-screen">
      <div className="synth-grid" aria-hidden="true" />
      <div className="title-sun" aria-hidden="true" />
      <div className="title-block">
        <div className="title-kicker">FY-CYCLE // DESK TERMINAL</div>
        <h1 className="title-logo">
          SPREAD
          <br />
          TRADING GAME
        </h1>
        <div className="title-sub">sell premium. survive the review. repeat.</div>
      </div>
      <nav className="title-menu">
        {MENU.map((m, i) => (
          <button key={m} className={`title-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)}>
            <span className="caret">{i === sel ? '▶' : ' '}</span>
            {m}
          </button>
        ))}
      </nav>
      <div className="title-foot num">
        v0.1 · paper trading only · not financial advice
        {data && (
          <span className="title-data" data-testid="data-status">
            {' '}
            · MARKET: {data.kind === 'synthetic' ? 'SIM' : 'REAL'} · {data.symbols} tickers · through{' '}
            {data.lastDate}
          </span>
        )}
      </div>
    </div>
  );
}
