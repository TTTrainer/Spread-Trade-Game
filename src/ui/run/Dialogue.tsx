import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CHARACTERS } from '../../content/characters';
import { useApp } from '../store/app';
import { usePayout } from '../store/payout';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { Portrait } from '../components/Portrait';
import { monthMenuUp } from './MonthMenu';

/** The speech box: a portrait, a name and a typed line. Clicks pass through it; it fades on its own. */
/** The chart panel's box on screen while `on` (read again on resize). */
/** The chart's box, and the bottom of a boss's banner stack over it (to speak below it). */
function useChartBox(on: boolean, key: unknown): { box: DOMRect; stackBottom: number | null } | null {
  const [box, setBox] = useState<{ box: DOMRect; stackBottom: number | null } | null>(null);
  useEffect(() => {
    if (!on) return;
    const read = () => {
      const chart = document.querySelector('[data-testid="chart-panel"]')?.getBoundingClientRect();
      const stack = document.querySelector('[data-testid="boss-stack"]')?.getBoundingClientRect();
      setBox(chart ? { box: chart, stackBottom: stack ? stack.bottom : null } : null);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [on, key]);
  return on ? box : null;
}

export function DialogueBox() {
  const speech = useRun((s) => s.speech);
  const clear = useRun((s) => s.clearSpeech);
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  // Over the chart during a round; in the shop, inside YOUR BUILD's empty middle (clear of the
  // offers, the payouts at the top right and the NEXT button); at the bottom elsewhere.
  const phase = useRun((s) => s.engine?.state.phase);
  const inRun = useApp((s) => s.screen === 'run');
  // The day's recap owns the middle of the chart: step aside to the corner while it's up.
  const recapUp = useTrading((s) => !!s.recap && (s.ff === 'paused' || s.ff === 'decision'));
  const onChart = inRun && phase === 'round';
  const place = onChart
    ? 'at-corner at-chart'
    : inRun && phase === 'shop'
      ? 'at-corner at-shop'
      : 'at-bottom';
  // During a round the line sits over the chart's oldest candles (its left side), clear of today's
  // price, the clock controls and the trade card: the top left, or the bottom left while the
  // day's recap fills the middle (the trade card steps aside for the recap too).
  // A boss's banner (with its style line and race) sits under the trade badge: speak below it.
  const measured = useChartBox(onChart && !!speech, speech?.n);
  const chartBox = measured?.box ?? null;
  const top = measured ? Math.max(measured.box.top + 46, (measured.stackBottom ?? 0) + 8) : 0;
  const chartStyle: React.CSSProperties | undefined =
    onChart && chartBox
      ? {
          left: chartBox.left + 10,
          width: Math.min(440, chartBox.width * 0.45),
          ...(recapUp
            ? { top: 'auto', bottom: window.innerHeight - chartBox.bottom + 40 }
            : { top, bottom: 'auto' }),
        }
      : undefined;
  // A line said while the month menu is up waits for it to close (its timer starts then).
  // So does one said while a closed trade's payout plays: the line follows the score.
  const menuOpen = useRun((s) => inRun && monthMenuUp(s.engine));
  const paying = usePayout((s) => s.queue.length > 0);
  const menuUp = menuOpen || paying;
  const [n, setN] = useState(0);
  const text = speech?.line.text ?? '';
  useEffect(() => {
    setN(reduced ? text.length : 0);
    if (!speech || menuUp) return;
    const id = setTimeout(() => clear(), Math.max(5000, text.length * 70));
    return () => clearTimeout(id);
  }, [speech?.n, menuUp]);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 16);
    return () => clearTimeout(id);
  }, [n, text]);
  return (
    <AnimatePresence>
      {speech && !menuUp && (
        <motion.div
          key={speech.n}
          className={`dialogue who-${speech.line.who} ${place}`}
          style={chartStyle}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          data-testid="dialogue"
        >
          <Portrait
            id={speech.line.who}
            mood={speech.line.mood}
            scale={place.includes('at-corner') ? 1 : 1.5}
          />
          <span className="dlg-body">
            <span className="dlg-name">
              {CHARACTERS[speech.line.who].name}{' '}
              <span className="dim">· {CHARACTERS[speech.line.who].role}</span>
            </span>
            <span className="dlg-text">{text.slice(0, n)}</span>
          </span>
          <button type="button" className="dlg-close" onClick={() => clear()} aria-label="Dismiss">
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
