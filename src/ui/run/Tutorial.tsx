import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TUTORIAL_PARTS, TUTORIAL_STEPS, type TutEnter } from '../../content/tutorial';
import type { RunEngine } from '../../engine/run/engine';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { Portrait } from '../components/Portrait';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { liveCardId, useTrading } from '../store/trading';
import { PRACTICE_POP, practiceLean, practiceLevel, practicePick } from '../../engine/teach/practice';
import type { OptionLeg, StructureId } from '../../engine/strategies/types';
import {
  TUT_START,
  acknowledge,
  activeLesson,
  freshRegions,
  hiddenRegions,
  lessonText,
  partOf,
  selectorFor,
  settle,
  tutorialCss,
  type ActiveLesson,
  type TutCtx,
  type TutProgress,
} from '../tutorial/flow';
import './tutorial.css';

const FULL_STUDIES = ['bb', 'rsi', 'vol', 'em'] as const;
/** The plan stays off the chart until Ines shows her practice trade. */
const EXAMPLE_STEP = TUTORIAL_STEPS.findIndex((s) => s.id === 'example');
/** Lessons that show the live POP against the 80% a first trade aims for. */
const POP_STEPS = ['pay', 'strike', 'safe', 'place'];
const DELTA_STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** A snapshot of the run for the lesson rules (cheap: read on each render of the coach). */
function contextOf(e: RunEngine, t: ReturnType<typeof useTrading.getState>): TutCtx {
  const st = e.state;
  const r = st.round;
  const s = t.session;
  const phase =
    st.phase === 'victory' || st.phase === 'defeat'
      ? 'end'
      : st.phase === 'tally' || st.phase === 'shop' || st.phase === 'review_intro'
        ? st.phase
        : 'round';
  const open = s ? s.openPositions().length + s.orders.length : 0;
  const bias = STRUCTURES[t.builder.structureId]?.bias;
  const plan = t.plan();
  const short = plan?.legs.find((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0);
  const mark = t.practiceMark;
  const vars: Record<string, string> = {};
  if (short) {
    vars.strike = String(short.strike);
    vars.right = short.right === 'P' ? 'put' : 'call';
  }
  if (plan?.metrics) vars.pop = pctText(plan.metrics.pop);
  if (mark) {
    vars.level = mark.price.toFixed(2);
    vars.kind = mark.kind;
    vars.touches = mark.touches.length > 1 ? `${mark.touches.length} times` : 'its recent turn';
  }
  return {
    phase,
    round: r.index,
    placed: s ? s.positions.length + s.orders.length : 0,
    closed: s ? s.positions.filter((p) => p.status !== 'open').length : 0,
    day: s ? s.dayIndex : 0,
    touched: t.touched,
    recap: !!t.recap && (t.ff === 'paused' || t.ff === 'decision'),
    decision: t.ff === 'decision',
    stress: st.stress,
    canEndRound: !!s && open === 0 && !s.inDay && r.clockStarted && !r.sitOut,
    strikeKey: JSON.stringify([t.builder.delta, t.builder.anchor, t.builder.structureId]),
    side: bias === 'bear' ? 'below' : 'above',
    vars,
  };
}

function runEnter(what: TutEnter | undefined): void {
  const t = useTrading.getState();
  if (what === 'simpleChart') useTrading.setState({ studies: ['vol'], chainOpen: false });
  else if (what === 'emChart') useTrading.setState({ studies: ['vol', 'em'], chainOpen: false });
  else if (what === 'fullChart') useTrading.setState({ studies: [...FULL_STUDIES] });
  else if (what === 'briefTab') t.setRightTab('brief');
  else if (what === 'tradeTab') t.setRightTab('trade');
  else if (what === 'practiceLevel') showPracticeLevel();
  else if (what === 'practiceTrade') showPracticeTrade();
}

/** Mark the floor (or ceiling) the practice trade is built around on the selected card's chart. */
function showPracticeLevel(): void {
  const t = useTrading.getState();
  const cardId = liveCardId(t);
  if (!t.session || !cardId) return;
  const bars = t.session.view(cardId).bars();
  // A cash-secured put is sold under a floor, so on the Income desk Ines always looks for one.
  const income = useRun.getState().engine?.state.config.deskId === 'income';
  const level = practiceLevel(bars, income ? 'up' : practiceLean(bars));
  useTrading.setState({ practiceMark: level ? { ...level, cardId } : null, chainOpen: false });
}

/**
 * Ines's example: the cash-secured put (or, off the Income desk, the credit spread) on the far
 * side of the level, with the most credit that keeps POP near 80%. It only shapes the builder (never placed), and doesn't count as the player
 * touching the trade, so "up or down?" still waits for them.
 */
function showPracticeTrade(): void {
  const t = useTrading.getState();
  const cardId = liveCardId(t);
  if (!t.practiceMark) showPracticeLevel();
  const mark = useTrading.getState().practiceMark;
  const s = t.session;
  const exp = t.builder.expiration;
  if (!s || !cardId || !mark || !exp) return;
  const income = useRun.getState().engine?.state.config.deskId === 'income';
  const sid: StructureId = income ? 'cash_secured_put' : mark.kind === 'floor' ? 'bull_put' : 'bear_call';
  const options = DELTA_STEPS.flatMap((delta) => {
    const p = s.planFor(cardId, sid, { expiration: exp, delta, width: t.builder.width }, 1);
    const sh = p.legs.find((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0);
    return p.ok && p.metrics && sh ? [{ delta, strike: sh.strike, pop: p.metrics.pop }] : [];
  });
  const pick = practicePick(mark, options);
  if (!pick) return;
  useTrading.setState({
    builder: {
      ...t.builder,
      structureId: sid,
      delta: pick.delta,
      legs: null,
      anchor: null,
      callAnchor: null,
    },
  });
}

/** The target's box on screen, re-read a few times a second (things move as the desk lights up). */
function useTargetRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const read = () => {
      let el: Element | null = null;
      try {
        el = document.querySelector(selector);
      } catch {
        el = null;
      }
      const r = el?.getBoundingClientRect() ?? null;
      const next = r && r.width > 2 && r.height > 2 ? r : null;
      setRect((prev) =>
        prev &&
        next &&
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    read();
    const id = window.setInterval(read, 250);
    window.addEventListener('resize', read);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', read);
    };
  }, [selector]);
  return rect;
}

