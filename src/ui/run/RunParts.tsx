import { AnimatePresence, motion } from 'motion/react';
import type { BriefAccess } from '../../engine/news/brief';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { burstAt } from '../../fx/overlay';
import { ArtIcon } from '../art';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { ALL_FAMILIES, FAMILY_NAMES } from '../../content/families';
import { MEMOS, TAGS } from '../../content/items';
import { REVIEWS } from '../../content/reviews';
import type { AnalystId, CartridgeDef, Family } from '../../content/types';
import { diffDays } from '../../engine/calendar';
import {
  baseRate,
  impliedMoveAfter,
  portfolioRisk,
  skew25,
  termStructure,
} from '../../engine/run/analystTools';
import { ROUND_NAMES, quarterLabel, type RunEngine } from '../../engine/run/engine';
import { heatOf } from '../../content/meta';
import { clientChecks } from '../../engine/run/clients';
import { CLIENT_BY_ID } from '../../content/clients';
import { previewScore } from '../../engine/run/preview';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { Kbd, Meter, Modal, CountUp } from '../components/ui';
import { money, pct, signed } from '../format';
import { useHotkeys } from '../hotkeys';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { FastForwardBar, type CardBadges } from '../trading/Panels';
import { Sparkline } from '../components/Sparkline';
import './run.css';

export function familyCounts(e: RunEngine): Record<Family, number> {
  return e.families();
}

export function CartridgeChip({
  def,
  index,
  onMove,
  extra,
}: {
  def: CartridgeDef;
  index?: number;
  onMove?: (dir: -1 | 1) => void;
  extra?: ReactNode;
}) {
  return (
    <div className={`cart-chip rar-${def.rarity}`} data-tip={`cart:${def.id}`} data-testid={`cart-${def.id}`}>
      {onMove && (
        <button className="cart-move" onClick={() => onMove(-1)} aria-label="Move left">
          ◀
        </button>
      )}
      <span className="cart-slot num">{index !== undefined ? index + 1 : ''}</span>
      <ArtIcon
        category="cartridge"
        id={def.id}
        name={def.name}
        tone={def.rarity}
        className="cart-art"
        style={{ width: 20, height: 20, fontSize: 9 }}
      />
      <span className="cart-name">{def.name}</span>
      <span className="cart-fam num">{def.families.join('·')}</span>
      {onMove && (
        <button className="cart-move" onClick={() => onMove(1)} aria-label="Move right">
          ▶
        </button>
      )}
      {extra}
    </div>
  );
}

