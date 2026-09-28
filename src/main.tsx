import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { App } from './ui/App';
import { useApp } from './ui/store/app';
import { useTrading } from './ui/store/trading';

// Stores are reachable from the console and from end-to-end tests.
(window as unknown as { __stg: unknown }).__stg = { app: useApp, trading: useTrading };

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
