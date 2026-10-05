/**
 * The Collector's interest notice: its own screen at the close of any day he charged. Each losing
 * trade sitting at or past a strike you sold is listed with its strike, its loss, how many days it
 * has been charged and the points it costs. PAY (a click, Enter or Space) takes them off the score.
 */

import { motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BOSSES } from '../../content/bosses';
import { sfx } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { Kbd } from '../components/ui';
import { money } from '../format';
import { usePayout, type PayoutItem } from '../store/payout';
import { useRun } from '../store/run';

export function CollectorNotice({ item }: { item: Extract<PayoutItem, { kind: 'interest' }> }) {
  const boss = BOSSES.collector;
  const total = -item.points;
  const panel = useRef<HTMLDivElement>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    sfx('decision', 0.7, 0.9);
    const id = setTimeout(() => sfx('stamp', 0.8), 380);
    return () => clearTimeout(id);
  }, []);

  const pay = () => {
    if (paying) return;
    setPaying(true);
    sfx('loss', 1, 0.8);
    burstAt(panel.current, 'embers', 24);
    setTimeout(() => {
      useRun.setState({ lastPoints: { points: item.points, n: (useRun.getState().lastPoints?.n ?? 0) + 1 } });
      usePayout.getState().done(item.id);
    }, 420);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      pay();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div
      className="notice-back"
      data-owns-keys
      style={{ '--boss-accent': boss.palette.accent, '--boss-tint': boss.palette.tint } as CSSProperties}
    >
      <motion.div
        ref={panel}
        className="notice panel"
        data-testid="collector-notice"
        initial={{ y: -40, rotate: -1.5, opacity: 0 }}
        animate={paying ? { y: 60, opacity: 0, scale: 0.9 } : { y: 0, rotate: 0, opacity: 1 }}
        transition={
          paying ? { duration: 0.4, ease: 'easeIn' } : { type: 'spring', stiffness: 300, damping: 20 }
        }
      >
        <div className="nt-head">
          <span className="nt-title">☠ THE COLLECTOR · INTEREST NOTICE</span>
          <span className="nt-day num">DAY {item.day}</span>
        </div>
        <p className="nt-line">
          “You&apos;re under water and leaning on the strike. That&apos;s a loan. Loans pay interest.”
          <span className="dim"> · {boss.person}</span>
        </p>
        <div className="nt-rows num" data-testid="notice-rows">
          {item.items.map((x) => (
            <div key={x.positionId} className="nt-row">
              <b className="nt-sym">{x.symbol}</b>
              <span>
                sold {x.right === 'P' ? 'put' : 'call'} {x.strike}
                <span className="dim">
                  {' '}
                  · price {x.spot.toFixed(2)}{' '}
                  {x.right === 'P'
                    ? x.spot <= x.strike
                      ? 'past'
                      : 'at'
                    : x.spot >= x.strike
                      ? 'past'
                      : 'at'}{' '}
                  it
                </span>
              </span>
              <span className="down-text">▼ −{money(Math.abs(x.plCents))}</span>
              <span className="dim">
                day {x.days} · {+(item.rate * 100).toFixed(1)}% of {money(x.riskCents)} risk
              </span>
              <b className="nt-pts">−{x.points}</b>
            </div>
          ))}
        </div>
        <div className="nt-total num">
          <span>INTEREST DUE</span>
          <b data-testid="notice-total">−{total} POINTS</b>
        </div>
        <motion.div
          className="nt-stamp"
          initial={{ scale: 2.4, opacity: 0, rotate: -24 }}
          animate={{ scale: 1, opacity: 1, rotate: -12 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 500, damping: 14 }}
        >
          PAST DUE
        </motion.div>
        <p className="nt-tip dim">Close a tested loser before the day ends and the interest stops.</p>
        <button className="pixel-btn danger nt-pay" onClick={pay} data-testid="notice-pay">
          PAY −{total} <Kbd>Enter</Kbd>
        </button>
      </motion.div>
    </div>
  );
}
