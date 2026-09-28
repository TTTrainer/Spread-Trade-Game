import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CHARACTERS } from '../../content/characters';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { Portrait } from '../components/Portrait';

/** The speech box: a portrait, a name and a typed line. Clicks pass through it; it fades on its own. */
export function DialogueBox() {
  const speech = useRun((s) => s.speech);
  const clear = useRun((s) => s.clearSpeech);
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  const [n, setN] = useState(0);
  const text = speech?.line.text ?? '';
  useEffect(() => {
    setN(reduced ? text.length : 0);
    if (!speech) return;
    const id = setTimeout(() => clear(), Math.max(5000, text.length * 70));
    return () => clearTimeout(id);
  }, [speech?.n]);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 16);
    return () => clearTimeout(id);
  }, [n, text]);
  return (
    <AnimatePresence>
      {speech && (
        <motion.div
          key={speech.n}
          className={`dialogue who-${speech.line.who}`}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          data-testid="dialogue"
        >
          <Portrait id={speech.line.who} mood={speech.line.mood} scale={1.5} />
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
