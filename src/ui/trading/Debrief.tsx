import { motion } from 'motion/react';
import { useState } from 'react';
import type { TradeDebrief } from '../../engine/trading/debrief';
import { MISTAKE_LABELS } from '../../engine/scoring/grade';
import { sfx } from '../../audio/sfx';
import { money, pct } from '../format';
import { Pnl, Stamp } from '../components/ui';

function AttributionBars({ d }: { d: TradeDebrief }) {
  const a = d.attribution;
  const parts: [string, number, string][] = [
    ['Direction (Δ+Γ)', a.direction, 'Stock moved'],
    ['Time (Θ)', a.time, 'Time decay'],
    ['Volatility (vega)', a.volatility, 'IV changed'],
    ['Execution', a.execution, 'Paid vs. mid'],
    ['Fees', a.fees, 'Commissions'],
    ['Residual', a.residual, 'Not explained by the Greeks'],
  ];
  const max = Math.max(1, ...parts.map((p) => Math.abs(p[1])));
  return (
    <div className="attrib num" data-testid="attribution">
      {parts.map(([label, v, hint]) => (
        <div key={label} className="attrib-row" title={hint}>
          <span className="attrib-label">{label}</span>
          <span className="attrib-bar">
            <span
              className={`attrib-fill ${v >= 0 ? 'pos' : 'neg'}`}
              style={{ width: `${(Math.abs(v) / max) * 50}%`, [v >= 0 ? 'left' : 'right']: '50%' }}
            />
          </span>
          <Pnl cents={v} />
        </div>
      ))}
      <div className="attrib-row total">
        <span className="attrib-label">Total</span>
        <span />
        <Pnl cents={a.total} />
      </div>
    </div>
  );
}

export function DebriefCard({ d, index, blind }: { d: TradeDebrief; index: number; blind: boolean }) {
  const [open, setOpen] = useState(false);
  const win = d.realizedCents > 0;
  return (
    <motion.div
      className={`receipt panel ${open ? 'open' : ''}`}
      initial={{ rotateY: 180, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay: 0.15 + index * 0.25, type: 'spring', stiffness: 200, damping: 20 }}
      onAnimationComplete={() => sfx('reveal', 0.9 + index * 0.1)}
      data-testid={`receipt-${index}`}
    >
      <button className="receipt-head" onClick={() => setOpen(!open)} data-testid={`receipt-toggle-${index}`}>
        <div>
          <div className="receipt-sym">
            {blind ? `${d.displaySymbol} → ` : ''}
            <span className="reveal">{d.realSymbol}</span>
          </div>
          <div className="dim num">
            {d.structureName} · {d.entryDate} → {d.exitDate} ({d.daysHeld}d) · {d.exitReason}
          </div>
        </div>
        <div className="receipt-pl">
          <Pnl cents={d.realizedCents} big testId={`receipt-pl-${index}`} />
          <div className="num dim">{pct(d.returnOnRisk, 0, true)} of risk</div>
        </div>
        <div className={`grade grade-${d.grade.grade}`}>{d.grade.grade}</div>
      </button>
      {!open && <Stamp text={win ? 'PROFIT' : 'LOSS'} tone={win ? 'good' : 'bad'} />}
      {open && (
        <div className="receipt-body">
          <div className="receipt-col">
            <div className="section-title">Reveal</div>
            <p className="num">{d.catalyst}</p>
            <div className="section-title">Why it made or lost money</div>
            <AttributionBars d={d} />
            <div className="section-title">Call result</div>
            <p className="num">{d.callLine}</p>
            <p className="num">
              SPY-style benchmark with the same capital at risk: <Pnl cents={d.benchmarkCents} /> · alpha{' '}
              <Pnl cents={d.alphaCents} />
            </p>
            {d.modeledMarks > 0 && (
              <p className="chip model">{d.modeledMarks} days were marked with modeled prices</p>
            )}
          </div>
          <div className="receipt-col">
            <div className="section-title">Decision grade {d.grade.grade}</div>
            <p className="outcome">{d.grade.outcome}</p>
            <ul className="checklist num">
              {d.grade.items.map((it) => (
                <li
                  key={it.id}
                  className={it.pass === null ? 'na' : it.pass ? 'pass' : 'fail'}
                  title={it.note}
                >
                  {it.pass === null ? '–' : it.pass ? '✔' : '✘'} {it.label}
                  <span className="dim"> · {it.note}</span>
                </li>
              ))}
            </ul>
            {d.tags.length > 0 && (
              <>
                <div className="section-title">Mistake tags</div>
                <div className="tags">
                  {d.tags.map((t) => (
                    <span key={t} className="chip bad">
                      {MISTAKE_LABELS[t]}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="section-title">Alternates (same dates, same chain, 1 unit)</div>
            <table className="alt-table num">
              <tbody>
                {d.alternates.map((a) => (
                  <tr key={a.id}>
                    <td>{a.label}</td>
                    <td>
                      <Pnl cents={a.plCents} />
                    </td>
                    <td>
                      {pct(a.returnPct, 0, true)} on {money(a.riskCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function DebriefStrip({ debriefs, blind }: { debriefs: TradeDebrief[]; blind: boolean }) {
  const total = debriefs.reduce((a, d) => a + d.realizedCents, 0);
  return (
    <div className="debrief" data-testid="debrief">
      <div className="debrief-head">
        <h2>Debrief</h2>
        <span className="num">
          Session P/L <Pnl cents={total} big />
        </span>
      </div>
      {debriefs.map((d, i) => (
        <DebriefCard key={d.positionId} d={d} index={i} blind={blind} />
      ))}
      {debriefs.length === 0 && <p className="dim">No trades closed.</p>}
    </div>
  );
}
