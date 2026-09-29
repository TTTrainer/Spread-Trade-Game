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

import { liveCardId, useTrading } from '../store/trading';
import { LivePnl } from './DayPlayer';

interface Curve {
  legs: Leg[];
  entryNet: number;
  qty: number;
  env: PricingEnv;
  spot: number;
  em: number | null;
  breakevens: number[];
}

export function useCurve(): Curve | null {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
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
        <defs>
          <clipPath id="pf-above">
            <rect x={0} y={0} width={W} height={Math.max(0, sy(0))} />
          </clipPath>
          <clipPath id="pf-below">
            <rect x={0} y={sy(0)} width={W} height={Math.max(0, H - sy(0))} />
          </clipPath>
        </defs>
        {/* Profit and loss at expiration, filled so the shape reads at a glance. */}
        <path
          d={`${path(data.exp)}L${sx(data.xs[data.xs.length - 1]).toFixed(1)},${sy(0).toFixed(1)}L${sx(data.xs[0]).toFixed(1)},${sy(0).toFixed(1)}Z`}
          fill="rgba(77,255,154,0.22)"
          clipPath="url(#pf-above)"
        />
        <path
          d={`${path(data.exp)}L${sx(data.xs[data.xs.length - 1]).toFixed(1)},${sy(0).toFixed(1)}L${sx(data.xs[0]).toFixed(1)},${sy(0).toFixed(1)}Z`}
          fill="rgba(255,79,109,0.22)"
          clipPath="url(#pf-below)"
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

/** Chance of profit as a needle on a red-to-green dial. */
function PopGauge({ pop }: { pop: number }) {
  const a = Math.max(0, Math.min(1, pop));
  const angle = -90 + a * 180;
  return (
    <div className="pop-gauge" data-tip="g:pop" data-testid="stat-pop">
      <svg viewBox="0 0 120 70" width={120} height={70}>
        <defs>
          <linearGradient id="popg" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#ff4f6d" />
            <stop offset="0.5" stopColor="#ffbf3e" />
            <stop offset="1" stopColor="#4dff9a" />
          </linearGradient>
        </defs>
        <path d="M 10 62 A 50 50 0 0 1 110 62" fill="none" stroke="#221a5c" strokeWidth={12} />
        <path
          d="M 10 62 A 50 50 0 0 1 110 62"
          fill="none"
          stroke="url(#popg)"
          strokeWidth={12}
          strokeDasharray={`${a * 157} 200`}
          className="pg-arc"
        />
        <g className="pg-needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1={60} y1={62} x2={60} y2={20} stroke="#ece9ff" strokeWidth={3} />
        </g>
        <circle cx={60} cy={62} r={5} fill="#ece9ff" />
      </svg>
      <div className="pg-v num">{Math.round(a * 100)}%</div>
      <div className="pg-k">CHANCE OF PROFIT</div>
    </div>
  );
}

/** What you can lose against what you can make, drawn to scale. */
function RiskReward({
  riskCents,
  rewardCents,
  good,
  rule,
}: {
  riskCents: number;
  rewardCents: number | null;
  good: boolean;
  rule: string;
}) {
  const reward = rewardCents ?? riskCents * 3;
  const top = Math.max(1, riskCents, reward);
  const ratio = reward > 0 ? riskCents / reward : Infinity;
  return (
    <div
      className="rr"
      data-tip-title="Reward vs risk"
      data-tip-body={`${rule} ${good ? 'This one passes: +1 mult if it wins.' : 'This one misses the rule, so no reward:risk bonus.'}`}
    >
      <div className="rr-row">
        <span className="rr-k">RISK</span>
        <span className="rr-bar loss" style={{ width: `${(riskCents / top) * 100}%` }} />
        <span className="rr-v num down">{money(riskCents)}</span>
      </div>
      <div className="rr-row">
        <span className="rr-k">REWARD</span>
        <span className="rr-bar gain" style={{ width: `${(reward / top) * 100}%` }} />
        <span className="rr-v num up">{rewardCents === null ? 'open' : money(reward)}</span>
      </div>
      <div className={`rr-ratio num ${good ? 'up' : 'down'}`} data-testid="stat-rr">
        {good ? '✔' : '✘'} risk {Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'} to make 1
      </div>
    </div>
  );
}

/** How much of the spread's width you collect: a third or more is the classic target. */
function PremiumBar({ credit, width }: { credit: number; width: number }) {
  const f = width > 0 ? Math.min(1, credit / width) : 0;
  return (
    <div className="premium-bar" data-tip="g:premium_bar">
      <div className="pb-head num">
        <span>PREMIUM</span>
        <span>
          {price(credit)} of ${price(width)} wide ·{' '}
          <b className={f >= 1 / 3 ? 'up' : ''}>{Math.round(f * 100)}%</b>
        </span>
      </div>
      <div className="pb-track">
        <span className="pb-fill" style={{ width: `${f * 100}%` }} />
        <span className="pb-mark" style={{ left: '33.3%' }} />
      </div>
    </div>
  );
}

export function StatsBlock() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
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
          <Stat k="OPEN P/L" v={<LivePnl pos={pos} />} tip="g:pl_open" testId="stat-pl" />
          <Stat k="% OF RISK" v={pct(pl / Math.max(1, pos.entry.maxLossCents))} tip="g:pct_risk" />
          <Stat k="MAX LOSS" v={money(pos.entry.maxLossCents)} tip="g:max_loss_trade" tone="down" />
          <Stat
            k="DAYS LEFT"
            v={pos.entry.dte - diffDays(pos.openedOn, session.view(cardId).now)}
            tip="g:dte"
          />
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
  const credit = m ? m.entryNet < 0 : false;
  return (
    <div className="stats" data-testid="stats-block">
      {m && (
        <div className="trade-visuals">
          <PopGauge pop={m.pop} />
          <RiskReward
            riskCents={plan.maxLossCents}
            rewardCents={plan.maxProfitCents}
            good={plan.goodRR}
            rule={rule.text}
          />
        </div>
      )}
      {m && credit && <PremiumBar credit={Math.abs(m.entryNet)} width={m.width} />}
      {m && (
        <div className="key-stats small">
          <Stat
            k={credit ? 'CREDIT (EACH)' : 'DEBIT (EACH)'}
            v={`${price(Math.abs(m.entryNet))}${plan.qty > 1 ? ` ×${plan.qty}` : ''}`}
            tip={credit ? 'g:credit' : 'g:debit'}
            testId="stat-net"
          />
          <Stat k="BREAKEVEN" v={m.breakevens.map((b) => price(b)).join(' / ') || '—'} tip="g:breakeven" />
          <Stat
            k="EXPECTED MOVE"
            v={m.expectedMove === null ? '—' : `±${pct(m.expectedMove / ctx.spot)}`}
            tip="g:expected_move"
          />
        </div>
      )}
      <div className="stat-chips num">
        <span
          className={`chip ${ctx.ivr !== null && ctx.ivr >= 50 ? 'magenta' : ''}`}
          data-testid="stat-ivr"
          data-tip-title="IV rank and IV vs HV"
          data-tip-body={`IV rank ${ctx.ivr === null ? 'n/a' : ctx.ivr.toFixed(0)} (0–100 over the last year). Implied volatility ${pct(ctx.iv30, 0)} against ${pct(ctx.hv20, 0)} realized: options look ${ctx.iv30 !== null && ctx.hv20 !== null && ctx.iv30 > ctx.hv20 ? 'rich (good for selling)' : 'cheap (good for buying)'}.`}
        >
          IV RANK {ctx.ivr === null ? '—' : ctx.ivr.toFixed(0)}
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
      {m && <GreeksLine g={m.greeks} units={plan.qty} />}
    </div>
  );
}
