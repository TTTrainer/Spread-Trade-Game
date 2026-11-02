/**
 * Runs the tutorial script (src/content/tutorial.ts): which lesson is up, which parts of the screen
 * are still switched off, and when a lesson is done. Pure functions over a small snapshot of the
 * game, so the rules are tested without the screen.
 */

import {
  TUTORIAL_MOMENTS,
  TUTORIAL_STEPS,
  TUT_REGIONS,
  type TutMoment,
  type TutPhase,
  type TutRegion,
  type TutStep,
} from '../../content/tutorial';

/** What the tutorial needs to know about the game right now. */
export interface TutCtx {
  phase: TutPhase;
  round: number;
  /** Trades placed this round (positions and working orders). */
  placed: number;
  /** Trades closed this round. */
  closed: number;
  /** Trading days played this round. */
  day: number;
  /** The player has shaped a trade on the selected card (a direction, a strike, a slider). */
  touched: boolean;
  recap: boolean;
  decision: boolean;
  stress: number;
  canEndRound: boolean;
  /** The builder's strike setting, to notice the player moving it. */
  strikeKey: string;
  /** Which side of the line wins for the trade being built. */
  side: 'above' | 'below';
  /** Words a lesson fills in: {strike}, {right}, {pop}, and the practice trade's {level}, {kind}, {touches}. */
  vars?: Record<string, string>;
}

export interface TutProgress {
  /** Index into TUTORIAL_STEPS of the current lesson. */
  idx: number;
  /** One-time lessons already shown. */
  seen: string[];
  /** The player turned the lessons off: the whole desk is on. */
  skipped: boolean;
}

export const TUT_START: TutProgress = { idx: 0, seen: [], skipped: false };

export type ActiveLesson = { kind: 'step'; lesson: TutStep } | { kind: 'moment'; lesson: TutMoment } | null;

const PHASE_RANK: Record<TutPhase, number> = { review_intro: 0, round: 1, tally: 2, shop: 3, end: 0 };

/** Where the run is, as one comparable number (a Review's intro comes before its round). */
export function stage(phase: TutPhase, round: number): number {
  return phase === 'end' ? 1000 : round * 10 + PHASE_RANK[phase];
}

const stepIndex = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
/** One-time lessons wait until the player has a trade on and has met the clock. */
const MOMENTS_FROM = stepIndex('clock');

function momentLive(m: TutMoment, c: TutCtx): boolean {
  if (c.phase !== 'round') return false;
  switch (m.when) {
    case 'recap':
      return c.recap;
    case 'decision':
      return c.decision;
    case 'closed':
      return c.closed > 0;
    case 'stress':
      return c.stress > 0;
    case 'endRound':
      return c.canEndRound;
  }
}

/**
 * Move past lessons that no longer apply: ones whose part of the run is over, and ones the player
 * already did (picked a direction, placed the trade, played a day, moved the strike since the
 * lesson opened: `strikeBase` is the strike setting at that moment).
 */
export function settle(p: TutProgress, c: TutCtx, strikeBase: string | null): TutProgress {
  if (p.skipped) return p;
  const now = stage(c.phase, c.round);
  let idx = p.idx;
  while (idx < TUTORIAL_STEPS.length) {
    const s = TUTORIAL_STEPS[idx];
    const at = stage(s.at.phase, s.at.round);
    if (at > now) break;
    const done =
      at < now ||
      (s.beforeTrade && c.placed > 0) ||
      (s.wait === 'view' && c.touched) ||
      (s.wait === 'placed' && c.placed > 0) ||
      (s.wait === 'day' && c.day > 0) ||
      (s.wait === 'strike' && idx === p.idx && strikeBase !== null && c.strikeKey !== strikeBase);
    if (!done) break;
    idx++;
  }
  return idx === p.idx ? p : { ...p, idx };
}

/** The lesson on screen: a one-time moment if one just happened, else the script's current step. */
export function activeLesson(p: TutProgress, c: TutCtx): ActiveLesson {
  if (p.skipped) return null;
  if (p.idx >= MOMENTS_FROM)
    for (const m of TUTORIAL_MOMENTS)
      if (!p.seen.includes(m.id) && momentLive(m, c)) return { kind: 'moment', lesson: m };
  const s = TUTORIAL_STEPS[p.idx];
  if (!s || stage(s.at.phase, s.at.round) !== stage(c.phase, c.round)) return null;
  return { kind: 'step', lesson: s };
}

/** GOT IT (or a choice) on the lesson that is up. */
export function acknowledge(p: TutProgress, a: ActiveLesson): TutProgress {
  if (!a) return p;
  if (a.kind === 'moment') return p.seen.includes(a.lesson.id) ? p : { ...p, seen: [...p.seen, a.lesson.id] };
  const i = stepIndex(a.lesson.id);
  return i === p.idx ? { ...p, idx: p.idx + 1 } : p;
}

