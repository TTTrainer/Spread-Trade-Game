/**
 * The exit plan's feedback loop, under its sliders on the month menu. A sample spread shows what
 * the plan does as the sliders move (the win it banks, the loss it cuts, the max loss it never
 * lets you reach), and the run's scorecard shows how your closes have actually gone: targets
 * banked, stops taken and what they saved, expiries, and closes by hand.
 */

import { motion } from 'motion/react';
import { DESKS } from '../../content/desks';
import { planExample, type ExitKind } from '../../engine/run/exits';
import type { RunEngine } from '../../engine/run/engine';
import { STRUCTURES } from '../../engine/strategies/structures';
import { money } from '../format';

const ROWS: { kind: ExitKind; glyph: string; name: string; cls: string }[] = [
  { kind: 'target', glyph: '▲', name: 'TARGETS', cls: 'up' },
  { kind: 'stop', glyph: '■', name: 'STOPS', cls: 'stop' },
  { kind: 'expired', glyph: '⌛', name: 'EXPIRED', cls: 'exp' },
  { kind: 'manual', glyph: '✋', name: 'BY HAND', cls: 'hand' },
];

const signedMoney = (c: number) => `${c >= 0 ? '+' : '−'}${money(Math.abs(c))}`;

export function ExitPlanFeedback({ e }: { e: RunEngine }) {
  const plan = e.exitPlan();
  const desk = DESKS[e.state.config.deskId];
  const credit = desk.structures.some((s) => STRUCTURES[s].credit);
  // A $1.00 credit on a $5-wide spread (or a $2.00 debit): round numbers that read at a glance.
  const ex = credit
    ? planExample(100, 500, plan.creditTargetPct, plan.creditStopMult)
    : {
        maxProfitCents: 400,
        targetCents: Math.round(200 * plan.debitTargetPct),
        stopCents: -Math.round(200 * plan.debitStopPct),
        maxLossCents: -200,
      };
  const lo = ex.maxLossCents;
  const hi = ex.maxProfitCents;
  const at = (c: number) => ((c - lo) / Math.max(1, hi - lo)) * 100;
  const capped = ex.stopCents > ex.maxLossCents;
  const exits = e.state.stats.exits ?? {};
  const closes = ROWS.reduce((a, r) => a + (exits[r.kind]?.n ?? 0), 0);
  return (
    <div className="epf" data-testid="exit-feedback">
      <div className="epf-k num">
        {credit ? 'ON A $1.00 CREDIT, $5-WIDE SPREAD' : 'ON A $2.00 DEBIT SPREAD'} (×100 shares)
      </div>
      <div className="epf-bar" aria-hidden="true">
        {capped && <i className="epf-cut" style={{ left: 0, width: `${at(ex.stopCents)}%` }} />}
        <i
          className="epf-risk"
          style={{ left: `${at(ex.stopCents)}%`, width: `${at(0) - at(ex.stopCents)}%` }}
        />
        <motion.i
          className="epf-bank"
          layout
          style={{ left: `${at(0)}%`, width: `${at(ex.targetCents) - at(0)}%` }}
        />
        <i className="epf-zero" style={{ left: `${at(0)}%` }} />
        <motion.b
          className="epf-mark stop"
          animate={{ left: `${at(ex.stopCents)}%` }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
        <motion.b
          className="epf-mark target"
          animate={{ left: `${at(ex.targetCents)}%` }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </div>
      <div className="epf-say num" data-testid="exit-example">
        <span className="up-text">▲ bank {signedMoney(ex.targetCents * 100)}</span>
        <span className="down-text">■ cut at {signedMoney(ex.stopCents * 100)}</span>
        <span className="dim">
          {capped
            ? `instead of up to ${signedMoney(ex.maxLossCents * 100)}`
            : 'the stop sits at the max loss'}
        </span>
      </div>
      <div className="epf-card num" data-testid="exit-scorecard">
        <span className="epf-title">THIS RUN</span>
        {closes === 0 ? (
          <span className="dim">No closes yet: each one lands here.</span>
        ) : (
          ROWS.filter((r) => exits[r.kind]?.n).map((r) => {
            const x = exits[r.kind]!;
            return (
              <span key={r.kind} className={`epf-chip ${r.cls}`} data-testid={`exit-${r.kind}`}>
                {r.glyph} {r.name} {x.n} · {signedMoney(x.cents)}
                {r.kind === 'stop' && x.savedCents > 0 && <b> · saved {money(x.savedCents)}</b>}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
