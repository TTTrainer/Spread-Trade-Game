/**
 * One simulated run: a bot plays a full Career run through the real engine. Returns a compact
 * summary for the balance report, including every action it took (for the run-time estimate).
 */

import type { DeskId } from '../../src/content/types';
import { DEFAULT_REALISM, defaultPause } from '../../src/engine/lifecycle/daily';
import type { MarketDataSource } from '../../src/engine/market/source';
import { RunEngine } from '../../src/engine/run/engine';
import type { RunAction } from '../../src/engine/run/types';
import { playRun, type BotKind } from '../../src/engine/sim/bot';

export interface SimSpec {
  seed: string;
  bot: BotKind;
  desk: DeskId;
  tier: number;
  shop: 'families' | 'random' | 'none';
  benchmark: string | null;
  /** A cartridge that is owned but does nothing (the counterfactual check). */
  inert?: string;
}

export interface SimResult {
  spec: SimSpec;
  outcome: string;
  completed: boolean; // cleared the year (victory or survived)
  victory: boolean; // cleared and beat SPY
  cleared: number;
  roundsPlayed: number;
  failRound: number | null;
  failReason: 'target' | 'breach' | null;
  realizedCents: number;
  alphaCents: number;
  points: number;
  trades: number;
  wins: number;
  maxStress: number;
  burnouts: number;
  skips: number;
  owned: string[];
  ownedAt: Record<string, number>;
  actions: Record<string, number>;
  days: number;
  rounds: { index: number; quarter: number; target: number; meter: number; status: string }[];
  ms: number;
  error?: string;
}

function key(a: RunAction): string {
  return a.t === 's' ? a.a.t : a.t;
}

export async function simulateRun(source: MarketDataSource, spec: SimSpec): Promise<SimResult> {
  const t0 = Date.now();
  const actions: Record<string, number> = {};
  const engine = await RunEngine.create(source, {
    seed: spec.seed,
    deskId: spec.desk,
    mode: 'sim',
    tier: spec.tier,
    startEquityCents: 500_000,
    pureMarket: false,
    realism: { ...DEFAULT_REALISM },
    pause: defaultPause(),
    callMode: 'em',
    rescale: true,
    quarters: 4,
    benchmark: spec.benchmark,
    startingStress: 0,
    extraRerolls: 0,
    practice: false,
    inert: spec.inert ? [spec.inert] : undefined,
  });
  let error: string | undefined;
  try {
    await playRun(
      engine,
      {
        kind: spec.bot,
        shop: spec.shop,
        dispatch: (a) => {
          const k = key(a);
          actions[k] = (actions[k] ?? 0) + 1;
          return engine.dispatch(a);
        },
      },
      600,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const st = engine.state;
  const r = st.result;
  const failed = st.history.findIndex((h) => h.status === 'failed');
  const lastFail = [...st.history].reverse().find((h) => h.status === 'failed');
  const completed = !!r && (r.outcome === 'victory' || r.outcome === 'survived');
  return {
    spec,
    outcome: r?.outcome ?? 'unfinished',
    completed,
    victory: r?.outcome === 'victory',
    cleared: st.history.filter((h) => h.status === 'passed').length,
    roundsPlayed: st.history.length,
    failRound: !completed && failed >= 0 ? failed : null,
    failReason: completed || !lastFail ? null : /Max-Loss/.test(r?.reason ?? '') ? 'breach' : 'target',
    realizedCents: st.totals.realizedCents,
    alphaCents: st.totals.alphaCents,
    points: st.totals.points,
    trades: st.totals.trades,
    wins: st.totals.wins,
    maxStress: st.stats.maxStress,
    burnouts: st.stats.burnouts,
    skips: st.stats.skips,
    owned: st.stats.owned,
    ownedAt: st.stats.ownedAt,
    actions,
    days: actions.begin ?? 0,
    rounds: st.history.map((h) => ({
      index: h.index,
      quarter: h.quarter,
      target: h.target,
      meter: h.meter,
      status: h.status,
    })),
    ms: Date.now() - t0,
    error,
  };
}
