import { create } from 'zustand';
import { RunEngine } from '../../engine/run/engine';
import type { RunAction, RunConfig, RunEvent, RunSave } from '../../engine/run/types';
import type { SessionAction, PlaceResult, SessionEvent } from '../../engine/trading/session';
import type { DeskId } from '../../content/types';
import { DESKS } from '../../content/desks';
import type { MarketDataSource } from '../../engine/market/source';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { ipcSource } from '../data/ipcSource';
import { useApp } from './app';
import { tradeRow, useTrading, type StudyId } from './trading';

export const CAREER_SLOT = 'career';
const CHARTIST_STUDIES: StudyId[] = [
  'sma20',
  'sma50',
  'sma200',
  'ema9',
  'ema21',
  'keltner',
  'atr',
  'sr',
  'relvol',
];

let source: MarketDataSource | null = null;
function src(): MarketDataSource {
  if (!source) source = ipcSource();
  return source;
}

export interface SaveSummary {
  desk: DeskId;
  quarter: number;
  roundIndex: number;
  phase: string;
  cash: number;
  equityCents: number;
  seed: string;
}

interface RunStore {
  engine: RunEngine | null;
  version: number;
  busy: boolean;
  error: string | null;
  saveSummary: SaveSummary | null;
  /** Last scored trade, for the meter pop. */
  lastPoints: { points: number; n: number } | null;
  /** Sector and size per real symbol (the Scout and the Lens memo reveal them). */
  sectors: Record<string, string>;
  loadSectors: () => Promise<void>;
  checkSave: () => Promise<void>;
  newRun: (opts: { deskId: DeskId; seed?: string; tier?: number; practice?: boolean }) => Promise<boolean>;
  resume: () => Promise<boolean>;
  act: (a: RunAction) => Promise<PlaceResult | null>;
  abandon: () => Promise<void>;
  leave: () => void;
}

function summaryOf(e: RunEngine): SaveSummary {
  const st = e.state;
  return {
    desk: st.config.deskId,
    quarter: st.quarter,
    roundIndex: st.roundIndex,
    phase: st.phase,
    cash: st.cash,
    equityCents: st.equityCents,
    seed: st.config.seed,
  };
}

async function persist(e: RunEngine): Promise<void> {
  if (!hasBridge()) return;
  if (e.over) {
    await bridge().invoke('user.deleteSave', CAREER_SLOT);
    return;
  }
  const save: RunSave = e.save();
  await bridge().invoke('user.save', {
    slot: CAREER_SLOT,
    kind: 'run',
    updatedAt: new Date().toISOString(),
    summary: summaryOf(e) as unknown as Record<string, unknown>,
    data: save,
  });
}

function toastEvents(events: RunEvent[]): void {
  const app = useApp.getState();
  for (const ev of events) {
    switch (ev.kind) {
      case 'warn':
        app.toast(ev.text, 'warn');
        sfx('error');
        break;
      case 'breach':
        app.toast(ev.text, 'bad');
        sfx('boom');
        break;
      case 'bad':
        app.toast(ev.text, 'bad');
        break;
      case 'good':
        app.toast(ev.text, 'good');
        sfx('coin');
        break;
      case 'stress':
        app.toast(ev.text, ev.text.includes('+') ? 'warn' : 'info');
        break;
      case 'score':
        sfx((ev.points ?? 0) >= 0 ? 'multPop' : 'loss');
        break;
      default:
        break;
    }
  }
}

