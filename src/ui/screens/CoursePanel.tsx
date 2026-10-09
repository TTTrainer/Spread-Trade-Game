/**
 * LEARN OPTIONS, the Trade Builder's course (src/content/optionsCourse.ts), on the right-hand LEARN
 * tab. Each lesson sets up its trade on the open ticker, says what to look at, and waits for you to
 * do something: play a sold option out on last month's real candles, do one thing with the tools,
 * answer one question, or tick off the coached trade's checklist. Progress is saved, so it picks up
 * where you left it.
 */

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { OPTIONS_COURSE, type CourseLesson } from '../../content/optionsCourse';
import { diffDays } from '../../engine/calendar';
import { frontExpiration } from '../../engine/strategies/metrics';
import { expirationsOf } from '../../engine/strategies/structures';
import type { StructureId } from '../../engine/strategies/types';
import { courseTaskDone, resolveCourseLegs, type CourseState } from '../../engine/teach/course';
import { supportResistance } from '../../engine/market/indicators';
import { practiceLevel } from '../../engine/teach/practice';
import type { OptionLeg } from '../../engine/strategies/types';
import { CourseReplay, type ReplayOutcome } from './CourseReplay';
import { sfx } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { money } from '../format';
import { useApp } from '../store/app';
import { liveCardId, useTrading } from '../store/trading';

const TASK_TEXT: Record<string, string> = {
  strike: 'Move the short strike (the Short Δ slider, or LEGS on the TRADE tab).',
  days: 'Drag DATE under the payoff all the way to expiration.',
  iv: 'Slide IV under the payoff down by 5 points or more.',
  pop: 'Move the short strike until POP reads 75% to 85%.',
};

/** Put the lesson's trade, view and studies on the screen. */
export function applyLesson(l: CourseLesson): void {
  const t = useTrading.getState();
  const s = t.session;
  const cardId = liveCardId(t);
  if (!s || !cardId) return;
  const chain = s.chain(cardId);
  if (!chain) return;
  const now = s.view(cardId).now;
  // About a month out: long enough for time decay and the expected move to show.
  const exps = expirationsOf(chain).filter((e) => diffDays(now, e) >= 7);
  const exp = exps.find((e) => diffDays(now, e) >= 28) ?? exps.at(-1) ?? t.builder.expiration;
  if (l.structure) {
    if (t.builder.structureId !== l.structure) t.setStructure(l.structure);
    t.setBuilder({
      expiration: exp,
      delta: l.delta ?? useTrading.getState().builder.delta,
      legs: null,
      anchor: null,
      callAnchor: null,
      qty: 1,
    });
  } else if (l.legs && exp) {
    const legs = resolveCourseLegs(chain, exp, l.legs);
    const one = legs.length === 1 ? legs[0] : null;
    // A lone option rides on a strategy of the same kind (credit or debit) so it prices the same way.
    const structureId: StructureId = one && one.ratio < 0 ? 'cash_secured_put' : 'long_straddle';
    // The strategy is only a carrier here: its first-time tip ("Long Straddle: …") would mislead.
    useApp.getState().updateSettings((st) => ({
      ...st,
      game: { ...st.game, seenStructures: [...new Set([...(st.game.seenStructures ?? []), structureId])] },
    }));
    useTrading.setState({
      builder: {
        ...useTrading.getState().builder,
        structureId,
        expiration: exp,
        legs,
        anchor: null,
        callAnchor: null,
        qty: 1,
      },
      touched: true,
    });
  }
  if (l.view === 'payoff') t.setPayoffOpen(true);
  else if (l.view === 'chart') {
    t.setPayoffOpen(false);
    t.setChainOpen(false);
  }
  for (const st of l.studies ?? [])
    if (!useTrading.getState().studies.includes(st)) useTrading.getState().toggleStudy(st);
  useTrading.setState({ payoffDays: 0, payoffIv: 0 });
}

/** What the course watches, read from the builder. */
function courseState(): CourseState {
  const t = useTrading.getState();
  const plan = t.plan();
  const front = plan ? frontExpiration(plan.legs) : null;
  const cardId = liveCardId(t);
  const now = t.session && cardId ? t.session.view(cardId).now : null;
  return {
    strikeKey: JSON.stringify(plan?.legs.map((l) => (l.kind === 'option' ? l.strike : 0)) ?? []),
    days: t.payoffDays,
    dte: front && now ? Math.max(0, diffDays(now, front)) : 0,
    ivPts: t.payoffIv,
    pop: plan?.metrics?.pop ?? null,
  };
}

