/**
 * A boss's rewards, one screen each. First the trophy: a card that flips in to a fanfare, names the
 * permanent buff and shows exactly what it changed (before → after, counted in one line at a time),
 * then flies to your desk. Then the spoils (three free cartridges, take one) on their own screen.
 */

import { motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BALANCE } from '../../content/balance';
import { BOSSES, type BossId } from '../../content/bosses';
import { BOSS_TROPHIES } from '../../content/trophies';
import type { RunEngine } from '../../engine/run/engine';
import { sfx } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { Kbd } from '../components/ui';
import { useApp } from '../store/app';

export interface TrophyDelta {
  label: string;
  before: string;
  after: string;
}

const pct = (x: number) => `${(Math.round(x * 1000) / 10).toString()}%`;

/** What a trophy changed, in numbers: each of its effects as the value before it and now. */
export function trophyDeltas(e: RunEngine, id: BossId): TrophyDelta[] {
  const t = BOSS_TROPHIES[id].passive;
  const p = e.passives();
  const out: TrophyDelta[] = [];
  if (t.riskCapMult) {
    const now = BALANCE.risk.riskCapPct * p.riskCapMult;
    out.push({ label: 'Per-trade risk cap', before: pct(now / t.riskCapMult), after: pct(now) });
  }
  if (t.maxLossLineDelta) {
    const now = e.baseLossLinePct();
    out.push({
      label: 'Max-Loss Line (below your start)',
      before: pct(now - t.maxLossLineDelta),
      after: pct(now),
    });
  }
  if (t.stressGainMult) {
    out.push({
      label: 'Stress you take on',
      before: pct(p.stressGainMult / t.stressGainMult),
      after: pct(p.stressGainMult),
    });
  }
  if (t.interestCapAdd) {
    const now = BALANCE.cash.interestCap + p.interestCapAdd;
    out.push({ label: 'Most interest a round', before: `$${now - t.interestCapAdd}`, after: `$${now}` });
  }
  if (t.rerollCostDelta) {
    const base = BALANCE.shop.rerollBase;
    const now = Math.max(0, base + p.rerollCostDelta);
    out.push({
      label: 'Shop reroll',
      before: `$${Math.max(0, now - t.rerollCostDelta)}`,
      after: `$${now}`,
    });
  }
  if (t.freeFirstShopReroll) out.push({ label: 'First reroll every shop', before: 'paid', after: 'FREE' });
  if (t.shopSlotsAdd) {
    const now = BALANCE.shop.cartridgeOffers + p.shopSlotsAdd;
    out.push({ label: 'Cartridges on offer', before: String(now - t.shopSlotsAdd), after: String(now) });
  }
  if (t.analystOffersAdd) {
    const now = BALANCE.shop.analystOffers + p.analystOffersAdd;
    out.push({ label: 'Analysts on offer', before: String(now - t.analystOffersAdd), after: String(now) });
  }
  if (t.cartridgeSlotsAdd) {
    const now = e.cartridgeSlots();
    out.push({ label: 'Cartridge slots', before: String(now - t.cartridgeSlotsAdd), after: String(now) });
  }
  return out;
}

// A trophy cup, as a pixel map: G gold, L light gold, D dark gold, A the boss's color, B the base.
const CUP = [
  '..GGGGGGGGGGGG..',
  'GGLLLLLLLLLLLLGG',
  'G.GLLLLLLLLLLG.G',
  'G.GLLAAAAAALLG.G',
  'G.GLLAAAAAALLG.G',
  '.GGGLLAAAALLGGG.',
  '...GGLLAALLGG...',
  '....GGLLLLGG....',
  '......GDDG......',
  '......GDDG......',
  '.....GGDDGG.....',
  '....GGGGGGGG....',
  '...BBBBBBBBBB...',
  '...BBBBBBBBBB...',
];

