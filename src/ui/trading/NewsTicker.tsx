import { AnimatePresence, motion } from 'motion/react';
import { useTrading } from '../store/trading';

/** Headlines slide in over the chart on event days (the last two trading days only). */
export function NewsTicker() {
  const feed = useTrading((s) => s.feed);
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const day = session?.dayIndex ?? 0;
  const items = feed.filter((f) => f.kind === 'headline' && f.day >= day - 1).slice(-3);
  return (
    <div className="news-ticker" data-testid="news-ticker">
      <AnimatePresence initial={false}>
        {items.map((f) => (
          <motion.div
            key={f.id}
            className="news-item num"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <span className="news-tag">NEWS</span> {f.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
