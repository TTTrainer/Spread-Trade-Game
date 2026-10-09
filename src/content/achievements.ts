/**
 * Achievements (~40), each computed from what the game already records: the real trade ledger,
 * finished runs (with their counters) and drill sessions. Nothing is tracked twice, so progress
 * is always consistent with Stats. Some unlock with modes that arrive later (Endless, Daily,
 * Live, The Pad, the tutorial).
 */

import type { DrillRow, RunRow, TradeRow } from '../shared/userData';

export interface AchievementCtx {
  trades: TradeRow[];
  runs: RunRow[];
  drills: DrillRow[];
  /** Simple counters kept outside runs (tutorial done, Pad tier...). */
  flags: Record<string, number>;
}

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  bonus: number;
  hidden?: boolean;
  progress: (c: AchievementCtx) => { have: number; need: number };
}

type RunStatsLike = {
  cartTriggers?: Record<string, number>;
  maxStress?: number;
  stopDeclines?: number;
  burnouts?: number;
  skips?: number;
  reviewsPassed?: string[];
  maxMult?: number;
  maxPoints?: number;
  maxCartridges?: number;
  maxAnalysts?: number;
  ladderBest?: number;
  clientsFilled?: number;
  wheel?: number;
  duoOwned?: boolean;
  parachuteSaves?: number;
  year?: number;
};

