import { create } from 'zustand';
import { RunEngine } from '../../engine/run/engine';
import type { RunAction, RunConfig, RunEvent, RunSave } from '../../engine/run/types';
import type { SessionAction, PlaceResult, SessionEvent } from '../../engine/trading/session';
import type { DeskId } from '../../content/types';
import type { Line } from '../../content/characters';
import { DESKS } from '../../content/desks';
import type { MarketDataSource } from '../../engine/market/source';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { ipcSource } from '../data/ipcSource';
import { useApp } from './app';
import { tradeRow, useTrading, type StudyId } from './trading';
import { checkAchievements } from '../achievements';
import { useProfile } from './profile';
import { cartridgePoolFor, perksFor, recordDaily } from '../../engine/meta/profile';
import { heatOf } from '../../content/meta';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import { playRun } from '../../engine/sim/bot';
import { crumb } from '../trail';
import { usePayout } from './payout';

export const CAREER_SLOT = 'career';
export type RunSlot = 'career' | 'daily' | 'tutorial';
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

export interface NewRunOpts {
  deskId: DeskId;
  seed?: string;
  tier?: number;
  practice?: boolean;
  mode?: RunConfig['mode'];
  quarters?: number;
  compliance?: string[];
  slot?: RunSlot;
  /** Starting capital for this run (defaults to the setting). */
  startEquityCents?: number;
}

