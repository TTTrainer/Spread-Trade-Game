import { AnimatePresence, motion } from 'motion/react';
import type { BriefAccess } from '../../engine/news/brief';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { burstAt } from '../../fx/overlay';
import { ArtIcon } from '../art';
import { BALANCE } from '../../content/balance';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { MEMOS, TAGS } from '../../content/items';
import { REVIEWS } from '../../content/reviews';
import type { AnalystId, Family } from '../../content/types';
import { diffDays } from '../../engine/calendar';
import {
  baseRate,
  impliedMoveAfter,
  portfolioRisk,
  skew25,
  termStructure,
} from '../../engine/run/analystTools';
import { ROUND_NAMES, quarterLabel, type RunEngine } from '../../engine/run/engine';
import { complianceMods, heatOf } from '../../content/meta';
import { clientChecks } from '../../engine/run/clients';
import { CLIENT_BY_ID } from '../../content/clients';
import { previewScore } from '../../engine/run/preview';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { Kbd, Meter, Modal, CountUp } from '../components/ui';
import { money, pct, pnlText, signed } from '../format';
import { useHotkeys } from '../hotkeys';
import { useRun } from '../store/run';
import { liveCardId, tradeOpen, useTrading } from '../store/trading';
import { FastForwardBar, type CardBadges } from '../trading/Panels';
import { Sparkline } from '../components/Sparkline';
import { CashReadout } from '../trading/CashDeposit';
import './run.css';
import { BOSSES, type SealedInfo } from '../../content/bosses';
import { LockStamp } from '../trading/BossBanner';
import { usePendingPoints } from '../store/payout';
import { JokerRow } from './JokerRow';

export function familyCounts(e: RunEngine): Record<Family, number> {
  return e.families();
}

function StressLog({ e, onClose }: { e: RunEngine; onClose: () => void }) {
  return (
    <Modal onClose={onClose} testId="stress-log">
      <h2>Stress: {e.state.stress} / 100</h2>
      <p className="dim">
        Every change and its cause. At 100: burnout (one fewer ticket and a silent analyst next round), then
        back to 50.
      </p>
      <div className="stress-list num">
        {e.state.stressLog.length === 0 && <div className="dim">Nothing yet.</div>}
        {e.state.stressLog
          .slice()
          .reverse()
          .map((s, i) => (
            <div key={i} className="stress-row">
              <span className={s.delta > 0 ? 'down-text' : 'up-text'}>
                {s.delta > 0 ? `+${s.delta}` : s.delta}
              </span>
              <span>{s.reason}</span>
              <span className="dim">{s.at}</span>
            </div>
          ))}
      </div>
    </Modal>
  );
}

