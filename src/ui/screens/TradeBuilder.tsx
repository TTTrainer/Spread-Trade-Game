/**
 * THE TRADE BUILDER: today's market, for building a real trade. Open any ticker (Schwab live when
 * connected, else the newest saved data, with a plain note when it's out of date), read it with
 * the studies options traders use, shape any strategy with the sliders or leg by leg, and study
 * its payoff full size. COPY ORDER puts the order on the clipboard as text for you to check and
 * enter at your broker. Nothing here places trades or reads your account.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isCashIndex } from '../../content/builderTickers';
import { diffDays } from '../../engine/calendar';
import { expirationsOf, quotesFor } from '../../engine/strategies/structures';
import { orderText, tradeName } from '../../engine/strategies/study';
import { CoursePanel } from './CoursePanel';
import type { OptionLeg, StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { Kbd, Modal } from '../components/ui';
import { money } from '../format';
import { useApp } from '../store/app';
import { freshnessOf, selectedTicker, useBuilder } from '../store/builder';
import { liveCardId, useTrading, type StudyId } from '../store/trading';
import { TradingLayout } from '../trading/TradingScreen';
import './builder.css';

/** Every structure, in the order a credit-spread seller reaches for them. */
const ALL_STRUCTURES: StructureId[] = [
  'bull_put',
  'bear_call',
  'iron_condor',
  'iron_fly',
  'bwb_condor',
  'bull_call',
  'bear_put',
  'cash_secured_put',
  'covered_call',
  'long_straddle',
  'long_strangle',
  'calendar',
  'diagonal',
  'double_calendar',
];

/** The studies offered as one-click toggles, with short names that fit the tray. */
const STUDY_CHIPS: { id: StudyId; label: string; tip: string }[] = [
  { id: 'bb', label: 'BB', tip: 'Bollinger Bands (20, 2): price stretched to a band tends to snap back.' },
  { id: 'em', label: 'EM', tip: "Expected move to the trade's expiration (1σ, from the straddle)." },
  {
    id: 'em2',
    label: '2σ',
    tip: 'Two expected moves: a short strike out here stays out about 95% of the time.',
  },
  { id: 'sma50', label: 'SMA50', tip: '50-day average: the medium trend.' },
  { id: 'sma200', label: 'SMA200', tip: '200-day average: the long trend.' },
  { id: 'ema21', label: 'EMA21', tip: '21-day exponential average: the swing trend.' },
  { id: 'keltner', label: 'KC', tip: 'Keltner Channels: Bollinger inside them is a squeeze before a move.' },
  { id: 'sr', label: 'S/R', tip: 'Support and resistance: levels the price keeps turning at.' },
  { id: 'rsi', label: 'RSI', tip: 'RSI (14): above 70 stretched up, below 30 stretched down.' },
  { id: 'macd', label: 'MACD', tip: 'MACD: momentum turning with its signal-line crosses.' },
  { id: 'atr', label: 'ATR', tip: 'ATR (14): the average daily range, for sizing how far a strike sits.' },
  { id: 'vol', label: 'VOL', tip: 'Volume.' },
];

function StudyStrip() {
  const studies = useTrading((s) => s.studies);
  const toggle = useTrading((s) => s.toggleStudy);
  return (
    <span className="bld-studies num" data-testid="study-strip">
      <span className="dim">STUDIES</span>
      {STUDY_CHIPS.map((c) => (
        <button
          key={c.id}
          className={`bld-chip ${studies.includes(c.id) ? 'on' : ''}`}
          onClick={() => (sfx('click'), toggle(c.id))}
          data-testid={`study-${c.id}`}
          data-tip-title={c.label}
          data-tip-body={c.tip}
          aria-pressed={studies.includes(c.id)}
        >
          {c.label}
        </button>
      ))}
    </span>
  );
}

function FreshBadge() {
  const loaded = useBuilder((s) => s.loaded);
  useTrading((s) => s.selectedCardId);
  void loaded;
  const t = selectedTicker();
  if (!t) return null;
  const f = freshnessOf(t);
  const src =
    t.source === 'schwab-live'
      ? 'Schwab, live'
      : t.source === 'schwab-saved'
        ? 'saved from Schwab'
        : 'game data';
  return (
    <div
      className={`bld-fresh num ${f.state}`}
      data-testid="builder-fresh"
      data-state={f.state}
      data-tip-title="How current this is"
      data-tip-body={[f.text, `Source: ${src}.`, ...t.notes].join(' ')}
    >
      <b>{f.state === 'live' ? '● LIVE' : f.state === 'current' ? '✔ CURRENT' : '⚠ OUT OF DATE'}</b>
      <span>
        {f.state === 'stale'
          ? `data ends ${t.asOf} · ${f.daysOld} trading day${f.daysOld === 1 ? '' : 's'} old`
          : `${t.asOf} · ${src}`}
      </span>
      {t.modeledChain && <span className="chip warn">MODEL CHAIN</span>}
    </div>
  );
}

