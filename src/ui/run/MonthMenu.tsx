/**
 * The month menu, Balatro style, before each Month round: the quarter's three rounds with their
 * targets (the boss card shows who runs the Review and can be rerolled once), your build in firing
 * order, and the run-wide exit plan (where new trades take profit and stop). Enter starts the
 * month; the lineup is already dealt underneath.
 */

import { motion } from 'motion/react';
import { useEffect, type CSSProperties } from 'react';
import { BALANCE } from '../../content/balance';
import { BOSSES } from '../../content/bosses';
import { DESKS } from '../../content/desks';
import { REVIEWS } from '../../content/reviews';
import { ROUND_NAMES, quarterLabel, type RunEngine } from '../../engine/run/engine';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { ArtIcon } from '../art';
import { Kbd } from '../components/ui';
import { SnapSlider } from '../components/SnapSlider';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { CartridgeRail } from './RunParts';

const TARGET_STEPS = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9];
const STOP_STEPS = [1, 1.5, 2, 2.5, 3, 4];
const DEBIT_TARGET_STEPS = [0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1];
const DEBIT_STOP_STEPS = [0.25, 0.35, 0.45, 0.5, 0.6, 0.75];

const nearest = (xs: number[], v: number) =>
  xs.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(xs[b] - v) ? i : b), 0);

/** The menu is up over a freshly dealt Month until it is closed (never in the tutorial). */
export function monthMenuUp(e: RunEngine | null | undefined): boolean {
  return !!e && e.state.phase === 'round' && !e.state.round.boardSeen && e.state.config.mode !== 'tutorial';
}

