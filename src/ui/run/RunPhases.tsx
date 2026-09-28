import { motion, useAnimationControls } from 'motion/react';
import { burstAt, fx } from '../../fx/overlay';
import { ArtIcon, artUrl } from '../art';
import { useEffect, useMemo, useState } from 'react';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import { MEMOS, VOUCHERS } from '../../content/items';
import { REVIEWS } from '../../content/reviews';
import { ROUND_NAMES, computeTarget, quarterLabel, sellPrice, type RunEngine } from '../../engine/run/engine';
import type { ShopItem, TradeTally } from '../../engine/run/types';
import type { TraceRow } from '../../engine/scoring/mult';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { CountUp, Kbd, Meter, Pnl, Stamp, TiltCard } from '../components/ui';
import { money } from '../format';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useRun, type DailyGhost } from '../store/run';
import { DebriefStrip } from '../trading/Debrief';
import { CartridgeRail } from './RunParts';
import './run.css';

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
  const meterNow = tallies.reduce((a, t, i) => a + (shownFor[i] > t.trace.length ? t.points : 0), 0);
  const finished = step >= totalSteps;
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
          {r.debriefs.length > 0 && <DebriefStrip debriefs={r.debriefs} blind />}
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

function itemTitle(it: ShopItem): string {
  switch (it.kind) {
    case 'cartridge':
      return CARTRIDGE_BY_ID[it.id].name;
    case 'analyst':
      return `${ANALYSTS[it.id].name}${it.level > 1 ? ' (level 2)' : ''}`;
    case 'memo':
      return MEMOS[it.id].name;
    case 'page':
      return `Playbook: ${STRUCTURES[it.id].name}`;
    case 'voucher':
      return VOUCHERS[it.id].name;
  }
}

function ItemCard({ e, it, index }: { e: RunEngine; it: ShopItem; index: number }) {
  const act = useRun((s) => s.act);
  const cash = e.state.cash;
  const rarity =
    it.kind === 'cartridge'
      ? CARTRIDGE_BY_ID[it.id].rarity
      : it.kind === 'voucher'
        ? 'L'
        : it.kind === 'analyst'
          ? 'U'
          : undefined;
  let body: React.ReactNode;
  switch (it.kind) {
    case 'cartridge': {
      const c = CARTRIDGE_BY_ID[it.id];
      body = (
        <>
          <div className="item-kind num">
            CARTRIDGE · {c.families.join('·')} ·{' '}
            <span className={c.tag.includes('REAL') ? 'cyan-text' : 'magenta-text'}>{c.tag}</span>
          </div>
          <div className="item-text">{c.text}</div>
          <div className="item-syn dim">
            Pairs with: {c.synergies.map((s) => CARTRIDGE_BY_ID[s]?.name ?? s).join(', ')}
          </div>
        </>
      );
      break;
    }
    case 'analyst':
      body = (
        <>
          <div className="item-kind num">ANALYST</div>
          <div className="item-text">{it.level > 1 ? ANALYSTS[it.id].level2 : ANALYSTS[it.id].reveals}</div>
        </>
      );
      break;
    case 'memo':
      body = (
        <>
          <div className="item-kind num">MEMO (one use)</div>
          <div className="item-text">{MEMOS[it.id].text}</div>
        </>
      );
      break;
    case 'page': {
      const lv = e.state.levels[it.id] ?? 1;
      body = (
        <>
          <div className="item-kind num">PLAYBOOK PAGE</div>
          <div className="item-text">
            {STRUCTURES[it.id].name}: level {lv} → {lv + 1}. +10 base chips and +0.5 mult on its winners.
          </div>
        </>
      );
      break;
    }
    case 'voucher':
      body = (
        <>
          <div className="item-kind num">VOUCHER (whole run)</div>
          <div className="item-text">{VOUCHERS[it.id].text}</div>
        </>
      );
      break;
  }
  return (
    <TiltCard
      className={`shop-item ${it.sold ? 'sold' : ''}`}
      rarity={rarity}
      disabled={it.sold}
      testId={`shop-item-${index}`}
      tip={
        it.kind === 'cartridge'
          ? `cart:${it.id}`
          : it.kind === 'page'
            ? `struct:${it.id}`
            : `${it.kind}:${it.id}`
      }
    >
      <div className="item-top">
        <ArtIcon
          category={it.kind === 'page' ? 'page' : it.kind}
          id={it.id}
          name={itemTitle(it)}
          tone={rarity}
          className="item-art"
        />
        <div className="item-name">{itemTitle(it)}</div>
      </div>
      {body}
      <div className="item-buy">
        {it.sold ? (
          <span className="dim">SOLD</span>
        ) : (
          <span
            role="button"
            className={`pixel-btn ${cash >= it.price ? 'primary' : ''}`}
            onClick={(ev) => {
              ev.stopPropagation();
              sfx(cash >= it.price ? 'buy' : 'error');
              if (cash >= it.price)
                burstAt(ev.currentTarget, rarity === 'L' ? 'sparkle' : 'coins', rarity === 'L' ? 50 : 14);
              void act({ t: 'buy', index });
            }}
            data-testid={`buy-${index}`}
          >
            {it.price === 0 ? 'FREE' : `BUY $${it.price}`}
          </span>
        )}
      </div>
    </TiltCard>
  );
}

