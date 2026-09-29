import { useState } from 'react';
import type { RunEngine } from '../../engine/run/engine';
import { Portrait } from '../components/Portrait';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import '../screens/modes.css';

interface Tip {
  key: string;
  title: string;
  text: string;
}

/** Ines's next hint, worked out from what is on screen (the tutorial never blocks a click). */
function tipFor(e: RunEngine, t: ReturnType<typeof useTrading.getState>): Tip {
  const st = e.state;
  const r = st.round;
  const s = t.session;
  switch (st.phase) {
    case 'tally':
      return {
        key: 'tally',
        title: 'The tally',
        text: 'Each closed trade prints a receipt: chips × mult, in slot order. Winners fill the meter; losers drain it (less than they cost you, unless you had no stop). Beat the target to pass the round.',
      };
    case 'shop':
      return {
        key: 'shop',
        title: 'The shop',
        text: 'Cartridges change how trades score, left to right, so order matters. Analysts give you information, not luck. Buy something you can afford, then LEAVE THE SHOP.',
      };
    case 'review_intro':
      return {
        key: 'review',
        title: 'A Review',
        text: "A boss round. COMPLY-3000 reads the rule; the lineup is dealt only from matching markets. The Annual Review ends the year. Press START THE REVIEW when you're ready.",
      };
    case 'victory':
    case 'defeat':
      return {
        key: 'end',
        title: 'That is the loop',
        text: "Lineup, brief, build, days, tally, shop, Review. Practice never counts against you. The mug is yours. Career is where it's real: every trade lands in your Stats.",
      };
    default:
      break;
  }
  if (!s) return { key: 'wait', title: 'One second', text: 'Dealing the lineup…' };
  const anyPosition = s.positions.length > 0;
  if (r.index === 1 && !anyPosition && !r.clockStarted)
    return {
      key: 'm2',
      title: 'Month 2',
      text: 'You have more than one ticket: try two trades on different cards. If nothing looks right, reroll (R), or skip the round (K) before trading for −10 stress and a Tag.',
    };
  if (!t.touched && !anyPosition)
    return {
      key: 'read',
      title: 'Read the card',
      text: 'Each card is one real stock at one real moment, disguised. Read the chart and the BRIEF on the right. Think it goes up? Press 4 for a bull put. Down? Press 2 for a bear call.',
    };
  if (!anyPosition)
    return {
      key: 'build',
      title: 'Shape a bull put',
      text: 'It collects a credit and wins while the stock stays above your short strike. Drag the S handle on the chart or use the sliders, and watch POP and max loss change. Conviction is how sure you are and how much you risk. Then SELL (Alt+S).',
    };
  if (!r.clockStarted)
    return {
      key: 'clock',
      title: 'Start the clock',
      text: 'Placed. Add another trade on a different card if you like, then press Space. Each press plays one day; the day ends with a recap of every trade.',
    };
  if (t.ff === 'decision')
    return {
      key: 'decision',
      title: 'A decision point',
      text: 'The clock paused. Closing at your plan scores +1 mult and calms you down. Declining your own stop costs stress, and the loss counts more on the meter.',
    };
  return {
    key: 'ff',
    title: 'Day by day',
    text: 'Each day plays as a forming candle, then a recap shows how every trade stands. Positions close at your plan, at a decision, or at expiration. Space plays the next day.',
  };
}

export function TutorialCoach({ e }: { e: RunEngine }) {
  useRun((s) => s.version);
  const t = useTrading();
  const [hidden, setHidden] = useState(false);
  const tip = tipFor(e, t);
  if (hidden)
    return (
      <button
        className="pixel-btn coach-show"
        onClick={() => setHidden(false)}
        style={{ position: 'fixed', left: 262, bottom: 262, zIndex: 800 }}
      >
        INES ▲
      </button>
    );
  return (
    <div
      className="panel coach"
      data-testid="tutorial-coach"
      data-step={tip.key}
      role="note"
      aria-live="polite"
    >
      <Portrait id="ines" mood="happy" scale={1} />
      <div>
        <div className="coach-step">INES · TUTORIAL · {tip.title.toUpperCase()}</div>
        <p>{tip.text}</p>
      </div>
      <button
        className="pixel-btn"
        onClick={() => setHidden(true)}
        title="Hide (the tips keep up in the background)"
      >
        ▼
      </button>
    </div>
  );
}
