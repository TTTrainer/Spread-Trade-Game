import { useEffect, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { useApp, type Screen } from '../store/app';
import { Backdrop } from '../../fx/Backdrop';
import './title.css';

const MENU: { label: string; screen: Screen; wip?: boolean }[] = [
  { label: 'Career', screen: 'career' },
  { label: 'Daily', screen: 'daily' },
  { label: 'Drills', screen: 'drills' },
  // On hold until it's rebuilt around trading today's price for a leaderboard.
  { label: 'Live', screen: 'live', wip: true },
  { label: 'Contracts', screen: 'contracts' },
  { label: 'Sandbox', screen: 'sandboxSetup' },
  { label: 'Stats', screen: 'stats' },
  { label: 'The Pad', screen: 'pad' },
  { label: 'Settings', screen: 'settings' },
  { label: 'Credits', screen: 'credits' },
];

export function TitleScreen() {
  const [sel, setSel] = useState(0);
  const go = useApp((s) => s.go);
  const data = useApp((s) => s.data);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown') {
        sfx('hover');
        setSel((s) => (s + 1) % MENU.length);
      }
      if (e.key === 'ArrowUp') {
        sfx('hover');
        setSel((s) => (s - 1 + MENU.length) % MENU.length);
      }
      if (e.key === 'Enter') {
        sfx('select');
        setSel((s) => {
          go(MENU[s].screen);
          return s;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="title-screen" data-testid="title-screen">
      <div className="synth-grid" aria-hidden="true" />
      <div className="title-sun" aria-hidden="true" />
      <Backdrop opacity={0.45} testId="backdrop" />
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
          <button
            key={m.label}
            className={`title-item ${i === sel ? 'sel' : ''}`}
            onMouseEnter={() => {
              if (i !== sel) sfx('hover');
              setSel(i);
            }}
            onClick={() => {
              sfx('select');
              go(m.screen);
            }}
            data-testid={`menu-${m.screen}`}
          >
            <span className="caret">{i === sel ? '▶' : ' '}</span>
            {m.label}
            {m.wip && (
              <span className="title-wip num" data-testid={`wip-${m.screen}`}>
                WORK IN PROGRESS
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="title-foot num">
        v{__APP_VERSION__} · paper trading only · not financial advice
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