function fill(text: string): string {
  const t = useTrading.getState();
  const plan = t.plan();
  const cardId = liveCardId(t);
  const card = t.session && cardId ? t.session.card(cardId) : null;
  const first = plan?.legs.find((l) => l.kind === 'option');
  const vars: Record<string, string> = {
    symbol: card?.displaySymbol ?? 'the stock',
    strike: first && first.kind === 'option' ? String(first.strike) : '—',
    premium: plan && plan.mid !== null ? money(Math.round(Math.abs(plan.mid) * 100 * plan.qty * 100)) : '—',
    pop: plan?.metrics ? `${Math.round(plan.metrics.pop * 100)}%` : '—',
    be: plan?.metrics?.breakevens.map((b) => b.toFixed(2)).join(' / ') || '—',
  };
  return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '—');
}

/** The coached trade's checklist, read from the trade on today's chart. */
function coachChecks(): { label: string; ok: boolean }[] {
  const t = useTrading.getState();
  const plan = t.plan();
  const cardId = liveCardId(t);
  const view = t.session && cardId ? t.session.view(cardId) : null;
  const bars = view ? view.bars() : [];
  const spot = view ? view.spot() : 0;
  const short = plan?.legs.find((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0);
  const floors = supportResistance(bars)
    .filter((l) => l.kind === 'support' && l.price < spot)
    .map((l) => l.price);
  const floor = floors.length ? Math.max(...floors) : (practiceLevel(bars, 'up')?.price ?? null);
  const st = courseState();
  return [
    { label: 'A cash-secured put', ok: t.builder.structureId === 'cash_secured_put' },
    {
      label: floor ? `Strike under the floor (${floor.toFixed(2)})` : 'Strike under a floor',
      ok: !!short && floor !== null && short.right === 'P' && short.strike < floor,
    },
    { label: '25 to 45 days out', ok: st.dte >= 25 && st.dte <= 45 },
    { label: 'POP 75% to 85%', ok: st.pop !== null && st.pop >= 0.75 && st.pop <= 0.85 },
  ];
}

const MAIN = OPTIONS_COURSE.filter((l) => !l.more).length;

export function CoursePanel() {
  const saved = useApp((s) => s.settings.game.courseProgress);
  const updateSettings = useApp((s) => s.updateSettings);
  // Redraw as the trade, the payoff sliders and the selection change.
  useTrading((s) =>
    [s.version, s.payoffDays, s.payoffIv, s.selectedCardId, JSON.stringify(s.builder)].join('|'),
  );
  const [idx, setIdx] = useState(Math.min(saved?.idx ?? 0, OPTIONS_COURSE.length));
  const [picks, setPicks] = useState<Record<string, number>>({});
  // Where things stood when the lesson opened. State, not a ref: if the player does the task
  // before it is taken, setting it still redraws the ✓.
  const [base, setBase] = useState<CourseState | null>(null);
  // The replay's result, once the month has played out.
  const [played, setPlayed] = useState<ReplayOutcome | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const lesson = OPTIONS_COURSE[idx] ?? null;
  const done = saved?.done ?? [];

  // A new lesson sets up its trade, then remembers where things stood for its task.
  useEffect(() => {
    if (!lesson) return;
    applyLesson(lesson);
    setBase(null);
    setPlayed(null);
    const id = setTimeout(() => setBase(courseState()), 0);
    updateSettings((st) => ({ ...st, game: { ...st.game, courseProgress: { idx, done } } }));
    return () => clearTimeout(id);
  }, [idx]);

  if (!lesson) {
    const right = OPTIONS_COURSE.filter((l) => l.quiz && picks[l.id] === l.quiz.answer).length;
    return (
      <div className="course num" data-testid="course-done">
        <div className="course-kicker">LEARN OPTIONS · DONE</div>
        <h3>Course complete</h3>
        <p>
          From your first cash-secured put to the iron condor, managing the trade and the events that move it.
          {Object.keys(picks).length > 0 &&
            ` You got ${right} of ${OPTIONS_COURSE.filter((l) => l.quiz).length} questions right.`}
        </p>
        <p className="dim">
          Now build your own on the TRADE tab: pick a ticker, read the chart, aim for about 80% POP.
        </p>
        <div className="course-actions">
          <button className="pixel-btn" onClick={() => setIdx(0)} data-testid="course-restart">
            START OVER
          </button>
          <button
            className="pixel-btn primary"
            onClick={() => useTrading.getState().setRightTab('trade')}
            data-testid="course-build"
          >
            BUILD YOUR OWN ▶
          </button>
        </div>
      </div>
    );
  }

  const now = courseState();
  const taskDone = lesson.task ? !!base && courseTaskDone(lesson.task, base, now) : true;
  const pick = picks[lesson.id];
  const answered = pick !== undefined;
  const checks = lesson.checklist ? coachChecks() : [];
  const checked = checks.every((c) => c.ok);
  const ready = lesson.quiz ? answered : taskDone && checked && (!lesson.replay || !!played);
  const t = useTrading.getState();
  const cardId = liveCardId(t);
  const view = t.session && cardId ? t.session.view(cardId) : null;
  const plan = t.plan();
  const short = plan?.legs.find((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0);
  const fixedStrike = lesson.replay?.strike === 'today' && short && view ? short.strike / view.spot() : null;
  const more = !!lesson.more;
  const n = more ? idx - MAIN + 1 : idx + 1;
  const go = (to: number) => {
    sfx(to > idx ? 'deal' : 'click');
    if (to > idx && !done.includes(lesson.id))
      updateSettings((st) => ({
        ...st,
        game: { ...st.game, courseProgress: { idx: to, done: [...done, lesson.id] } },
      }));
    setIdx(Math.max(0, to));
  };
  const answer = (i: number) => {
    if (answered || !lesson.quiz) return;
    const right = i === lesson.quiz.answer;
    sfx(right ? 'coin' : 'error');
    if (right) burstAt(card.current, 'sparkle', 18);
    setPicks((p) => ({ ...p, [lesson.id]: i }));
  };

  return (
    <motion.div
      key={lesson.id}
      ref={card}
      className="course num"
      data-testid="course"
      data-lesson={lesson.id}
      initial={{ x: 18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
    >
      <div className="course-kicker">
        {more
          ? `LEARN OPTIONS · MORE LESSONS · ${n} OF ${OPTIONS_COURSE.length - MAIN}`
          : `LEARN OPTIONS · LESSON ${n} OF ${MAIN}`}
      </div>
      <h3>{lesson.title}</h3>
      <p className="course-text" data-testid="course-text">
        {fill(lesson.text)}
      </p>
      {lesson.task && (
        <div className={`course-task ${taskDone ? 'ok' : ''}`} data-testid="course-task">
          {taskDone ? '✓ ' : '▶ '}
          {TASK_TEXT[lesson.task.kind]}
          {lesson.task.kind === 'pop' && now.pop !== null && <b> Now {Math.round(now.pop * 100)}%.</b>}
        </div>
      )}
      {lesson.checklist && (
        <ul className="course-checks" data-testid="course-checks">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? 'ok' : ''}>
              {c.ok ? '✓' : '▢'} {c.label}
            </li>
          ))}
        </ul>
      )}
      {lesson.replay && view && (
        <CourseReplay
          bars={view.bars()}
          side={lesson.replay.side}
          fixedStrike={lesson.replay.strike === 'today' ? fixedStrike : undefined}
          locked={lesson.replay.strike === 'today' && !checked}
          onDone={(o) => {
            setPlayed(o);
            if (lesson.checklist && o.touchedOn === null) burstAt(card.current, 'confetti', 60);
          }}
        />
      )}
      {lesson.checklist && played && (
        <p className={`course-badge ${played.touchedOn === null ? 'won' : ''}`} data-testid="course-badge">
          {played.touchedOn === null
            ? '★ FIRST TRADE BADGE: your setup kept the whole premium last month.'
            : 'Close one. Try another month, or move the strike further from the price.'}
        </p>
      )}
      {lesson.quiz && (
        <div className="course-quiz" data-testid="course-quiz">
          <div className="cq-q">{lesson.quiz.q}</div>
          {lesson.quiz.options.map((o, i) => (
            <button
              key={o}
              className={`cq-opt ${answered && i === lesson.quiz!.answer ? 'right' : ''} ${answered && i === pick && i !== lesson.quiz!.answer ? 'wrong' : ''}`}
              onClick={() => answer(i)}
              disabled={answered}
              data-testid={`course-opt-${i}`}
            >
              {o}
            </button>
          ))}
          {answered && (
            <p
              className={`cq-why ${pick === lesson.quiz.answer ? 'right' : 'wrong'}`}
              data-testid="course-why"
            >
              {pick === lesson.quiz.answer ? '✓ Right. ' : '✗ Not quite. '}
              {fill(lesson.quiz.why)}
            </p>
          )}
        </div>
      )}
      <div className="course-actions">
        <button
          className="pixel-btn"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          data-testid="course-back"
        >
          ◀ BACK
        </button>
        <button
          className={`pixel-btn key k-next ${ready ? 'nudge' : ''}`}
          onClick={() => go(idx + 1)}
          disabled={!ready}
          data-testid="course-next"
          title={
            ready
              ? ''
              : lesson.quiz
                ? 'Answer the question first.'
                : lesson.replay && !played
                  ? 'Play the month out first.'
                  : 'Do the task first.'
          }
        >
          {idx === OPTIONS_COURSE.length - 1 ? 'FINISH ✓' : 'NEXT ▶'}
        </button>
      </div>
      <div className="course-dots" aria-hidden="true">
        {OPTIONS_COURSE.map((l, i) => (
          <i
            key={l.id}
            className={`${i < idx || done.includes(l.id) ? 'done' : i === idx ? 'now' : ''} ${l.more ? 'more' : ''}`}
          />
        ))}
      </div>
    </motion.div>
  );
}
