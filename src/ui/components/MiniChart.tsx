import { useRef, useState } from 'react';
import { bollinger, rsi, sma } from '../../engine/market/indicators';
import type { Bar } from '../../engine/market/types';

interface Props {
  bars: Bar[];
  width: number;
  height: number;
  /** Bars from this index on are the reveal (drawn brighter, after a divider). */
  revealFrom?: number;
  showBands?: boolean;
  showSma?: boolean;
  showRsi?: boolean;
  range?: { low: number; high: number } | null;
  onRange?: (r: { low: number; high: number }) => void;
  hLines?: { price: number; color: string; label?: string }[];
  testId?: string;
}

/** A small pixel-crisp SVG candle chart for drills, previews and the tutorial. */
export function MiniChart({ bars, width, height, revealFrom, showBands, showSma, showRsi, range, onRange, hLines = [], testId }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  if (bars.length === 0) return <svg width={width} height={height} />;
  const rsiH = showRsi ? Math.round(height * 0.22) : 0;
  const mainH = height - rsiH - (showRsi ? 6 : 0);
  const closes = bars.map((b) => b.close);
  const bb = showBands ? bollinger(closes, 20, 2) : [];
  const s50 = showSma ? sma(closes, 50) : [];
  let lo = Math.min(...bars.map((b) => b.low));
  let hi = Math.max(...bars.map((b) => b.high));
  for (const b of bb) {
    if (b.lower !== null) lo = Math.min(lo, b.lower);
    if (b.upper !== null) hi = Math.max(hi, b.upper);
  }
  if (range) {
    lo = Math.min(lo, range.low, range.high);
    hi = Math.max(hi, range.low, range.high);
  }
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const axisW = 52;
  const plotW = width - axisW;
  const step = plotW / bars.length;
  const x = (i: number) => i * step + step / 2;
  const y = (p: number) => ((hi - p) / (hi - lo)) * mainH;
  const priceAt = (py: number) => hi - (py / mainH) * (hi - lo);
  const r = showRsi ? rsi(closes, 14) : [];
  const ry = (v: number) => mainH + 6 + ((100 - v) / 100) * rsiH;
  const line = (vals: (number | null)[], yf: (v: number) => number) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${yf(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const evY = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? e.clientY - rect.top : 0;
  };
  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      className="minichart"
      data-testid={testId}
      onMouseDown={(e) => onRange && setDrag(priceAt(evY(e)))}
      onMouseMove={(e) => {
        if (onRange && drag !== null) onRange({ low: drag, high: priceAt(evY(e)) });
      }}
      onMouseUp={(e) => {
        if (onRange && drag !== null) onRange({ low: drag, high: priceAt(evY(e)) });
        setDrag(null);
      }}
      style={{ cursor: onRange ? 'ns-resize' : undefined }}
    >
      <rect x={0} y={0} width={plotW} height={mainH} fill="#0b0826" />
      {revealFrom !== undefined && revealFrom < bars.length && <rect x={revealFrom * step} y={0} width={plotW - revealFrom * step} height={mainH} fill="rgba(255,191,62,0.06)" />}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={plotW} y1={mainH * f} y2={mainH * f} stroke="rgba(91,75,196,0.2)" />
      ))}
      {showBands && (
        <>
          <polyline points={line(bb.map((b) => b.upper), y)} fill="none" stroke="rgba(62,242,255,0.5)" />
          <polyline points={line(bb.map((b) => b.lower), y)} fill="none" stroke="rgba(62,242,255,0.5)" />
        </>
      )}
      {showSma && <polyline points={line(s50, y)} fill="none" stroke="#ff8a3d" strokeWidth={1.5} />}
      {range && <rect x={0} y={y(Math.max(range.low, range.high))} width={plotW} height={Math.abs(y(range.low) - y(range.high))} fill="rgba(255,62,165,0.18)" stroke="#ff3ea5" />}
      {bars.map((b, i) => {
        const up = b.close >= b.open;
        const faded = revealFrom !== undefined && i >= revealFrom;
        const color = up ? '#4dff9a' : '#ff4f6d';
        return (
          <g key={i} opacity={faded ? 1 : revealFrom !== undefined ? 0.75 : 1}>
            <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={color} />
            <rect x={x(i) - Math.max(1, step * 0.35)} y={y(Math.max(b.open, b.close))} width={Math.max(2, step * 0.7)} height={Math.max(1, Math.abs(y(b.open) - y(b.close)))} fill={color} />
          </g>
        );
      })}
      {revealFrom !== undefined && revealFrom < bars.length && <line x1={revealFrom * step} x2={revealFrom * step} y1={0} y2={mainH} stroke="#ffbf3e" strokeDasharray="4 3" />}
      {hLines.map((h, i) => (
        <g key={i}>
          <line x1={0} x2={plotW} y1={y(h.price)} y2={y(h.price)} stroke={h.color} strokeDasharray="5 3" />
          {h.label && (
            <text x={4} y={y(h.price) - 3} fill={h.color} className="axis">
              {h.label}
            </text>
          )}
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={plotW + 4} y={Math.min(mainH - 2, Math.max(12, mainH * f + 4))} className="axis">
          {priceAt(mainH * f).toFixed(2)}
        </text>
      ))}
      {showRsi && (
        <>
          <rect x={0} y={mainH + 6} width={plotW} height={rsiH} fill="#0b0826" />
          <line x1={0} x2={plotW} y1={ry(70)} y2={ry(70)} stroke="rgba(255,79,109,0.4)" strokeDasharray="3 3" />
          <line x1={0} x2={plotW} y1={ry(30)} y2={ry(30)} stroke="rgba(77,255,154,0.4)" strokeDasharray="3 3" />
          <polyline points={line(r, ry)} fill="none" stroke="#9d6bff" strokeWidth={1.5} />
          <text x={plotW + 4} y={mainH + 18} className="axis">
            RSI
          </text>
        </>
      )}
    </svg>
  );
}
