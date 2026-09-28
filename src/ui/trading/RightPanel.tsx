import { useMemo, useState, type ReactNode } from 'react';
import { diffDays } from '../../engine/calendar';
import { envFromChain, payoffAtExpiry, payoffNow, plainGreeks, type PricingEnv } from '../../engine/strategies/metrics';
import { optionLegsOf } from '../../engine/lifecycle/position';
import type { Leg, OptionLeg } from '../../engine/strategies/types';
import { RR_RULES } from '../../content/structureRules';
import { money, pct, price } from '../format';
import { Meter, Pnl } from '../components/ui';
import { useTrading } from '../store/trading';

interface Curve {
  legs: Leg[];
  entryNet: number;
  qty: number;
  env: PricingEnv;
  spot: number;
  em: number | null;
  breakevens: number[];
}

function useCurve(): Curve | null {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  useTrading((s) => s.version);
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  if (!session || !cardId) return null;
  const view = session.view(cardId);
  const pos = session.openPositions().find((p) => p.cardId === cardId);
  if (pos) {
    const ivs = new Map(optionLegsOf(pos.legs).map((l, i) => [l, pos.lastLegs[i]?.iv ?? pos.entry.iv ?? 0.3] as const));
    const env: PricingEnv = { date: view.now, rate: view.rate(), divYield: 0, ivOf: (leg: OptionLeg) => ivs.get(leg) ?? 0.3 };
    return { legs: pos.legs, entryNet: pos.openNet, qty: pos.qty, env, spot: view.spot(), em: pos.entry.expectedMove, breakevens: [] };
  }
  const chain = session.chain(cardId);
  if (!plan || !plan.metrics || !chain || plan.mid === null) return null;
  return { legs: plan.legs, entryNet: plan.mid, qty: builder.qty, env: envFromChain(chain, view.rate(), 0), spot: chain.spot, em: plan.metrics.expectedMove, breakevens: plan.metrics.breakevens };
}

