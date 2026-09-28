/** A tiny line chart for lineup cards and analyst readouts. */
export function Sparkline({ closes, w = 150, h = 36 }: { closes: number[]; w?: number; h?: number }) {
  if (closes.length < 2) return null;
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const pts = closes
    .map(
      (c, i) =>
        `${((i / (closes.length - 1)) * w).toFixed(1)},${(h - ((c - lo) / (hi - lo || 1)) * h).toFixed(1)}`,
    )
    .join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.5} />
    </svg>
  );
}
