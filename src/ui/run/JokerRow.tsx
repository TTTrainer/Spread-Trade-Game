/**
 * The Joker Row: your cartridges as game cartridges along the top of the trading screen, in
 * slot order (the order they fire in), each with its art on the label, its name and what it adds.
 * The shell's color is the rarity. While you build a trade, the cartridges that would fire if it
 * wins light up and say what they'd add. The payout (Payout.tsx) fires them in place.
 */

import type { ReactNode } from 'react';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { ALL_FAMILIES, FAMILY_NAMES } from '../../content/families';
import { CARTRIDGE_SUMMARY, FAMILY_GLYPH } from '../../content/summaries';
import type { CartridgeDef, Rarity } from '../../content/types';
import type { RunEngine } from '../../engine/run/engine';
import { previewScore } from '../../engine/run/preview';
import type { ScoreStep } from '../../engine/scoring/mult';
import shellC from '../../../assets/ui/cartridge-shell-C.png';
import shellU from '../../../assets/ui/cartridge-shell-U.png';
import shellR from '../../../assets/ui/cartridge-shell-R.png';
import shellL from '../../../assets/ui/cartridge-shell-L.png';
import { ArtIcon, artUrl } from '../art';
import { chipsText, multText } from '../format';
import { BOSSES } from '../../content/bosses';
import { LockStamp } from '../trading/BossBanner';
import { usePayout } from '../store/payout';
import { useRun } from '../store/run';
import { liveCardId, tradeOpen, useTrading } from '../store/trading';

const SHELL: Record<Rarity, string> = { C: shellC, U: shellU, R: shellR, L: shellL };

/** What a step adds, short: "+150 chips", "+1 mult", "×2". */
export function stepShort(op: ScoreStep['op'], value: number): string {
  if (op === 'chips') return `+${chipsText(value)} chips`;
  if (op === 'add') return `+${multText(value)} mult`;
  if (op === 'chipsMul') return `×${multText(value)} chips`;
  return `×${multText(value)}`;
}

/** One cartridge as a game cartridge: the rarity's shell with the art on its label. */
export function CartridgeDevice({ def, className = '' }: { def: CartridgeDef; className?: string }) {
  const art = artUrl('cartridge', def.id);
  return (
    <span className={`jr-dev rar-${def.rarity} ${className}`} data-jr-dev={def.id}>
      <img className="jr-shell" src={SHELL[def.rarity]} alt="" draggable={false} />
      <span className="jr-label">
        {art ? (
          <img src={art} alt="" draggable={false} />
        ) : (
          <ArtIcon category="cartridge" id={def.id} name={def.name} tone={def.rarity} />
        )}
      </span>
    </span>
  );
}

