/**
 * Live mode: the most recent month of the market, real names and real dates. A month starts
 * LIVE_MONTH_DAYS trading days before the latest close with a dealt lineup, and plays forward day by
 * day like any other desk. At the latest close the clock waits; each new day of data (a sync) plays
 * on from there, so the month never runs out. The session's action log is saved and replayed
 * against the newer data on load. Nothing is sent anywhere; nothing places real trades.
 *
 * On the SIM market there is no new data to download, so Sync moves a simulated "today" forward
 * one week (five trading days) through the SIM history instead, and the screen says so.
 */

import { create } from 'zustand';
import { addDays, type ISODate } from '../../engine/calendar';
import { buildDebrief } from '../../engine/trading/debrief';
import { liveMonthStart, pickLiveLineup } from '../../engine/trading/liveMonth';
import { defaultSessionConfig, TradingSession, type SessionAction } from '../../engine/trading/session';
import { bridge, hasBridge } from '../bridge';
import { ipcSource } from '../data/ipcSource';
import { useApp } from './app';
import { tradeRow, useTrading } from './trading';

export const LIVE_SLOT = 'live';
/** How far back the simulated "today" starts on the SIM market (gives about 12 weekly syncs). */
const SIM_RUNWAY_DAYS = 60;
const SIM_WEEK = 5;

interface LiveSave {
  seed: string;
  log: SessionAction[];
  simToday: ISODate | null;
  startedAt: string;
  /** First day of this Live month. Saves from before months have none and keep the old rules. */
  start?: ISODate | null;
}

interface LiveStore {
  session: TradingSession | null;
  edge: ISODate | null;
  /** First day of the month being played (null for an old, month-less save). */
  start: ISODate | null;
  /** Trading days from the month's start through the latest close. */
  days: ISODate[];
  synthetic: boolean;
  /** Last day of data in the SIM market (the simulated today can't pass it). */
  simEnd: ISODate | null;
  busy: boolean;
  recorded: Set<string>;
  open: () => Promise<boolean>;
  addTicker: (symbol: string) => Promise<string | null>;
  sync: () => Promise<void>;
  reset: () => Promise<void>;
  persist: () => Promise<void>;
  recordClosed: () => Promise<number>;
}

let save: LiveSave | null = null;
const src = ipcSource();

async function loadSave(): Promise<LiveSave | null> {
  if (!hasBridge()) return null;
  const slot = await bridge().invoke('user.load', LIVE_SLOT);
  return (slot?.data as LiveSave | undefined) ?? null;
}

/** The day the desk's clock is on: every card moves together, so any card's date will do. */
export function liveClock(s: TradingSession, start: ISODate | null): ISODate | null {
  const dates = s.cards.map((c) => s.view(c.id).now);
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : start;
}