interface RunStore {
  engine: RunEngine | null;
  /** Which save slot the loaded run lives in (Career, Daily and the tutorial are separate). */
  slot: RunSlot;
  /** Bradley's ghost for the Daily in progress. */
  ghost: DailyGhost | null;
  setGhost: (g: DailyGhost | null) => void;
  version: number;
  busy: boolean;
  error: string | null;
  saveSummary: SaveSummary | null;
  /** Last scored trade, for the meter pop. */
  lastPoints: { points: number; n: number } | null;
  /** Sector and size per real symbol (the Scout and the Lens memo reveal them). */
  sectors: Record<string, string>;
  loadSectors: () => Promise<void>;
  /** The line currently on screen (n changes each time so repeats still animate). */
  speech: { line: Line; n: number } | null;
  clearSpeech: () => void;
  checkSave: (slot?: RunSlot) => Promise<void>;
  newRun: (opts: NewRunOpts) => Promise<boolean>;
  resume: (slot?: RunSlot) => Promise<boolean>;
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

async function persist(e: RunEngine, slot: RunSlot): Promise<void> {
  if (!hasBridge()) return;
  if (e.over) {
    await bridge().invoke('user.deleteSave', slot);
    return;
  }
  const save: RunSave = e.save();
  await bridge().invoke('user.save', {
    slot,
    kind: slot === 'daily' ? 'daily' : 'run',
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

/** A finished run: store it for Stats, then pay XP and Bonus into the profile. */
async function recordEnd(e: RunEngine, slot: RunSlot): Promise<void> {
  const r = e.state.result;
  if (!r) return;
  const cfg = e.state.config;
  const mode = cfg.practice ? 'practice' : cfg.mode;
  await bridge().invoke('user.recordRun', {
    id: e.state.id,
    mode,
    desk: cfg.deskId,
    seed: cfg.seed,
    tier: cfg.tier,
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
      stats: e.state.stats,
      reputation: e.state.reputation,
      heat: heatOf(cfg.compliance),
      compliance: cfg.compliance ?? [],
    },
  });
  const profile = useProfile.getState();
  await profile.awardRun({
    id: e.state.id,
    mode,
    desk: cfg.deskId,
    tier: cfg.tier,
    heat: heatOf(cfg.compliance),
    outcome: r.outcome,
    xp: r.xp,
    bonus: r.bonus,
  });
  if (slot === 'daily') {
    const ghost = ((await bridge().invoke('user.get', 'dailyGhost')) as DailyGhost | null) ?? null;
    await profile.set((p) =>
      recordDaily(p, cfg.seed.replace(/^daily-/, ''), {
        points: r.points,
        ghost: ghost?.seed === cfg.seed ? ghost.total : 0,
        outcome: r.outcome,
        roundsCleared: r.roundsCleared,
      }),
    );
  }
  if (slot === 'tutorial') {
    await profile.set((p) => ({
      ...p,
      tutorialDone: true,
      pad: {
        ...p.pad,
        deskItems: p.pad.deskItems.includes('mug')
          ? p.pad.deskItems
          : [...p.pad.deskItems, 'mug'].slice(0, 4),
      },
    }));
    useApp.getState().updateSettings((st) => ({ ...st, game: { ...st.game, tutorialDone: true } }));
    useApp.getState().toast("Tutorial complete: Ines's Mug and the Notebook card back are yours.", 'good');
  }
}

/** Bradley's ghost for a Daily: the disciplined bot's score on the same seed. */
export interface DailyGhost {
  seed: string;
  rounds: number[];
  total: number;
  outcome: string;
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
      blockReason: (cardId, structureId) => get().engine?.tradeBlock(cardId, structureId) ?? null,
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

  // Which of the current round's scored trades the screen has already been handed.
  let seen = { key: '', n: 0 };
  const roundKey = (e: RunEngine) => `${e.state.id}:${e.state.quarter}:${e.state.roundIndex}`;
  /** Start counting from what's already scored (a fresh or resumed run replays nothing). */
  const markSeen = (e: RunEngine) => {
    seen = { key: roundKey(e), n: e.state.round.tallies.length };
    usePayout.getState().clear();
  };
  /** Newly scored trades go to the payout queue (played out one at a time on screen). */
  const queuePayouts = (e: RunEngine): boolean => {
    const key = roundKey(e);
    if (key !== seen.key) seen = { key, n: 0 };
    const fresh = e.state.round.tallies.slice(seen.n);
    seen.n = e.state.round.tallies.length;
    const on = useApp.getState().settings.game.payoutSpeed !== 'instant' && e.state.config.mode !== 'sim';
    if (!fresh.length || !on) return false;
    usePayout.getState().push(fresh);
    return true;
  };

  const afterAction = async () => {
    const e = get().engine;
    if (!e) return;
    toastEvents(e.events);
    const paying = queuePayouts(e);
    // In the tutorial Ines's lessons are the only voice, so the other characters stay quiet.
    const said = e.events.filter((x) => x.kind === 'say' && x.line).at(-1);
    if (said?.line && e.state.config.mode !== 'tutorial')
      set({ speech: { line: said.line, n: (get().speech?.n ?? 0) + 1 } });
    // A payout lands its own points on the meter; otherwise they pop straight away.
    const pts = e.events.filter((x) => x.kind === 'score');
    if (pts.length && !paying)
      set({
        lastPoints: {
          points: pts.reduce((a, x) => a + (x.points ?? 0), 0),
          n: (get().lastPoints?.n ?? 0) + 1,
        },
      });
    if (e.finishedSession) await recordFinished(e);
    if (e.state.phase === 'round') attach(e);
    else if (useTrading.getState().session) useTrading.getState().reset();
    const slot = get().slot;
    if (e.over && e.state.result && hasBridge()) await recordEnd(e, slot);
    await persist(e, slot);
    if (e.over || e.state.phase === 'tally') void checkAchievements();
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
    slot: 'career',
    ghost: null,
    setGhost: (g) => set({ ghost: g }),
    version: 0,
    busy: false,
    error: null,
    saveSummary: null,
    lastPoints: null,
    sectors: {},
    speech: null,
    clearSpeech: () => set({ speech: null }),
    loadSectors: async () => {
      if (Object.keys(get().sectors).length || !hasBridge()) return;
      const syms = await src().symbols();
      set({ sectors: Object.fromEntries(syms.map((s) => [s.symbol, `${s.sector} · ${s.sizeTier}`])) });
    },

    checkSave: async (slot = 'career') => {
      if (!hasBridge()) return;
      const slots = await bridge().invoke('user.listSaves');
      const found = slots.find((x) => x.slot === slot);
      set({ saveSummary: found ? (found.summary as unknown as SaveSummary) : null });
    },

    newRun: async ({
      deskId,
      seed,
      tier = 0,
      practice = false,
      mode = 'career',
      quarters = 4,
      compliance = [],
      slot = 'career',
      startEquityCents,
    }) => {
      set({ busy: true, error: null, slot });
      try {
        const settings = useApp.getState().settings;
        const profile = await useProfile.getState().load();
        const meta = await src().meta();
        const career = mode === 'career';
        // The Daily is the same challenge for everyone (and Bradley's ghost): default rules.
        const daily = mode === 'daily' ? await dailyConfig(seed ?? '', deskId) : null;
        const config: RunConfig = daily
          ? { ...daily, pause: { ...settings.game.pause }, trustEarningsAck: true }
          : {
              seed: seed?.trim() || `${Date.now().toString(36)}`,
              deskId,
              mode,
              tier,
              startEquityCents: startEquityCents ?? settings.game.startingCapitalCents,
              pureMarket: settings.game.pureMarket,
              realism: { ...settings.realism },
              pause: { ...settings.game.pause },
              trustEarningsAck: true,
              callMode: settings.game.bucketMode,
              rescale: settings.blind.rescale,
              quarters,
              benchmark: meta.benchmark,
              startingStress: 0,
              extraRerolls: 0,
              practice,
              compliance: career ? compliance : [],
              // The Daily is the same challenge for everyone: no perks, the full cartridge pool.
              perks: career ? perksFor(profile) : undefined,
              cartridgePool: career ? cartridgePoolFor(profile) : undefined,
            };
        const e = await RunEngine.create(src(), config, new Date().toISOString());
        markSeen(e);
        set({ engine: e, lastPoints: null });
        attach(e);
        const hello = e.events.find((x) => x.kind === 'say' && x.line);
        if (hello?.line && config.mode !== 'tutorial')
          set({ speech: { line: hello.line, n: (get().speech?.n ?? 0) + 1 } });
        await persist(e, slot);
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

    resume: async (slot = 'career') => {
      if (!hasBridge()) return false;
      set({ busy: true, error: null });
      try {
        const saved = await bridge().invoke('user.load', slot);
        if (!saved) return false;
        const e = await RunEngine.resume(src(), saved.data as RunSave);
        markSeen(e);
        set({ engine: e, lastPoints: null, slot });
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
        crumb(`run ${a.t === 's' ? `s.${a.a.t}` : a.t}`);
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
      usePayout.getState().clear();
      useTrading.getState().reset();
      set({ engine: null });
    },
  };
});

/** The config a Daily runs on (default rules, so everyone and the ghost play the same game). */
export async function dailyConfig(seed: string, deskId: DeskId): Promise<RunConfig> {
  const d = DEFAULT_SETTINGS;
  const meta = await src().meta();
  return {
    seed,
    deskId,
    mode: 'daily',
    tier: 0,
    startEquityCents: d.game.startingCapitalCents,
    pureMarket: false,
    realism: { ...d.realism },
    pause: { ...d.game.pause },
    callMode: d.game.bucketMode,
    rescale: d.blind.rescale,
    quarters: 1,
    benchmark: meta.benchmark,
    startingStress: 0,
    extraRerolls: 0,
    practice: false,
  };
}

/** Bradley plays the same Daily seed headless (the disciplined bot), round by round. */
export async function computeGhost(seed: string, deskId: DeskId): Promise<DailyGhost> {
  const e = await RunEngine.create(src(), await dailyConfig(seed, deskId));
  await playRun(e, { kind: 'disciplined', shop: 'families' }, 200);
  const ghost: DailyGhost = {
    seed,
    rounds: e.state.history.map((h) => h.meter),
    total: e.state.totals.points,
    outcome: e.state.result?.outcome ?? 'unfinished',
  };
  if (hasBridge()) await bridge().invoke('user.set', 'dailyGhost', ghost);
  return ghost;
}
