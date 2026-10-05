/**
 * The payout: a closed trade's scoring played out on screen, Balatro style. The P/L lands as
 * chips, then every source fires in the order the engine applied it: the structure base and
 * levels, then each cartridge in its slot (it jumps and pops a label saying what it added, on the
 * card here and on the rail up top), with the chips and mult counters ticking and the pitch
 * climbing a semitone a step. Then chips x mult slams into a total that flies to the score;
 * clearing the round's target sets it on fire. Every number shown is the engine's own trace.
 *
 * One payout plays at a time; the clock waits for it. A click, Space or Enter skips to the total.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { CARTRIDGE_SUMMARY } from '../../content/summaries';
import type { RunEngine } from '../../engine/run/engine';
import { exitKind } from '../../engine/run/exits';
import type { TraceRow } from '../../engine/scoring/mult';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx, type SfxName } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { ArtIcon } from '../art';
import { CountUp } from '../components/ui';
import { money } from '../format';
import { useApp } from '../store/app';
import { usePayout, type PayoutItem } from '../store/payout';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { CollectorNotice } from './CollectorNotice';

export function PayoutLayer() {
  const head = usePayout((s) => s.queue[0] ?? null);
  const e = useRun((s) => s.engine);
  if (!head || !e) return null;
  if (head.kind === 'interest') return <CollectorNotice key={head.id} item={head} />;
  return <Payout key={head.id} item={head} e={e} />;
}

const trim = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ''));
/** Chips are fractional (they come from P/L): small counts keep a decimal so the sum adds up. */
const chipDigits = (x: number) => (Math.abs(x) < 20 && Math.abs(x - Math.round(x)) >= 0.05 ? 1 : 0);
const chipText = (x: number) => x.toFixed(chipDigits(x));

/** What a step did, in the counter's words: "+30 chips", "+2 mult", "x1.5 mult". */
export function effectText(r: Pick<TraceRow, 'op' | 'value'>): string {
  switch (r.op) {
    case 'chips':
      return `${r.value >= 0 ? '+' : '−'}${chipText(Math.abs(r.value))} chips`;
    case 'add':
      return `+${trim(r.value)} mult`;
    case 'mul':
      return `×${trim(r.value)} mult`;
    case 'chipsMul':
      return `×${trim(r.value)} chips`;
    case 'meter':
      return `×${trim(r.value)} score`;
  }
}

const VOICE: Record<TraceRow['op'], SfxName> = {
  chips: 'chip',
  add: 'multAdd',
  mul: 'multX',
  chipsMul: 'multX',
  meter: 'multX',
};