export const useLive = create<LiveStore>((set, get) => ({
  session: null,
  edge: null,
  start: null,
  days: [],
  synthetic: true,
  simEnd: null,
  busy: false,
  recorded: new Set(),

  /** Build the session at the current edge and replay every saved action (or deal a new month). */
  open: async () => {
    set({ busy: true });
    try {
      const meta = await src.meta();
      const synthetic = meta.kind === 'synthetic';
      save = (await loadSave()) ?? null;
      const fresh = !save;
      if (!save) {
        let simToday: ISODate | null = null;
        if (synthetic) {
          const days = await src.tradingDays(addDays(meta.lastDate, -140), meta.lastDate);
          simToday = days[Math.max(0, days.length - 1 - SIM_RUNWAY_DAYS)];
        }
        const edge0 = simToday ?? meta.lastDate;
        const recent = await src.tradingDays(addDays(edge0, -60), edge0);
        save = {
          seed: `live-${Date.now().toString(36)}`,
          log: [],
          simToday,
          startedAt: new Date().toISOString(),
          start: liveMonthStart(recent, edge0),
        };
      }
      const edge = synthetic ? (save.simToday ?? meta.lastDate) : meta.lastDate;
      const month = !!save.start;
      const settings = useApp.getState().settings;
      const s = new TradingSession(
        src,
        defaultSessionConfig({
          seed: save.seed,
          mode: 'live',
          startEquityCents: settings.game.startingCapitalCents,
          realism: { ...settings.realism },
          pause: { ...settings.game.pause },
          trustEarningsAck: true,
          benchmark: meta.benchmark,
          callMode: settings.game.bucketMode,
          blind: false,
          liveEdge: edge,
          // The whole desk moves with the clock, traded or not, so any day can start a trade.
          advanceIdle: month,
        }),
      );
      // A month never "ends" early: it runs to the latest close and waits there for new days.
      s.holdOpen = month;
      for (const a of save.log) await s.dispatch(a);
      if (month && fresh) {
        const lineup = pickLiveLineup(await src.symbols(), meta.benchmark, save.seed, save.start as ISODate);
        let n = 0;
        for (const symbol of lineup) {
          try {
            await s.dispatch({ t: 'addLive', cardId: `L${++n}`, symbol, entryDate: save.start as ISODate });
          } catch (err) {
            s.log.pop();
            n--;
            console.error(`live lineup: no chain for ${symbol}`, err);
          }
        }
      }
      if (!month)
        // An old save: a ticker you looked at but never traded stays on the day you opened it; drop
        // it so every card on the desk is at today's close.
        for (const c of s.cards.slice())
          if (!c.positionIds.length && !c.orderIds.length && s.view(c.id).now < edge)
            await s.dispatch({ t: 'removeCard', cardId: c.id });
      const start = save.start ?? null;
      const days = start ? await src.tradingDays(start, edge) : [];
      set({ session: s, edge, start, days, synthetic, simEnd: synthetic ? meta.lastDate : null });
      useTrading.getState().init(s, { recordMode: 'live', onChange: () => void get().persist() });
      await get().persist();
      await get().recordClosed();
      return true;
    } catch (err) {
      useApp.getState().toast(`Live: ${err instanceof Error ? err.message : String(err)}`, 'warn');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  addTicker: async (symbol) => {
    const s = get().session;
    const edge = get().edge;
    if (!s || !edge) return null;
    if (s.inDay) {
      useApp.getState().toast('Finish the day first.', 'warn');
      return null;
    }
    // New tickers join on the day the desk is on (the latest close for an old save).
    const day = get().start ? (liveClock(s, get().start) ?? edge) : edge;
    const existing = s.cards.find((c) => c.realSymbol === symbol && s.view(c.id).now >= day);
    if (existing) {
      useTrading.getState().select(existing.id);
      return existing.id;
    }
    const cardId = `L${s.log.filter((a) => a.t === 'addLive').length + 1}`;
    try {
      await s.dispatch({ t: 'addLive', cardId, symbol, entryDate: day });
    } catch (err) {
      s.log.pop();
      useApp.getState().toast(`No chain for ${symbol} on ${day}.`, 'warn');
      console.error(err);
      return null;
    }
    useTrading.getState().bump();
    useTrading.getState().select(cardId);
    await get().persist();
    return cardId;
  },

  sync: async () => {
    if (!hasBridge()) return;
    set({ busy: true });
    try {
      if (get().synthetic) {
        const cur = save?.simToday;
        const end = get().simEnd;
        if (!cur || !end) return;
        const days = await src.tradingDays(addDays(cur, 1), addDays(cur, 14));
        const next = days[Math.min(days.length, SIM_WEEK) - 1];
        if (!next || cur >= end) {
          useApp.getState().toast('The SIM market has no later days. Reset Live to start over.', 'warn');
          return;
        }
        save = { ...(save as LiveSave), simToday: next > end ? end : next };
        await get().persist();
        useApp.getState().toast(`SIM market: the simulated calendar moved to ${save.simToday}.`, 'good');
      } else {
        const r = await bridge().invoke('data.build', {
          mode: 'sync',
          allowDownload: false,
          confirmLowDisk: true,
        });
        await useApp.getState().refreshData();
        useApp.getState().toast(r.message, r.ok ? 'good' : 'warn');
        if (!r.ok) return;
      }
    } finally {
      set({ busy: false });
    }
    useTrading.getState().reset();
    await get().open();
  },

  reset: async () => {
    if (hasBridge()) await bridge().invoke('user.deleteSave', LIVE_SLOT);
    save = null;
    useTrading.getState().reset();
    set({ session: null, start: null, days: [], recorded: new Set() });
    await get().open();
  },

  persist: async () => {
    const s = get().session;
    if (!s || !save || !hasBridge()) return;
    save = { ...save, log: s.log.slice() };
    const open = s.openPositions().length;
    await bridge().invoke('user.save', {
      slot: LIVE_SLOT,
      kind: 'live',
      updatedAt: new Date().toISOString(),
      summary: { edge: get().edge, open, seed: save.seed },
      data: save,
    });
  },

  /** Closed live trades go to Stats as they close (the row id is stable, so replays don't duplicate). */
  recordClosed: async () => {
    const s = get().session;
    if (!s || !hasBridge()) return 0;
    let n = 0;
    for (const p of s.positions.filter((x) => x.status === 'closed')) {
      if (get().recorded.has(p.id)) continue;
      try {
        const d = await buildDebrief(s, p.id);
        const row = tradeRow(s, d, 'live', null, null);
        if (row) await bridge().invoke('user.recordTrade', row);
        get().recorded.add(p.id);
        n++;
      } catch (err) {
        console.error('live debrief failed', err);
      }
    }
    return n;
  },
}));