function FamilyCounters({ e }: { e: RunEngine }) {
  const fam = e.families();
  return (
    <div className="fam-counters num">
      {ALL_FAMILIES.filter((f) => fam[f] > 0).map((f) => (
        <span
          key={f}
          className={`fam ${fam[f] >= (f === 'CHAOS' ? 1 : 2) ? 'on' : ''}`}
          data-tip={`family:${f}`}
        >
          <ArtIcon
            category="family"
            id={f}
            name={FAMILY_NAMES[f]}
            onlyIfUploaded
            className="fam-art"
            style={{ width: 16, height: 16 }}
          />
          {!artUrl('family', f) && <span className="fam-glyph">{FAMILY_GLYPH[f]}</span>}
          {FAMILY_NAMES[f].toUpperCase()}
          <span className="fam-pips" aria-label={`${fam[f]} of 4`}>
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={i <= fam[f] ? 'full' : ''} />
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The cartridges that would fire if the trade being built wins at max profit, and what each adds. */
function useWinPreview(e: RunEngine, enabled: boolean): Map<string, string> {
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  const cardId = useTrading(liveCardId);
  const session = useTrading((s) => s.session);
  const open = useTrading(tradeOpen);
  const implied = useTrading((s) => s.impliedCall)();
  useTrading((s) => s.version);
  const out = new Map<string, string>();
  if (!enabled || !plan || !cardId || !session || !open) return out;
  const call = implied
    ? {
        ...implied,
        emPct: plan.entry?.expectedMovePct ?? 0.05,
        horizonDays: plan.dte ?? 30,
        mode: session.config.callMode,
      }
    : null;
  const p = previewScore(e, plan, builder.structureId, cardId, call);
  if (!p) return out;
  for (const st of p.steps)
    if (st.source && CARTRIDGE_BY_ID[st.source])
      out.set(
        st.source,
        out.has(st.source)
          ? `${out.get(st.source)} ${stepShort(st.op, st.value)}`
          : stepShort(st.op, st.value),
      );
  return out;
}

function JokerCard({
  def,
  index,
  held,
  will,
  onMove,
  extra,
}: {
  def: CartridgeDef;
  index: number;
  held?: boolean;
  will?: string;
  onMove?: (dir: -1 | 1) => void;
  extra?: ReactNode;
}) {
  const sum = CARTRIDGE_SUMMARY[def.id];
  // A payout playing: the coin's stops light up and fire; the rest wait dimmed (Payout.tsx).
  const fx = usePayout((s) => s.fx[def.id]);
  const focus = usePayout((s) => s.focus);
  const play = fx ? `jr-${fx.state}` : focus ? 'jr-dim' : '';
  return (
    <div
      className={`jr-card rar-${def.rarity} ${held ? 'held' : ''} ${will && !focus ? 'will-fire' : ''} ${play}`}
      data-tip={`cart:${def.id}`}
      data-testid={`cart-${def.id}`}
      data-slot={index}
    >
      <CartridgeDevice key={fx?.hit ?? 0} def={def} className={fx?.hit ? 'jr-hit' : ''} />
      {will && !focus && (
        <span className="jr-will num" data-testid={`will-${def.id}`}>
          {will}
        </span>
      )}
      <span className="jr-name">{def.name}</span>
      <span className="jr-get num">
        {onMove && (
          <button className="jr-move" onClick={() => onMove(-1)} aria-label="Move left">
            ◀
          </button>
        )}
        <span className="jr-get-text">{sum?.get ?? ''}</span>
        {onMove && (
          <button className="jr-move" onClick={() => onMove(1)} aria-label="Move right">
            ▶
          </button>
        )}
      </span>
      {extra}
    </div>
  );
}

export function JokerRow({ e, editable, preview }: { e: RunEngine; editable?: boolean; preview?: boolean }) {
  const act = useRun((s) => s.act);
  const will = useWinPreview(e, !!preview);
  const slots = e.cartridgeSlots();
  const owned = e.state.cartridges;
  // The Bursar holds the leftmost cartridge for the round: it shows, stamped, but does nothing.
  const r = e.state.round;
  const held =
    r.bossId && (e.state.phase === 'round' || e.state.phase === 'review_intro') && e.rule().leftCartOff
      ? owned[0]
      : null;
  return (
    <div className="joker-row" data-testid="cartridge-rail" data-tip="g:cartridge_rail">
      <div className="jr-slots">
        {Array.from({ length: slots }, (_, i) => {
          const id = owned[i];
          const def = id ? CARTRIDGE_BY_ID[id] : null;
          if (!def)
            return (
              <div key={i} className="jr-card empty num">
                <span className="jr-empty">SLOT {i + 1}</span>
              </div>
            );
          return (
            <JokerCard
              key={id}
              def={def}
              index={i}
              held={id === held}
              will={id === held ? undefined : will.get(id)}
              onMove={editable ? (d) => void act({ t: 'move', from: i, to: i + d }) : undefined}
              extra={id === held ? <LockStamp text="TUITION" by={BOSSES[r.bossId!].name} /> : undefined}
            />
          );
        })}
      </div>
      <FamilyCounters e={e} />
    </div>
  );
}