function BuilderTopBar() {
  const back = useApp((s) => s.back);
  const go = useApp((s) => s.go);
  const loading = useBuilder((s) => s.loading);
  const refresh = useBuilder((s) => s.refresh);
  const list = useBuilder((s) => s.list);
  return (
    <div className="topbar panel bld-top" data-testid="topbar">
      <button className="pixel-btn" onClick={back} data-testid="builder-back">
        ◀ BACK
      </button>
      <div className="bld-title">
        <b>TRADE BUILDER</b>
        <span className="dim num">paper analysis · nothing is sent to a broker</span>
      </div>
      <FreshBadge />
      <div className="tb-spacer" />
      {!list?.schwab && (
        <button
          className="pixel-btn small"
          onClick={() => go('settings')}
          data-testid="builder-connect"
          data-tip-title="Today's data"
          data-tip-body="Connect Schwab (read-only market data) in Settings › Data and every ticker loads live: today's prices and option chain."
        >
          CONNECT SCHWAB
        </button>
      )}
      <button
        className="pixel-btn"
        onClick={() => void refresh()}
        disabled={!!loading}
        data-testid="builder-refresh"
        data-tip-title="Refresh"
        data-tip-body="Load this ticker again: today's prices and chain from Schwab when connected."
      >
        {loading ? `LOADING ${loading}…` : '⟳ REFRESH'}
      </button>
      <button
        className="pixel-btn bld-learn"
        onClick={() => (sfx('select'), useTrading.getState().setRightTab('learn'))}
        data-testid="builder-learn"
        data-tip-title="Learn options"
        data-tip-body="A 13-lesson course on the chart you have open: from a single call to credit spreads and condors, with one thing to try or one question per lesson."
      >
        ✎ LEARN OPTIONS
      </button>
      <button className="pixel-btn" onClick={() => go('live')} data-testid="builder-classic">
        PAPER MONTH ▸
      </button>
    </div>
  );
}

/** What was typed, as a ticker: thinkorswim's and Schwab's $SPX is plain SPX here. */
const clean = (q: string) => q.trim().toUpperCase().replace(/^\$/, '');

/** Type a ticker and press Enter, or pick one from the full list. */
function TickerPicker() {
  const list = useBuilder((s) => s.list);
  const open = useBuilder((s) => s.open);
  const loading = useBuilder((s) => s.loading);
  const [q, setQ] = useState('');
  const all = useBuilder((s) => s.tickersOpen);
  const setAll = useBuilder((s) => s.setTickersOpen);
  const tickers = list?.tickers ?? [];
  const hits = useMemo(() => {
    const f = clean(q);
    if (!f) return [];
    return tickers
      .filter((t) => t.symbol.startsWith(f) || t.name.toUpperCase().includes(f))
      .sort((a, b) => Number(!a.symbol.startsWith(f)) - Number(!b.symbol.startsWith(f)))
      .slice(0, 6);
  }, [q, tickers]);
  const go = async (sym: string) => {
    sfx('select');
    setQ('');
    setAll(false);
    await open(sym);
  };
  return (
    <div className="bld-picker" data-testid="ticker-picker">
      <div className="section-title">Open a ticker</div>
      <div className="bld-search">
        <input
          className="num"
          placeholder="SPY, QQQ, NVDA…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              const sym = hits[0]?.symbol ?? clean(q);
              if (sym) void go(sym);
            }
          }}
          disabled={!!loading}
          data-testid="ticker-input"
        />
        <button className="pixel-btn small" onClick={() => setAll(true)} data-testid="ticker-all">
          ALL
        </button>
      </div>
      {hits.length > 0 && (
        <div className="bld-hits num">
          {hits.map((t) => (
            <button key={t.symbol} onClick={() => void go(t.symbol)} data-testid={`hit-${t.symbol}`}>
              <b>{t.symbol}</b> <span className="dim">{t.name}</span>
            </button>
          ))}
        </div>
      )}
      {all && <AllTickers onPick={(s) => void go(s)} onClose={() => setAll(false)} />}
    </div>
  );
}