const PAD = 6;
const BUBBLE_W = 380;

/**
 * What a bubble should never sit on if it can help it: the buttons and numbers a lesson is about
 * to ask for, and the readouts the player is watching.
 */
const KEEP_CLEAR = [
  '[data-testid="sell-button"]',
  '[data-testid="setup-sliders"]',
  '[data-testid="goal-card"]',
  '.rtb-score',
  '[data-testid="ff-bar"]',
  '[data-testid="leave-shop"]',
  '[data-testid="tally-continue"]',
  '[data-testid="tally-meter"]',
  '[data-testid="day-recap"]',
  '[data-testid="decision-modal"]',
  '[data-testid="pos-hud"]',
  '.shop-card',
  '.os-taskbar',
];

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Put the bubble next to what it talks about, where it covers the least: never the spotlight if
 * there's any other room, then as little of the key buttons and readouts as possible, then as
 * close to the spotlight as it can get (so the eye doesn't travel far to act on it).
 */
export function bubblePlace(
  rect: DOMRect | null,
  centered: boolean,
  size: { w: number; h: number },
  avoid: Box[] = [],
): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { w, h } = size;
  if (!rect) return centered ? { left: vw / 2 - w / 2, top: vh * 0.3 } : { right: 24, bottom: 24 };
  const gap = PAD + 16;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const raw: { x: number; y: number }[] = [
    { x: rect.right + gap, y: rect.top },
    { x: rect.right + gap, y: cy - h / 2 },
    { x: rect.right + gap, y: rect.bottom - h },
    { x: rect.left - gap - w, y: rect.top },
    { x: rect.left - gap - w, y: cy - h / 2 },
    { x: rect.left - gap - w, y: rect.bottom - h },
    { x: rect.left, y: rect.bottom + gap },
    { x: cx - w / 2, y: rect.bottom + gap },
    { x: rect.right - w, y: rect.bottom + gap },
    { x: rect.left, y: rect.top - gap - h },
    { x: cx - w / 2, y: rect.top - gap - h },
    { x: rect.right - w, y: rect.top - gap - h },
    // Inside a big spotlight (the chart): its older, left side matters least.
    { x: rect.left + 16, y: rect.top + 16 },
    { x: rect.left + 16, y: rect.bottom - h - 16 },
  ];
  const target: Box = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  let best: { x: number; y: number; score: number } | null = null;
  for (const c of raw) {
    const x = Math.max(12, Math.min(vw - w - 12, c.x));
    const y = Math.max(12, Math.min(vh - h - 12, c.y));
    const me: Box = { x, y, w, h };
    const onTarget = overlap(me, target);
    const onKeep = avoid.reduce((a, b) => a + overlap(me, b), 0);
    const dist = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
    const score = onTarget * 4 + onKeep * 2 + dist * 60;
    if (!best || score < best.score) best = { x, y, score };
  }
  return { left: best!.x, top: best!.y };
}

