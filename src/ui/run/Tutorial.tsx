import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TUTORIAL_PARTS, TUTORIAL_STEPS, type TutEnter } from '../../content/tutorial';
import type { RunEngine } from '../../engine/run/engine';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { Portrait } from '../components/Portrait';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
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
const LINE_STEP = TUTORIAL_STEPS.findIndex((s) => s.id === 'line');

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
  };
}

function runEnter(what: TutEnter | undefined): void {
  const t = useTrading.getState();
  if (what === 'simpleChart') useTrading.setState({ studies: ['vol'], chainOpen: false });
  else if (what === 'fullChart') useTrading.setState({ studies: [...FULL_STUDIES] });
  else if (what === 'briefTab') t.setRightTab('brief');
  else if (what === 'tradeTab') t.setRightTab('trade');
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

/** Put the bubble beside the spotlight where there's room: right, left, below, above. */
function bubblePlace(rect: DOMRect | null, centered: boolean): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return centered ? { left: vw / 2 - BUBBLE_W / 2, top: vh * 0.3 } : { right: 24, bottom: 24 };
  const clampTop = (y: number) => Math.max(12, Math.min(vh - 260, y));
  const clampLeft = (x: number) => Math.max(12, Math.min(vw - BUBBLE_W - 12, x));
  if (vw - rect.right > BUBBLE_W + 28) return { left: rect.right + PAD + 16, top: clampTop(rect.top) };
  if (rect.left > BUBBLE_W + 28) return { left: rect.left - PAD - 16 - BUBBLE_W, top: clampTop(rect.top) };
  if (vh - rect.bottom > 240) return { left: clampLeft(rect.left), top: rect.bottom + PAD + 14 };
  if (rect.top > 240) return { left: clampLeft(rect.left), bottom: vh - rect.top + PAD + 14 };
  return { left: clampLeft(rect.left + 24), top: clampTop(rect.top + 24) };
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

  // The planned trade stays off the chart until Ines has explained the chart and asked up or down.
  const planHidden = !settled.skipped && settled.idx < LINE_STEP && ctx.placed === 0 && ctx.round === 0;
  useEffect(() => {
    useTrading.setState({ planHidden });
  }, [planHidden]);
  useEffect(() => () => useTrading.setState({ planHidden: false }), []);

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
      <AnimatePresence mode="wait">
        {lesson && (
          <motion.div
            key={lesson.id}
            className={`tut-bubble panel ${active?.kind === 'moment' ? 'moment' : ''}`}
            style={bubblePlace(rect, !selector && dim)}
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