function AllTickers({ onPick, onClose }: { onPick: (s: string) => void; onClose: () => void }) {
  const list = useBuilder((s) => s.list);
  const loaded = useBuilder((s) => s.loaded);
  const groups: { name: string; filter: (g: string, isNew: boolean) => boolean }[] = [
    { name: 'Index & sector ETFs', filter: (g) => g === 'etf' },
    { name: 'Index options (cash-settled)', filter: (g) => g === 'index' },
    { name: 'Stocks', filter: (g, n) => g === 'stock' && !n },
    { name: 'Added for the Trade Builder', filter: (g, n) => g === 'stock' && n },
    { name: 'SIM practice market', filter: (g) => g === 'sim' },
  ];
  // On the page itself, so the chart's CHART / CHAIN / PAYOFF tabs can't draw over it.
  return createPortal(
    <Modal onClose={onClose} testId="ticker-list">
      <h2>Tickers</h2>
      <p className="dim small">
        {list?.schwab
          ? 'Schwab is connected: every ticker loads live.'
          : 'Without Schwab, a ticker opens from your saved data (a date shows how far it reaches).'}
      </p>
      {groups.map((g) => {
        const ts = (list?.tickers ?? []).filter((t) => g.filter(t.group, t.isNew));
        if (!ts.length) return null;
        return (
          <div key={g.name}>
            <div className="section-title">{g.name}</div>
            <div className="bld-grid num">
              {ts.map((t) => (
                <button
                  key={t.symbol}
                  className={`sym-btn ${loaded[t.symbol] ? 'sel' : ''}`}
                  onClick={() => onPick(t.symbol)}
                  data-testid={`pick-${t.symbol}`}
                >
                  <b>{t.symbol}</b>
                  <span className="dim">
                    {t.isNew ? 'NEW · ' : ''}
                    {t.savedThrough ? `saved to ${t.savedThrough}` : list?.schwab ? 'live' : 'not saved yet'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Modal>,
    document.body,
  );
}

/** Every leg of the trade, editable: side, size, call or put, strike and expiration. */
function LegsEditor() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  useTrading((s) => s.version);
  const plan = useTrading((s) => s.plan)();
  if (!session || !cardId || !plan?.legs.length) return null;
  const chain = session.chain(cardId);
  if (!chain) return null;
  const now = session.view(cardId).now;
  const exps = expirationsOf(chain).filter((e) => diffDays(now, e) >= 0);
  const legs = plan.legs;
  const edit = (i: number, patch: Partial<OptionLeg>) => {
    sfx('tick');
    setBuilder({
      legs: legs.map((l, j) => (j === i && l.kind === 'option' ? { ...l, ...patch } : l)),
    });
  };
  return (
    <div className="tray-section bld-legs num" data-testid="legs-editor">
      <div className="section-title">
        Legs{' '}
        {builder.legs && (
          <button
            className="bld-reset"
            onClick={() => (sfx('click'), setBuilder({ legs: null }))}
            data-testid="legs-reset"
          >
            ↺ back to the sliders
          </button>
        )}
      </div>
      <table>
        <tbody>
          {legs.map((l, i) => {
            if (l.kind === 'stock')
              return (
                <tr key={i}>
                  <td colSpan={5} className="dim">
                    {Math.abs(l.ratio) * plan.qty * 100} shares you own
                  </td>
                </tr>
              );
            const strikes = quotesFor(chain, l.expiration, l.right);
            const q = strikes.find((x) => Math.abs(x.strike - l.strike) < 1e-6);
            return (
              <tr key={i} data-testid={`leg-${i}`}>
                <td>
                  <button
                    className={`bld-side ${l.ratio < 0 ? 'sell' : 'buy'}`}
                    onClick={() => edit(i, { ratio: -l.ratio })}
                    data-testid={`leg-${i}-side`}
                    title="Switch buy / sell"
                  >
                    {l.ratio < 0 ? 'SELL' : 'BUY'} {Math.abs(l.ratio)}
                  </button>
                </td>
                <td>
                  <button
                    className="bld-right"
                    onClick={() => edit(i, { right: l.right === 'C' ? 'P' : 'C' })}
                    title="Switch call / put"
                  >
                    {l.right === 'C' ? 'CALL' : 'PUT'}
                  </button>
                </td>
                <td>
                  <select
                    value={l.strike}
                    onChange={(e) => edit(i, { strike: Number(e.target.value) })}
                    data-testid={`leg-${i}-strike`}
                  >
                    {strikes.map((x) => (
                      <option key={x.strike} value={x.strike}>
                        {x.strike}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={l.expiration} onChange={(e) => edit(i, { expiration: e.target.value })}>
                    {exps.map((e) => (
                      <option key={e} value={e}>
                        {e.slice(5)} ({diffDays(now, e)}d)
                      </option>
                    ))}
                  </select>
                </td>
                <td className="dim" title={q ? `bid ${q.bid.toFixed(2)} · ask ${q.ask.toFixed(2)}` : ''}>
                  {q ? `Δ${Math.round(Math.abs(q.delta) * 100)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The ticket: what the trade costs or pays, its odds, and COPY ORDER (never SEND). */
function BuilderTicket() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const plan = useTrading((s) => s.plan)();
  const setPayoffOpen = useTrading((s) => s.setPayoffOpen);
  const toast = useApp((s) => s.toast);
  // Redraw on every change to the trade being built.
  useTrading((s) => s.builder);
  useTrading((s) => s.version);
  if (!session || !cardId || !plan?.metrics || plan.mid === null)
    return (
      <div className="tray-section ticket bld-ticket num" data-testid="builder-ticket">
        <div className="section-title">Order</div>
        <p className="dim">{plan?.reason ?? 'Pick a strategy to build a trade.'}</p>
      </div>
    );
  const card = session.card(cardId);
  const m = plan.metrics;
  const net = plan.mid;
  const text = orderText(card.displaySymbol, plan.structureId, plan.legs, plan.qty, net);
  const copy = () => {
    sfx('select');
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast('Order copied. Check every leg before you send it at your broker.', 'info'))
      .catch(() => toast('Copy failed: select the order text and copy it by hand.', 'warn'));
  };
  const dollars = (x: number) => money(Math.round(Math.abs(x) * 100 * plan.qty * 100));
  return (
    <div className="tray-section ticket bld-ticket num" data-testid="builder-ticket">
      <div className="section-title">
        Order · {tradeName(plan.structureId, plan.legs)} · {plan.qty}×
      </div>
      <div className={`bld-net ${net < 0 ? 'credit' : 'debit'}`}>
        <span>{net < 0 ? 'CREDIT' : 'DEBIT'}</span>
        <b data-testid="builder-net">{dollars(net)}</b>
        <span className="dim">{Math.abs(net).toFixed(2)}/sh</span>
        {isCashIndex(card.realSymbol) && (
          <span
            className="bld-settle"
            data-testid="builder-settle"
            data-tip-title="Cash-settled index option"
            data-tip-body="European style: it can't be assigned early, and at expiration the difference is paid in cash. No shares change hands."
          >
            CASH-SETTLED
          </span>
        )}
      </div>
      <div className="bld-kv">
        <span>
          <span className="dim">MAX +</span>{' '}
          <b className="up-text">{m.maxProfit === null ? '∞' : dollars(m.maxProfit)}</b>
        </span>
        <span>
          <span className="dim">MAX −</span> <b className="down-text">{dollars(m.maxLoss)}</b>
        </span>
        <span>
          <span className="dim">POP</span> <b>{Math.round(m.pop * 100)}%</b>
        </span>
        <span>
          <span className="dim">BE</span> <b>{m.breakevens.map((b) => b.toFixed(2)).join(' / ') || '—'}</b>
        </span>
      </div>
      <div className="bld-actions">
        <button className="pixel-btn" onClick={() => setPayoffOpen(true)} data-testid="open-payoff">
          ⟋ PAYOFF
        </button>
        <button className="pixel-btn primary" onClick={copy} data-testid="builder-copy">
          ⧉ COPY ORDER <Kbd>Alt+C</Kbd>
        </button>
      </div>
      <code className="bld-order" data-testid="builder-order">
        {text}
      </code>
    </div>
  );
}

export function TradeBuilderScreen() {
  const init = useBuilder((s) => s.init);
  const session = useBuilder((s) => s.session);
  const error = useBuilder((s) => s.error);
  const loading = useBuilder((s) => s.loading);
  const back = useApp((s) => s.back);
  useEffect(() => {
    void init();
    return () => useTrading.setState({ clockHold: null, sizeMode: 'conviction', payoffOpen: false });
  }, []);
  useEffect(() => {
    // Size is yours to set here: a plain contract count, not the game's conviction steps.
    // The TRADE tab (payoff, legs, stats) is the builder's home on the right.
    if (session) useTrading.setState({ sizeMode: 'contracts', rightTab: 'trade' });
  }, [session]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-testid="builder-copy"]')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!session)
    return (
      <div className="screen bld-empty" data-testid="builder-screen">
        <h1 className="screen-title">TRADE BUILDER</h1>
        <p className="screen-sub">
          {loading ? `Loading ${loading}…` : (error ?? 'Getting the ticker list…')}
        </p>
        <TickerPicker />
        <div className="modal-actions">
          <button className="pixel-btn" onClick={back}>
            BACK
          </button>
        </div>
      </div>
    );
  return (
    <div className="bld-wrap" data-testid="builder-screen">
      <TradingLayout
        top={<BuilderTopBar />}
        allowedStructures={ALL_STRUCTURES}
        payoffTab
        tabs={['builder', 'analyze']}
        ticket={<BuilderTicket />}
        tradeTabExtra={<LegsEditor />}
        learnTab={<CoursePanel />}
        trayExtra={<StudyStrip />}
        leftPinned={<TickerPicker />}
      />
    </div>
  );
}
