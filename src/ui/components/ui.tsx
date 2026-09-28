import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { pnlClass, pnlText } from '../format';
import { useApp } from '../store/app';
import './ui.css';

export function Pnl({ cents, big = false, testId }: { cents: number; big?: boolean; testId?: string }) {
  return (
    <span className={`num pnl ${pnlClass(cents)} ${big ? 'big' : ''}`} data-testid={testId}>
      {pnlText(cents)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function Meter({
  value,
  max,
  label,
  tone = 'cyan',
  testId,
}: {
  value: number;
  max: number;
  label?: ReactNode;
  tone?: 'cyan' | 'magenta' | 'amber' | 'down';
  testId?: string;
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`meter tone-${tone}`} data-testid={testId}>
      <div className="meter-fill" style={{ width: `${frac * 100}%` }} />
      {label !== undefined && (
        <div className="meter-label num">
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}

/** A card with pixel frame, hover tilt and an idle wobble. */
export function TiltCard({
  children,
  selected,
  onClick,
  rarity,
  className = '',
  testId,
  disabled,
  title,
  tip,
}: {
  children: ReactNode;
  /** A hover-explanation key (see Tooltip.tsx). */
  tip?: string;
  selected?: boolean;
  onClick?: () => void;
  rarity?: 'C' | 'U' | 'R' | 'L';
  className?: string;
  testId?: string;
  disabled?: boolean;
  title?: string;
}) {
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 300, damping: 20 });
  return (
    <motion.button
      type="button"
      title={title}
      disabled={disabled}
      data-testid={testId}
      data-tip={tip}
      className={`tilt-card ${selected ? 'selected' : ''} ${rarity ? `rar-${rarity}` : ''} ${className}`}
      style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 600 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      whileTap={reduced ? undefined : { scale: 0.95 }}
      animate={selected && !reduced ? { y: -4 } : { y: 0 }}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

export function Modal({
  children,
  onClose,
  wide,
  testId,
}: {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  testId?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <motion.div
        className={`modal panel ${wide ? 'wide' : ''}`}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** A number that counts up to its target (used for chips, mult and the meter). */
export function CountUp({
  value,
  digits = 0,
  duration = 600,
  onTick,
}: {
  value: number;
  digits?: number;
  duration?: number;
  onTick?: (v: number) => void;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    let lastTick = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      if (onTick && t - lastTick > 45) {
        lastTick = t;
        onTick(v);
      }
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className="num">
      {shown.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}
    </span>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" data-testid="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <motion.div
          key={t.id}
          className={`toast tone-${t.tone}`}
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          {t.text}
        </motion.div>
      ))}
    </div>
  );
}

export function Stamp({ text, tone }: { text: string; tone: 'good' | 'bad' }) {
  return (
    <motion.div
      className={`stamp tone-${tone}`}
      initial={{ scale: 3, rotate: -18, opacity: 0 }}
      animate={{ scale: 1, rotate: -12, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
    >
      {text}
    </motion.div>
  );
}
