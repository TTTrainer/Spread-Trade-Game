/**
 * The payoff, full size: what the trade makes or loses at every price, at expiration and on any
 * day before it, with the market's expected move and where the price is likely to end drawn under
 * it. Breakevens, max profit and max loss, the strikes and today's price are labeled on the chart;
 * hovering reads out any price. The side panel says the position in plain words, lists the legs,
 * and copies the order as text (nothing is sent anywhere).
 */

import { useEffect, useMemo, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { atmIv, frontExpiration, payoffAtExpiry, payoffNow } from '../../engine/strategies/metrics';
import {
  describeTrade,
  legLines,
  orderText,
  priceDensity,
  probBetween,
  tradeName,
} from '../../engine/strategies/study';
import type { OptionLeg } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { money } from '../format';
import { liveCardId, useTrading } from '../store/trading';
import { useApp } from '../store/app';
import { useCurve } from './RightPanel';

function useBox(): [(el: HTMLDivElement | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 800, h: 420 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({
        w: Math.max(320, Math.round(e.contentRect.width)),
        h: Math.max(220, Math.round(e.contentRect.height)),
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box];
}

const usd = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

/** Round-number ticks across a range. */
function ticks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function PayoffStudio({ onClose }: { onClose: () => void }) {
  const curve = useCurve();
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const plan = useTrading((s) => s.plan)();
  const toast = useApp((s) => s.toast);
  // In the store, so the options course can see where the sliders are.
  const days = useTrading((s) => s.payoffDays);
  const ivPts = useTrading((s) => s.payoffIv);
  const setDays = (d: number) => useTrading.setState({ payoffDays: d });
  const setIvPts = (v: number) => useTrading.setState({ payoffIv: v });
  const [hover, setHover] = useState<number | null>(null);
  const [boxRef, box] = useBox();
  const metrics = plan?.metrics ?? null;
  const qty = plan?.qty ?? curve?.qty ?? 1;
  const card = session && cardId ? session.card(cardId) : null;
  const chain = session && cardId ? session.chain(cardId) : null;
  const front = curve ? frontExpiration(curve.legs) : null;
  const dte = curve && front ? Math.max(0, diffDays(curve.env.date, front)) : 0;
  const sigma = (chain && front ? atmIv(chain, front) : null) ?? plan?.entry?.iv ?? 0.3;
  useEffect(() => {
    if (days > dte) setDays(dte);
  }, [dte]);

  const data = useMemo(() => {
    if (!curve) return null;
    const strikes = curve.legs.filter((l): l is OptionLeg => l.kind === 'option').map((l) => l.strike);
    const em = curve.em ?? curve.spot * sigma * Math.sqrt(Math.max(dte, 1) / 365);
    const lo0 = Math.min(curve.spot - 2.4 * em, ...strikes);
    const hi0 = Math.max(curve.spot + 2.4 * em, ...strikes);
    const padX = (hi0 - lo0) * 0.08;
    const lo = Math.max(0.01, lo0 - padX);
    const hi = hi0 + padX;
    const n = 180;
    const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
    const mult = 100 * qty;
    const fin = (v: number) => (Number.isFinite(v) ? v : 0);
    const iv = ivPts / 100;
    const exp = xs.map((x) => fin(payoffAtExpiry(curve.legs, curve.entryNet, x, curve.env) * mult));
    const now = xs.map((x) => fin(payoffNow(curve.legs, curve.entryNet, x, curve.env, 0, iv) * mult));
    const at = xs.map((x) => fin(payoffNow(curve.legs, curve.entryNet, x, curve.env, days, iv) * mult));
    const dens = priceDensity(curve.spot, sigma, Math.max(dte, 0.5) / 365, curve.env.rate, xs);
    const all = [...exp, ...now, ...at];
    let ymin = Math.min(0, ...all);
    let ymax = Math.max(0, ...all);
    const pad = (ymax - ymin) * 0.12 || 1;
    ymin -= pad;
    ymax += pad;
    return { xs, exp, now, at, dens, lo, hi, ymin, ymax, em, strikes, mult };
  }, [curve, days, ivPts, sigma, dte, qty]);

  if (!curve || !data || !card)
    return (
      <div className="payoff-studio empty" data-testid="payoff-studio">
        <p className="num">Build a trade below (pick a strategy) and its payoff draws here.</p>
        <button className="pixel-btn" onClick={onClose}>
          BACK TO THE CHART
        </button>
      </div>
    );

  const W = box.w;
  const H = box.h;
  const P = { l: 64, r: 16, t: 18, b: 44 };
  const sx = (x: number) => P.l + ((x - data.lo) / (data.hi - data.lo)) * (W - P.l - P.r);
  const sy = (y: number) => P.t + ((data.ymax - y) / (data.ymax - data.ymin)) * (H - P.t - P.b);
  const path = (ys: number[]) =>
    ys.map((y, i) => `${i ? 'L' : 'M'}${sx(data.xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const area = (ys: number[]) =>
    `${path(ys)}L${sx(data.xs[data.xs.length - 1]).toFixed(1)},${sy(0).toFixed(1)}L${sx(data.xs[0]).toFixed(1)},${sy(0).toFixed(1)}Z`;
  const maxD = Math.max(...data.dens, 1e-9);
  const densH = (H - P.t - P.b) * 0.22;
  const densPath =
    data.xs
      .map(
        (x, i) =>
          `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${(H - P.b - (data.dens[i] / maxD) * densH).toFixed(1)}`,
      )
      .join('') + `L${sx(data.hi).toFixed(1)},${H - P.b}L${sx(data.lo).toFixed(1)},${H - P.b}Z`;
  const hi =
    hover === null ? null : Math.round(((hover - data.lo) / (data.hi - data.lo)) * (data.xs.length - 1));
  const years = Math.max(dte, 0.5) / 365;
  const below = (x: number) => probBetween(curve.spot, sigma, years, curve.env.rate, 0, x);
  const maxP = metrics?.maxProfit === null ? null : (metrics?.maxProfit ?? null);
  const net = plan?.mid ?? curve.entryNet;
  const symbol = card.displaySymbol;
  const order = plan ? orderText(symbol, plan.structureId, plan.legs, qty, net) : '';
  const copy = () => {
    sfx('click');
    void navigator.clipboard
      ?.writeText(order)
      .then(() => toast('Order copied. Check every leg before you send it at your broker.', 'info'))
      .catch(() => toast('Copy failed: select the order text and copy it by hand.', 'warn'));
  };
  const xt = ticks(data.lo, data.hi, 7);
  const yt = ticks(data.ymin, data.ymax, 5);
  const label = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(2));

  return (
    <div className="payoff-studio" data-testid="payoff-studio">
      <div className="ps-main">
        <div className="ps-head num">
          <b>
            {symbol} {plan ? tradeName(plan.structureId, plan.legs) : ''}
          </b>{' '}
          <span className="dim">
            {qty}× · {front ?? ''} ({dte}d) · IV {(sigma * 100).toFixed(0)}%
          </span>
          <span className="ps-legend">
            <span className="cyan-text">━ at expiration</span>
            <span className="amber-text">┅ today</span>
            {days > 0 && <span className="violet-text">━ in {days} days</span>}
            <span className="dim">▒ where it likely ends</span>
          </span>
        </div>
        <div className="ps-plot" ref={boxRef}>
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            data-testid="payoff-svg"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = data.lo + ((e.clientX - r.left - P.l) / (W - P.l - P.r)) * (data.hi - data.lo);
              setHover(x >= data.lo && x <= data.hi ? x : null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id="ps-up">
                <rect x={0} y={0} width={W} height={Math.max(0, sy(0))} />
              </clipPath>
              <clipPath id="ps-dn">
                <rect x={0} y={sy(0)} width={W} height={Math.max(0, H - sy(0))} />
              </clipPath>
            </defs>
            {/* The expected move: 1 standard deviation shaded, 2 dashed. */}
            <rect
              x={sx(curve.spot - data.em)}
              y={P.t}
              width={Math.max(0, sx(curve.spot + data.em) - sx(curve.spot - data.em))}
              height={H - P.t - P.b}
              className="ps-em"
            />
            {[-2, 2].map((k) => (
              <line
                key={k}
                x1={sx(curve.spot + k * data.em)}
                x2={sx(curve.spot + k * data.em)}
                y1={P.t}
                y2={H - P.b}
                className="ps-em2"
              />
            ))}
            <text x={sx(curve.spot + data.em) + 4} y={P.t + 12} className="ps-t em">
              +1σ {label(curve.spot + data.em)}
            </text>
            <text x={sx(curve.spot - data.em) + 4} y={P.t + 12} className="ps-t em">
              −1σ {label(curve.spot - data.em)}
            </text>
            <path d={densPath} className="ps-dens" />
            {yt.map((v) => (
              <g key={`y${v}`}>
                <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} className="ps-grid" />
                <text x={P.l - 6} y={sy(v) + 4} className="ps-t axis" textAnchor="end">
                  {usd(v)}
                </text>
              </g>
            ))}
            {xt.map((v) => (
              <text key={`x${v}`} x={sx(v)} y={H - P.b + 30} className="ps-t axis" textAnchor="middle">
                {label(v)}
              </text>
            ))}
            <path d={area(data.exp)} className="ps-win" clipPath="url(#ps-up)" />
            <path d={area(data.exp)} className="ps-loss" clipPath="url(#ps-dn)" />
            <line x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} className="ps-zero" />
            {maxP !== null && maxP !== undefined && (
              <g>
                <line
                  x1={P.l}
                  x2={W - P.r}
                  y1={sy(maxP * data.mult)}
                  y2={sy(maxP * data.mult)}
                  className="ps-max up"
                />
                <text x={W - P.r - 4} y={sy(maxP * data.mult) - 5} className="ps-t up" textAnchor="end">
                  MAX PROFIT {usd(maxP * data.mult)}
                </text>
              </g>
            )}
            {metrics && (
              <g>
                <line
                  x1={P.l}
                  x2={W - P.r}
                  y1={sy(-metrics.maxLoss * data.mult)}
                  y2={sy(-metrics.maxLoss * data.mult)}
                  className="ps-max down"
                />
                <text
                  x={W - P.r - 4}
                  y={sy(-metrics.maxLoss * data.mult) + 15}
                  className="ps-t down"
                  textAnchor="end"
                >
                  MAX LOSS {usd(-metrics.maxLoss * data.mult)}
                </text>
              </g>
            )}
            <path d={path(data.now)} className="ps-now" />
            {days > 0 && <path d={path(data.at)} className="ps-at" />}
            <path d={path(data.exp)} className="ps-exp" />
            {(metrics?.breakevens ?? []).map((b) => (
              <g key={`be${b}`}>
                <line x1={sx(b)} x2={sx(b)} y1={P.t} y2={H - P.b} className="ps-be" />
                <circle cx={sx(b)} cy={sy(0)} r={4} className="ps-be-dot" />
                <text x={sx(b)} y={sy(0) - 8} className="ps-t be" textAnchor="middle">
                  BE {b.toFixed(2)}
                </text>
              </g>
            ))}
            <line x1={sx(curve.spot)} x2={sx(curve.spot)} y1={P.t} y2={H - P.b} className="ps-spot" />
            <text x={sx(curve.spot)} y={H - P.b + 14} className="ps-t spot" textAnchor="middle">
              NOW {curve.spot.toFixed(2)}
            </text>
            {curve.legs
              .filter((l): l is OptionLeg => l.kind === 'option')
              .map((l, i) => (
                <g key={`k${i}`}>
                  <line
                    x1={sx(l.strike)}
                    x2={sx(l.strike)}
                    y1={H - P.b - 8}
                    y2={H - P.b}
                    className={`ps-k ${l.ratio < 0 ? 's' : 'l'}`}
                  />
                  <text
                    x={sx(l.strike)}
                    y={H - P.b - 12 - (i % 2) * 12}
                    className={`ps-t k ${l.ratio < 0 ? 's' : 'l'}`}
                    textAnchor="middle"
                  >
                    {l.ratio < 0 ? 'S' : 'L'} {l.strike}
                    {l.right}
                  </text>
                </g>
              ))}
            {hover !== null && hi !== null && (
              <g>
                <line x1={sx(hover)} x2={sx(hover)} y1={P.t} y2={H - P.b} className="ps-cross" />
                <circle cx={sx(hover)} cy={sy(data.exp[hi])} r={4} className="ps-dot exp" />
                {days > 0 && <circle cx={sx(hover)} cy={sy(data.at[hi])} r={4} className="ps-dot at" />}
              </g>
            )}
          </svg>
          {hover !== null && hi !== null && (
            <div
              className="ps-tip num"
              data-testid="payoff-hover"
              style={{
                left: Math.min(W - 230, sx(hover) + 12),
                top: P.t + 8,
              }}
            >
              <div>
                <b>{hover.toFixed(2)}</b>{' '}
                <span className="dim">
                  ({hover >= curve.spot ? '+' : '−'}
                  {Math.abs((hover / curve.spot - 1) * 100).toFixed(1)}% from now)
                </span>
              </div>
              <div>
                at expiration{' '}
                <b className={data.exp[hi] >= 0 ? 'up-text' : 'down-text'}>
                  {data.exp[hi] >= 0 ? '▲' : '▼'} {usd(data.exp[hi])}
                </b>
              </div>
              {days > 0 && (
                <div>
                  in {days} days{' '}
                  <b className={data.at[hi] >= 0 ? 'up-text' : 'down-text'}>
                    {data.at[hi] >= 0 ? '▲' : '▼'} {usd(data.at[hi])}
                  </b>
                </div>
              )}
              <div className="dim">
                ends below: {Math.round(below(hover) * 100)}% · above: {Math.round((1 - below(hover)) * 100)}%
              </div>
            </div>
          )}
        </div>
        <div className="ps-controls num">
          <label>
            <span>DATE</span>
            <input
              type="range"
              min={0}
              max={dte}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              data-testid="ps-days"
            />
            <b>{days === 0 ? 'today' : days >= dte ? 'expiration' : `+${days} days`}</b>
          </label>
          <label>
            <span>IV</span>
            <input
              type="range"
              min={-20}
              max={20}
              value={ivPts}
              onChange={(e) => setIvPts(Number(e.target.value))}
              data-testid="ps-iv"
            />
            <b>{ivPts === 0 ? 'as now' : `${ivPts > 0 ? '+' : ''}${ivPts} pts`}</b>
          </label>
        </div>
      </div>
      <aside className="ps-side num" data-testid="payoff-side">
        <div className={`ps-net ${net < 0 ? 'credit' : 'debit'}`}>
          <span>{net < 0 ? 'CREDIT' : 'DEBIT'}</span>
          <b>{money(Math.round(Math.abs(net) * 100 * qty * 100))}</b>
          <span className="dim">{Math.abs(net).toFixed(2)} a share</span>
        </div>
        {metrics && (
          <div className="ps-grid2">
            <div>
              <span className="dim">MAX PROFIT</span>
              <b className="up-text">{maxP === null ? 'unlimited' : usd(maxP * data.mult)}</b>
            </div>
            <div>
              <span className="dim">MAX LOSS</span>
              <b className="down-text">{usd(-metrics.maxLoss * data.mult)}</b>
            </div>
            <div>
              <span className="dim">BREAKEVEN</span>
              <b>{metrics.breakevens.map((b) => b.toFixed(2)).join(' / ') || '—'}</b>
            </div>
            <div>
              <span className="dim">CHANCE OF PROFIT</span>
              <b>{Math.round(metrics.pop * 100)}%</b>
            </div>
            <div>
              <span className="dim">EXPECTED MOVE</span>
              <b>±{data.em.toFixed(2)}</b>
            </div>
            <div>
              <span className="dim">REWARD : RISK</span>
              <b>{metrics.rewardToRisk === null ? '—' : `${metrics.rewardToRisk.toFixed(2)} : 1`}</b>
            </div>
          </div>
        )}
        {metrics && (
          <div className="ps-greeks" data-tip="g:greeks">
            <span>Δ {(metrics.greeks.delta * qty).toFixed(1)}</span>
            <span>Γ {(metrics.greeks.gamma * qty).toFixed(2)}</span>
            <span>Θ {usd(metrics.greeks.theta * qty)}/day</span>
            <span>V {usd(metrics.greeks.vega * qty)}/pt</span>
          </div>
        )}
        {plan && metrics && (
          <p className="ps-say" data-testid="payoff-say">
            {describeTrade({
              symbol,
              structureId: plan.structureId,
              qty,
              net,
              maxProfit: metrics.maxProfit,
              maxLoss: metrics.maxLoss,
              breakevens: metrics.breakevens,
              pop: metrics.pop,
              expiration: front,
              legs: curve.legs,
            })}
          </p>
        )}
        <div className="ps-legs" data-testid="payoff-legs">
          {legLines(curve.legs, qty, curve.env.date).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        {order && (
          <div className="ps-order">
            <code data-testid="order-text">{order}</code>
            <button className="pixel-btn primary" onClick={copy} data-testid="copy-order">
              ⧉ COPY ORDER
            </button>
            <span className="dim small">Paper analysis only. Nothing is sent to a broker.</span>
          </div>
        )}
      </aside>
    </div>
  );
}
