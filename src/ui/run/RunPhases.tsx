import { motion, useAnimationControls } from 'motion/react';
import { burstAt, fx } from '../../fx/overlay';
import { ArtIcon, artUrl } from '../art';
import { useEffect, useMemo, useState } from 'react';
import { REVIEWS } from '../../content/reviews';
import { BOSSES } from '../../content/bosses';
import { STYLE_TEXT } from '../../engine/run/style';
import { BALANCE } from '../../content/balance';
import { ROUND_NAMES, quarterLabel, type RunEngine } from '../../engine/run/engine';
import type { TradeTally } from '../../engine/run/types';
import type { TraceRow } from '../../engine/scoring/mult';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { CountUp, Kbd, Meter, Pnl, Stamp } from '../components/ui';
import { money } from '../format';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useRun, type DailyGhost } from '../store/run';
import { DebriefStrip } from '../trading/Debrief';
import './run.css';

export { ShopView } from './Shop';

function opText(t: TraceRow): string {
  const v = Math.round(t.value * 100) / 100;
  switch (t.op) {
    case 'chips':
      return `${v >= 0 ? '+' : ''}${Math.round(v)} chips`;
    case 'chipsMul':
      return `×${v} chips`;
    case 'add':
      return `${v >= 0 ? '+' : ''}${v} mult`;
    case 'mul':
      return `×${v} mult`;
    case 'meter':
      return `meter ×${v}`;
  }
}