export function RunTopBar({ e, onMenu }: { e: RunEngine; onMenu: () => void }) {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  useRun((s) => s.version);
  const lastPoints = useRun((s) => s.lastPoints);
  const [stressOpen, setStressOpen] = useState(false);
  const st = e.state;
  const r = st.round;
  // Points still playing out in a payout land on the score when it does.
  const meter = r.meter - usePendingPoints();
  const eq = session ? session.markedEquityCents() : st.equityCents;
  const floor = e.maxLossFloorCents();
  const room = eq - floor;
  const span = Math.max(1, r.startEquityCents - floor);
  const review = r.reviewId ? REVIEWS[r.reviewId] : null;
  // The Controller seals equity and the room above the line (both move with running P/L); the
  // line itself still fires.
  const plSealed = sealedBy(e).pnl;
  return (
    <div className="topbar panel run-topbar" data-testid="run-topbar">
      <div className="rtb-row">
        <button
          className="pixel-btn rtb-exit"
          onClick={onMenu}
          data-testid="run-menu"
          title="Save and return to the title screen"
        >
          ◀ EXIT
        </button>
        <div className={`rtb-round rtb-blind ${review ? 'boss' : ''}`}>
          <span className="rtb-q amber-text">{quarterLabel(st.quarter)}</span>
          <span className="rtb-name">{ROUND_NAMES[r.index].toUpperCase()}</span>
          <span className="rtb-chips">
            {review && (
              <span className="chip magenta" data-tip={`review:${review.id}`} data-testid="boss-chip">
                {(r.bossId ? BOSSES[r.bossId].name : review.name).toUpperCase()}
              </span>
            )}
            <ModeChips e={e} />
            {r.memo.waiver && <span className="chip warn">WAIVER</span>}
          </span>
          <MeterJuice meter={meter} target={r.target} />
        </div>
        {/* The score is the number the round is about, so it's the biggest thing up here. */}
        <div className={`rtb-meter rtb-score ${meter >= r.target ? 'met' : ''}`} data-tip="g:meter">
          <span className="rtb-k">SCORE</span>
          <span className="rtb-score-v num" data-testid="round-meter">
            <b>{meter.toLocaleString()}</b> / {r.target.toLocaleString()}
          </span>
          <Meter value={Math.max(0, meter)} max={r.target} tone={meter >= r.target ? 'cyan' : 'magenta'} />
          <AnimatePresence>
            {lastPoints && (
              <motion.span
                key={lastPoints.n}
                className={`meter-pop num ${lastPoints.points >= 0 ? 'up-text' : 'down-text'}`}
                initial={{ y: 0, opacity: 1, scale: 1.4 }}
                animate={{ y: -26, opacity: 0, scale: 1 }}
                transition={{ duration: 1.4 }}
              >
                {lastPoints.points >= 0 ? '+' : ''}
                {lastPoints.points}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="rtb-tile rtb-cash num" data-testid="cash" data-tip="g:cash">
          <span className="rtb-k">CASH</span>
          <span className="rtb-v amber-text">${st.cash}</span>
        </div>
        <div className="rtb-tile num" data-testid="tickets" data-tip="g:tickets">
          <span className="rtb-k">TICKETS</span>
          <span className="rtb-v">
            {Array.from({ length: r.tickets }, (_, i) => (
              <span key={i} className={i < r.ticketsUsed ? 'tk-pip used' : 'tk-pip'}>
                ■
              </span>
            ))}
          </span>
        </div>
        <div className="rtb-gauges">
          <div
            className="rtb-line"
            data-tip-title="Max-Loss Line"
            data-tip-body={`Equity must stay above ${money(floor)} at every close (${Math.round(r.maxLossLinePct * 100)}% below the round's start). Cross it and the risk desk closes everything and the round fails.`}
          >
            <span className="rtb-k">MAX-LOSS</span>
            {plSealed ? (
              <LockStamp text="ROOM SEALED" by={plSealed} />
            ) : (
              <Meter
                value={room}
                max={span}
                tone={room / span < 0.35 ? 'down' : 'amber'}
                label={r.memo.waiver ? 'waived' : `room ${money(Math.max(0, room))}`}
                testId="maxloss-gauge"
              />
            )}
          </div>
          <button
            className="rtb-stress"
            onClick={() => setStressOpen(true)}
            data-testid="stress"
            data-tip="g:stress"
          >
            <span className="rtb-k">STRESS</span>
            <Meter
              value={st.stress}
              max={100}
              tone={st.stress >= 75 ? 'down' : 'amber'}
              label={`${st.stress}`}
            />
          </button>
        </div>
        <div className="rtb-tile rtb-account num">
          <span className="rtb-k" data-tip="g:equity">
            EQUITY{' '}
            {plSealed ? (
              <b className="rtb-eq sealed-num" data-testid="equity-sealed">
                🔒 SEALED
              </b>
            ) : (
              <b className="rtb-eq">{money(eq)}</b>
            )}
          </span>
          <CashReadout />
        </div>
        <div className="tb-spacer" />
        <FastForwardBar />
      </div>
      <JokerRow e={e} preview />
      {stressOpen && <StressLog e={e} onClose={() => setStressOpen(false)} />}
    </div>
  );
}

/** Lineup badges earned through analysts and cartridges. */
/** Exact earnings dates are an Event-desk edge: the Whisperer, its cartridge, the family or the desk. */
function hasEarningsDetail(e: RunEngine): boolean {
  return (
    e.hasAnalyst('earnings_whisperer') ||
    e.activeCartridges().includes('earnings_whisper') ||
    e.families().EVENT >= 2 ||
    e.state.config.deskId === 'volatility'
  );
}

/** The news brief is free for everyone; its finer detail comes from the same analysts as the badges. */
export function careerBriefAccess(e: RunEngine): BriefAccess {
  const sealed = sealedBy(e);
  return {
    earningsDetail: hasEarningsDetail(e),
    ivDetail: !sealed.ivr && (e.hasAnalyst('quant') || e.hasAnalyst('vol_surfer')),
    ivSealedBy: sealed.ivr ?? undefined,
    studiesSealedBy: sealed.studies ?? undefined,
  };
}

/** Which information this round's boss has sealed, by the boss's name. */
function sealedBy(e: RunEngine): Record<SealedInfo, string | null> {
  const r = e.state.round;
  const hide = e.state.phase === 'round' && r.bossId ? (e.rule().hide ?? []) : [];
  const name = r.bossId ? BOSSES[r.bossId].name : '';
  const of = (w: SealedInfo) => (hide.includes(w) ? name : null);
  return { ivr: of('ivr'), studies: of('studies'), pnl: of('pnl'), dte: of('dte') };
}

export function careerBadges(
  e: RunEngine,
  symbolSector: (sym: string) => string | null,
): (cardId: string) => CardBadges {
  const fam = e.families();
  // IV rank badges go dark while a boss has IV rank sealed.
  const quant = e.hasAnalyst('quant') && !sealedBy(e).ivr;
  const whisper = hasEarningsDetail(e);
  const scout = e.hasAnalyst('scout') || e.state.round.memo.lens;
  const trend = fam.DELTA >= 2;
  return (cardId: string) => {
    const s = useTrading.getState().session;
    if (!s) return { ivr: quant, earnings: whisper };
    const card = s.cards.find((c) => c.id === cardId);
    const ctx = s.context(cardId);
    const extra: ReactNode[] = [];
    if (scout && card) {
      const sec = symbolSector(card.realSymbol);
      if (sec)
        extra.push(
          <span key="sec" className="chip cyan">
            {sec}
          </span>,
        );
    }
    if (trend && ctx.sma50Slope !== null)
      extra.push(
        <span key="tr" className={`chip ${ctx.sma50Slope >= 0 ? 'good' : 'bad'}`}>
          {ctx.sma50Slope >= 0 ? '↗ TREND' : '↘ TREND'}
        </span>,
      );
    if (whisper && ctx.nextEarnings) {
      const chain = s.chain(cardId);
      const im = chain ? impliedMoveAfter(chain, ctx.nextEarnings.reactionDate) : null;
      if (im)
        extra.push(
          <span key="im" className="chip warn">
            EM ±{pct(im.pct, 1)}
          </span>,
        );
    }
    return { ivr: quant, earnings: whisper, extra: extra.length ? <>{extra}</> : undefined };
  };
}

/** Confetti the moment the meter crosses the target during the round. */
function MeterJuice({ meter, target }: { meter: number; target: number }) {
  const was = useRef(meter >= target);
  useEffect(() => {
    const now = meter >= target && target > 0;
    if (now && !was.current) {
      burstAt(document.querySelector('[data-testid="round-meter"]'), 'confetti', 60);
      sfx('win');
    }
    was.current = now;
  }, [meter, target]);
  return null;
}

/** Small badges for the kind of run: Daily (with Bradley's score this round), tutorial, Endless, Tier, Heat. */
function ModeChips({ e }: { e: RunEngine }) {
  const ghost = useRun((s) => s.ghost);
  const cfg = e.state.config;
  const i = e.state.history.length;
  const heat = heatOf(cfg.compliance);
  return (
    <>
      {cfg.mode === 'daily' && <span className="chip warn">DAILY</span>}
      {cfg.mode === 'daily' && ghost && ghost.rounds[i] !== undefined && (
        <span className="chip" title="Bradley's ghost scored this on the same round" data-testid="ghost-chip">
          BRADLEY {ghost.rounds[i].toLocaleString()}
        </span>
      )}
      {cfg.mode === 'tutorial' && <span className="chip good">TUTORIAL</span>}
      {e.state.endless && <span className="chip magenta">ENDLESS</span>}
      {cfg.tier > 0 && <span className="chip">TIER {cfg.tier}</span>}
      {heat > 0 && (
        <span className="chip warn" title="Compliance Rules in force">
          HEAT {heat}
        </span>
      )}
    </>
  );
}

function ClientCard({ e }: { e: RunEngine }) {
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  useTrading((s) => s.version);
  const c = e.state.round.client;
  if (!c) return null;
  const def = CLIENT_BY_ID[c.id];
  const facts =
    plan?.ok && plan.entry
      ? {
          structureId: builder.structureId,
          maxLossCents: plan.entry.maxLossCents,
          pop: plan.entry.pop,
          dte: plan.entry.dte,
          credit: (plan.mid ?? 0) < 0,
          rewardToRisk: plan.entry.rewardToRisk,
          edgeTier: plan.entry.edgeTier,
        }
      : null;
  const checks = clientChecks(def.request, facts, e.state.round.startEquityCents);
  return (
    <div className={`client-card ${c.status}`} data-testid="client-card" data-tip={`client:${c.id}`}>
      <div className="section-title">
        Client{' '}
        {c.status === 'filled' ? (
          <span className="chip good">FILLED</span>
        ) : (
          <span className="chip">+${def.cash}</span>
        )}
      </div>
      <div className="client-who">
        <ArtIcon
          category="client"
          id={c.id}
          name={def.name}
          style={{ width: 32, height: 32, fontSize: 12 }}
        />
        <b className="client-name">{def.name}</b>
      </div>
      <div className="client-ask">{def.ask}</div>
      {c.status === 'open' && (
        <ul className="client-checks num">
          {checks.map((k) => (
            <li key={k.label} className={k.pass ? 'pass' : 'fail'}>
              {k.pass ? '✔' : '✘'} {k.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The round goal in one glance: points still needed, a bar that shows where the meter is and where
 * it would be if the open trades closed now, and a plain line on what that means.
 */
/** The Allocator's second goal as a progress chip: one pip per structure type needed. */
function SecondGoal({ e }: { e: RunEngine }) {
  const g = e.secondGoal();
  if (!g) return null;
  return (
    <div className={`goal-second num ${g.met ? 'met' : ''}`} data-testid="second-goal">
      <span className="dim">SECOND GOAL</span> {g.need} structure types{' '}
      <span className="gs-pips">
        {Array.from({ length: g.need }, (_, i) => (
          <i key={i} className={i < g.have ? 'on' : ''} />
        ))}
      </span>{' '}
      <b>
        {Math.min(g.have, g.need)}/{g.need}
        {g.met ? ' ✔' : ''}
      </b>
    </div>
  );
}

export function GoalCard({ e }: { e: RunEngine }) {
  useTrading((s) => s.version);
  useRun((s) => s.version);
  const pending = usePendingPoints();
  if (e.state.round.sitOut) return null;
  const g0 = e.goalOutlook();
  // A payout still on screen hasn't landed its points yet.
  const g = { ...g0, meter: g0.meter - pending, toGo: Math.max(0, g0.target - (g0.meter - pending)) };
  const met = g.meter >= g.target;
  const hole = g.meter < 0;
  const frac = (v: number) => Math.max(0, Math.min(1, v / Math.max(1, g.target)));
  const now = frac(g.meter);
  // With the running P/L sealed, so is what the open trades would score.
  const plSealed = sealedBy(e).pnl;
  const withOpen = plSealed ? now : frac(g.meter + g.openPoints);
  const ifClosedToGo = g.target - (g.meter + g.openPoints);
  const note = met
    ? 'Target met. Anything more is bonus; protect it.'
    : hole
      ? 'Losses score against you. Small, planned exits climb back out.'
      : plSealed && g.openCount > 0
        ? `${plSealed} has sealed how your open trades stand. Read the chart.`
        : g.openCount > 0 && ifClosedToGo <= 0
          ? 'Closing your open trades now would clear the target.'
          : g.openCount > 0
            ? `If your open trades closed now: ${Math.max(0, ifClosedToGo).toLocaleString()} still to go.`
            : 'Winning trades fill the bar; confident, exact calls multiply it.';
  return (
    <div
      className={`goal-card ${met ? 'met' : hole ? 'hole' : ''}`}
      data-testid="goal-card"
      data-tip="g:meter"
    >
      <div className="goal-head">
        <span className="section-title">Round goal</span>
        <span className="num dim">
          {g.meter.toLocaleString()} / {g.target.toLocaleString()}
        </span>
      </div>
      <motion.div
        key={g.meter}
        className="goal-big num"
        data-testid="goal-to-go"
        initial={{ scale: 1.25 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 14 }}
      >
        {met
          ? '✔ TARGET MET'
          : hole
            ? `▼ ${Math.abs(g.meter).toLocaleString()} IN THE HOLE`
            : `${g.toGo.toLocaleString()} TO GO`}
      </motion.div>
      <div className="goal-bar" aria-label={`${Math.round(now * 100)}% of the target`}>
        <i className="gb-now" style={{ width: `${now * 100}%` }} />
        {g.openCount > 0 && withOpen !== now && (
          <i
            className={`gb-open ${withOpen > now ? 'up' : 'down'}`}
            style={{ left: `${Math.min(now, withOpen) * 100}%`, width: `${Math.abs(withOpen - now) * 100}%` }}
          />
        )}
        <b className="gb-pct num">{Math.round(now * 100)}%</b>
      </div>
      {g.openCount > 0 && (
        <div className="goal-open num" data-testid="goal-open">
          <span className="dim">OPEN ×{g.openCount}</span>{' '}
          {plSealed ? (
            <span className="sealed-num">🔒 SEALED</span>
          ) : (
            <>
              <span className={g.openPlCents >= 0 ? 'up-text' : 'down-text'}>{pnlText(g.openPlCents)}</span>{' '}
              <span className="dim">≈</span>{' '}
              <span className={g.openPoints >= 0 ? 'up-text' : 'down-text'}>
                {g.openPoints >= 0 ? '+' : ''}
                {g.openPoints.toLocaleString()}
                {g.openPoints > 0 ? '+' : ''} pts
              </span>
            </>
          )}
        </div>
      )}
      <SecondGoal e={e} />
      <div className="goal-note">{note}</div>
    </div>
  );
}

/**
 * REROLL and SIT OUT, pinned above the round goal so they're in view whatever the lineup's length.
 * Both only work before the clock starts, so they leave once it does; a rule that removes one
 * (no rerolls left in the budget, the Attendance Policy) removes its button too.
 */
export function RunLineupControls({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  useTrading((s) => s.version);
  const st = e.state;
  const r = st.round;
  const canSkip = e.canSkip();
  const showSkip = r.index < 2 && !r.sitOut && !complianceMods(st.config.compliance).noSkips;
  if (r.clockStarted || r.sitOut || (r.rerolls <= 0 && !showSkip)) return null;
  return (
    <div className="run-controls" data-testid="lineup-controls">
      {r.rerolls > 0 && (
        <button
          className="pixel-btn"
          disabled={r.rerollsUsed >= r.rerolls}
          onClick={() => (sfx('deal'), void act({ t: 'reroll' }))}
          data-testid="reroll"
          data-tip="g:reroll"
        >
          REROLL {r.rerolls - r.rerollsUsed} <Kbd>R</Kbd>
        </button>
      )}
      {showSkip && (
        <button
          className="pixel-btn"
          disabled={!canSkip}
          onClick={() => void act({ t: 'skip' })}
          data-testid="skip"
          data-tip-title="Sit this round out (K)"
          data-tip-body={`No trades for ${BALANCE.run.sitOutDays} trading days while the market moves without you. At the end: −10 stress and ${r.skipTag ? `the ${TAGS[r.skipTag].name}: ${TAGS[r.skipTag].text}` : 'a Tag'}. No shop after a sit-out; Reviews can't be skipped.`}
        >
          ☕ SIT OUT →{' '}
          {r.skipTag && (
            <ArtIcon
              category="tag"
              id={r.skipTag}
              name={TAGS[r.skipTag].name}
              onlyIfUploaded
              className="skip-tag-art"
              style={{ width: 18, height: 18 }}
            />
          )}
          {r.skipTag ? TAGS[r.skipTag].name.replace(' Tag', '').toUpperCase() : 'TAG'} <Kbd>K</Kbd>
        </button>
      )}
    </div>
  );
}

export function RunLeftExtra({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  useTrading((s) => s.version);
  const selected = useTrading((s) => s.selectedCardId);
  const [loanOpen, setLoanOpen] = useState(false);
  const st = e.state;
  const r = st.round;
  const canSkip = e.canSkip();
  const daysLeft = e.tradeDaysLeft();
  const session = e.session;
  const noPositions =
    !!session && session.openPositions().length === 0 && session.orders.length === 0 && !session.inDay;
  useHotkeys({
    reroll: () => {
      if (!r.clockStarted) {
        sfx('deal');
        void act({ t: 'reroll' });
      }
    },
    skip: () => {
      if (canSkip) void act({ t: 'skip' });
    },
  });
  const playMemo = (id: (typeof st.memos)[number]) => {
    if (id === 'analyst_loan') return setLoanOpen(true);
    sfx('select');
    void act({ t: 'memo', id, cardId: selected ?? undefined });
  };
  return (
    <div className="run-left">
      <div className="run-status">
        {r.sitOut && session && (
          <div className="sitout-banner num" data-testid="sitout">
            <div>
              ☕ SITTING OUT · day {Math.min(session.dayIndex, r.sitOut.days)}/{r.sitOut.days}
            </div>
            <div className="sitout-bar">
              <i style={{ width: `${(Math.min(session.dayIndex, r.sitOut.days) / r.sitOut.days) * 100}%` }} />
            </div>
            <div className="dim small">
              {r.skipTag ? `${TAGS[r.skipTag].name} and −10 stress at the end.` : '−10 stress at the end.'}{' '}
              Space lets a day pass.
            </div>
          </div>
        )}
        {!r.sitOut && daysLeft !== null && r.index >= 0 && (
          <div
            className={`window-chip num ${daysLeft <= 2 ? 'low' : ''}`}
            data-testid="trade-window"
            data-tip-title="Trading window"
            data-tip-body={`New trades can start on any of the round's first ${BALANCE.run.tradeWindowDays} trading days, while you have tickets. Waiting a day to see more bars is allowed: press Space (or N) without trading.`}
          >
            ⏱ {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} to open trades` : 'window closed'}{' '}
            · 🎫 {Math.max(0, r.tickets - r.ticketsUsed)}
          </div>
        )}
        {noPositions && r.clockStarted && !r.sitOut && (
          <button
            className="pixel-btn"
            onClick={() => void act({ t: 'endRound' })}
            data-testid="end-round"
            data-tip-title="End the round now"
            data-tip-body="Nothing is open. Settle the round with what you have instead of waiting out the trading window."
          >
            END ROUND ■
          </button>
        )}
        {r.filterRelaxed && (
          <div className="dim small">
            Few windows matched this Review's filter; the desk dealt the closest it had.
          </div>
        )}
      </div>
      <ClientCard e={e} />
      {st.memos.length > 0 && (
        <div className="memo-list">
          <div className="section-title">Memos</div>
          {st.memos.map((m, i) => (
            <button
              key={`${m}${i}`}
              className="memo-btn with-art"
              onClick={() => playMemo(m)}
              data-tip={`memo:${m}`}
              data-testid={`memo-${m}`}
            >
              <ArtIcon
                category="memo"
                id={m}
                name={MEMOS[m].name}
                style={{ width: 32, height: 32, fontSize: 12 }}
              />
              <b>{MEMOS[m].name}</b>
            </button>
          ))}
        </div>
      )}
      <div className="analyst-seats">
        <div className="section-title" data-tip="g:analysts">
          Analysts {e.activeAnalysts().length}/{e.analystSeats()}
        </div>
        {st.analysts.map((a) => (
          <div
            key={a.id}
            className={`seat ${r.silentAnalyst === a.id ? 'silent' : ''}`}
            data-tip={`analyst:${a.id}`}
          >
            <ArtIcon
              category="analyst"
              id={a.id}
              name={ANALYSTS[a.id].name}
              style={{ width: 24, height: 24, fontSize: 10 }}
            />
            {ANALYSTS[a.id].name}
            {a.level > 1 && <span className="chip">L2</span>}
            {r.silentAnalyst === a.id && <span className="chip bad">SILENT</span>}
          </div>
        ))}
        {r.memo.loan && (
          <div className="seat loan">
            {ANALYSTS[r.memo.loan].name} <span className="chip cyan">LOAN</span>
          </div>
        )}
      </div>
      {loanOpen && (
        <Modal onClose={() => setLoanOpen(false)} testId="loan-picker">
          <h2>Analyst Loan: pick one for this round</h2>
          <div className="loan-grid">
            {(Object.keys(ANALYSTS) as AnalystId[])
              .filter((id) => !st.analysts.some((a) => a.id === id))
              .map((id) => (
                <button
                  key={id}
                  className="memo-btn"
                  onClick={() => {
                    setLoanOpen(false);
                    void act({ t: 'memo', id: 'analyst_loan', analyst: id });
                  }}
                >
                  <b>{ANALYSTS[id].name}</b>
                  <span className="dim">{ANALYSTS[id].reveals}</span>
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * What this trade is worth if it wins, and which of your cartridges power it: each bonus is a
 * chip that pops in (with the cartridge's picture), and the ones this trade doesn't trigger sit
 * greyed out, so it's clear what you're building toward.
 */
export function ScorePreviewBox({ e }: { e: RunEngine }) {
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  const cardId = useTrading(liveCardId);
  const session = useTrading((s) => s.session);
  const open = useTrading(tradeOpen);
  const implied = useTrading((s) => s.impliedCall)();
  useTrading((s) => s.version);
  if (!plan || !cardId || !session || !open) return null;
  const call = implied
    ? {
        ...implied,
        emPct: plan.entry?.expectedMovePct ?? 0.05,
        horizonDays: plan.dte ?? 30,
        mode: session.config.callMode,
      }
    : null;
  const p = previewScore(e, plan, builder.structureId, cardId, call);
  if (!p) return null;
  const steps = p.steps.filter((st) => st.op !== 'meter');
  const firing = new Set(steps.map((st) => st.source).filter((x): x is string => !!x));
  const idle = e.activeCartridges().filter((id) => !firing.has(id) && CARTRIDGE_BY_ID[id]);
  const share = p.targetLeft > 0 ? p.points / p.targetLeft : 1;
  return (
    <div
      className="combo"
      data-testid="score-preview"
      data-tip-title="If it wins (at max profit)"
      data-tip-body={`${p.chips} chips × ${p.mult.toFixed(2)} mult = ${p.points.toLocaleString()}. With an exact call: ${p.pointsIfExact.toLocaleString()}. The round still needs ${p.targetLeft.toLocaleString()}.`}
    >
      <div className="combo-head">
        <span className="dim">IF IT WINS</span>
        <b className="num combo-pts">
          <CountUp value={p.points} />
        </b>
        <span className="num dim">
          {p.chips} chips × {p.mult.toFixed(1)}
        </span>
      </div>
      <div
        className="combo-fill"
        data-tip-title="Round target"
        data-tip-body={`This trade alone would fill ${Math.round(share * 100)}% of what the round still needs (${p.targetLeft.toLocaleString()}).`}
      >
        <span
          className={`cf-bar ${share >= 1 ? 'full' : ''}`}
          style={{ width: `${Math.min(1, share) * 100}%` }}
        />
        <span className="cf-label num">
          {share >= 1 ? '✔ CLEARS THE ROUND' : `${Math.round(share * 100)}% OF THE ROUND`}
        </span>
      </div>
      <div className="combo-steps">
        <AnimatePresence initial={false}>
          {steps.map((st, i) => {
            const cart = st.source ? CARTRIDGE_BY_ID[st.source] : undefined;
            return (
              <motion.span
                key={`${st.label}-${st.op}-${st.value}-${i}`}
                className={`cstep ${st.op}`}
                data-tip={cart ? `cart:${cart.id}` : undefined}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 20, delay: i * 0.03 }}
              >
                {cart && (
                  <ArtIcon
                    category="cartridge"
                    id={cart.id}
                    name={cart.name}
                    tone={cart.rarity}
                    style={{ width: 16, height: 16, fontSize: 8 }}
                  />
                )}
                <b className="num">
                  {st.op === 'chips'
                    ? `+${Math.round(st.value)}`
                    : st.op === 'add'
                      ? `+${st.value}×`
                      : st.op === 'chipsMul'
                        ? `×${st.value}c`
                        : `×${st.value}`}
                </b>{' '}
                {st.label}
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
      {idle.length > 0 && (
        <div className="combo-idle">
          <span className="dim">NOT TRIGGERED:</span>
          {idle.map((id) => (
            <span key={id} className="ci" data-tip={`cart:${id}`}>
              <ArtIcon
                category="cartridge"
                id={id}
                name={CARTRIDGE_BY_ID[id].name}
                tone={CARTRIDGE_BY_ID[id].rarity}
                style={{ width: 20, height: 20, fontSize: 9 }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Readout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="readout">
      <div className="ro-title">{title}</div>
      <div className="ro-body num">{children}</div>
    </div>
  );
}

/** What each hired analyst says about the selected card. */
export function AnalystDesk({ e }: { e: RunEngine }) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const builder = useTrading((s) => s.builder);
  const plan = useTrading((s) => s.plan)();
  useTrading((s) => s.version);
  if (!session || !cardId || !session.cards.some((c) => c.id === cardId)) return null;
  const view = session.view(cardId);
  const ctx = session.context(cardId);
  const chain = session.chain(cardId);
  const has = (id: AnalystId) => e.hasAnalyst(id);
  const lvl = (id: AnalystId) => e.activeAnalysts().find((a) => a.id === id)?.level ?? 0;
  const out: ReactNode[] = [];
  const fam = e.families();
  const deskCal = e.state.config.deskId === 'calendar';
  const review = e.rule();
  const sealed = sealedBy(e);
  const ivSealed = sealed.ivr;
  if (ivSealed && (has('quant') || has('vol_surfer')))
    out.push(
      <Readout key="sealed" title="IV desk">
        <LockStamp text="IV RANK SEALED" by={ivSealed} />
      </Readout>,
    );
  else if (has('quant')) {
    const hist = view
      .vol()
      .slice(-120)
      .map((v) => v.ivr ?? 0);
    out.push(
      <Readout key="quant" title="The Quant">
        IV rank <b>{ctx.ivr?.toFixed(0) ?? '—'}</b> · IV pct <b>{ctx.ivp?.toFixed(0) ?? '—'}</b>
        {hist.length > 5 && <Sparkline closes={hist} />}
        {lvl('quant') > 1 && (
          <div className="dim">
            5-year rank of today's IV: {ctx.ivp !== null ? `${ctx.ivp.toFixed(0)}th pct` : '—'}
          </div>
        )}
      </Readout>,
    );
  }
  if (has('vol_surfer') || deskCal || e.activeCartridges().includes('vol_arb')) {
    const ts = chain ? termStructure(chain).filter((t) => t.dte <= 70) : [];
    const vrp = ctx.iv30 !== null && ctx.hv20 !== null ? (ctx.iv30 - ctx.hv20) * 100 : null;
    out.push(
      <Readout
        key="vol"
        title={has('vol_surfer') ? 'The Vol Surfer' : deskCal ? 'Term structure (desk)' : 'Vol Arb'}
      >
        IV30 {pct(ctx.iv30, 0)} vs HV20 {pct(ctx.hv20, 0)}:{' '}
        {vrp !== null ? <b className={vrp >= 0 ? 'up-text' : 'down-text'}>{signed(vrp, 1)} pts</b> : '—'}{' '}
        {vrp !== null ? (vrp >= 5 ? '(premium rich)' : vrp < 0 ? '(premium cheap)' : '') : ''}
        {(has('vol_surfer') || deskCal) && ts.length > 1 && (
          <div className="term num">
            {ts.slice(0, 6).map((t, i) => (
              <span key={t.expiration}>
                {sealed.dte ? `T${i + 1}` : `${t.dte}d`} {pct(t.iv, 0)}
              </span>
            ))}
            <div className="dim">
              {ts[0].iv > ts[ts.length - 1].iv
                ? 'Backwardation: the front is pricier (an event is priced in).'
                : 'Contango: the normal upward slope.'}
            </div>
          </div>
        )}
      </Readout>,
    );
  }
  if (has('earnings_whisperer')) {
    const past = view.earnings().past.slice(-8);
    const next = ctx.nextEarnings;
    const im = next && chain ? impliedMoveAfter(chain, next.reactionDate) : null;
    out.push(
      <Readout key="ern" title="The Earnings Whisperer">
        {next ? (
          <>
            Next report in <b>{diffDays(view.now, next.date)}d</b> ({next.timing}) · implied move{' '}
            <b>±{im ? pct(im.pct, 1) : '—'}</b>
          </>
        ) : (
          'No report scheduled inside 60 days.'
        )}
        {past.length > 0 && (
          <div className="ern-hist">
            {past.map((p) => (
              <span
                key={p.date}
                className={Math.abs(p.movePct ?? 0) > (p.impliedMovePct ?? 99) ? 'warn-text' : ''}
              >
                {signed(p.movePct ?? 0, 1)}%/±{(p.impliedMovePct ?? 0).toFixed(1)}
                {lvl('earnings_whisperer') > 1 && p.ivBefore && p.ivAfter
                  ? ` crush ${Math.round((1 - p.ivAfter / p.ivBefore) * 100)}%`
                  : ''}
              </span>
            ))}
            <div className="dim">actual move / implied move, last {past.length}</div>
          </div>
        )}
      </Readout>,
    );
  }
  if (e.state.round.memo.dueDiligence.includes(cardId) && !has('earnings_whisperer')) {
    const past = view.earnings().past.slice(-5);
    out.push(
      <Readout key="dd" title="Due Diligence">
        {past.length
          ? past
              .map((p) => `${signed(p.movePct ?? 0, 1)}% vs ±${(p.impliedMovePct ?? 0).toFixed(1)}%`)
              .join(' · ')
          : 'No earnings history visible yet.'}
      </Readout>,
    );
  }
  if (has('chartist'))
    out.push(
      <Readout key="chart" title="The Chartist">
        Extra studies are unlocked in the study picker (Ctrl+E): SMA 20/50/200, EMA 9/21, ATR, Keltner,
        support/resistance, relative volume.
      </Readout>,
    );
  if (has('skew_doctor') && chain && builder.expiration) {
    const sk = skew25(chain, builder.expiration);
    out.push(
      <Readout key="skew" title="The Skew Doctor">
        {sk ? (
          <>
            25Δ put IV {pct(sk.putIv, 1)} vs call {pct(sk.callIv, 1)}:{' '}
            <b>
              {sk.richer === 'even'
                ? 'balanced'
                : `${sk.richer} richer by ${Math.abs(sk.diffPts).toFixed(1)} pts`}
            </b>
            {sk.richer !== 'even' && (
              <div className="dim">The richer side pays more premium per unit of risk to sell.</div>
            )}
          </>
        ) : (
          'Not enough quotes to read the skew.'
        )}
      </Readout>,
    );
  }
  if (has('macro_desk') || review.macroPanel) {
    const bench = view.benchmarkBars();
    const b20 = bench.length > 21 ? bench[bench.length - 1].close / bench[bench.length - 21].close - 1 : null;
    out.push(
      <Readout key="macro" title={has('macro_desk') ? 'The Macro Desk' : 'Macro panel (The Fed)'}>
        VIX <b>{ctx.vix?.toFixed(1) ?? '—'}</b> · index 20d {b20 !== null ? pct(b20, 1, true) : '—'}
        <div>
          {ctx.macroAhead.length
            ? ctx.macroAhead
                .slice(0, 4)
                .map((m) => `${m.label} in ${diffDays(view.now, m.date)}d`)
                .join(' · ')
            : 'No FOMC or CPI day in the next 30 days.'}
        </div>
      </Readout>,
    );
  }
  if (has('ghost') && sealed.dte)
    out.push(
      <Readout key="ghost" title="The Ghost">
        A base rate needs the trade's length, and {sealed.dte} has sealed it.
      </Readout>,
    );
  else if (has('ghost') && plan?.ok && plan.entry && plan.dte) {
    const shorts = plan.entry.shortStrikes;
    const spot = plan.entry.spot;
    const def = STRUCTURES[builder.structureId];
    const k = shorts[0];
    if (k !== undefined && spot > 0) {
      const side = def.bias === 'bear' ? 'up' : 'down';
      const dist = Math.abs(k / spot - 1);
      const br = baseRate(view.bars(), dist, (plan.dte * 252) / 365, side);
      out.push(
        <Readout key="ghost" title="The Ghost">
          {br ? (
            <>
              In this stock's history, a {pct(dist, 1)} move {side} over {Math.round((plan.dte * 252) / 365)}{' '}
              trading days happened <b>{pct(br.rate, 0)}</b> of the time ({br.samples} samples).
            </>
          ) : (
            'Not enough history for a base rate.'
          )}
        </Readout>,
      );
    }
  }
  if (has('risk_officer')) {
    const open = session.openPositions();
    const pr = portfolioRisk(open, (p) => STRUCTURES[p.structureId].bias);
    out.push(
      <Readout key="risk" title="The Risk Officer">
        Portfolio Δ {pr.delta.toFixed(0)} · Θ ${pr.theta.toFixed(2)}/day · vega {pr.vega.toFixed(1)}
        {pr.sameDirection && (
          <div className="warn-text">
            All positions lean the same way: one market move hits them together.
          </div>
        )}
        {plan?.ok && plan.mid !== null && plan.mid < 0 && (
          <div className="dim">
            Suggested brackets: take profit at {money(Math.round(-plan.mid * 0.5 * 100 * 100 * builder.qty))},
            stop at 2× credit.
          </div>
        )}
      </Readout>,
    );
  }
  if (fam.VEGA >= 2) {
    const open = session.openPositions().filter((p) => p.cardId === cardId);
    for (const p of open) {
      const a = p.marks[0]?.legs.filter((l) => !l.stock).map((l) => l.iv);
      const b = p.marks[p.marks.length - 1]?.legs.filter((l) => !l.stock).map((l) => l.iv);
      if (a?.length && b?.length) {
        const ch = b.reduce((x, y) => x + y, 0) / b.length / (a.reduce((x, y) => x + y, 0) / a.length) - 1;
        out.push(
          <Readout key={`vega${p.id}`} title="VEGA x2: live IV change">
            {pct(ch, 1, true)} since entry
          </Readout>,
        );
      }
    }
  }
  if (!out.length) return null;
  return (
    <div className="analyst-desk" data-testid="analyst-desk">
      <div className="section-title">Analyst desk</div>
      {out}
    </div>
  );
}

export function RunRightExtra({ e }: { e: RunEngine }) {
  return (
    <>
      <ScorePreviewBox e={e} />
      <AnalystDesk e={e} />
    </>
  );
}

export function PointsCount({ value }: { value: number }) {
  return <CountUp value={value} duration={700} />;
}