export function PayoffChart({ height = 190 }: { height?: number }) {
  const curve = useCurve();
  const whatIf = useTrading((s) => s.whatIf);
  const [hover, setHover] = useState<number | null>(null);
  const W = 310;
  const H = height;
  const pad = { l: 44, r: 8, t: 10, b: 20 };
  const data = useMemo(() => {
    if (!curve) return null;
    const span = Math.max((curve.em ?? curve.spot * 0.05) * 3, curve.spot * 0.12);
    const lo = curve.spot - span;
    const hi = curve.spot + span;
    const n = 90;
    const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
    const mult = 100 * curve.qty;
    const exp = xs.map((x) => payoffAtExpiry(curve.legs, curve.entryNet, x, curve.env) * mult);
    const now = xs.map((x) => payoffNow(curve.legs, curve.entryNet, x, curve.env, whatIf.days, whatIf.ivPts / 100) * mult);
    const all = [...exp, ...now];
    const ymin = Math.min(0, ...all);
    const ymax = Math.max(0, ...all);
    return { xs, exp, now, lo, hi, ymin, ymax: ymax === ymin ? ymin + 1 : ymax };
  }, [curve, whatIf.days, whatIf.ivPts]);
  if (!curve || !data) return <div className="payoff empty num">Build a trade to see its payoff.</div>;
  const sx = (x: number) => pad.l + ((x - data.lo) / (data.hi - data.lo)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + ((data.ymax - y) / (data.ymax - data.ymin)) * (H - pad.t - pad.b);
  const path = (ys: number[]) => ys.map((y, i) => `${i ? 'L' : 'M'}${sx(data.xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const whatSpot = curve.spot * (1 + whatIf.pricePct / 100);
  const hoverIdx = hover === null ? null : Math.round(((hover - data.lo) / (data.hi - data.lo)) * (data.xs.length - 1));
  return (
    <div className="payoff" data-testid="payoff-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width={W}
        height={H}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = data.lo + ((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * (data.hi - data.lo);
          setHover(x >= data.lo && x <= data.hi ? x : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={sy(0) - pad.t} fill="rgba(77,255,154,0.05)" />
        <rect x={pad.l} y={sy(0)} width={W - pad.l - pad.r} height={H - pad.b - sy(0)} fill="rgba(255,79,109,0.06)" />
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="#5b4bc4" />
        {curve.em && (
          <rect x={sx(curve.spot - curve.em)} y={pad.t} width={sx(curve.spot + curve.em) - sx(curve.spot - curve.em)} height={H - pad.t - pad.b} fill="rgba(157,107,255,0.08)" />
        )}
        <path d={path(data.now)} fill="none" stroke="#ffbf3e" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={path(data.exp)} fill="none" stroke="#3ef2ff" strokeWidth={2} />
        <line x1={sx(curve.spot)} x2={sx(curve.spot)} y1={pad.t} y2={H - pad.b} stroke="#ff3ea5" strokeDasharray="2 2" />
        {whatIf.pricePct !== 0 && <line x1={sx(whatSpot)} x2={sx(whatSpot)} y1={pad.t} y2={H - pad.b} stroke="#ffbf3e" />}
        {curve.breakevens.map((b) => (
          <circle key={b} cx={sx(b)} cy={sy(0)} r={3} fill="#ffbf3e" />
        ))}
        <text x={2} y={sy(data.ymax) + 10} className="axis">
          {Math.round(data.ymax)}
        </text>
        <text x={2} y={sy(data.ymin)} className="axis">
          {Math.round(data.ymin)}
        </text>
        <text x={pad.l} y={H - 4} className="axis">
          {data.lo.toFixed(0)}
        </text>
        <text x={W - pad.r - 24} y={H - 4} className="axis">
          {data.hi.toFixed(0)}
        </text>
        {hover !== null && hoverIdx !== null && (
          <>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={H - pad.b} stroke="#ece9ff" strokeOpacity={0.4} />
            <text x={pad.l + 4} y={pad.t + 12} className="axis hover">
              @{hover.toFixed(2)} exp {Math.round(data.exp[hoverIdx])} · now {Math.round(data.now[hoverIdx])}
            </text>
          </>
        )}
      </svg>
      <div className="payoff-legend num">
        <span className="cyan-text">— at expiration</span> <span className="amber-text">- - today{curve && whatIf.days ? ` +${whatIf.days}d` : ''}</span>
      </div>
    </div>
  );
}

function Row({ k, v, testId }: { k: string; v: ReactNode; testId?: string }) {
  return (
    <div className="stat-row num" data-testid={testId}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function StatsBlock() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  useTrading((s) => s.version);
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  if (!session || !cardId) return null;
  const ctx = session.context(cardId);
  const pos = session.openPositions().find((p) => p.cardId === cardId);
  if (pos) {
    const mark = pos.marks[pos.marks.length - 1];
    const greeks = mark?.greeks ?? { delta: 0, gamma: 0, theta: 0, vega: 0 };
    return (
      <div className="stats" data-testid="stats-block">
        <Row k="P/L" v={<Pnl cents={mark?.plCents ?? 0} />} testId="stat-pl" />
        <Row k="% of risk" v={pct((mark?.plCents ?? 0) / Math.max(1, pos.entry.maxLossCents))} />
        <Row k="Max loss" v={money(pos.entry.maxLossCents)} />
        <Row k="DTE" v={pos.entry.dte - diffDays(pos.openedOn, session.view(cardId).now)} />
        <div className="greeks-plain">
          {plainGreeks(greeks, pos.qty).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      </div>
    );
  }
  if (!plan) return <div className="stats num">Pick an expiration to start building.</div>;
  const m = plan.metrics;
  const edge = plan.edge;
  const rule = RR_RULES[builder.structureId];
  return (
    <div className="stats" data-testid="stats-block">
      {m && (
        <>
          <Row k={m.entryNet < 0 ? 'Credit (mid)' : 'Debit (mid)'} v={`${price(Math.abs(m.entryNet))} × ${builder.qty}`} testId="stat-net" />
          <Row k="Max profit" v={plan.maxProfitCents === null ? 'unlimited' : money(plan.maxProfitCents)} testId="stat-maxprofit" />
          <Row k="Max loss" v={money(plan.maxLossCents)} testId="stat-maxloss" />
          <Row k="Breakeven" v={m.breakevens.map((b) => price(b)).join(' / ') || '—'} />
          <Row k="POP" v={pct(m.pop, 0)} testId="stat-pop" />
          <Row k="R:R" v={m.rewardToRisk === null ? '—' : `1 : ${(1 / Math.max(1e-9, m.rewardToRisk)).toFixed(2)}`} />
          <Row k="Exp. move" v={m.expectedMove === null ? '—' : `±${price(m.expectedMove)} (${pct(m.expectedMove / ctx.spot)})`} />
        </>
      )}
      <Row k="IV rank" v={ctx.ivr === null ? '—' : `${ctx.ivr.toFixed(0)} · IV ${pct(ctx.iv30, 0)} vs HV ${pct(ctx.hv20, 0)}`} testId="stat-ivr" />
      <div className={`rr-rule num ${plan.goodRR ? 'good' : ''}`}>
        {plan.goodRR ? '✔' : '✘'} {rule.text}
      </div>
      <div className="edge" data-testid="edge-meter">
        <div className="section-title">Edge Rank</div>
        {edge ? (
          <>
            <Meter value={edge.percentile} max={1} tone={edge.tier === 'top10' ? 'amber' : edge.tier === 'top25' ? 'magenta' : 'cyan'} />
            <div className="edge-label num">
              beats {Math.round(edge.percentile * 100)}% of {edge.of} comparable spreads ·{' '}
              <span className={edge.tier === 'none' ? 'dim' : 'amber-text'}>{edge.tier === 'top10' ? 'TOP 10% ×1.5' : edge.tier === 'top25' ? 'TOP 25% ×1.25' : 'no bonus'}</span>
            </div>
          </>
        ) : (
          <div className="num dim">No comparable spreads to rank.</div>
        )}
      </div>
      {m && (
        <div className="greeks-plain">
          {plainGreeks(m.greeks, builder.qty).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