/** The boxes a bubble should keep clear of (minus the spotlight itself, which is scored apart). */
function keepClearBoxes(selector: string | null): Box[] {
  const out: Box[] = [];
  for (const sel of KEEP_CLEAR) {
    let els: NodeListOf<Element>;
    try {
      els = document.querySelectorAll(sel);
    } catch {
      continue;
    }
    els.forEach((el) => {
      if (selector && el.matches(selector)) return;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    });
  }
  return out;
}

/**
 * Ines's lessons. The desk starts almost empty; each lesson puts a spotlight on one thing, says
 * what it's for and lights it up for good. Lessons that only explain wait for GOT IT (Enter);
 * the rest wait for the player to do the thing.
 */
export function TutorialCoach({ e }: { e: RunEngine }) {
  useRun((s) => s.version);
  // Re-read only when something a lesson watches changes (not on every animation frame).
  useTrading((s) =>
    [
      s.version,
      s.ff,
      !!s.recap,
      s.touched,
      s.builder.delta,
      s.builder.anchor,
      s.builder.structureId,
      s.selectedCardId,
      s.session?.dayIndex,
    ].join('|'),
  );
  const t = useTrading.getState();
  const saved = useApp((s) => s.settings.game.tutorialProgress);
  const updateSettings = useApp((s) => s.updateSettings);
  const [prog, setProg] = useState<TutProgress>(saved ?? TUT_START);
  const ctx = contextOf(e, t);
  const lessonKey = useRef<string | null>(null);
  const strikeBase = useRef<string | null>(null);

  // Lessons the player has already done (or that this part of the run has passed) move on.
  const settled = settle(prog, ctx, strikeBase.current);
  useEffect(() => {
    if (settled !== prog) setProg(settled);
  });
  const active: ActiveLesson = activeLesson(settled, ctx);
  const lesson = active?.lesson ?? null;

  // Save where the lessons are, so a resumed tutorial picks up at the same one.
  useEffect(() => {
    updateSettings((st) => ({ ...st, game: { ...st.game, tutorialProgress: prog } }));
  }, [prog]);

  // A new lesson: its sound, its setup, and a fresh baseline for "move the strike".
  useEffect(() => {
    const key = lesson?.id ?? null;
    if (key === lessonKey.current) return;
    lessonKey.current = key;
    strikeBase.current = ctx.strikeKey;
    if (!lesson) return;
    sfx(active?.kind === 'moment' ? 'select' : 'deal');
    if (active?.kind === 'step') runEnter(active.lesson.enter);
  });

  // The chart starts plain (candles and volume) and gets its studies back with the whole desk.
  useEffect(() => {
    if (!prog.skipped && prog.idx < TUTORIAL_STEPS.findIndex((s) => s.id === 'everything'))
      runEnter('simpleChart');
    return () => useTrading.setState({ clockHold: null });
  }, []);

  // The planned trade stays off the chart until Ines shows her practice trade on it.
  const planHidden = !settled.skipped && settled.idx < EXAMPLE_STEP && ctx.placed === 0 && ctx.round === 0;
  useEffect(() => {
    useTrading.setState({ planHidden });
  }, [planHidden]);
  useEffect(() => () => useTrading.setState({ planHidden: false, practiceMark: null }), []);
  // The practice level stays on the chart while the player builds their own; the first trade clears it.
  useEffect(() => {
    if ((ctx.placed > 0 || settled.skipped) && useTrading.getState().practiceMark)
      useTrading.setState({ practiceMark: null });
  }, [ctx.placed, settled.skipped]);

  // The clock stays locked while a lesson before the first trade is up.
  const hold = active?.kind === 'step' && !!active.lesson.holdClock;
  useEffect(() => {
    useTrading.setState({
      clockHold: hold ? 'One thing at a time: Ines will start the clock with you in a moment.' : null,
    });
  }, [hold]);

  const hidden = hiddenRegions(settled, active);
  const fresh = freshRegions(active);
  const css = useMemo(() => tutorialCss(hidden, fresh), [hidden.join(' '), fresh.join(' ')]);

  const selector = lesson?.target ? selectorFor(lesson.target) : null;
  const rect = useTargetRect(selector);
  const wait = active?.kind === 'step' ? active.lesson.wait : 'next';
  const dim = !!lesson && (lesson.dim ?? (wait !== 'phase' && (!!selector || wait === 'next')));
  // Reading lessons hold the rest of the screen still; doing lessons leave it all clickable.
  const block = dim && (wait === 'next' || wait === 'view');

  const ok = () => {
    sfx('click');
    setProg((p) => acknowledge(settle(p, ctx, strikeBase.current), active));
  };
  const skipAll = () => {
    sfx('whoosh');
    runEnter('fullChart');
    setProg((p) => ({ ...p, skipped: true }));
  };
  const pick = (up: boolean) => {
    void useTrading.getState().setCall(up ? 3 : 1);
    ok();
  };

  useEffect(() => {
    if (!lesson || (wait !== 'next' && wait !== 'strike')) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !ev.repeat && !document.querySelector('.modal-backdrop')) ok();
    };
    // Capture, like the game's hotkeys, which stop Enter from reaching later listeners.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // The bubble's real size, so placement knows what it has to fit.
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(230);
  useEffect(() => {
    const hNow = bubbleRef.current?.offsetHeight;
    if (hNow && Math.abs(hNow - bubbleH) > 4) setBubbleH(hNow);
  });
  const part = partOf(settled);
  const hole = rect
    ? {
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  return (
    <>
      <style data-testid="tutorial-style">{css}</style>
      {dim && (
        <div className={`tut-dim ${hole ? '' : 'full'}`} aria-hidden="true">
          {hole && <div className="tut-hole" style={hole} />}
        </div>
      )}
      {block && hole && <Blockers hole={hole} />}
      {block && !hole && <div className="tut-block" style={{ inset: 0 }} />}
      {!dim && hole && <div className="tut-ring" style={hole} aria-hidden="true" />}
      {lesson?.id === 'strike' && rect && (
        // A hand showing the move: press on the tag and drag it up or down.
        <div
          className="tut-drag"
          style={{ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 }}
          aria-hidden="true"
        >
          <span className="td-hand">☝</span>
          <span className="td-arrows">⇕</span>
        </div>
      )}
      <AnimatePresence mode="wait">
        {lesson && (
          <motion.div
            key={lesson.id}
            className={`tut-bubble panel ${active?.kind === 'moment' ? 'moment' : ''}`}
            ref={bubbleRef}
            style={bubblePlace(rect, !selector && dim, { w: BUBBLE_W, h: bubbleH }, keepClearBoxes(selector))}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            data-testid="tutorial-coach"
            data-step={lesson.id}
            role="dialog"
            aria-live="polite"
          >
            <div className="tut-head">
              <Portrait id="ines" mood="happy" scale={1} />
              <div>
                <div className="tut-kicker num">
                  {active?.kind === 'moment'
                    ? 'INES · SOMETHING NEW'
                    : `INES · PART ${part} OF ${TUTORIAL_PARTS.length} · ${TUTORIAL_PARTS[part - 1].toUpperCase()}`}
                </div>
                <div className="tut-title">{lesson.title}</div>
              </div>
            </div>
            <p className="tut-text">{lessonText(lesson.text, ctx)}</p>
            {POP_STEPS.includes(lesson.id) && <PopAim />}
            <div className="tut-actions">
              {wait === 'view' ? (
                <>
                  <button className="pixel-btn tut-up" onClick={() => pick(true)} data-testid="tut-up">
                    ▲ UP <span className="dim">or flat</span>
                  </button>
                  <button className="pixel-btn tut-down" onClick={() => pick(false)} data-testid="tut-down">
                    ▼ DOWN
                  </button>
                </>
              ) : wait === 'next' ? (
                <button className="pixel-btn primary" onClick={ok} data-testid="tut-next">
                  GOT IT <span className="kbd">Enter</span>
                </button>
              ) : wait === 'strike' ? (
                <button className="pixel-btn" onClick={ok} data-testid="tut-next">
                  KEEP IT <span className="kbd">Enter</span>
                </button>
              ) : (
                <span className="tut-doing num">
                  {wait === 'placed'
                    ? '▶ waiting for SELL'
                    : wait === 'day'
                      ? '▶ waiting for a day to play'
                      : '▶ your move'}
                </span>
              )}
              <button className="tut-skip" onClick={skipAll} data-testid="tut-skip">
                skip lessons
              </button>
            </div>
            <div className="tut-dots" aria-hidden="true">
              {TUTORIAL_PARTS.map((name, i) => (
                <i key={name} className={i + 1 < part ? 'done' : i + 1 === part ? 'now' : ''} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Four clear panes around the spotlight that catch clicks, so only the lit area answers. */
function Blockers({ hole }: { hole: { left: number; top: number; width: number; height: number } }) {
  const r = hole.left + hole.width;
  const b = hole.top + hole.height;
  return (
    <>
      <div className="tut-block" style={{ left: 0, top: 0, right: 0, height: Math.max(0, hole.top) }} />
      <div className="tut-block" style={{ left: 0, top: b, right: 0, bottom: 0 }} />
      <div
        className="tut-block"
        style={{ left: 0, top: hole.top, width: Math.max(0, hole.left), height: hole.height }}
      />
      <div className="tut-block" style={{ left: r, top: hole.top, right: 0, height: hole.height }} />
    </>
  );
}

/**
 * The live POP against the 80% a first trade aims for: a bar with the target marked, and which
 * way to move the line to get there.
 */
function PopAim() {
  useTrading((s) => [s.version, s.builder.delta, s.builder.anchor, s.builder.structureId].join('|'));
  const plan = useTrading.getState().plan();
  const pop = plan?.metrics?.pop;
  if (pop === undefined) return null;
  const near = Math.abs(pop - PRACTICE_POP) <= 0.05;
  const hint = near
    ? '✓ right around 80%'
    : pop < PRACTICE_POP
      ? '▶ move the line further from the price'
      : '◀ move the line closer for more credit';
  return (
    <div className={`tut-pop num ${near ? 'ok' : ''}`} data-testid="tut-pop">
      <span className="tp-k">POP {pctText(pop)}</span>
      <span className="tp-bar">
        <i style={{ width: `${Math.min(100, pop * 100)}%` }} />
        <b style={{ left: `${PRACTICE_POP * 100}%` }} title="aim: 80%" />
      </span>
      <span className="tp-hint">{hint}</span>
    </div>
  );
}