export const useRun = create<RunStore>((set, get) => {
  /** Point the trading screen at the engine's current session. */
  const attach = (e: RunEngine) => {
    const t = useTrading.getState();
    const s = e.session;
    if (!s) return;
    if (t.session === s) {
      // Cards may have changed (reroll, Time Skip): keep the selection valid.
      if (t.selectedCardId && !s.cards.some((c) => c.id === t.selectedCardId) && s.cards[0])
        t.select(s.cards[0].id);
      t.bump();
      return;
    }
    const chartist = e.hasAnalyst('chartist');
    t.init(s, {
      recordMode: 'career',
      runId: e.state.id,
      deskId: e.state.config.deskId,
      lockedStudies: chartist ? [] : CHARTIST_STUDIES,
      external: (a: SessionAction) => sessionAct(a),
    });
    useTrading.getState().setStructure(DESKS[e.state.config.deskId].structures[0]);
  };

  const recordFinished = async (e: RunEngine) => {
    const s = e.finishedSession;
    if (!s || !hasBridge()) return;
    for (const d of e.state.round.debriefs) {
      const row = tradeRow(s, d, 'career', e.state.id, e.state.config.deskId);
      if (row) await bridge().invoke('user.recordTrade', row);
    }
    e.finishedSession = null;
  };

  const afterAction = async () => {
    const e = get().engine;
    if (!e) return;
    toastEvents(e.events);
    const pts = e.events.filter((x) => x.kind === 'score');
    if (pts.length)
      set({
        lastPoints: {
          points: pts.reduce((a, x) => a + (x.points ?? 0), 0),
          n: (get().lastPoints?.n ?? 0) + 1,
        },
      });
    if (e.finishedSession) await recordFinished(e);
    if (e.state.phase === 'round') attach(e);
    else if (useTrading.getState().session) useTrading.getState().reset();
    if (e.over && e.state.result && hasBridge()) {
      const r = e.state.result;
      await bridge().invoke('user.recordRun', {
        id: e.state.id,
        mode: e.state.config.mode,
        desk: e.state.config.deskId,
        seed: e.state.config.seed,
        tier: e.state.config.tier,
        startedAt: e.state.startedAt,
        endedAt: new Date().toISOString(),
        result: r.outcome,
        rounds: e.state.history.length,
        score: r.points,
        calGrade: r.calGrade,
        alphaCents: r.alphaCents,
        xp: r.xp,
        bonus: r.bonus,
        data: {
          reason: r.reason,
          realizedCents: r.realizedCents,
          roundsCleared: r.roundsCleared,
          history: e.state.history,
        },
      });
    }
    await persist(e);
    set({ version: get().version + 1, saveSummary: e.over ? null : summaryOf(e) });
  };

  // Serialize engine calls: the fast-forward loop and clicks must not interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  const sessionAct = (a: SessionAction) =>
    serial(async () => {
      const e = get().engine;
      if (!e) return { result: null, events: [] as SessionEvent[] };
      const result = await e.dispatch({ t: 's', a });
      const events = e.sessionEvents.slice();
      await afterAction();
      return { result, events };
    });

  return {
    engine: null,
    version: 0,
    busy: false,
    error: null,
    saveSummary: null,
    lastPoints: null,
    sectors: {},
    loadSectors: async () => {
      if (Object.keys(get().sectors).length || !hasBridge()) return;
      const syms = await src().symbols();
      set({ sectors: Object.fromEntries(syms.map((s) => [s.symbol, `${s.sector} · ${s.sizeTier}`])) });
    },

    checkSave: async () => {
      if (!hasBridge()) return;
      const slots = await bridge().invoke('user.listSaves');
      const slot = slots.find((x) => x.slot === CAREER_SLOT);
      set({ saveSummary: slot ? (slot.summary as unknown as SaveSummary) : null });
    },

    newRun: async ({ deskId, seed, tier = 0, practice = false }) => {
      set({ busy: true, error: null });
      try {
        const settings = useApp.getState().settings;
        const meta = await src().meta();
        const config: RunConfig = {
          seed: seed?.trim() || `${Date.now().toString(36)}`,
          deskId,
          mode: 'career',
          tier,
          startEquityCents: settings.game.startingCapitalCents,
          pureMarket: settings.game.pureMarket,
          realism: { ...settings.realism },
          pause: { ...settings.game.pause },
          callMode: settings.game.bucketMode,
          rescale: settings.blind.rescale,
          quarters: 4,
          benchmark: meta.benchmark,
          startingStress: 0,
          extraRerolls: 0,
          practice,
        };
        const e = await RunEngine.create(src(), config, new Date().toISOString());
        set({ engine: e, lastPoints: null });
        attach(e);
        await persist(e);
        set({ version: get().version + 1, saveSummary: summaryOf(e) });
        return true;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        useApp.getState().toast(err instanceof Error ? err.message : String(err), 'warn');
        return false;
      } finally {
        set({ busy: false });
      }
    },

    resume: async () => {
      if (!hasBridge()) return false;
      set({ busy: true, error: null });
      try {
        const slot = await bridge().invoke('user.load', CAREER_SLOT);
        if (!slot) return false;
        const e = await RunEngine.resume(src(), slot.data as RunSave);
        set({ engine: e, lastPoints: null });
        if (e.state.phase === 'round') attach(e);
        set({ version: get().version + 1 });
        return true;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        useApp
          .getState()
          .toast(`Could not resume: ${err instanceof Error ? err.message : String(err)}`, 'warn');
        return false;
      } finally {
        set({ busy: false });
      }
    },

    act: (a) =>
      serial(async () => {
        const e = get().engine;
        if (!e) return null;
        const r = await e.dispatch(a);
        await afterAction();
        return r;
      }),

    abandon: async () => {
      const e = get().engine;
      if (e && !e.over) {
        await get().act({ t: 'forfeit' });
      }
    },

    leave: () => {
      useTrading.getState().reset();
      set({ engine: null });
    },
  };
});