/** The parts of the screen not introduced yet. */
export function hiddenRegions(p: TutProgress, a: ActiveLesson): TutRegion[] {
  if (p.skipped) return [];
  const on = new Set<string>();
  const add = (r?: readonly string[]) => r?.forEach((x) => on.add(x));
  TUTORIAL_STEPS.slice(0, p.idx + 1).forEach((s) => add(s.reveal));
  for (const m of TUTORIAL_MOMENTS)
    if (p.seen.includes(m.id) || (a?.kind === 'moment' && a.lesson.id === m.id)) add(m.reveal);
  if (on.has('*') || p.idx >= TUTORIAL_STEPS.length) return [];
  return TUT_REGIONS.filter((r) => !on.has(r));
}

/** The regions a lesson's reveal just turned on (they get a short glow). */
export function freshRegions(a: ActiveLesson): TutRegion[] {
  const r = a?.lesson.reveal ?? [];
  return r.includes('*') ? [...TUT_REGIONS] : (r as TutRegion[]);
}

/** Lessons left before the whole desk is on (for the progress dots). */
export function partOf(p: TutProgress): number {
  return TUTORIAL_STEPS[Math.min(p.idx, TUTORIAL_STEPS.length - 1)].part;
}

export function lessonText(text: string, c: Pick<TutCtx, 'side' | 'vars'>): string {
  const vars: Record<string, string> = { ...c.vars, side: c.side };
  // A word with nothing to fill it reads as a plain dash rather than a raw {placeholder}.
  return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '—');
}

/** Where each region lives on screen. A lesson's target is a region name or a CSS selector. */
export const REGION_SELECTORS: Record<TutRegion, string> = {
  goal: '.rtb-meter, [data-testid="goal-card"]',
  maxloss: '.rtb-line',
  stress: '[data-testid="stress"]',
  cash: '.run-topbar [data-testid="cash"]',
  tickets: '[data-testid="tickets"]',
  equity: '.run-topbar [data-tip="g:equity"], .run-topbar .cash-readout',
  clock: '[data-testid="ff-bar"]',
  rail: '[data-testid="cartridge-rail"]',
  lineup: '[data-testid="lineup"]',
  controls: '.run-controls',
  client: '[data-testid="client-card"]',
  memos: '.run-left .memo-list',
  seats: '.analyst-seats',
  center: '.t-center',
  charttabs: '.center-tabs',
  ticker: '.news-ticker',
  right: '.t-right',
  ifwins: '[data-testid="score-preview"]',
  analystdesk: '[data-testid="analyst-desk"]',
  traytabs: '.tray-tabs',
  structures: '[data-testid="structure-cards"]',
  presets: '[data-testid="presets"]',
  view: '.view-chip',
  expires: '[data-testid="slider-exp"]',
  short: '[data-testid="slider-delta"]',
  width: '[data-testid="slider-width"]',
  size: '[data-testid="slider-conviction"], [data-testid="conv-cap"]',
  ordertype: '.ticket > .section-title, .ticket .ticket-grid > .seg, .ticket .limit-box',
  plan: '.ticket .plan-chip',
  sell: '.ticket-buttons, [data-testid="earnings-ack"]',
  'win-log': '[data-testid="win-log"]',
  'win-carts': '[data-testid="win-carts"]',
  'win-build': '[data-testid="win-build"]',
  'win-analysts': '[data-testid="win-analysts"]',
  'win-memos': '[data-testid="win-memos"]',
  'win-pages': '[data-testid="win-pages"]',
  'win-voucher': '[data-testid="win-voucher"]',
  'win-loadout': '[data-testid="win-loadout"]',
};

export function selectorFor(target: string): string {
  return (REGION_SELECTORS as Record<string, string>)[target] ?? target;
}

/** CSS that switches off the regions not introduced yet and gives the new ones a glow. */
export function tutorialCss(hidden: TutRegion[], fresh: TutRegion[]): string {
  const sel = (rs: TutRegion[]) =>
    rs
      .flatMap((r) => REGION_SELECTORS[r].split(',').map((x) => x.trim()))
      .filter(Boolean)
      .join(',\n');
  const parts: string[] = [];
  if (hidden.length) parts.push(`${sel(hidden)} {\n  visibility: hidden !important;\n}`);
  const glow = fresh.filter((r) => !hidden.includes(r));
  if (glow.length) parts.push(`${sel(glow)} {\n  animation: tut-reveal 1.1s ease-out;\n}`);
  return parts.join('\n');
}
