/**
 * The payout: a closed trade's scoring played out in three acts the eye can follow.
 *
 * 1. The register prints the trade's receipt: the P/L, then each base source (structure, levels,
 *    R:R, the call, discipline, Edge...). Each line's number flies off the receipt into the
 *    CHIPS × MULT scoreboard.
 * 2. A coin launches from the register and runs along the Joker Row in slot order. A cartridge it
 *    hits freezes for a beat, flashes and slams, pops what it added and why, and sends that to the
 *    scoreboard; the combo, the pitch and the shake build. A cartridge that doesn't apply lets the
 *    coin pass, greys out and says what it needs.
 * 3. The jackpot: CHIPS × MULT assembles mid-screen, the total slams in and flies to the round's
 *    score. Clearing the round's target sets it on fire.
 *
 * A loss prints on the register only (losses are never multiplied). Every number is the engine's
 * own trace, shown ×10 as whole numbers. One payout plays at a time and the clock waits for it.
 * A click, Space or Enter skips to the end.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { CARTRIDGE_SUMMARY } from '../../content/summaries';
import type { RunEngine } from '../../engine/run/engine';
import { exitKind } from '../../engine/run/exits';
import type { TraceRow } from '../../engine/scoring/mult';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx, type SfxName } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { SCORE_SCALE, money, multText, pts, ptsSigned } from '../format';
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

type Op = TraceRow['op'];
type Box = 'chips' | 'mult' | 'score';
type Tally = Extract<PayoutItem, { kind: 'trade' }>['tally'];

/** Chips as the screen shows them: whole, at ×10. */
const shown = (chips: number) => Math.round(chips * SCORE_SCALE);
const signedInt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toLocaleString('en-US')}`;

const BOX: Record<Op, Box> = { chips: 'chips', chipsMul: 'chips', add: 'mult', mul: 'mult', meter: 'score' };
const VOICE: Record<Op, SfxName> = {
  chips: 'chip',
  add: 'multAdd',
  mul: 'multX',
  chipsMul: 'multX',
  meter: 'multX',
};
const SCORING = new Set(['chips', 'mult', 'xmult']);

/** What a row adds, short (for the flying token) and long (for the receipt and the pop). */
function rowText(r: TraceRow, prevChips: number): { tok: string; long: string } {
  switch (r.op) {
    case 'chips': {
      const d = shown(r.chips) - shown(prevChips);
      return { tok: signedInt(d), long: `${signedInt(d)} CHIPS` };
    }
    case 'add':
      return { tok: `+${multText(r.value)}`, long: `+${multText(r.value)} MULT` };
    case 'mul':
      return { tok: `×${multText(r.value)}`, long: `×${multText(r.value)} MULT` };
    case 'chipsMul':
      return { tok: `×${multText(r.value)}`, long: `×${multText(r.value)} CHIPS` };
    case 'meter':
      return { tok: `×${multText(r.value)}`, long: `×${multText(r.value)} SCORE` };
  }
}

interface Line {
  k: string;
  text: string;
  amt?: string;
  op?: Op;
  cls?: string;
}

interface Board {
  chips: number;
  mult: number;
  meter: number;
  bump: Record<Box, number>;
}

const sleepRaf = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const centre = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
};

function Payout({ item, e }: { item: Extract<PayoutItem, { kind: 'trade' }>; e: RunEngine }) {
  const t = item.tally;
  const rows = t.trace;
  const speed = useApp((s) => s.settings.game.payoutSpeed ?? 'normal');
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const shakeOn = useApp((s) => s.settings.display.shake);
  const pace = speed === 'fast' || reduced ? 0.5 : 1;
  const skipN = usePayout((s) => s.skipN);
  const skip0 = useRef(skipN);

  const [top, setTop] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [board, setBoard] = useState<Board>({
    chips: 0,
    mult: 1,
    meter: 1,
    bump: { chips: 0, mult: 0, score: 0 },
  });
  const [combo, setCombo] = useState(0);
  const [jack, setJack] = useState<'eq' | 'total' | null>(null);
  const [lossTotal, setLossTotal] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [quake, setQuake] = useState({ n: 0, big: false });

  const root = useRef<HTMLDivElement>(null);
  const fxLayer = useRef<HTMLDivElement>(null);
  const coin = useRef<HTMLDivElement>(null);
  const boxes = {
    chips: useRef<HTMLDivElement>(null),
    mult: useRef<HTMLDivElement>(null),
    score: useRef<HTMLDivElement>(null),
  };
  const register = useRef<HTMLDivElement>(null);
  const jackEl = useRef<HTMLDivElement>(null);
  const bigEl = useRef<HTMLSpanElement>(null);
  const ctl = useRef({ dead: false, over: false, timers: new Set<number>(), trail: false });

  const meterAfter = t.meterAfter ?? 0;
  const before = meterAfter - t.points;
  const target = t.target ?? 0;
  const clears = t.points > 0 && target > 0 && before < target && meterAfter >= target;
  const plan = t.exitReason === 'stop';
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

  // The rows split into the receipt's base lines, the cartridges (in slot order) and what comes
  // after them (the Landlord's cut, memos).
  const firstCart = rows.findIndex((r, i) => i > 0 && r.kind === 'cartridge');
  const cartEnd =
    firstCart < 0 ? -1 : rows.length - [...rows].reverse().findIndex((r) => r.kind === 'cartridge');
  const baseIdx = rows.map((_, i) => i).filter((i) => i > 0 && (firstCart < 0 || i < firstCart));
  const tailIdx = firstCart < 0 ? [] : rows.map((_, i) => i).filter((i) => i >= cartEnd);
  const cartIdx = firstCart < 0 ? [] : rows.map((_, i) => i).filter((i) => i >= firstCart && i < cartEnd);
  const meterAt = rows.map((_, i) =>
    rows.slice(0, i + 1).reduce((a, r) => (r.op === 'meter' ? a * r.value : a), 1),
  );
  const prevChips = (i: number) => (i > 0 ? rows[i - 1].chips : 0);
  // The coin's stops: each cartridge in slot order that fired, or that scores and could have.
  const active = new Set(e.activeCartridges());
  const fired = new Map<string, number[]>();
  for (const i of cartIdx) {
    const id = rows[i].source ?? '';
    fired.set(id, [...(fired.get(id) ?? []), i]);
  }
  const owned = e.state.cartridges.filter((id) => CARTRIDGE_BY_ID[id]);
  const stops = [
    ...owned
      .filter((id) => fired.has(id) || (active.has(id) && SCORING.has(CARTRIDGE_SUMMARY[id]?.kind ?? '')))
      .map((id) => ({ id, idx: fired.get(id) ?? [] })),
    ...[...fired.entries()].filter(([id]) => !owned.includes(id)).map(([id, idx]) => ({ id, idx })),
  ];
  const finalChips = rows[rows.length - 1]?.chips ?? 0;
  const finalMult = t.winner ? (rows[rows.length - 1]?.mult ?? 1) : 1;
  const finalMeter = meterAt[meterAt.length - 1] ?? 1;

  const headLines: Line[] = [
    { k: 'h0', text: 'DESK/OS · TRADE RECEIPT', cls: 'hd' },
    { k: 'h1', text: `${t.displaySymbol} ${STRUCTURES[t.structureId].short} · ${head}`, cls: 'hd' },
    { k: 'r0', text: '', cls: 'rule' },
  ];
  const rowLine = (i: number): Line => {
    const r = rows[i];
    const label =
      i === 0
        ? `${t.winner ? 'PROFIT' : 'LOSS'} ${t.realizedCents >= 0 ? '+' : '−'}${money(Math.abs(t.realizedCents))}`
        : r.label;
    return { k: `row${i}`, text: label, amt: rowText(r, prevChips(i)).long, op: r.op };
  };
  const cartSummary = (): Line => ({
    k: 'carts',
    text: 'YOUR CARTRIDGES',
    amt: `${fired.size} OF ${stops.length} FIRED`,
    cls: 'sub',
  });
  const allLines = (): Line[] => [
    ...headLines,
    rowLine(0),
    ...baseIdx.map(rowLine),
    ...(t.winner && stops.length ? [cartSummary()] : !t.winner ? cartIdx.map(rowLine) : []),
    ...tailIdx.map(rowLine),
    ...(t.winner ? [] : [{ k: 'note', text: 'Losses lose chips; nothing multiplies them.', cls: 'note' }]),
    { k: 'r1', text: '', cls: 'rule dbl' },
  ];

  const apply = (i: number) =>
    setBoard((b) => ({
      chips: rows[i].chips,
      mult: t.winner ? rows[i].mult : 1,
      meter: meterAt[i],
      bump: { ...b.bump, [BOX[rows[i].op]]: b.bump[BOX[rows[i].op]] + 1 },
    }));

  // Measure where the top bar ends: the stage sits below it, and the Joker Row and the score stay
  // lit above the dimmed board.
  useLayoutEffect(() => {
    const bar = document.querySelector('[data-testid="run-topbar"]')?.getBoundingClientRect();
    setTop(bar ? Math.round(bar.bottom) : 120);
  }, []);

  // Enter and Space skip, and go no further: mid-payout they must not confirm a ticket or start
  // the clock (the global hotkeys stand aside while this owns the keys).
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

  // ---- the imperative bits: tokens, pops, the coin and its trail ----
  const c = ctl.current;
  const wait = (ms: number) =>
    new Promise<void>((r) => {
      const id = window.setTimeout(() => {
        c.timers.delete(id);
        r();
      }, ms * pace);
      c.timers.add(id);
    });
  const alive = () => !c.dead;
  const shake = (big: boolean) => {
    if (!shakeOn || reduced) return;
    setQuake((q) => ({ n: q.n + 1, big }));
    if (big) useTrading.setState({ shake: useTrading.getState().shake + 1 });
  };
  const fly = async (from: Element | null, to: Element | null, text: string, kind: string, ms = 280) => {
    const a = centre(from);
    const b = centre(to);
    const layer = fxLayer.current;
    if (!a || !b || !layer) return;
    const tok = document.createElement('div');
    tok.className = `pay-tok num k-${kind}`;
    tok.textContent = text;
    layer.appendChild(tok);
    const an = tok.animate(
      [
        { left: `${a.x}px`, top: `${a.y}px`, transform: 'translate(-50%,-50%) scale(1.25)' },
        { left: `${b.x}px`, top: `${b.y}px`, transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0.75 },
      ],
      { duration: ms * pace, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' },
    );
    await an.finished.catch(() => undefined);
    tok.remove();
  };
  const pop = (at: Element | null, big: string, kind: string, why?: string) => {
    const r = at?.getBoundingClientRect();
    const layer = fxLayer.current;
    if (!r || !layer) return;
    const p = document.createElement('div');
    p.className = `pay-pop k-${kind}`;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.bottom - 6}px`;
    // Each reason wraps inside its own cartridge's column, so neighbors never touch.
    const col = at?.closest('.jr-card')?.getBoundingClientRect().width ?? r.width * 1.6;
    p.style.maxWidth = `${Math.round(col - 4)}px`;
    p.innerHTML = '';
    const b = document.createElement('b');
    b.className = 'num';
    b.textContent = big;
    p.appendChild(b);
    if (why) {
      const w = document.createElement('span');
      w.textContent = why;
      p.appendChild(w);
    }
    layer.appendChild(p);
  };
  const trail = () => {
    if (!c.trail || !coin.current || !fxLayer.current || reduced) return;
    const p = centre(coin.current);
    if (p) {
      const d = document.createElement('i');
      d.className = 'pay-trail';
      d.style.left = `${p.x}px`;
      d.style.top = `${p.y}px`;
      fxLayer.current.appendChild(d);
      window.setTimeout(() => d.remove(), 420);
    }
    requestAnimationFrame(trail);
  };
  const coinTo = async (to: Element | null, ms: number, lift = 0.12) => {
    const el = coin.current;
    const a = centre(el);
    const b = centre(to);
    if (!el || !a || !b) return;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - window.innerHeight * lift };
    const an = el.animate(
      [
        { left: `${a.x}px`, top: `${a.y}px` },
        { left: `${mid.x}px`, top: `${mid.y}px`, offset: 0.5 },
        { left: `${b.x}px`, top: `${b.y}px` },
      ],
      { duration: ms * pace, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' },
    );
    await an.finished.catch(() => undefined);
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    an.cancel();
  };
  const countBig = (to: number, ms: number) =>
    new Promise<void>((res) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / (ms * pace));
        if (bigEl.current)
          bigEl.current.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
        if (k < 1 && alive()) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
  const lineEl = (k: string) => register.current?.querySelector(`[data-line="${k}"] .pay-amt`) ?? null;
  const print = async (L: Line, row?: number, step = 0) => {
    setLines((ls) => [...ls, L]);
    for (let k = 0; k < 3; k++) {
      sfx('print', 1 + k * 0.08, 0.8);
      await wait(35);
    }
    if (row === undefined || !alive()) return;
    await sleepRaf();
    const r = rows[row];
    void fly(lineEl(L.k), boxes[BOX[r.op]].current, rowText(r, prevChips(row)).tok, BOX[r.op], 260).then(
      () => {
        if (!alive()) return;
        apply(row);
        if (row === 0) sfx(t.winner ? 'chip' : 'tick', t.winner ? 1 : 0.7, t.winner ? 1 : 0.7);
        else sfx(VOICE[r.op], Math.min(2.2, Math.pow(2, step / 12)));
      },
    );
  };

  // ---- the show ----
  useEffect(() => {
    usePayout.getState().setFocus(true);
    const run = async () => {
      if (t.winner) sfx('coin', 1, 0.8);
      if (t.planExit) window.setTimeout(() => sfx('stamp', 0.9), 160);
      await wait(260);
      for (const L of headLines) {
        if (!alive()) return;
        await print(L);
        await wait(40);
      }
      let step = 0;
      let gap = 340;
      await print(rowLine(0), 0, step++);
      await wait(gap);
      for (const i of baseIdx) {
        if (!alive()) return;
        await print(rowLine(i), i, step++);
        await wait(gap);
        gap = Math.max(170, gap * 0.88);
      }
      if (!alive()) return;
      if (!t.winner) {
        // A loss: only the meter's cuts and refunds, each flashing its cartridge.
        for (const i of [...cartIdx, ...tailIdx]) {
          if (!alive()) return;
          const src = rows[i].source;
          if (src && rows[i].kind === 'cartridge') usePayout.getState().setFx(src, 'fired', true);
          await print(rowLine(i), i, step++);
          await wait(gap);
        }
        await print({ k: 'note', text: 'Losses lose chips; nothing multiplies them.', cls: 'note' });
        await print({ k: 'r1', text: '', cls: 'rule dbl' });
        if (!alive()) return;
        setLossTotal(true);
        sfx(plan ? 'stop' : 'loss', 1, 0.9);
        await wait(1100);
        if (alive()) await land(true);
        return;
      }
      // The coin.
      if (stops.length) {
        await wait(220);
        const el = coin.current;
        const from = register.current?.getBoundingClientRect();
        if (!el || !from || !alive()) return;
        el.style.left = `${from.left + from.width / 2}px`;
        el.style.top = `${from.top + 18}px`;
        el.classList.add('on');
        el.animate(
          [
            { transform: 'translate(-50%,-50%) scale(.2)' },
            { transform: 'translate(-50%,-50%) scale(1.5)' },
            { transform: 'translate(-50%,-50%) scale(1)' },
          ],
          { duration: 300 * pace },
        );
        sfx('whoosh', 1.2, 0.7);
        await wait(300);
        c.trail = true;
        requestAnimationFrame(trail);
        let dur = 480;
        let hits = 0;
        for (const [n, s] of stops.entries()) {
          if (!alive()) return;
          // Measured fresh each time: a hit re-mounts the cartridge to replay its slam.
          const card = () => document.querySelector(`[data-testid="cart-${s.id}"] .jr-dev`);
          usePayout.getState().setFx(s.id, 'lit');
          if (card()) await coinTo(card(), dur, n === 0 ? 0.2 : 0.08);
          if (!alive()) return;
          const why = CARTRIDGE_SUMMARY[s.id]?.when;
          if (!s.idx.length) {
            usePayout.getState().setFx(s.id, 'idle');
            pop(card(), '✕', 'dud', why ? `Needs: ${why}` : undefined);
            sfx('dud', 1, 0.8);
            dur = Math.max(200, dur * 0.92);
            continue;
          }
          // Hit-stop: everything holds for a beat, then the cartridge fires.
          c.trail = false;
          usePayout.getState().setFx(s.id, 'fired', true);
          sfx('cartSlam', 1 + hits * 0.04);
          await wait(75);
          await sleepRaf();
          if (!alive()) return;
          hits++;
          setCombo(hits);
          const label = s.idx.map((i) => rowText(rows[i], prevChips(i)).long).join(' · ');
          pop(card(), label, BOX[rows[s.idx[0]].op], why);
          burstAt(card(), 'sparkle', 12 + hits * 6);
          shake(hits >= 3);
          for (const i of s.idx) {
            const r = rows[i];
            const st = step++;
            void fly(
              card() ?? boxes.chips.current,
              boxes[BOX[r.op]].current,
              rowText(r, prevChips(i)).tok,
              BOX[r.op],
            ).then(() => {
              if (!alive()) return;
              apply(i);
              sfx(VOICE[r.op], Math.min(2.2, Math.pow(2, st / 12)));
            });
            await wait(110);
          }
          c.trail = true;
          requestAnimationFrame(trail);
          await wait(140);
          dur = Math.max(200, dur * 0.85);
        }
        await wait(280);
      }
      if (!alive()) return;
      if (stops.length) await print(cartSummary());
      for (const i of tailIdx) {
        if (!alive()) return;
        await print(rowLine(i), i, step++);
        await wait(gap);
      }
      await print({ k: 'r1', text: '', cls: 'rule dbl' });
      if (!alive()) return;
      // The jackpot.
      setJack('eq');
      await sleepRaf();
      if (coin.current?.classList.contains('on')) await coinTo(jackEl.current, 420, 0.06);
      c.trail = false;
      coin.current?.classList.remove('on');
      if (!alive()) return;
      sfx('chip', Math.min(2.4, Math.pow(2, (step + 4) / 12)));
      await wait(420);
      if (!alive()) return;
      setJack('total');
      await countBig(shown(t.points), 380);
      if (!alive()) return;
      sfx('jackpot');
      shake(true);
      burstAt(jackEl.current, 'coins', 40);
      burstAt(jackEl.current, 'sparkle', 24);
      await wait(800);
      if (!alive()) return;
      if (clears) {
        setCleared(true);
        sfx('fire');
        burstAt(jackEl.current, 'embers', 40);
        await wait(1100);
      }
      if (alive()) await land(false);
    };
    void run();
    return () => {
      c.dead = true;
      c.trail = false;
      for (const id of c.timers) window.clearTimeout(id);
      c.timers.clear();
      usePayout.getState().setFocus(false);
    };
  }, []);

  // Home: the total flies to the round's score, and the score counts up as it lands.
  const land = async (loss: boolean) => {
    if (c.over) return;
    c.over = true;
    const from = loss ? root.current?.querySelector('[data-testid="payout-total"]') : jackEl.current;
    await fly(
      from ?? null,
      document.querySelector('[data-testid="round-meter"]'),
      ptsSigned(t.points),
      'total',
      420,
    );
    useRun.setState({ lastPoints: { points: t.points, n: (useRun.getState().lastPoints?.n ?? 0) + 1 } });
    sfx('tick', t.points >= 0 ? 1.6 : 0.7, 0.6);
    usePayout.getState().done(item.id);
  };

  // A skip: everything lands where it would have, then home.
  useEffect(() => {
    if (skipN === skip0.current || c.over) return;
    c.dead = true;
    c.trail = false;
    for (const id of c.timers) window.clearTimeout(id);
    c.timers.clear();
    fxLayer.current?.replaceChildren();
    coin.current?.classList.remove('on');
    setLines(allLines());
    setBoard((b) => ({ chips: finalChips, mult: finalMult, meter: finalMeter, bump: b.bump }));
    for (const s of stops) usePayout.getState().setFx(s.id, s.idx.length ? 'fired' : 'idle');
    setCombo(fired.size);
    if (t.winner) setJack('total');
    else setLossTotal(true);
    if (clears) setCleared(true);
    requestAnimationFrame(() => {
      if (bigEl.current) bigEl.current.textContent = shown(t.points).toLocaleString('en-US');
    });
    const id = window.setTimeout(() => {
      c.over = true;
      useRun.setState({ lastPoints: { points: t.points, n: (useRun.getState().lastPoints?.n ?? 0) + 1 } });
      sfx('tick', t.points >= 0 ? 1.6 : 0.7, 0.6);
      usePayout.getState().done(item.id);
    }, 350 * pace);
    return () => window.clearTimeout(id);
  }, [skipN]);

  const toward = target > 0 ? Math.max(0, Math.min(1, (jack === 'total' ? meterAfter : before) / target)) : 0;

  return (
    <div
      className={`pay-root ${quake.n ? `quake-${quake.n % 2 ? 'a' : 'b'}` : ''} ${quake.big ? 'quake-big' : ''}`}
      ref={root}
      aria-live="polite"
      data-owns-keys
    >
      <div className="pay-dim" style={{ top }} />
      <div
        className={`pay-stage ${t.winner ? 'win' : 'lose'} ${jack ? 'jack-on' : ''}`}
        style={{ top: top + 44 }}
        data-testid="payout"
        onClick={() => usePayout.getState().skip()}
      >
        <div className="pay-board num">
          <ScoreBox
            refEl={boxes.chips}
            k="chips"
            label="CHIPS"
            value={shown(board.chips).toLocaleString('en-US')}
            bump={board.bump.chips}
          />
          <span className="pay-x">×</span>
          <ScoreBox
            refEl={boxes.mult}
            k="mult"
            label="MULT"
            value={t.winner ? multText(board.mult) : '—'}
            bump={board.bump.mult}
          />
          <span className={`pay-x ${board.meter !== 1 || finalMeter !== 1 ? '' : 'gone'}`}>×</span>
          <ScoreBox
            refEl={boxes.score}
            k="score"
            label="SCORE ×"
            value={multText(board.meter)}
            bump={board.bump.score}
            hidden={finalMeter === 1}
          />
          <AnimatePresence>
            {combo > 0 && (
              <motion.span
                key={combo}
                className="pay-combo"
                initial={{ scale: 1.8, opacity: 0 }}
                animate={{ scale: Math.min(1.35, 1 + combo * 0.08), opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 14 }}
              >
                COMBO <b>×{combo}</b>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className={`pay-register ${jack ? 'faded' : ''}`} ref={register}>
          <div className="pay-slot" aria-hidden="true" />
          <ExitStamp t={t} />
          <div className="pay-paper num">
            {lines.map((L) => (
              <motion.div
                key={L.k}
                data-line={L.k}
                className={`pay-ln ${L.cls ?? ''} ${L.op ? `op-${BOX[L.op]}` : ''}`}
                initial={{ y: -10, opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
                animate={{ y: 0, opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
                transition={{ duration: 0.12 * pace }}
              >
                <span className="pay-lbl">{L.cls?.includes('rule') ? '' : L.text}</span>
                {L.amt !== undefined && <span className="pay-amt">{L.amt}</span>}
              </motion.div>
            ))}
            {lossTotal && (
              <motion.div
                className="pay-ln total down"
                data-testid="payout-total"
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
              >
                <span className="pay-lbl">TOTAL</span>
                <span className="pay-amt">{ptsSigned(t.points)} POINTS</span>
              </motion.div>
            )}
          </div>
          <div className="pay-hint dim">click or Space to skip</div>
        </div>

        <AnimatePresence>
          {jack && (
            <motion.div
              ref={jackEl}
              className={`pay-jack ${cleared ? 'on-fire' : ''}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            >
              <span className="pay-jk">JACKPOT</span>
              <span className="pay-eq num">
                <span className="k-chips">{shown(finalChips).toLocaleString('en-US')}</span> ×{' '}
                <span className="k-mult">{multText(finalMult)}</span>
                {finalMeter !== 1 && (
                  <>
                    {' '}
                    × <span className="k-score">{multText(finalMeter)}</span>
                  </>
                )}
              </span>
              {jack === 'total' && (
                <motion.span
                  className="pay-big num"
                  data-testid="payout-total"
                  initial={{ scale: 1.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 12 }}
                >
                  =<span ref={bigEl}>0</span>
                </motion.span>
              )}
              {target > 0 && (
                <div className="pay-goal num">
                  <div className="pay-bar">
                    <i style={{ width: `${toward * 100}%` }} />
                  </div>
                  <span>
                    {pts(jack === 'total' ? meterAfter : before)} / {pts(target)}
                  </span>
                </div>
              )}
              {cleared && (
                <motion.b
                  className="pay-cleared"
                  data-testid="payout-cleared"
                  initial={{ scale: 2.2, rotate: -14, opacity: 0 }}
                  animate={{ scale: 1, rotate: -5, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 14 }}
                >
                  TARGET CLEARED
                </motion.b>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="pay-fx" ref={fxLayer} />
      <div className="pay-coin" ref={coin}>
        $
      </div>
    </div>
  );
}

function ScoreBox({
  refEl,
  k,
  label,
  value,
  bump,
  hidden,
}: {
  refEl: RefObject<HTMLDivElement | null>;
  k: Box;
  label: string;
  value: string;
  bump: number;
  hidden?: boolean;
}) {
  return (
    <div ref={refEl} className={`pay-box k-${k} ${hidden ? 'gone' : ''}`}>
      <span className="pay-k">{label}</span>
      <motion.b
        key={bump}
        initial={{ scale: bump ? 1.35 : 1, y: bump ? -4 : 0 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 14 }}
      >
        {value}
      </motion.b>
    </div>
  );
}

/**
 * How this trade closed, stamped so each kind feels different: the plan's target or stop (with
 * what the stop saved against the max loss), a close by hand, or an expiry.
 */
function ExitStamp({ t }: { t: Tally }) {
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
