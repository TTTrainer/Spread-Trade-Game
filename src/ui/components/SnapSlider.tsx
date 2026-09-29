/**
 * A slider that snaps to a fixed set of values (listed expirations, strikes, conviction steps).
 * Drag the diamond, click the track, scroll the wheel, or use the arrow keys while it has focus.
 * It ticks as it passes each value, so moving it feels like turning a detented knob.
 */

import { useRef, type ReactNode } from 'react';
import { sfx } from '../../audio/sfx';

export interface SnapOption {
  /** Position on the track (any unit; spacing follows it when `byValue` is set). */
  value: number;
  /** A small label under the tick (only some ticks get one). */
  mark?: string;
  /** Drawn taller: monthly expirations, the default delta. */
  major?: boolean;
}

export function SnapSlider({
  options,
  index,
  onIndex,
  label,
  readout,
  tip,
  byValue = false,
  testId,
  accent = 'cyan',
  disabled = false,
}: {
  options: SnapOption[];
  index: number;
  onIndex: (i: number) => void;
  label: ReactNode;
  readout: ReactNode;
  tip?: string;
  byValue?: boolean;
  testId?: string;
  accent?: 'cyan' | 'magenta' | 'amber' | 'up';
  disabled?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const n = options.length;
  const lo = options[0]?.value ?? 0;
  const hi = options[n - 1]?.value ?? 1;
  const posOf = (i: number) =>
    n <= 1 ? 0.5 : byValue ? (options[i].value - lo) / Math.max(1e-9, hi - lo) : i / (n - 1);
  const nearest = (x: number) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(posOf(i) - x) < Math.abs(posOf(best) - x)) best = i;
    return best;
  };
  const go = (i: number) => {
    const j = Math.max(0, Math.min(n - 1, i));
    if (j === index || disabled) return;
    sfx('tick', 0.8 + (j / Math.max(1, n - 1)) * 0.7, 0.7);
    onIndex(j);
  };
  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    go(nearest((clientX - r.left) / r.width));
  };
  const safe = Math.max(0, Math.min(n - 1, index));
  return (
    <div className={`snap ${disabled ? 'off' : ''} accent-${accent}`} data-tip={tip} data-testid={testId}>
      <span className="snap-label">{label}</span>
      <div
        className="snap-track"
        ref={track}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={safe}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
        onWheel={(e) => go(safe + (e.deltaY < 0 ? 1 : -1))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') go(safe - 1);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') go(safe + 1);
          else return;
          e.preventDefault();
        }}
      >
        <span className="snap-rail" />
        <span className="snap-fill" style={{ width: `${posOf(safe) * 100}%` }} />
        {options.map((o, i) => (
          <span
            key={i}
            className={`snap-tick ${o.major ? 'major' : ''} ${i === safe ? 'on' : ''}`}
            style={{ left: `${posOf(i) * 100}%` }}
          >
            {o.mark && <span className="snap-mark num">{o.mark}</span>}
          </span>
        ))}
        {n > 0 && <span className="snap-thumb" style={{ left: `${posOf(safe) * 100}%` }} />}
      </div>
      <span className="snap-readout num">{readout}</span>
    </div>
  );
}