function Receipt({ t, shown, index }: { t: TradeTally; shown: number; index: number }) {
  const rows = t.trace.slice(0, Math.max(0, shown));
  const done = shown > t.trace.length;
  const last = rows[rows.length - 1];
  return (
    <motion.div
      className={`tally-rc ${t.winner ? 'win' : 'loss'}`}
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      data-testid={`tally-receipt-${index}`}
    >
      <div className="rc-head">
        <b>{t.displaySymbol}</b> {STRUCTURES[t.structureId].short} <Pnl cents={t.realizedCents} />
      </div>
      <div className="rc-rows num">
        {rows.map((r, i) => (
          <motion.div
            key={i}
            className={`rc-row op-${r.op}`}
            initial={{ x: -12, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <span>{r.label}</span>
            <span>{opText(r)}</span>
          </motion.div>
        ))}
      </div>
      <div className="rc-foot num">
        <span className="chips-text">{Math.round(last?.chips ?? 0)}</span> ×{' '}
        <span className="mult-text">{(last?.mult ?? 1).toFixed(2)}</span>
        {done && (
          <motion.b
            className={t.points >= 0 ? 'up-text' : 'down-text'}
            initial={{ scale: 2 }}
            animate={{ scale: 1 }}
          >
            {' '}
            = {t.points >= 0 ? '+' : ''}
            {t.points.toLocaleString()}
          </motion.b>
        )}
      </div>
    </motion.div>
  );
}

export function TallyView({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const shakeOn = useApp((s) => s.settings.display.shake);
  const shake = useAnimationControls();
  const r = e.state.round;
  const tallies = r.tallies;
  const totalSteps = tallies.reduce((a, t) => a + t.trace.length + 1, 0);
  const [step, setStep] = useState(reduced ? totalSteps : 0);
  useEffect(() => {
    if (step >= totalSteps) return;
    const id = setTimeout(() => {
      setStep((s) => s + 1);
    }, 260);
    return () => clearTimeout(id);
  }, [step, totalSteps]);
  // Which receipt and row does the current step point at?
  const shownFor = useMemo(() => {
    let left = step;
    return tallies.map((t) => {
      const n = Math.min(left, t.trace.length + 1);
      left -= n;
      return n;
    });
  }, [step, tallies]);
  useEffect(() => {
    if (step === 0 || reduced) return;
    let left = step - 1;
    for (const t of tallies) {
      if (left < t.trace.length + 1) {
        if (left === t.trace.length) {
          sfx(t.points >= 0 ? 'coin' : 'loss');
          // Juice: coins for a winner, embers for a loser, and a shake for a hit bigger than the target.
          const el = document.querySelector(`[data-testid="tally-receipt-${tallies.indexOf(t)}"]`);
          burstAt(
            el,
            t.points >= 0 ? 'coins' : 'embers',
            t.points >= 0 ? 18 + Math.min(40, Math.round(t.points / 50)) : 24,
          );
          if (t.points >= r.target && shakeOn)
            void shake.start({
              x: [0, -9, 8, -5, 3, 0],
              y: [0, 4, -3, 2, 0, 0],
              transition: { duration: 0.35 },
            });
        } else {
          const row = t.trace[left];
          sfx(row.op === 'chips' ? 'tick' : 'multPop', 0.8 + Math.min(0.9, left * 0.06));
        }
        break;
      }
      left -= t.trace.length + 1;
    }
  }, [step]);
  const finished = step >= totalSteps;
  // The meter starts at what carried in from last round and ends with the green/red-round change.
  const meterNow =
    (r.carriedIn ?? 0) +
    tallies.reduce((a, t, i) => a + (shownFor[i] > t.trace.length ? t.points : 0), 0) +
    (finished ? (r.greenBonus ?? 0) : 0);
  useHotkeys({ confirm: () => (finished ? void act({ t: 'finishTally' }) : setStep(totalSteps)) });
  useEffect(() => {
    if (!finished) return;
    if (!reduced) sfx(r.status === 'passed' ? 'win' : 'stop');
    const meter = document.querySelector('[data-testid="tally-meter"]');
    if (r.status === 'passed') burstAt(meter, 'confetti');
    else burstAt(meter, 'embers', 40);
  }, [finished]);
  return (
    <motion.div className="screen run-tally" data-testid="tally-screen" animate={shake}>
      <div className="tally-head">
        <h1 className="screen-title">
          {quarterLabel(e.state.quarter)} {ROUND_NAMES[r.index].toUpperCase()} · TALLY
        </h1>
        <div className="tally-meter">
          <Meter
            value={Math.max(0, meterNow)}
            max={r.target}
            tone={meterNow >= r.target ? 'cyan' : 'magenta'}
            label={
              <>
                {<CountUp value={meterNow} />} / {r.target.toLocaleString()}
              </>
            }
            testId="tally-meter"
          />
        </div>
        {finished && (
          <div className="tally-stamp">
            <Stamp
              text={r.breached ? 'LIQUIDATED' : r.status === 'passed' ? 'TARGET MET' : 'TARGET MISSED'}
              tone={r.status === 'passed' ? 'good' : 'bad'}
            />
          </div>
        )}
      </div>
      {tallies.length === 0 && <p className="dim">No trades closed this round.</p>}
      <div className="tally-rcs">
        {tallies.map((t, i) => (
          <Receipt key={t.positionId} t={t} shown={shownFor[i]} index={i} />
        ))}
      </div>
      {finished && (
        <>
          {/* One thing at a time: the verdict, then why, then the trade-by-trade detail. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 0.5, duration: 0.35 }}
          >
            <RoundWhy e={e} />
          </motion.div>
          {r.debriefs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 1.2, duration: 0.35 }}
            >
              <DebriefStrip debriefs={r.debriefs} blind />
            </motion.div>
          )}
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => void act({ t: 'finishTally' })}
              data-testid="tally-continue"
            >
              CONTINUE <Kbd>Enter</Kbd>
            </button>
          </div>
        </>
      )}
      {!finished && (
        <button className="pixel-btn" onClick={() => setStep(totalSteps)} data-testid="tally-skip">
          SKIP ANIMATION <Kbd>Enter</Kbd>
        </button>
      )}
    </motion.div>
  );
}

/**
 * Why the round scored what it did, in money first and points second: what the trades made and
 * lost, what the build added, what the losses cost, and the round's green/red and carry-over.
 */
function RoundWhy({ e }: { e: RunEngine }) {
  const r = e.state.round;
  const wins = r.tallies.filter((t) => t.winner);
  const losses = r.tallies.filter((t) => !t.winner);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const made = sum(wins.map((t) => t.realizedCents));
  const lost = sum(losses.map((t) => t.realizedCents));
  const net = r.realizedCents ?? made + lost;
  const winPts = sum(wins.map((t) => t.points));
  const lossPts = sum(losses.map((t) => t.points));
  const avgMult = wins.length ? sum(wins.map((t) => t.mult)) / wins.length : 0;
  const passed = r.status === 'passed';
  const verdict =
    passed && net < 0
      ? "You passed while losing money: your build's multipliers on the winners outweighed the losses. The red round cost you, and the Max-Loss Line doesn't care about points."
      : !passed && net > 0
        ? 'You made money, but not enough points: bigger winners, more of them, or a build that multiplies them.'
        : passed
          ? 'Points and money agree: a good round.'
          : r.breached
            ? 'The account crossed the Max-Loss Line: the risk desk closed everything.'
            : 'Points and money agree: a round to learn from. The debrief below shows where it went.';
  if (!r.tallies.length && !r.carriedIn) return null;
  return (
    <div className="panel round-why num" data-testid="tally-why">
      <div className="section-title">Why this score</div>
      <div className="rw-grid">
        <div>
          <span className="dim">MONEY</span>{' '}
          {wins.length > 0 && (
            <span className="up-text">
              ▲ {money(made)} on {wins.length} winner{wins.length > 1 ? 's' : ''}
            </span>
          )}
          {wins.length > 0 && losses.length > 0 && ' · '}
          {losses.length > 0 && (
            <span className="down-text">
              ▼ {money(-lost)} on {losses.length} loser{losses.length > 1 ? 's' : ''}
            </span>
          )}{' '}
          · round <Pnl cents={net} />
        </div>
        <div>
          <span className="dim">POINTS</span>{' '}
          {wins.length > 0 && (
            <span className="up-text">
              winners +{winPts.toLocaleString()} (your build: ×{avgMult.toFixed(1)} on average)
            </span>
          )}
          {wins.length > 0 && losses.length > 0 && ' · '}
          {losses.length > 0 && (
            <span className="down-text">losers {lossPts.toLocaleString()} (losses count in full)</span>
          )}
          {!!r.greenBonus && (
            <span className={r.greenBonus > 0 ? 'up-text' : 'down-text'}>
              {' '}
              · {r.greenBonus > 0 ? `green round +${r.greenBonus}` : `red round ${r.greenBonus}`}
            </span>
          )}
          {!!r.carriedIn && <span className="cyan-text"> · carried in +{r.carriedIn}</span>}
        </div>
        <div className="rw-verdict">{verdict}</div>
      </div>
    </div>
  );
}

function Typed({ text }: { text: string }) {
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + 3)), 18);
    return () => clearTimeout(id);
  }, [n, text]);
  return <span>{text.slice(0, n)}</span>;
}

/**
 * A boss's case file: who it is, which pillar it plays on, the market it brings (with its logo),
 * its one twist and what it takes away, then the target. Full screen, in the boss's colors.
 */
function BossCaseFile({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  const st = e.state;
  const boss = BOSSES[st.round.bossId!];
  const market = REVIEWS[boss.market];
  const accept = () => (sfx('stamp'), void act({ t: 'startReview' }));
  return (
    <div className="screen run-review boss-file" data-testid="review-intro" data-boss-file={boss.id}>
      <motion.div
        className="bf-card panel"
        initial={{ scale: 1.15, opacity: 0, rotate: -1.5 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <div className="bf-top num">
          <span>CASE FILE · {quarterLabel(st.quarter)} REVIEW</span>
          <span className="bf-pillar">
            PILLAR {boss.pillar} · {boss.pillarName.toUpperCase()}
          </span>
        </div>
        <div className="bf-head">
          <div className="bf-emblem" data-tip={`review:${boss.market}`}>
            <ArtIcon category="review" id={boss.market} name={market.name} scale={1.5} />
          </div>
          <div>
            <h1 className="bf-name" data-testid="boss-name">
              {boss.name.toUpperCase()}
            </h1>
            <div className="bf-person num">
              {boss.person} · {boss.role}
            </div>
            <p className="bf-intro">
              “<Typed text={boss.intro} />”
            </p>
          </div>
        </div>
        <div className="bf-rows">
          <div className="bf-row twist">
            <span className="bf-k num">THE TWIST</span>
            <span className="bf-v" data-testid="boss-twist">
              {boss.twistText}
            </span>
          </div>
          <div className="bf-row blocked">
            <span className="bf-k num">🔒 BLOCKED</span>
            <span className="bf-v">{boss.blocks}</span>
          </div>
          <div className="bf-row">
            <span className="bf-k num">MARKET</span>
            <span className="bf-v">
              {market.name}: {market.filterText}
            </span>
          </div>
          <div className="bf-row">
            <span className="bf-k num">TARGET</span>
            <span className="bf-v num">{st.round.target.toLocaleString()} points</span>
          </div>
          <div className="bf-row style" data-testid="boss-style-row">
            <span className="bf-k num">★ STYLE</span>
            <span className="bf-v">
              {STYLE_TEXT[boss.style]}: <span className="amber-text">+${BALANCE.run.styleCash}</span>
            </span>
          </div>
        </div>
        {BALANCE.run.bossFailEndsRun && (
          <div className="bf-warn num">
            Miss the target and the run ends.
            {boss.twist.kind === 'variety' ? ' Miss the second goal and it ends too.' : ''}
            {boss.twist.kind === 'annual' ? ' Trail SPY and you only survive.' : ''}
          </div>
        )}
        <button className="pixel-btn primary bf-go" onClick={accept} data-testid="review-accept">
          TAKE THE REVIEW <Kbd>Enter</Kbd>
        </button>
      </motion.div>
    </div>
  );
}

export function ReviewIntro({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  const st = e.state;
  const id = st.nextReview;
  useHotkeys({ confirm: () => void act({ t: 'startReview' }) });
  if (!id) return null;
  if (st.round.bossId) return <BossCaseFile e={e} />;
  const rv = REVIEWS[id];
  return (
    <div className="screen run-review" data-testid="review-intro">
      <div className="comply panel">
        {artUrl('review', id) ? (
          <ArtIcon category="review" id={id} name={rv.name} scale={2} />
        ) : (
          <div className="comply-face" aria-hidden="true">
            <div className="eye" />
            <div className="eye" />
            <div className="mouth" />
          </div>
        )}
        <div className="comply-body">
          <div className="dim num">COMPLY-3000 // QUARTER-END REVIEW // {quarterLabel(st.quarter)}</div>
          <h1 className="screen-title">{rv.name.toUpperCase()}</h1>
          <p className="comply-text num">
            <Typed text={rv.announce} />
          </p>
          <div className="review-facts num">
            <div>
              <span className="dim">MARKETS:</span> {rv.filterText}
            </div>
            <div>
              <span className="dim">RULE:</span> {rv.ruleText}
            </div>
            <div>
              <span className="dim">TARGET:</span> {st.round.target.toLocaleString()} points
            </div>
            <div className="dim">Reviews cannot be skipped. Entering one added stress.</div>
          </div>
          <button
            className="pixel-btn primary"
            onClick={() => (sfx('stamp'), void act({ t: 'startReview' }))}
            data-testid="review-accept"
          >
            ACKNOWLEDGE <Kbd>Enter</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

export function RunEnd({
  e,
  onNew,
  newLabel = 'NEW RUN',
  ghost,
}: {
  e: RunEngine;
  onNew: () => void;
  newLabel?: string;
  ghost?: DailyGhost | null;
}) {
  const go = useApp((s) => s.go);
  const home = useApp((s) => s.home);
  const act = useRun((s) => s.act);
  const res = e.state.result;
  const cfg = e.state.config;
  const endless = e.state.endless;
  const canEndless = res?.outcome === 'victory' && cfg.mode === 'career' && !cfg.practice && !endless;
  useEffect(() => {
    sfx(res?.outcome === 'victory' ? 'win' : res?.outcome === 'survived' ? 'coin' : 'loss');
    if (res?.outcome === 'victory') void fx.celebrate();
    else if (res?.outcome === 'survived')
      void fx.burst('confetti', window.innerWidth / 2, window.innerHeight * 0.25, 50);
  }, []);
  if (!res) return null;
  const title = e.state.config.practice
    ? 'PRACTICE COMPLETE'
    : res.outcome === 'victory'
      ? 'VICTORY'
      : res.outcome === 'survived'
        ? 'YOU SURVIVED'
        : res.outcome === 'forfeit'
          ? 'RESIGNED'
          : 'DEFEAT';
  return (
    <div className="screen run-end" data-testid="run-end">
      <h1 className={`screen-title end-title ${res.outcome}`} data-testid="run-end-title">
        {title}
      </h1>
      <p className="end-reason">{res.reason}</p>
      {endless && (
        <p className="end-reason amber-text" data-testid="endless-summary">
          Endless: you reached {yearRound(e.state.history.length - 1)} ({e.state.history.length - 12} rounds
          past the year).
        </p>
      )}
      {ghost && (
        <p
          className={`end-reason ${res.points > ghost.total ? 'up-text' : 'down-text'}`}
          data-testid="ghost-result"
        >
          Bradley scored {ghost.total.toLocaleString()} on this seed.{' '}
          {res.points > ghost.total ? 'You beat his ghost.' : 'His ghost wins today.'}
        </p>
      )}
      <div className="end-stats num">
        <div>
          <span className="dim">Rounds cleared</span> {res.roundsCleared} /{' '}
          {endless ? e.state.history.length : e.state.config.quarters * 3}
        </div>
        <div>
          <span className="dim">Points</span> {res.points.toLocaleString()}
        </div>
        <div>
          <span className="dim">Real P/L</span> <Pnl cents={res.realizedCents} />
        </div>
        <div data-tip="g:alpha">
          <span className="dim">Alpha vs SPY</span> <Pnl cents={res.alphaCents} />
        </div>
        <div data-tip="g:calibration">
          <span className="dim">Calibration</span> <b className="amber-text">{res.calGrade}</b>{' '}
          {res.meanBrier !== null ? `(Brier ${res.meanBrier.toFixed(3)})` : ''}
        </div>
        <div data-tip="g:xp">
          <span className="dim">Career XP</span> +{res.xp}
        </div>
        <div data-tip="g:bonus">
          <span className="dim">Bonus</span> +{res.bonus}
        </div>
      </div>
      <table className="end-rounds num">
        <thead>
          <tr>
            <th>Round</th>
            <th>Target</th>
            <th>Score</th>
            <th>Result</th>
            <th>P/L</th>
          </tr>
        </thead>
        <tbody>
          {e.state.history.map((h, i) => (
            <tr key={i}>
              <td>
                {yearRound(i)} {h.reviewId ? `· ${REVIEWS[h.reviewId].name}` : ''}
              </td>
              <td>{h.target.toLocaleString()}</td>
              <td>{h.meter.toLocaleString()}</td>
              <td
                className={h.status === 'passed' ? 'up-text' : h.status === 'skipped' ? 'dim' : 'down-text'}
              >
                {h.status}
              </td>
              <td>
                <Pnl cents={h.realizedCents} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal-actions">
        {canEndless && (
          <button
            className="pixel-btn primary"
            onClick={() => void act({ t: 'endless' })}
            data-testid="end-endless"
            title="Keep your build and play on. Targets grow x1.8 a quarter. The year's victory is already banked."
          >
            CONTINUE INTO ENDLESS ▶
          </button>
        )}
        <button
          className={`pixel-btn ${canEndless ? '' : 'primary'}`}
          onClick={onNew}
          data-testid="end-new-run"
        >
          {newLabel}
        </button>
        <button className="pixel-btn" onClick={() => go('stats')}>
          STATS
        </button>
        <button className="pixel-btn" onClick={home}>
          TITLE
        </button>
      </div>
      <p className="dim small">Every trade from this run is in Stats (filter: Career).</p>
    </div>
  );
}

/** "Q2 Month 1" in the first year, "Y2 Q1 Review" after that (Endless). */
function yearRound(i: number): string {
  const q = Math.floor(i / 3);
  const y = Math.floor(q / 4) + 1;
  return `${y > 1 ? `Y${y} ` : ''}Q${(q % 4) + 1} ${ROUND_NAMES[i % 3]}`;
}
