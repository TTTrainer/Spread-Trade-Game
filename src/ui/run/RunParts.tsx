import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { ALL_FAMILIES, FAMILY_NAMES, FAMILY_TEXT } from '../../content/families';
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
import { ROUND_NAMES, type RunEngine } from '../../engine/run/engine';
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

const RAR_NAME = { C: 'Common', U: 'Uncommon', R: 'Rare', L: 'Legendary' } as const;

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
    <div
      className={`cart-chip rar-${def.rarity}`}
      title={`${def.name} (${RAR_NAME[def.rarity]} · ${def.families.join('/')} · ${def.tag})\n${def.text}`}
      data-testid={`cart-${def.id}`}
    >
      {onMove && (
        <button className="cart-move" onClick={() => onMove(-1)} aria-label="Move left">
          ◀
        </button>
      )}
      <span className="cart-slot num">{index !== undefined ? index + 1 : ''}</span>
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
    <div className="cart-rail" data-testid="cartridge-rail">
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
          <span
            key={f}
            className={`fam ${fam[f] >= 2 ? 'on' : ''}`}
            title={FAMILY_TEXT[f]
              .map((t, i) => (t ? `${i + 2}: ${t}` : ''))
              .filter(Boolean)
              .join('\n')}
          >
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
          <span className="amber-text">Q{st.quarter}</span> {ROUND_NAMES[r.index].toUpperCase()}
          {review && <span className="chip magenta">{review.name.toUpperCase()}</span>}
          {r.memo.waiver && <span className="chip warn">WAIVER</span>}
        </div>
        <div className="rtb-meter" title="Round meter: points from closed trades against the target">
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
          title={`Max-Loss Line: equity must stay above ${money(floor)} at every close (${Math.round(r.maxLossLinePct * 100)}% below the round's start).`}
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
          title="Click for every change and its cause"
        >
          <span className="dim">STRESS</span>
          <Meter
            value={st.stress}
            max={100}
            tone={st.stress >= 75 ? 'down' : 'amber'}
            label={`${st.stress}`}
          />
        </button>
        <div className="tb-item num" data-testid="cash">
          <span className="dim">CASH</span> <span className="amber-text">${st.cash}</span>
        </div>
        <div className="tb-item num" data-testid="tickets" title="Trades you may place this round">
          <span className="dim">TICKETS</span>{' '}
          {Array.from({ length: r.tickets }, (_, i) => (
            <span key={i} className={i < r.ticketsUsed ? 'tk-pip used' : 'tk-pip'}>
              ■
            </span>
          ))}
        </div>
        <div className="tb-item num">
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
export function careerBadges(
  e: RunEngine,
  symbolSector: (sym: string) => string | null,
): (cardId: string) => CardBadges {
  const fam = e.families();
  const owned = e.activeCartridges();
  const quant = e.hasAnalyst('quant');
  const whisper =
    e.hasAnalyst('earnings_whisperer') ||
    owned.includes('earnings_whisper') ||
    fam.EVENT >= 2 ||
    e.state.config.deskId === 'volatility';
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
    <div className={`client-card ${c.status}`} data-testid="client-card" title={def.persona}>
      <div className="section-title">
        Client{' '}
        {c.status === 'filled' ? (
          <span className="chip good">FILLED</span>
        ) : (
          <span className="chip">+${def.cash}</span>
        )}
      </div>
      <b className="client-name">{def.name}</b>
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
          title="Redraw every card you have not traded"
        >
          REROLL {r.rerolls - r.rerollsUsed} <Kbd>R</Kbd>
        </button>
        {r.index < 2 && (
          <button
            className="pixel-btn"
            disabled={!canSkip}
            onClick={() => void act({ t: 'skip' })}
            data-testid="skip"
            title={
              r.skipTag
                ? `Skip this round: -10 stress and the ${TAGS[r.skipTag].name} (${TAGS[r.skipTag].text})`
                : 'Skip this round'
            }
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
              className="memo-btn"
              onClick={() => playMemo(m)}
              title={MEMOS[m].text}
              data-testid={`memo-${m}`}
            >
              <b>{MEMOS[m].name}</b>
              <span className="dim">{MEMOS[m].text}</span>
            </button>
          ))}
        </div>
      )}
      <div className="analyst-seats">
        <div className="section-title">
          Analysts {e.activeAnalysts().length}/{e.analystSeats()}
        </div>
        {st.analysts.map((a) => (
          <div
            key={a.id}
            className={`seat ${r.silentAnalyst === a.id ? 'silent' : ''}`}
            title={ANALYSTS[a.id].reveals}
          >
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
  return (
    <div className="score-preview" data-testid="score-preview">
      <div className="section-title">Score preview (at max profit)</div>
      <div className="sp-formula num">
        <span className="chips-text">{p.chips}</span> chips ×{' '}
        <span className="mult-text">{p.mult.toFixed(2)}</span> mult = <b>{p.points.toLocaleString()}</b>
      </div>
      <div className="dim num">
        exact call: <b className="cyan-text">{p.pointsIfExact.toLocaleString()}</b> · round needs{' '}
        {p.targetLeft.toLocaleString()} more
      </div>
      <div className="sp-steps num">
        {p.steps
          .filter((s) => s.op !== 'meter')
          .map((s, i) => (
            <span key={i} className={`sp-step op-${s.op}`}>
              {s.op === 'chips'
                ? `+${Math.round(s.value)}c`
                : s.op === 'add'
                  ? `+${s.value}m`
                  : `×${s.value}`}{' '}
              {s.label}
            </span>
          ))}
      </div>
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
