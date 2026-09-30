/**
 * On the price chart: where the trade makes its most (a soft green band) and loses its most (a
 * soft red band) at expiration, a gold line where a narrow peak pays best, and the cushion
 * between today's price and the nearest short strike.
 */

import { useEffect, useState } from 'react';
import { payoffAtExpiry } from '../../engine/strategies/metrics';
import type { OptionLeg } from '../../engine/strategies/types';
import { chartBridge } from './chartBridge';
import { useCurve } from './RightPanel';
import { liveCardId, useTrading } from '../store/trading';
import { barsAhead } from './expiry';

interface Band {
  top: number;
  bottom: number;
}

export function ChartZones() {
  const curve = useCurve();
  const [, setTick] = useState(0);
  useTrading((s) => s.version);
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const timeframe = useTrading((s) => s.timeframe);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);
  const h = chartBridge.paneHeight();
  const w = chartBridge.plotWidth();
  if (!curve || h <= 0 || w <= 0) return null;
  const pTop = chartBridge.yToPrice(0);
  const pBot = chartBridge.yToPrice(h);
  if (pTop === null || pBot === null || pTop <= pBot) return null;
  // Sample the expiration payoff down the visible price range.
  const n = 120;
  const ys = Array.from({ length: n + 1 }, (_, i) => (h * i) / n);
  const pay = ys.map((y) => {
    const p = chartBridge.yToPrice(y) ?? 0;
    return payoffAtExpiry(curve.legs, curve.entryNet, p, curve.env);
  });
  const max = Math.max(...pay);
  const min = Math.min(...pay);
  const span = Math.max(1e-9, max - min);
  const bands = (hit: (v: number) => boolean): Band[] => {
    const out: Band[] = [];
    let start: number | null = null;
    pay.forEach((v, i) => {
      if (hit(v) && start === null) start = i;
      if ((!hit(v) || i === n) && start !== null) {
        out.push({ top: ys[start], bottom: ys[hit(v) ? i : i - 1] });
        start = null;
      }
    });
    return out;
  };
  const green = max > 0 ? bands((v) => v >= max - span * 0.02) : [];
  const red = min < 0 ? bands((v) => v <= min + span * 0.02) : [];
  // A peak narrower than a few pixels (a fly's center) gets a line instead of a band.
  const peaks = green.filter((b) => b.bottom - b.top < 6);
  const wide = green.filter((b) => b.bottom - b.top >= 6);
  const shorts = curve.legs
    .filter((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0)
    .map((l) => l.strike);
  const nearest = shorts.length
    ? shorts.reduce((a, k) => (Math.abs(k - curve.spot) < Math.abs(a - curve.spot) ? k : a))
    : null;
  // The zones cover the trade's own life, from the day it opens (today, for a plan) to
  // expiration, like a position box: where the trade is, without painting over the history.
  const now = session && cardId ? session.view(cardId).now : null;
  const exps = curve.legs.filter((l): l is OptionLeg => l.kind === 'option').map((l) => l.expiration);
  const exp = exps.length ? exps.reduce((a, b) => (a < b ? a : b)) : null;
  const todayX = chartBridge.xAhead(0);
  const expX = now && exp ? chartBridge.xAhead(barsAhead(now, exp, timeframe)) : null;
  const openX = curve.openedOn ? chartBridge.xForDate(curve.openedOn) : todayX;
  const left = Math.max(0, Math.min(w, openX ?? 0));
  const right = Math.max(0, Math.min(w, expX ?? w));
  const boxed = right - left >= 8;
  const box = boxed ? { left, width: right - left } : { left: 0, width: w };
  const ySpot = chartBridge.priceToY(curve.spot);
  const yK = nearest !== null ? chartBridge.priceToY(nearest) : null;
  const cushion = nearest !== null ? (curve.spot - nearest) / curve.spot : null;
  return (
    <div
      className={`chart-zones ${boxed ? 'boxed' : ''} ${curve.openedOn ? 'open' : 'plan'}`}
      style={{ left: box.left, width: box.width, height: h }}
      data-testid="chart-zones"
    >
      {curve.openedOn && boxed && (
        <div className="zone-entry num" data-testid="zone-entry">
          {curve.entryNet < 0
            ? `SOLD +${Math.abs(curve.entryNet).toFixed(2)}`
            : `BOUGHT −${curve.entryNet.toFixed(2)}`}
        </div>
      )}
      {wide.map((b, i) => (
        <div key={`g${i}`} className="zone win" style={{ top: b.top, height: b.bottom - b.top }} />
      ))}
      {red.map((b, i) => (
        <div key={`r${i}`} className="zone lose" style={{ top: b.top, height: b.bottom - b.top }} />
      ))}
      {peaks.map((b, i) => (
        <div key={`p${i}`} className="zone-peak num" style={{ top: (b.top + b.bottom) / 2 }}>
          <span>MAX PROFIT</span>
        </div>
      ))}
      {ySpot !== null && yK !== null && cushion !== null && Math.abs(yK - ySpot) > 14 && (
        <div
          className={`cushion num ${Math.abs(cushion) < 0.02 ? 'thin' : ''}`}
          data-tip="g:cushion"
          style={{
            top: Math.min(ySpot, yK),
            height: Math.abs(yK - ySpot),
            // At today's candle, whatever the box's width.
            ...(todayX !== null ? { left: Math.max(0, todayX - box.left + 10), right: 'auto' } : {}),
          }}
        >
          <span>
            {cushion >= 0 ? '▼' : '▲'} {(Math.abs(cushion) * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