export function CartridgeRail({ e, editable }: { e: RunEngine; editable?: boolean }) {
  const act = useRun((s) => s.act);
  const slots = e.cartridgeSlots();
  const fam = e.families();
  const owned = e.state.cartridges;
  return (
    <div className="cart-rail" data-testid="cartridge-rail" data-tip="g:cartridge_rail">
      <div className="cart-slots">
        {Array.from({ length: slots }, (_, i) => {
          const id = owned[i];
          const def = id ? CARTRIDGE_BY_ID[id] : null;
          if (!def)
            return (
              <div key={i} className="cart-chip empty num">
                slot {i + 1}
              </div>
            );
          return (
            <CartridgeChip
              key={id}
              def={def}
              index={i}
              onMove={editable ? (d) => void act({ t: 'move', from: i, to: i + d }) : undefined}
            />
          );
        })}
      </div>
      <div className="fam-counters num">
        {ALL_FAMILIES.filter((f) => fam[f] > 0).map((f) => (
          <span key={f} className={`fam ${fam[f] >= 2 ? 'on' : ''}`} data-tip={`family:${f}`}>
            {FAMILY_NAMES[f].toUpperCase()} {fam[f]}
          </span>
        ))}
      </div>
    </div>
  );
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
  const eq = session ? session.markedEquityCents() : st.equityCents;
  const floor = e.maxLossFloorCents();
  const room = eq - floor;
  const span = Math.max(1, r.startEquityCents - floor);
  const review = r.reviewId ? REVIEWS[r.reviewId] : null;
  return (
    <div className="topbar panel run-topbar" data-testid="run-topbar">
      <div className="rtb-row">
        <button
          className="pixel-btn rtb-exit"
          onClick={onMenu}
          data-testid="run-menu"
          title="Save and return to the title screen"
        >
          ◀ SAVE & EXIT
        </button>
        <div className="tb-item rtb-round">
          <span className="amber-text">{quarterLabel(st.quarter)}</span> {ROUND_NAMES[r.index].toUpperCase()}
          {review && (
            <span className="chip magenta" data-tip={`review:${review.id}`}>
              {review.name.toUpperCase()}
            </span>
          )}
          <ModeChips e={e} />
          <MeterJuice meter={r.meter} target={r.target} />
          {r.memo.waiver && <span className="chip warn">WAIVER</span>}
        </div>
        <div className="rtb-meter" data-tip="g:meter">
          <Meter
            value={Math.max(0, r.meter)}
            max={r.target}
            tone={r.meter >= r.target ? 'cyan' : 'magenta'}
            label={
              <span data-testid="round-meter">
                {r.meter.toLocaleString()} / {r.target.toLocaleString()}
              </span>
            }
          />
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
        <div
          className="rtb-line"
          data-tip-title="Max-Loss Line"
          data-tip-body={`Equity must stay above ${money(floor)} at every close (${Math.round(r.maxLossLinePct * 100)}% below the round's start). Cross it and the risk desk closes everything and the round fails.`}
        >
          <span className="dim">MAX-LOSS</span>
          <Meter
            value={room}
            max={span}
            tone={room / span < 0.35 ? 'down' : 'amber'}
            label={r.memo.waiver ? 'waived' : `room ${money(Math.max(0, room))}`}
            testId="maxloss-gauge"
          />
        </div>
        <button
          className="tb-item rtb-stress"
          onClick={() => setStressOpen(true)}
          data-testid="stress"
          data-tip="g:stress"
        >
          <span className="dim">STRESS</span>
          <Meter
            value={st.stress}
            max={100}
            tone={st.stress >= 75 ? 'down' : 'amber'}
            label={`${st.stress}`}
          />
        </button>
        <div className="tb-item num" data-testid="cash" data-tip="g:cash">
          <span className="dim">CASH</span> <span className="amber-text">${st.cash}</span>
        </div>
        <div className="tb-item num" data-testid="tickets" data-tip="g:tickets">
          <span className="dim">TICKETS</span>{' '}
          {Array.from({ length: r.tickets }, (_, i) => (
            <span key={i} className={i < r.ticketsUsed ? 'tk-pip used' : 'tk-pip'}>
              ■
            </span>
          ))}
        </div>
        <div className="tb-item num" data-tip="g:equity">
          <span className="dim">EQUITY</span> {money(eq)}
        </div>
        <div className="tb-spacer" />
        <FastForwardBar />
      </div>
      <CartridgeRail e={e} />
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
  return {
    earningsDetail: hasEarningsDetail(e),
    ivDetail: e.hasAnalyst('quant') || e.hasAnalyst('vol_surfer'),
  };
}

export function careerBadges(
  e: RunEngine,
  symbolSector: (sym: string) => string | null,
): (cardId: string) => CardBadges {
  const fam = e.families();
  const quant = e.hasAnalyst('quant');
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

export function RunLeftExtra({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  useTrading((s) => s.version);
  const selected = useTrading((s) => s.selectedCardId);
  const [loanOpen, setLoanOpen] = useState(false);
  const st = e.state;
  const r = st.round;
  const canSkip = e.canSkip();
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
      <div className="run-controls">
        <button
          className="pixel-btn"
          disabled={r.clockStarted || r.rerollsUsed >= r.rerolls}
          onClick={() => (sfx('deal'), void act({ t: 'reroll' }))}
          data-testid="reroll"
          data-tip="g:reroll"
        >
          REROLL {r.rerolls - r.rerollsUsed} <Kbd>R</Kbd>
        </button>
        {r.index < 2 && (
          <button
            className="pixel-btn"
            disabled={!canSkip}
            onClick={() => void act({ t: 'skip' })}
            data-testid="skip"
            data-tip-title="Skip the round (K)"
            data-tip-body={`Skip before trading: −10 stress and ${r.skipTag ? `the ${TAGS[r.skipTag].name}: ${TAGS[r.skipTag].text}` : 'a Tag'}. No shop after a skip; Reviews can't be skipped.`}
          >
            SKIP → {r.skipTag ? TAGS[r.skipTag].name.replace(' Tag', '').toUpperCase() : 'TAG'} <Kbd>K</Kbd>
          </button>
        )}
        {noPositions && (session?.positions.length ?? 0) > 0 && (
          <button className="pixel-btn" onClick={() => void act({ t: 'endRound' })} data-testid="end-round">
            END ROUND
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

export function ScorePreviewBox({ e }: { e: RunEngine }) {
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  const cardId = useTrading((s) => s.selectedCardId);
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  if (!plan || !cardId || !session || session.clockStarted) return null;
  const card = session.cards.find((c) => c.id === cardId);
  const p = previewScore(e, plan, builder.structureId, cardId, card?.call ?? null);
  if (!p) return null;
  const steps = p.steps
    .filter((st) => st.op !== 'meter')
    .map(
      (st) =>
        `${st.op === 'chips' ? `+${Math.round(st.value)} chips` : st.op === 'add' ? `+${st.value} mult` : `×${st.value}`} ${st.label}`,
    )
    .join(' · ');
  return (
    <div
      className="score-preview"
      data-testid="score-preview"
      data-tip-title="Score preview (at max profit)"
      data-tip-body={`${p.chips} chips × ${p.mult.toFixed(2)} mult = ${p.points.toLocaleString()}. With an exact call: ${p.pointsIfExact.toLocaleString()}. The round needs ${p.targetLeft.toLocaleString()} more. ${steps}`}
    >
      <span className="dim">SCORE IF IT WINS</span>{' '}
      <b className="num sp-points">{p.points.toLocaleString()}</b>{' '}
      <span className="dim num">
        ({p.chips}c × {p.mult.toFixed(1)}) · needs {p.targetLeft.toLocaleString()}
      </span>
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
  const cardId = useTrading((s) => s.selectedCardId);
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
  const review = e.state.round.reviewId ? REVIEWS[e.state.round.reviewId].rule : {};
  if (has('quant')) {
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
            {ts.slice(0, 6).map((t) => (
              <span key={t.expiration}>
                {t.dte}d {pct(t.iv, 0)}
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
  if (has('ghost') && plan?.ok && plan.entry && plan.dte) {
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