export function MonthMenu({ e, onExit }: { e: RunEngine; onExit: () => void }) {
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const st = e.state;
  const q = st.quarter;
  const idx = st.roundIndex;
  const start = () => (sfx('whoosh'), void act({ t: 'boardDone' }));
  useHotkeys({ confirm: start });
  // The clock waits for the menu.
  useEffect(() => {
    useTrading.setState({ clockHold: 'Close the month menu first (Enter starts the month).' });
    return () => useTrading.setState({ clockHold: null });
  }, []);
  const bossId = e.knownBoss(q);
  const boss = bossId ? BOSSES[bossId] : null;
  const reroll = e.bossReroll();
  const plan = e.exitPlan();
  const desk = DESKS[st.config.deskId];
  const credit = desk.structures.some((s) => STRUCTURES[s].credit);
  const debit = desk.structures.some((s) => !STRUCTURES[s].credit);
  const past = (i: number) => st.history.find((h) => h.quarter === q && h.index === i);
  const card = (i: number) => {
    const done = past(i);
    const now = i === idx;
    const target = i === idx ? st.round.target : e.upcomingTarget(q, i);
    return (
      <div
        key={i}
        className={`mm-round ${now ? 'now' : ''} ${done ? done.status : ''} ${i === 2 ? 'boss' : ''}`}
        data-testid={`mm-round-${i}`}
        style={
          i === 2 && boss
            ? ({ '--boss-accent': boss.palette.accent, '--boss-tint': boss.palette.tint } as CSSProperties)
            : undefined
        }
      >
        <div className="mm-r-name num">{i === 2 ? 'REVIEW · BOSS' : ROUND_NAMES[i].toUpperCase()}</div>
        {i === 2 && boss ? (
          <div className="mm-boss-row">
            <div className="mm-emblem" data-tip={`review:${boss.market}`}>
              <ArtIcon category="review" id={boss.market} name={REVIEWS[boss.market].name} scale={0.6} />
            </div>
            <div className="mm-boss-text">
              <div className="mm-boss-name" data-testid="mm-boss-name">
                {boss.name}
              </div>
              <div className="mm-boss-twist">{boss.twistText}</div>
            </div>
          </div>
        ) : (
          <div className="mm-r-glyph">{i === 0 ? '◆' : '◆◆'}</div>
        )}
        <div className="mm-r-target num">
          <span className="dim">TARGET</span> <b>{target.toLocaleString()}</b>
        </div>
        <div className="mm-r-pay num dim">
          a win pays <span className="amber-text">${BALANCE.cash.roundWin[i]}</span> + interest
        </div>
        <div className="mm-r-state num">
          {done
            ? done.status === 'passed'
              ? `✔ ${done.meter.toLocaleString()}`
              : '✘ missed'
            : now
              ? '▶ UP NEXT'
              : ''}
        </div>
        {i === 2 && boss && (
          <button
            className="pixel-btn small mm-reroll"
            disabled={'blocked' in reroll}
            onClick={() => (sfx('deal'), void act({ t: 'rerollBoss' }))}
            data-testid="boss-reroll"
            title={'blocked' in reroll ? reroll.blocked : 'Swap this boss for another, once.'}
          >
            ⟳ REROLL BOSS {reroll.cost !== undefined ? `$${reroll.cost}` : ''}
          </button>
        )}
      </div>
    );
  };
  const setPause = (k: 'target_hit' | 'stop_hit', v: boolean) =>
    updateSettings((s) => ({ ...s, game: { ...s.game, pause: { ...s.game.pause, [k]: v } } }));
  return (
    <motion.div
      className="month-menu"
      data-testid="month-menu"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mm-card panel">
        <div className="mm-head">
          <h1 className="screen-title">
            {quarterLabel(q)} · {ROUND_NAMES[idx].toUpperCase()}
          </h1>
          <span className="mm-sub num">
            {desk.name} desk · cash <b className="amber-text">${st.cash}</b>
          </span>
        </div>
        <div className="mm-quarter">{[0, 1, 2].map(card)}</div>
        <div className="mm-cols">
          <section className="mm-build">
            <div className="section-title">Your build · fires left to right</div>
            <CartridgeRail e={e} editable />
          </section>
          <section className="mm-plan" data-testid="mm-plan">
            <div className="section-title">Exit plan · the whole run</div>
            {credit && (
              <>
                <SnapSlider
                  label="Take profit"
                  accent="up"
                  options={TARGET_STEPS.map((v) => ({ value: v, major: v === 0.5, mark: `${v * 100}%` }))}
                  index={nearest(TARGET_STEPS, plan.creditTargetPct)}
                  onIndex={(i) => void act({ t: 'setPlan', plan: { creditTargetPct: TARGET_STEPS[i] } })}
                  readout={`${Math.round(plan.creditTargetPct * 100)}% of credit`}
                  testId="plan-credit-target"
                />
                <SnapSlider
                  label="Stop"
                  accent="magenta"
                  options={STOP_STEPS.map((v) => ({ value: v, major: v === 2, mark: `${v}×` }))}
                  index={nearest(STOP_STEPS, plan.creditStopMult)}
                  onIndex={(i) => void act({ t: 'setPlan', plan: { creditStopMult: STOP_STEPS[i] } })}
                  readout={`lose ${plan.creditStopMult}× credit`}
                  testId="plan-credit-stop"
                />
              </>
            )}
            {debit && (
              <>
                <SnapSlider
                  label="Debit target"
                  accent="up"
                  options={DEBIT_TARGET_STEPS.map((v) => ({ value: v, mark: `${Math.round(v * 100)}%` }))}
                  index={nearest(DEBIT_TARGET_STEPS, plan.debitTargetPct)}
                  onIndex={(i) => void act({ t: 'setPlan', plan: { debitTargetPct: DEBIT_TARGET_STEPS[i] } })}
                  readout={`+${Math.round(plan.debitTargetPct * 100)}% of debit`}
                />
                <SnapSlider
                  label="Debit stop"
                  accent="magenta"
                  options={DEBIT_STOP_STEPS.map((v) => ({ value: v, mark: `${Math.round(v * 100)}%` }))}
                  index={nearest(DEBIT_STOP_STEPS, plan.debitStopPct)}
                  onIndex={(i) => void act({ t: 'setPlan', plan: { debitStopPct: DEBIT_STOP_STEPS[i] } })}
                  readout={`−${Math.round(plan.debitStopPct * 100)}% of debit`}
                />
              </>
            )}
            <label className="mm-toggle num">
              <input
                type="checkbox"
                checked={settings.game.pause.target_hit}
                onChange={(ev) => setPause('target_hit', ev.target.checked)}
              />
              Pause when a profit target is hit (you choose to take it)
            </label>
            <label className="mm-toggle num">
              <input
                type="checkbox"
                checked={settings.game.pause.stop_hit}
                onChange={(ev) => setPause('stop_hit', ev.target.checked)}
              />
              Pause when a stop is hit
            </label>
            <div className="dim small">New trades use this plan; open trades keep theirs.</div>
          </section>
        </div>
        <div className="mm-foot">
          <button className="pixel-btn small" onClick={onExit} data-testid="mm-exit">
            ◀ SAVE &amp; EXIT
          </button>
          <button className="pixel-btn primary mm-go" onClick={start} data-testid="board-play">
            ▶ START {ROUND_NAMES[idx].toUpperCase()} <Kbd>Enter</Kbd>
          </button>
          <span />
        </div>
      </div>
    </motion.div>
  );
}
