import { useMemo, useState, type ReactNode } from 'react';
import { diffDays } from '../../engine/calendar';
import {
  envFromChain,
  payoffAtExpiry,
  payoffNow,
  plainGreeks,
  type PricingEnv,
} from '../../engine/strategies/metrics';
import { optionLegsOf } from '../../engine/lifecycle/position';
import type { Leg, OptionLeg } from '../../engine/strategies/types';
import { RR_RULES } from '../../content/structureRules';
import { money, pct, price } from '../format';
import { Pnl } from '../components/ui';
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
    const ivs = new Map(
      optionLegsOf(pos.legs).map((l, i) => [l, pos.lastLegs[i]?.iv ?? pos.entry.iv ?? 0.3] as const),
    );
    const env: PricingEnv = {
      date: view.now,
      rate: view.rate(),
      divYield: 0,
      ivOf: (leg: OptionLeg) => ivs.get(leg) ?? 0.3,
    };
    return {
      legs: pos.legs,
      entryNet: pos.openNet,
      qty: pos.qty,
      env,
      spot: view.spot(),
      em: pos.entry.expectedMove,
      breakevens: [],
    };
  }
  const chain = session.chain(cardId);
  if (!plan || !plan.metrics || !chain || plan.mid === null) return null;
  return {
    legs: plan.legs,
    entryNet: plan.mid,
    qty: builder.qty,
    env: envFromChain(chain, view.rate(), 0),
    spot: chain.spot,
    em: plan.metrics.expectedMove,
    breakevens: plan.metrics.breakevens,
  };
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
    const now = xs.map(
      (x) => payoffNow(curve.legs, curve.entryNet, x, curve.env, whatIf.days, whatIf.ivPts / 100) * mult,
    );
    const all = [...exp, ...now];
    const ymin = Math.min(0, ...all);
    const ymax = Math.max(0, ...all);
    return { xs, exp, now, lo, hi, ymin, ymax: ymax === ymin ? ymin + 1 : ymax };
  }, [curve, whatIf.days, whatIf.ivPts]);
  if (!curve || !data) return <div className="payoff empty num">Build a trade to see its payoff.</div>;
  const sx = (x: number) => pad.l + ((x - data.lo) / (data.hi - data.lo)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + ((data.ymax - y) / (data.ymax - data.ymin)) * (H - pad.t - pad.b);
  const path = (ys: number[]) =>
    ys.map((y, i) => `${i ? 'L' : 'M'}${sx(data.xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const whatSpot = curve.spot * (1 + whatIf.pricePct / 100);
  const hoverIdx =
    hover === null ? null : Math.round(((hover - data.lo) / (data.hi - data.lo)) * (data.xs.length - 1));
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
        <rect
          x={pad.l}
          y={pad.t}
          width={W - pad.l - pad.r}
          height={sy(0) - pad.t}
          fill="rgba(77,255,154,0.05)"
        />
        <rect
          x={pad.l}
          y={sy(0)}
          width={W - pad.l - pad.r}
          height={H - pad.b - sy(0)}
          fill="rgba(255,79,109,0.06)"
        />
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="#5b4bc4" />
        {curve.em && (
          <rect
            x={sx(curve.spot - curve.em)}
            y={pad.t}
            width={sx(curve.spot + curve.em) - sx(curve.spot - curve.em)}
            height={H - pad.t - pad.b}
            fill="rgba(157,107,255,0.08)"
          />
        )}
        <path d={path(data.now)} fill="none" stroke="#ffbf3e" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={path(data.exp)} fill="none" stroke="#3ef2ff" strokeWidth={2} />
        <line
          x1={sx(curve.spot)}
          x2={sx(curve.spot)}
          y1={pad.t}
          y2={H - pad.b}
          stroke="#ff3ea5"
          strokeDasharray="2 2"
        />
        {whatIf.pricePct !== 0 && (
          <line x1={sx(whatSpot)} x2={sx(whatSpot)} y1={pad.t} y2={H - pad.b} stroke="#ffbf3e" />
        )}
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
            <line
              x1={sx(hover)}
              x2={sx(hover)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="#ece9ff"
              strokeOpacity={0.4}
            />
            <text x={pad.l + 4} y={pad.t + 12} className="axis hover">
              @{hover.toFixed(2)} exp {Math.round(data.exp[hoverIdx])} · now {Math.round(data.now[hoverIdx])}
            </text>
          </>
        )}
      </svg>
      <div className="payoff-legend num" data-tip="g:payoff">
        <span className="cyan-text">— at expiration</span>{' '}
        <span className="amber-text">- - today{curve && whatIf.days ? ` +${whatIf.days}d` : ''}</span>
      </div>
    </div>
  );
}

function Stat({
  k,
  v,
  tip,
  tone,
  testId,
}: {
  k: string;
  v: ReactNode;
  tip: string;
  tone?: 'up' | 'down';
  testId?: string;
}) {
  return (
    <div className="kstat" data-tip={tip} data-testid={testId}>
      <div className="kstat-k">{k}</div>
      <div className={`kstat-v num ${tone ?? ''}`}>{v}</div>
    </div>
  );
}

/** The Greeks in plain words, tucked into one hover line so the panel stays clean. */
function GreeksLine({ g, units }: { g: Parameters<typeof plainGreeks>[0]; units: number }) {
  const lines = plainGreeks(g, units);
  return (
    <div className="greeks-line num" data-tip-title="What moves this trade" data-tip-body={lines.join(' ')}>
      <span className="ginfo">ⓘ</span> {lines[0]}
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
    const pl = mark?.plCents ?? 0;
    return (
      <div className="stats" data-testid="stats-block">
        <div className="key-stats">
          <Stat k="OPEN P/L" v={<Pnl cents={pl} />} tip="g:pl_open" testId="stat-pl" />
          <Stat k="% OF RISK" v={pct(pl / Math.max(1, pos.entry.maxLossCents))} tip="g:pct_risk" />
          <Stat k="MAX LOSS" v={money(pos.entry.maxLossCents)} tip="g:max_loss_trade" tone="down" />
          <Stat k="DTE" v={pos.entry.dte - diffDays(pos.openedOn, session.view(cardId).now)} tip="g:dte" />
        </div>
        <GreeksLine g={greeks} units={pos.qty} />
      </div>
    );
  }
  if (!plan) return <div className="stats num dim">Pick an expiration to start building.</div>;
  const m = plan.metrics;
  const edge = plan.edge;
  const rule = RR_RULES[builder.structureId];
  const edgeText = edge
    ? edge.tier === 'top10'
      ? 'TOP 10% ×1.5'
      : edge.tier === 'top25'
        ? 'TOP 25% ×1.25'
        : `${Math.round(edge.percentile * 100)}th pct`
    : 'n/a';
  return (
    <div className="stats" data-testid="stats-block">
      {m && (
        <div className="key-stats">
          <Stat
            k={m.entryNet < 0 ? 'CREDIT' : 'DEBIT'}
            v={`${price(Math.abs(m.entryNet))}${builder.qty > 1 ? ` ×${builder.qty}` : ''}`}
            tip={m.entryNet < 0 ? 'g:credit' : 'g:debit'}
            testId="stat-net"
          />
          <Stat
            k="MAX PROFIT"
            v={plan.maxProfitCents === null ? '∞' : money(plan.maxProfitCents)}
            tip="g:max_profit"
            tone="up"
            testId="stat-maxprofit"
          />
          <Stat
            k="MAX LOSS"
            v={money(plan.maxLossCents)}
            tip="g:max_loss_trade"
            tone="down"
            testId="stat-maxloss"
          />
          <Stat k="POP" v={pct(m.pop, 0)} tip="g:pop" testId="stat-pop" />
          <Stat k="BREAKEVEN" v={m.breakevens.map((b) => price(b)).join(' / ') || '—'} tip="g:breakeven" />
          <Stat
            k="EXP. MOVE"
            v={m.expectedMove === null ? '—' : `±${pct(m.expectedMove / ctx.spot)}`}
            tip="g:expected_move"
          />
        </div>
      )}
      <div className="stat-chips num">
        <span
          className={`chip ${plan.goodRR ? 'good' : 'bad'}`}
          data-tip-title="Reward : risk"
          data-tip-body={`${m?.rewardToRisk ? `This trade: 1 : ${(1 / Math.max(1e-9, m.rewardToRisk)).toFixed(2)}. ` : ''}${rule.text} ${plan.goodRR ? 'It passes: +1 mult if it wins.' : 'It misses the rule, so no R:R bonus.'}`}
        >
          R:R {plan.goodRR ? '✔' : '✘'}
        </span>
        <span
          className={`chip ${ctx.ivr !== null && ctx.ivr >= 50 ? 'magenta' : ''}`}
          data-testid="stat-ivr"
          data-tip-title="IV rank and IV vs HV"
          data-tip-body={`IV rank ${ctx.ivr === null ? 'n/a' : ctx.ivr.toFixed(0)} (0–100 over the last year). Implied volatility ${pct(ctx.iv30, 0)} against ${pct(ctx.hv20, 0)} realized: options look ${ctx.iv30 !== null && ctx.hv20 !== null && ctx.iv30 > ctx.hv20 ? 'rich (good for selling)' : 'cheap (good for buying)'}.`}
        >
          IVR {ctx.ivr === null ? '—' : ctx.ivr.toFixed(0)}
        </span>
        <span
          className={`chip ${edge && edge.tier !== 'none' ? 'warn' : ''}`}
          data-testid="edge-meter"
          data-tip-title="Edge Rank"
          data-tip-body={
            edge
              ? `Your price beats ${Math.round(edge.percentile * 100)}% of ${edge.of} similar spreads on this chain today. Top 25% scores ×1.25, top 10% ×1.5.`
              : 'No comparable spreads to rank against.'
          }
        >
          EDGE {edgeText}
        </span>
      </div>
      {m && <GreeksLine g={m.greeks} units={builder.qty} />}
    </div>
  );
}
