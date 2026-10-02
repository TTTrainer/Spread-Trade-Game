/**
 * Selling premium puts cash in the account right away, so a credit fill should feel like it:
 * a big "+$210 CREDIT" pops over the screen and flies into the BALANCE readout, which counts up.
 * (Equity doesn't jump: the spread you now owe is worth about what you collected.) Closing a
 * winner gets the same moment, bigger, flying into the round score instead.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { money } from '../format';
import { useTrading } from '../store/trading';

/** A cash figure that counts toward its new value and flashes when money lands. */
export function CashReadout() {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const target = session ? session.cashCents() : 0;
  const [shown, setShown] = useState(target);
  const [flash, setFlash] = useState(0);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    if (a === target) return;
    if (target > a) setFlash((f) => f + 1);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target]);
  if (!session) return null;
  return (
    <div
      className={`tb-item num cash-readout ${flash ? 'bump' : ''}`}
      key={flash}
      data-tip-title="Balance"
      data-tip-body="Cash in your trading account. Selling a credit spread puts the premium here the moment it fills; buying a spread takes the debit out. Equity counts what your open trades are worth, so it moves with the market instead."
    >
      <span className="dim">BALANCE</span> <span data-testid="balance">{money(shown)}</span>
    </div>
  );
}

export function CashDeposit() {
  const deposit = useTrading((s) => s.deposit);
  const [to, setTo] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!deposit) return;
    const el = document.querySelector(deposit.to ?? '[data-testid="balance"]');
    const r = el?.getBoundingClientRect();
    setTo(
      r
        ? {
            x: r.left + r.width / 2 - window.innerWidth / 2,
            y: r.top + r.height / 2 - window.innerHeight / 2,
          }
        : null,
    );
    // A profit rings longer than a credit: more coins, climbing in pitch.
    const n = deposit.profit ? 9 : 5;
    for (let i = 0; i < n; i++) setTimeout(() => sfx('coin', 1 + i * 0.08, 0.7), 900 + i * 70);
  }, [deposit?.id]);
  return (
    <AnimatePresence>
      {deposit && (
        <motion.div
          key={deposit.id}
          className={`cash-deposit num ${deposit.profit ? 'profit' : ''}`}
          data-testid="cash-deposit"
          initial={{ scale: 0.3, opacity: 0, x: 0, y: 40 }}
          animate={{
            scale: [0.3, 1.25, 1, 1, 0.25],
            opacity: [0, 1, 1, 1, 0],
            x: [0, 0, 0, 0, to?.x ?? 0],
            y: [40, 0, 0, 0, to?.y ?? -400],
          }}
          transition={{ duration: 1.6, times: [0, 0.18, 0.3, 0.55, 1], ease: 'easeInOut' }}
        >
          <div className="cd-amount">+{money(deposit.cents)}</div>
          <div className="cd-label">{deposit.label ?? 'CREDIT DEPOSITED'}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