export function PixelTrophy({ accent, px = 8 }: { accent: string; px?: number }) {
  const colors: Record<string, string> = {
    G: '#e7b53a',
    L: '#ffe08a',
    D: '#a7741c',
    A: accent,
    B: '#3a2a55',
  };
  const w = CUP[0].length;
  return (
    <svg
      className="pixel-trophy"
      width={w * px}
      height={CUP.length * px}
      viewBox={`0 0 ${w} ${CUP.length}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {CUP.flatMap((row, y) =>
        [...row].map((c, x) =>
          c in colors ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[c]} /> : null,
        ),
      )}
    </svg>
  );
}

/** The trophy reveal: the first of a boss's two reward screens. */
export function TrophyReveal({ e, id, onDone }: { e: RunEngine; id: BossId; onDone: () => void }) {
  const boss = BOSSES[id];
  const trophy = BOSS_TROPHIES[id];
  const deltas = trophyDeltas(e, id);
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const card = useRef<HTMLDivElement>(null);
  // flip: the card turns face up; rows: the deltas counted in; leaving: it flies to the desk.
  const [stage, setStage] = useState<'flip' | 'rows' | 'leaving'>(reduced ? 'rows' : 'flip');
  const [shown, setShown] = useState(reduced ? deltas.length : 0);

  useEffect(() => {
    if (stage !== 'flip') return;
    sfx('whoosh');
    const id = setTimeout(() => {
      sfx('fanfare');
      burstAt(card.current, 'firework', 60);
      setTimeout(() => burstAt(card.current, 'sparkle', 40), 220);
      setStage('rows');
    }, 620);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (stage !== 'rows' || shown >= deltas.length) return;
    const id = setTimeout(
      () => {
        sfx('multPop', 1 + shown * 0.12, 0.9);
        setShown(shown + 1);
      },
      shown === 0 ? 700 : 380,
    );
    return () => clearTimeout(id);
  }, [stage, shown]);

  const claim = () => {
    if (stage === 'leaving') return;
    // A first press mid-count finishes the count; the next one claims it.
    if (stage === 'flip' || shown < deltas.length) {
      setStage('rows');
      setShown(deltas.length);
      return;
    }
    sfx('stamp');
    setStage('leaving');
    setTimeout(onDone, reduced ? 0 : 520);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      claim();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const style = { '--boss-accent': boss.palette.accent, '--boss-tint': boss.palette.tint } as CSSProperties;
  return (
    <motion.div
      className="trophy-back"
      style={style}
      data-testid="trophy-reveal"
      data-owns-keys
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={claim}
    >
      <div className="tr-rays" aria-hidden />
      <motion.div
        className="tr-kicker num"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        ☠ {boss.name.toUpperCase()} BEATEN · YOUR PRIZE
      </motion.div>
      <motion.div
        ref={card}
        className="tr-card"
        initial={reduced ? false : { rotateY: 180, scale: 0.6, y: 40 }}
        animate={
          stage === 'leaving'
            ? { y: -480, x: -520, scale: 0.12, rotate: -20, opacity: 0 }
            : { rotateY: 0, scale: 1, y: 0 }
        }
        transition={
          stage === 'leaving'
            ? { duration: 0.5, ease: 'easeIn' }
            : { type: 'spring', stiffness: 140, damping: 14, delay: 0.15 }
        }
      >
        <div className="tr-face">
          <div className="tr-label num">TROPHY</div>
          <motion.div
            className="tr-cup"
            animate={stage === 'flip' ? {} : { y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          >
            <PixelTrophy accent={boss.palette.accent} px={9} />
          </motion.div>
          <h1 className="tr-name" data-testid="trophy-name">
            {trophy.name}
          </h1>
          <div className="tr-perm num">★ PERMANENT · FOR THE REST OF THE RUN ★</div>
          <p className="tr-text">{trophy.text}</p>
          <div className="tr-rows num" data-testid="trophy-deltas">
            {deltas.slice(0, shown).map((d) => (
              <motion.div
                key={d.label}
                className="tr-row"
                initial={{ x: -30, opacity: 0, scale: 1.2 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              >
                <span className="tr-k">{d.label}</span>
                <span className="tr-before">{d.before}</span>
                <span className="tr-arrow">→</span>
                <b className="tr-after">{d.after}</b>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
      <motion.button
        className="pixel-btn primary tr-claim"
        data-testid="trophy-claim"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: stage === 'leaving' ? 0 : 1, y: 0 }}
        transition={{ delay: reduced ? 0 : 1.2 }}
        onClick={(ev) => {
          ev.stopPropagation();
          claim();
        }}
      >
        PUT IT ON THE DESK <Kbd>Enter</Kbd>
      </motion.button>
    </motion.div>
  );
}