export function ShopView({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  const st = e.state;
  const shop = st.shop;
  const r = st.round;
  useHotkeys({ reroll: () => void act({ t: 'rerollShop' }), confirm: () => void act({ t: 'leaveShop' }) });
  if (!shop) return null;
  const nextIndex = (st.roundIndex + 1) % 3;
  const nextQ = st.roundIndex === 2 ? st.quarter + 1 : st.quarter;
  const nextName = nextIndex === 2 ? 'the Review' : `${quarterLabel(nextQ)} ${ROUND_NAMES[nextIndex]}`;
  const annual = st.endless ? nextQ % 4 === 0 : nextQ >= st.config.quarters;
  const nextTarget = computeTarget(
    nextQ,
    nextIndex,
    nextIndex === 2 && annual ? 'annual_review' : null,
    st.config,
  );
  const payout = r.payouts.reduce((a, p) => a + p.cash, 0);
  const cost = e.shopRerollCost();
  return (
    <div className="screen run-shop" data-testid="shop-screen">
      <div className="shop-head">
        <h1 className="screen-title">THE SHOP</h1>
        <div className="tb-item num">
          <span className="dim">CASH</span>{' '}
          <span className="amber-text big-cash" data-testid="shop-cash">
            ${st.cash}
          </span>
        </div>
        <div className="tb-item num">
          <span className="dim">EQUITY</span> {money(st.equityCents)}
        </div>
        <div className="tb-item num">
          <span className="dim">STRESS</span> {st.stress}
        </div>
      </div>
      <div className="shop-grid">
        <div className="panel shop-summary">
          <div className="section-title">
            Last round:{' '}
            {r.status === 'passed' ? (
              <span className="up-text">TARGET MET</span>
            ) : (
              <span className="down-text">MISSED (saved)</span>
            )}{' '}
            {r.meter.toLocaleString()} / {r.target.toLocaleString()}
          </div>
          {r.payouts.map((p, i) => (
            <div key={i} className="payout num">
              <span>{p.label}</span>
              <span className={p.cash >= 0 ? 'amber-text' : 'down-text'}>
                {p.cash >= 0 ? '+' : '−'}${Math.abs(p.cash)}
              </span>
            </div>
          ))}
          <div className="payout num total">
            <span>Total</span>
            <span className="amber-text">${payout}</span>
          </div>
          {r.taxCents > 0 && <div className="dim">Taxes set aside: {money(r.taxCents)}</div>}
        </div>
        <div className="shop-offers">
          <div className="offer-row">
            {shop.items.map((it, i) => (
              <ItemCard key={`${it.kind}-${it.id}-${i}-${shop.rerolls}`} e={e} it={it} index={i} />
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="pixel-btn"
              onClick={() => (sfx('deal'), void act({ t: 'rerollShop' }))}
              disabled={st.cash < cost}
              data-testid="shop-reroll"
              data-tip="g:shop_reroll"
            >
              REROLL {cost === 0 ? 'FREE' : `$${cost}`} <Kbd>R</Kbd>
            </button>
            <button
              className="pixel-btn primary"
              onClick={() => (sfx('whoosh'), void act({ t: 'leaveShop' }))}
              data-testid="leave-shop"
            >
              NEXT: {nextName.toUpperCase()} (target {nextTarget.toLocaleString()}
              {nextIndex === 2 && nextQ < st.config.quarters ? '+' : ''}) ▶ <Kbd>Enter</Kbd>
            </button>
          </div>
        </div>
      </div>
      <div className="panel loadout">
        <div className="section-title">Your cartridges (slot order matters: effects apply left to right)</div>
        <CartridgeRail e={e} editable />
        <div className="sell-row">
          {st.cartridges.map((id) => (
            <button
              key={id}
              className="pixel-btn"
              onClick={() => void act({ t: 'sell', cartridgeId: id })}
              data-testid={`sell-${id}`}
            >
              SELL {CARTRIDGE_BY_ID[id].name} +${sellPrice(CARTRIDGE_BY_ID[id])}
            </button>
          ))}
        </div>
        <div className="loadout-grid">
          <div>
            <div className="section-title">
              Analysts {st.analysts.length}/{e.analystSeats()}
            </div>
            {st.analysts.map((a) => (
              <div key={a.id} className="seat">
                {ANALYSTS[a.id].name} {a.level > 1 && <span className="chip">L2</span>}
                <button className="link-btn" onClick={() => void act({ t: 'fire', analyst: a.id })}>
                  let go
                </button>
              </div>
            ))}
          </div>
          <div>
            <div className="section-title">Memos {st.memos.length}/2</div>
            {st.memos.map((m, i) => (
              <div key={i} className="seat" title={MEMOS[m].text}>
                {MEMOS[m].name}
              </div>
            ))}
          </div>
          <div>
            <div className="section-title">Playbook</div>
            {DESKS[st.config.deskId].structures.map((s) => (
              <div key={s} className="seat num">
                {STRUCTURES[s].short} <span className="amber-text">LV {st.levels[s] ?? 1}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="section-title">Vouchers</div>
            {st.vouchers.length === 0 && <div className="dim">none</div>}
            {st.vouchers.map((v) => (
              <div key={v} className="seat" title={VOUCHERS[v].text}>
                {VOUCHERS[v].name}
              </div>
            ))}
          </div>
        </div>
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

export function ReviewIntro({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  const st = e.state;
  const id = st.nextReview;
  useHotkeys({ confirm: () => void act({ t: 'startReview' }) });
  if (!id) return null;
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