const statsOf = (r: RunRow): RunStatsLike => (r.data as { stats?: RunStatsLike } | undefined)?.stats ?? {};
const scored = (c: AchievementCtx) => c.trades.filter((t) => t.mode !== 'sandbox');
const won = (r: RunRow) => r.result === 'victory';
const finished = (r: RunRow) => r.result === 'victory' || r.result === 'survived';
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const count = (have: number, need: number) => ({ have: Math.min(have, need), need });
const flag = (b: boolean) => ({ have: b ? 1 : 0, need: 1 });
const data = (t: TradeRow) => (t.data ?? {}) as Record<string, unknown>;

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---------------- trading habits ----------------
  {
    id: 'first_blood',
    name: 'First Blood',
    text: 'Close a profitable trade in a scored mode.',
    bonus: 5,
    progress: (c) => flag(scored(c).some((t) => t.realizedCents > 0)),
  },
  {
    id: 'fifty_club',
    name: 'Fifty-Percent Club',
    text: 'Close 50 spreads at 50%+ of max profit before expiration.',
    bonus: 25,
    progress: (c) =>
      count(
        scored(c).filter(
          (t) => Number(data(t).pctMax ?? 0) >= 0.5 && t.exitReason !== 'expired' && t.realizedCents > 0,
        ).length,
        50,
      ),
  },
  {
    id: 'crush_ten',
    name: 'Crush Season',
    text: 'Profit from 10 IV crushes.',
    bonus: 20,
    progress: (c) => count(scored(c).filter((t) => data(t).ivCrushWin === true).length, 10),
  },
  {
    id: 'stop_taker',
    name: 'Stop Taker',
    text: 'Take 25 planned stops.',
    bonus: 25,
    progress: (c) => count(scored(c).filter((t) => t.exitReason === 'stop').length, 25),
  },
  {
    id: 'century',
    name: 'Century',
    text: 'Close 100 trades in scored modes.',
    bonus: 15,
    progress: (c) => count(scored(c).length, 100),
  },
  {
    id: 'called_it',
    name: 'Called It',
    text: 'Make an exact call at 90% confidence.',
    bonus: 10,
    progress: (c) =>
      flag(
        scored(c).some(
          (t) =>
            t.callConf !== null &&
            t.callConf >= 0.9 &&
            t.callBucket !== null &&
            t.callBucket === t.callActual,
        ),
      ),
  },
  {
    id: 'calibrated',
    name: 'Calibrated',
    text: 'Hold a calibration grade of A (Brier 0.60 or better) over 100 calls.',
    bonus: 40,
    progress: (c) => {
      const b = scored(c)
        .map((t) => t.brier)
        .filter((x): x is number => x !== null);
      if (b.length < 100) return { have: b.length, need: 100 };
      const last = b.slice(-100);
      return flag(sum(last) / last.length <= 0.6);
    },
  },
  {
    id: 'edge_lord',
    name: 'Edge Lord',
    text: '10 trades priced in the top 10% of their chain (Edge Rank).',
    bonus: 15,
    progress: (c) => count(scored(c).filter((t) => Number(data(t).edge ?? 0) >= 0.9).length, 10),
  },
  {
    id: 'good_process',
    name: 'Good Trade, Bad Luck',
    text: 'Take a loss with an A process grade.',
    bonus: 10,
    progress: (c) => flag(scored(c).some((t) => t.realizedCents < 0 && t.grade === 'A')),
  },
  {
    id: 'clean_ten',
    name: 'Clean Sheet',
    text: '10 trades in a row with no mistake tags.',
    bonus: 20,
    progress: (c) => count(maxRun(scored(c).map((t) => t.tags.length === 0)), 10),
  },
  {
    id: 'sandbox_scholar',
    name: 'Sandbox Scholar',
    text: 'Close 20 trades in Sandbox studying history.',
    bonus: 5,
    progress: (c) => count(c.trades.filter((t) => t.mode === 'sandbox').length, 20),
  },

  // ---------------- runs ----------------
  {
    id: 'first_victory',
    name: 'Made the Year',
    text: 'Win a Career run.',
    bonus: 30,
    progress: (c) => flag(c.runs.some(won)),
  },
  {
    id: 'alpha_hunter',
    name: 'Alpha Hunter',
    text: 'Beat SPY in 5 runs.',
    bonus: 40,
    progress: (c) => count(c.runs.filter((r) => r.alphaCents > 0 && finished(r)).length, 5),
  },
  {
    id: 'survivor',
    name: 'Why Not SPY?',
    text: 'Survive a year without beating SPY. The board has questions.',
    bonus: 10,
    progress: (c) => flag(c.runs.some((r) => r.result === 'survived')),
  },
  {
    id: 'desk_verticals',
    name: 'Verticals Veteran',
    text: 'Win a run on the Verticals desk.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.desk === 'verticals')),
  },
  {
    id: 'desk_income',
    name: 'Income Investor',
    text: 'Win a run on the Income desk.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.desk === 'income')),
  },
  {
    id: 'desk_condor',
    name: 'Range Bound',
    text: 'Win a run on the Condor desk.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.desk === 'condor')),
  },
  {
    id: 'desk_volatility',
    name: 'Vol Hunter',
    text: 'Win a run on the Volatility desk.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.desk === 'volatility')),
  },
  {
    id: 'desk_calendar',
    name: 'Time Lord',
    text: 'Win a run on the Calendar desk.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.desk === 'calendar')),
  },
  {
    id: 'every_desk',
    name: 'Every Desk',
    text: 'Win a run on each of the five desks.',
    bonus: 75,
    progress: (c) => count(new Set(c.runs.filter(won).map((r) => r.desk)).size, 5),
  },
  {
    id: 'tier_four',
    name: 'Climbing',
    text: 'Win at Risk Tier 4 or higher.',
    bonus: 40,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.tier >= 4)),
  },
  {
    id: 'tier_eight',
    name: 'The Top Floor',
    text: 'Win at Risk Tier 8.',
    bonus: 100,
    progress: (c) => flag(c.runs.some((r) => won(r) && r.tier >= 8)),
  },
  {
    id: 'zen',
    name: 'Zen Desk',
    text: 'Finish a year with stress never above 30.',
    bonus: 25,
    progress: (c) => flag(c.runs.some((r) => finished(r) && (statsOf(r).maxStress ?? 100) <= 30)),
  },
  {
    id: 'no_override',
    name: 'By the Book',
    text: 'Finish a year without declining a single stop.',
    bonus: 30,
    progress: (c) => flag(c.runs.some((r) => finished(r) && (statsOf(r).stopDeclines ?? 1) === 0)),
  },
  {
    id: 'burnout',
    name: 'Crispy',
    text: 'Hit burnout. It happens to the ones who care.',
    bonus: 5,
    hidden: true,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).burnouts ?? 0) > 0)),
  },
  {
    id: 'patient',
    name: 'Patience Pays',
    text: 'Skip 10 rounds across your career.',
    bonus: 10,
    progress: (c) => count(sum(c.runs.map((r) => statsOf(r).skips ?? 0)), 10),
  },
  {
    id: 'reviewer',
    name: 'Survived Every Review',
    text: 'Pass all 10 kinds of Review.',
    bonus: 60,
    progress: (c) => count(new Set(c.runs.flatMap((r) => statsOf(r).reviewsPassed ?? [])).size, 10),
  },
  {
    id: 'gauntlet',
    name: 'Earnings Gauntlet',
    text: 'Pass the Earnings Gauntlet Review.',
    bonus: 15,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).reviewsPassed ?? []).includes('earnings_gauntlet'))),
  },
  {
    id: 'big_mult',
    name: 'Combo Engine',
    text: 'Score a single trade at x10 mult or more.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).maxMult ?? 0) >= 10)),
  },
  {
    id: 'big_score',
    name: 'Receipt Printer',
    text: 'Score 20,000+ points on a single trade.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).maxPoints ?? 0) >= 2000)),
  },
  {
    id: 'career_points',
    name: 'Six Figures (of Points)',
    text: 'Score 1,000,000 points across your career.',
    bonus: 50,
    progress: (c) => count(Math.max(0, sum(c.runs.map((r) => r.score))), 100_000),
  },
  {
    id: 'full_rack',
    name: 'Full Rack',
    text: 'Hold five cartridges at once.',
    bonus: 10,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).maxCartridges ?? 0) >= 5)),
  },
  {
    id: 'duo',
    name: 'Better Together',
    text: 'Own a duo Legendary.',
    bonus: 25,
    progress: (c) => flag(c.runs.some((r) => statsOf(r).duoOwned === true)),
  },
  {
    id: 'research_team',
    name: 'Research Team',
    text: 'Employ three analysts at once.',
    bonus: 15,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).maxAnalysts ?? 0) >= 3)),
  },
  {
    id: 'ladder',
    name: 'Ladder to Heaven',
    text: 'Reach a 5-win Ladder Up streak.',
    bonus: 20,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).ladderBest ?? 0) >= 5)),
  },
  {
    id: 'pin_master',
    name: 'Pinned',
    text: 'Trigger Pin Master.',
    bonus: 30,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).cartTriggers?.pin_master ?? 0) > 0)),
  },
  {
    id: 'the_wheel',
    name: 'Round and Round',
    text: 'Complete the wheel: a put assigned, then a covered call closed for a profit.',
    bonus: 25,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).wheel ?? 0) > 0)),
  },
  {
    id: 'parachute',
    name: 'Golden Handshake',
    text: 'Survive a lost round with the Golden Parachute.',
    bonus: 15,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).parachuteSaves ?? 0) > 0)),
  },
  {
    id: 'client_list',
    name: 'Client List',
    text: 'Fill 10 client requests.',
    bonus: 20,
    progress: (c) => count(sum(c.runs.map((r) => statsOf(r).clientsFilled ?? 0)), 10),
  },

  // ---------------- drills ----------------
  {
    id: 'drill_ten',
    name: 'Practice Makes',
    text: 'Finish 10 drill sessions.',
    bonus: 10,
    progress: (c) => count(c.drills.length, 10),
  },
  {
    id: 'streak_ten',
    name: 'Hot Hand',
    text: 'A 10-answer streak in one drill session.',
    bonus: 15,
    progress: (c) =>
      flag(
        c.drills.some(
          (d) => Number((d.detail as { summary?: { bestStreak?: number } }).summary?.bestStreak ?? 0) >= 10,
        ),
      ),
  },
  {
    id: 'greeks_ace',
    name: 'Greeks Ace',
    text: 'Answer 25 Greeks Speed Round questions correctly.',
    bonus: 15,
    progress: (c) => count(drillResults(c).filter((r) => r.kind === 'greeks' && r.correct).length, 25),
  },

  // ---------------- modes that come later ----------------
  {
    id: 'endless_two',
    name: 'Tenured',
    text: 'Reach Year 2 in Endless.',
    bonus: 30,
    progress: (c) => flag(c.runs.some((r) => (statsOf(r).year ?? 1) >= 2)),
  },
  {
    id: 'daily_five',
    name: 'Daily Habit',
    text: 'Finish 5 Daily runs.',
    bonus: 15,
    progress: (c) => count(c.runs.filter((r) => r.mode === 'daily').length, 5),
  },
  {
    id: 'live_trader',
    name: 'Live From the Close',
    text: 'Close a paper trade in Live mode.',
    bonus: 10,
    progress: (c) => flag(c.trades.some((t) => t.mode === 'live')),
  },
  {
    id: 'pad_upgrade',
    name: 'Moving Up',
    text: 'Upgrade The Pad past the Studio.',
    bonus: 10,
    progress: (c) => flag((c.flags.padTier ?? 0) >= 1),
  },
  {
    id: 'tutorial',
    name: "Ines's Student",
    text: 'Finish the tutorial with Ines.',
    bonus: 10,
    progress: (c) => flag((c.flags.tutorialDone ?? 0) > 0),
  },
];

function maxRun(xs: boolean[]): number {
  let best = 0;
  let cur = 0;
  for (const x of xs) {
    cur = x ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

function drillResults(c: AchievementCtx): { kind: string; correct: boolean }[] {
  return c.drills.flatMap(
    (d) => (d.detail as { results?: { kind: string; correct: boolean }[] }).results ?? [],
  );
}

export function evaluateAchievements(
  ctx: AchievementCtx,
): { def: AchievementDef; have: number; need: number; done: boolean }[] {
  // Practice runs (the tutorial, test runs) never count toward achievements.
  const c = { ...ctx, runs: ctx.runs.filter((r) => r.mode !== 'practice') };
  return ACHIEVEMENTS.map((def) => {
    const p = def.progress(c);
    return { def, have: p.have, need: p.need, done: p.have >= p.need };
  });
}