/** Fire a cartridge on the run's rail up top too: a jump and a floating label above it. */
function fireOnRail(id: string, text: string, op: TraceRow['op']): void {
  const el = document.querySelector<HTMLElement>(`[data-testid="cart-${id}"]`);
  if (!el) return;
  el.classList.remove('cart-fire');
  // Restart the animation on a card that fires twice in a row.
  void el.offsetWidth;
  el.classList.add('cart-fire');
  setTimeout(() => el.classList.remove('cart-fire'), 520);
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `rail-float num op-${op}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.bottom + 4}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

function Payout({ item, e }: { item: Extract<PayoutItem, { kind: 'trade' }>; e: RunEngine }) {
  const t = item.tally;
  const speed = useApp((s) => s.settings.game.payoutSpeed ?? 'normal');
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const shakeOn = useApp((s) => s.settings.display.shake);
  const pace = speed === 'fast' || reduced ? 0.5 : 1;
  const rows = t.trace;
  // n = rows shown so far (row 0 is the P/L).
  const [n, setN] = useState(0);
  const [stage, setStage] = useState<'count' | 'total' | 'land'>('count');
  const [fired, setFired] = useState<Record<string, { text: string; k: number; op: TraceRow['op'] }>>({});
  const skipN = usePayout((s) => s.skipN);
  const skip0 = useRef(skipN);
  const skipped = skipN !== skip0.current;
  const panel = useRef<HTMLDivElement>(null);
  const meterAfter = t.meterAfter ?? 0;
  const before = meterAfter - t.points;
  const target = t.target ?? 0;
  const cleared = t.points > 0 && target > 0 && before < target && meterAfter >= target;
  const plan = t.exitReason === 'stop';

  // Enter and Space skip, and go no further: mid-payout they must not confirm a ticket or start
  // the clock (the global hotkeys stand aside while this panel owns the keys).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      usePayout.getState().skip();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Reveal one row, with its sound and its source's jump.
  const reveal = (i: number, quiet: boolean) => {
    const r = rows[i];
    if (!r) return;
    if (!quiet) {
      if (i === 0) sfx(t.winner ? 'coin' : 'loss', 1, 0.8);
      else
        sfx(VOICE[r.op], Math.min(2.2, Math.pow(2, (i - 1) / 12)), r.op === 'meter' && r.value < 1 ? 0.6 : 1);
    }
    if (i > 0 && r.kind === 'cartridge' && r.source) {
      const text = effectText(r);
      setFired((f) => ({ ...f, [r.source!]: { text, k: (f[r.source!]?.k ?? 0) + 1, op: r.op } }));
      if (!quiet) fireOnRail(r.source, text, r.op);
    }
  };

  useEffect(() => {
    if (stage !== 'count') return;
    if (skipped) {
      for (let i = n; i < rows.length; i++) reveal(i, true);
      setN(rows.length);
      setStage('total');
      return;
    }
    if (n >= rows.length) {
      const id = setTimeout(() => setStage('total'), 260 * pace);
      return () => clearTimeout(id);
    }
    const delay = n === 0 ? 240 * pace : Math.max(150, 430 * Math.pow(0.86, n - 1)) * pace;
    const id = setTimeout(() => {
      reveal(n, false);
      setN(n + 1);
    }, delay);
    return () => clearTimeout(id);
  }, [n, stage, skipped]);

  // The total: a slam (and fire if it clears the round), a beat to read it, then it flies home.
  useEffect(() => {
    if (stage !== 'total') return;
    if (t.points > 0) sfx('slam');
    else sfx(plan ? 'stop' : 'loss');
    // Plan exits get their stamp's thunk, so keeping the plan sounds different from winging it.
    if (t.planExit) setTimeout(() => sfx('stamp', 0.9), 140);
    if (cleared) {
      setTimeout(() => sfx('fire'), 120);
      burstAt(panel.current, 'coins', 40);
      if (shakeOn) useTrading.setState({ shake: useTrading.getState().shake + 1 });
    }
    const id = setTimeout(() => setStage('land'), (skipped ? 350 : cleared ? 1400 : 1000) * pace);
    return () => clearTimeout(id);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'land') return;
    const id = setTimeout(() => {
      useRun.setState({ lastPoints: { points: t.points, n: (useRun.getState().lastPoints?.n ?? 0) + 1 } });
      sfx('tick', t.points >= 0 ? 1.6 : 0.7, 0.6);
      usePayout.getState().done(item.id);
    }, 380);
    return () => clearTimeout(id);
  }, [stage]);

  // Where the total flies: the round's score in the top bar.
  const meterEl =
    typeof document !== 'undefined' ? document.querySelector('[data-testid="round-meter"]') : null;
  const fly = (() => {
    const m = meterEl?.getBoundingClientRect();
    const p = panel.current?.getBoundingClientRect();
    if (!m || !p) return { x: 0, y: -200 };
    return {
      x: m.left + m.width / 2 - (p.left + p.width / 2),
      y: m.top + m.height / 2 - (p.top + p.height / 2),
    };
  })();

  const shown = rows.slice(0, Math.max(1, n));
  const last = shown[shown.length - 1];
  const chips = n === 0 ? 0 : last.chips;
  const mult = n === 0 ? 1 : last.mult;
  const meterMult = shown.filter((r) => r.op === 'meter').reduce((a, r) => a * r.value, 1);
  const log = rows.slice(1, n).filter((r) => r.kind !== 'cartridge');
  const owned = e.state.cartridges.filter((id) => CARTRIDGE_BY_ID[id]);
  const head = t.winner
    ? t.exitReason === 'expired'
      ? 'EXPIRY PAYDAY'
      : t.exitReason === 'window_end'
        ? 'CLOSED AT THE BELL'
        : 'CASH OUT'
    : plan
      ? 'STOP TAKEN · PLAN KEPT'
      : t.exitReason === 'expired'
        ? 'EXPIRED'
        : 'LOSS';
  const toward =
    target > 0 ? Math.max(0, Math.min(1, (stage === 'count' ? before : meterAfter) / target)) : 0;

  return (
    <div className="payout-back" aria-live="polite" data-owns-keys>
      <motion.div
        ref={panel}
        className={`po-panel panel ${t.winner ? 'win' : 'lose'} ${stage === 'total' && cleared ? 'on-fire' : ''}`}
        data-testid="payout"
        onClick={() => usePayout.getState().skip()}
        initial={{ y: 40, scale: 0.9, opacity: 0 }}
        animate={
          stage === 'land'
            ? { x: fly.x, y: fly.y, scale: 0.15, opacity: 0 }
            : { x: 0, y: 0, scale: 1, opacity: 1 }
        }
        transition={
          stage === 'land'
            ? { duration: 0.38, ease: 'easeIn' }
            : { type: 'spring', stiffness: 320, damping: 22 }
        }
      >
        <div className="po-head">
          <span className={`po-kind ${t.winner ? 'up' : 'down'}`}>{head}</span>
          <span className="po-trade num">
            {t.displaySymbol} {STRUCTURES[t.structureId].short}
          </span>
          <span className={`po-pl num ${t.realizedCents >= 0 ? 'up-text' : 'down-text'}`}>
            {t.realizedCents >= 0 ? '▲ +' : '▼ −'}
            {money(Math.abs(t.realizedCents))}
          </span>
        </div>

        <ExitStamp t={t} />

        <div className="po-score">
          <motion.div
            key={`c${n}`}
            className="po-box chips num"
            initial={{ scale: n > 0 ? 1.12 : 1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            <span className="po-k">CHIPS</span>
            <b>
              <CountUp value={chips} digits={chipDigits(chips)} duration={200 * pace} />
            </b>
          </motion.div>
          <span className="po-x">×</span>
          <motion.div
            key={`m${mult}`}
            className="po-box mult num"
            initial={{ scale: n > 1 ? 1.15 : 1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            <span className="po-k">MULT</span>
            <b>{trim(Math.round(mult * 100) / 100)}</b>
          </motion.div>
          {meterMult !== 1 && (
            <>
              <span className="po-x">×</span>
              <div className="po-box po-score-x num">
                <span className="po-k">SCORE ×</span>
                <b>{trim(Math.round(meterMult * 100) / 100)}</b>
              </div>
            </>
          )}
        </div>

        {owned.length > 0 && (
          <div className="po-carts">
            {owned.map((id) => {
              const def = CARTRIDGE_BY_ID[id];
              const f = fired[id];
              return (
                <motion.div
                  key={`${id}-${f?.k ?? 0}`}
                  className={`po-cart ${f ? 'fired' : ''} op-${f?.op ?? 'none'}`}
                  data-testid={`po-cart-${id}`}
                  initial={f ? { y: -14, rotate: -8, scale: 1.18 } : false}
                  animate={{ y: 0, rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                >
                  <ArtIcon category="cartridge" id={id} name={def.name} tone={def.rarity} scale={0.55} />
                  <span className="po-cn">{def.name}</span>
                  <AnimatePresence>
                    {f && (
                      <motion.span
                        key={f.k}
                        className={`po-pop num op-${f.op}`}
                        initial={{ y: 8, opacity: 0, scale: 0.6 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                      >
                        {f.text}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {f && CARTRIDGE_SUMMARY[id] && <span className="po-why">{CARTRIDGE_SUMMARY[id].when}</span>}
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="po-log num">
          {rows[0] && n > 0 && (
            <div className="po-line pnl">
              <span>
                {t.winner ? 'Profit' : 'Loss'} {money(t.realizedCents)}
              </span>
              <b>{effectText(rows[0])}</b>
            </div>
          )}
          {log.slice(-4).map((r, i) => (
            <motion.div
              key={`${r.label}-${i}-${log.length}`}
              className={`po-line op-${r.op}`}
              initial={{ x: -12, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
            >
              <span>{r.label}</span>
              <b>{effectText(r)}</b>
            </motion.div>
          ))}
          {!t.winner && <div className="po-line dim">Losses lose chips; nothing multiplies them.</div>}
        </div>

        <AnimatePresence>
          {stage !== 'count' && (
            <motion.div
              className={`po-total num ${t.points >= 0 ? 'up' : 'down'}`}
              data-testid="payout-total"
              initial={{ scale: 2.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            >
              = {t.points >= 0 ? '+' : ''}
              <CountUp value={t.points} duration={420 * pace} /> <span className="po-k">POINTS</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="po-goal num">
          <div className="po-bar">
            <i className="po-fill" style={{ width: `${toward * 100}%` } as CSSProperties} />
            <i className="po-tick" />
          </div>
          <span>
            {Math.round(stage === 'count' ? before : meterAfter).toLocaleString()} / {target.toLocaleString()}
          </span>
          {stage !== 'count' && cleared && (
            <motion.b
              className="po-cleared"
              data-testid="payout-cleared"
              initial={{ scale: 2, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: -4, opacity: 1 }}
            >
              TARGET CLEARED
            </motion.b>
          )}
        </div>
        <div className="po-hint dim num">click or Space to skip</div>
      </motion.div>
    </div>
  );
}

/**
 * How this trade closed, stamped so each kind feels different: the plan's target or stop (with
 * what the stop saved against the max loss), a close by hand, or an expiry.
 */
function ExitStamp({ t }: { t: Extract<PayoutItem, { kind: 'trade' }>['tally'] }) {
  const kind = exitKind(t.planExit, t.exitReason);
  const saved =
    kind === 'stop' && t.maxLossCents !== undefined
      ? Math.max(0, t.maxLossCents - Math.max(0, -t.realizedCents))
      : 0;
  const text =
    kind === 'target'
      ? '✔ YOUR PLAN · TARGET BANKED'
      : kind === 'stop'
        ? `✔ YOUR PLAN · STOP TAKEN${saved > 0 ? ` · saved ${money(saved)} vs max loss` : ''}`
        : kind === 'manual'
          ? '✋ CLOSED BY HAND · off the plan'
          : kind === 'expired'
            ? '⌛ HELD TO EXPIRATION'
            : '◆ CLOSED BY THE DESK';
  return (
    <motion.div
      className={`po-exit num ${kind}`}
      data-testid="po-exit"
      data-kind={kind}
      initial={{ scale: 1.6, rotate: -6, opacity: 0 }}
      animate={{ scale: 1, rotate: -1.5, opacity: 1 }}
      transition={{ delay: 0.15, type: 'spring', stiffness: 520, damping: 16 }}
    >
      {text}
    </motion.div>
  );
}
