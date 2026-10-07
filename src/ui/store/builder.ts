/**
 * The Trade Builder: today's market for the tickers you open, with the game's chart, studies,
 * strategy builder and payoff tools on top. Each ticker is loaded whole (Schwab live when
 * connected, else the newest saved data) into an in-memory market, and the desk shows it as a card
 * on its own newest day. Nothing plays forward and nothing is placed: COPY ORDER puts the trade on
 * the clipboard for you to enter at your broker yourself.
 */

import { create } from 'zustand';
import type { ISODate } from '../../engine/calendar';
import { BundleSource } from '../../engine/market/bundleSource';
import { freshness, type Freshness } from '../../engine/market/freshness';
import { defaultSessionConfig, TradingSession } from '../../engine/trading/session';
import type { BuilderList, BuilderLoadResult } from '../../shared/rpc';
import { bridge, hasBridge } from '../bridge';
import { useApp } from './app';
import { useTrading } from './trading';

export interface LoadedTicker {
  symbol: string;
  asOf: ISODate;
  source: Extract<BuilderLoadResult, { ok: true }>['source'];
  live: boolean;
  modeledChain: boolean;
  notes: string[];
  fetchedAt: string;
}

interface BuilderStore {
  list: BuilderList | null;
  loaded: Record<string, LoadedTicker>;
  /** The ticker being fetched right now. */
  loading: string | null;
  error: string | null;
  session: TradingSession | null;
  /** The ALL ticker list is open. */
  tickersOpen: boolean;
  setTickersOpen: (open: boolean) => void;
  init: () => Promise<void>;
  open: (symbol: string) => Promise<boolean>;
  /** Fetch the selected ticker again (fresh quotes). */
  refresh: () => Promise<void>;
}

const HOLD = "The Trade Builder is today's market: there are no later days to play.";

let src = new BundleSource();

/** The New York date and whether today's session has closed (4:00 pm). */
export function nyNow(now = new Date()): { today: ISODate; afterClose: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    today: `${get('year')}-${get('month')}-${get('day')}` as ISODate,
    afterClose: Number(get('hour')) * 60 + Number(get('minute')) >= 16 * 60,
  };
}

export function freshnessOf(t: LoadedTicker, now = new Date()): Freshness {
  const ny = nyNow(now);
  return freshness(t.asOf, ny.today, ny.afterClose, t.live);
}

/** The ticker on the selected card. */
export function selectedTicker(): LoadedTicker | null {
  const t = useTrading.getState();
  const card = t.session?.cards.find((c) => c.id === t.selectedCardId);
  return card ? (useBuilder.getState().loaded[card.realSymbol] ?? null) : null;
}

function newSession(edge: ISODate): TradingSession {
  const settings = useApp.getState().settings;
  return new TradingSession(
    src,
    defaultSessionConfig({
      seed: 'trade-builder',
      mode: 'live',
      startEquityCents: settings.game.startingCapitalCents,
      realism: { ...settings.realism },
      pause: { ...settings.game.pause },
      trustEarningsAck: true,
      benchmark: 'SPY',
      callMode: settings.game.bucketMode,
      blind: false,
      liveEdge: edge,
      liveHistoryDays: 730,
      // Analysis, not a game round: the size is yours, so the per-trade cap never blocks a build.
      riskCapPct: 1,
    }),
  );
}

export const useBuilder = create<BuilderStore>((set, get) => ({
  list: null,
  loaded: {},
  tickersOpen: false,
  setTickersOpen: (open) => set({ tickersOpen: open }),
  loading: null,
  error: null,
  session: null,

  init: async () => {
    if (!hasBridge()) return;
    const list = await bridge().invoke('builder.list');
    set({ list });
    // Back on the screen with tickers already open: put them back on the desk.
    const s = get().session;
    if (s && s.cards.length) {
      useTrading.getState().init(s, { recordMode: 'live', sizeMode: 'contracts' });
      useTrading.setState({ clockHold: HOLD });
      return;
    }
    const first =
      list.tickers.find((t) => t.symbol === 'SPY' && t.savedThrough) ??
      list.tickers.find((t) => t.savedThrough) ??
      null;
    if (first) await get().open(first.symbol);
  },

  open: async (symbol) => {
    if (!hasBridge() || get().loading) return false;
    const existing = get().session?.cards.find((c) => c.realSymbol === symbol);
    if (existing && get().loaded[symbol]) {
      useTrading.getState().select(existing.id);
      return true;
    }
    set({ loading: symbol, error: null });
    try {
      const r = await bridge().invoke('builder.load', symbol);
      if (!r.ok) {
        set({ error: r.message });
        useApp.getState().toast(r.message, 'warn');
        return false;
      }
      src.add(r.bundle);
      src.setRate(r.rate);
      if (r.vix.length) src.setVix(r.vix);
      const edge = src.lastDate() ?? r.bundle.asOf;
      let s = get().session;
      // A newer day than the desk's edge (or a reload) starts a fresh desk with every ticker on it.
      const rebuild = !s || (s.config.liveEdge ?? '') < edge || !!existing;
      if (rebuild) {
        const keep = (s?.cards.map((c) => c.realSymbol) ?? []).filter((x) => x !== symbol);
        s = newSession(edge);
        let n = 0;
        for (const sym of [...keep, symbol]) {
          const b = src.get(sym);
          if (b) await s.dispatch({ t: 'addLive', cardId: `B${++n}`, symbol: sym, entryDate: b.asOf });
        }
      } else if (s) {
        await s.dispatch({
          t: 'addLive',
          cardId: `B${s.cards.length + 1}`,
          symbol,
          entryDate: r.bundle.asOf,
        });
      }
      const loaded: LoadedTicker = {
        symbol,
        asOf: r.bundle.asOf,
        source: r.source,
        live: r.live,
        modeledChain: r.modeledChain,
        notes: r.notes,
        fetchedAt: r.fetchedAt,
      };
      set({ session: s, loaded: { ...get().loaded, [symbol]: loaded } });
      const t = useTrading.getState();
      if (rebuild || t.session !== s) t.init(s!, { recordMode: 'live', sizeMode: 'contracts' });
      else t.bump();
      useTrading.setState({ clockHold: HOLD });
      const card = s!.cards.find((c) => c.realSymbol === symbol);
      if (card) useTrading.getState().select(card.id);
      return true;
    } catch (e) {
      const message = `Couldn't load ${symbol}: ${(e as Error).message}`;
      set({ error: message });
      useApp.getState().toast(message, 'warn');
      return false;
    } finally {
      set({ loading: null });
    }
  },

  refresh: async () => {
    const t = selectedTicker();
    if (!t) return;
    const { [t.symbol]: _drop, ...rest } = get().loaded;
    void _drop;
    set({ loaded: rest });
    await get().open(t.symbol);
  },
}));

/** Tests and a fresh start: forget every loaded ticker. */
export function resetBuilder(): void {
  src = new BundleSource();
  useBuilder.setState({
    loaded: {},
    session: null,
    list: null,
    error: null,
    loading: null,
    tickersOpen: false,
  });
}
