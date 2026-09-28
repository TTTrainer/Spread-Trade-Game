import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { App } from './ui/App';
import { useApp } from './ui/store/app';
import { useTrading } from './ui/store/trading';
import { useRun } from './ui/store/run';
import { useProfile } from './ui/store/profile';
import { useLive } from './ui/store/live';
import { playRun, type BotKind } from './engine/sim/bot';

// Stores are reachable from the console and from end-to-end tests.
(window as unknown as { __stg: unknown }).__stg = {
  app: useApp,
  trading: useTrading,
  run: useRun,
  profile: useProfile,
  live: useLive,
  /** Let a bot finish the current Career run through the same store actions the UI uses. */
  botPlay: async (kind: BotKind = 'disciplined', maxSteps = 400) => {
    const e = useRun.getState().engine;
    if (!e) return null;
    useTrading.getState().pause();
    return playRun(e, { kind, dispatch: (a) => useRun.getState().act(a) }, maxSteps);
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
