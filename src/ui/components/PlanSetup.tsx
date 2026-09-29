import { useApp } from '../store/app';
import { useTrading } from '../store/trading';
import { SnapSlider } from './SnapSlider';

const TARGETS = [0.25, 0.4, 0.5, 0.65, 0.75];
const STOPS = [1, 1.5, 2, 3];

/**
 * Your trading plan, set once for every trade: where you take profit and where you stop.
 * Shown when a run starts and in Settings; the order ticket only displays it.
 */
export function PlanSetup({ compact = false }: { compact?: boolean }) {
  const game = useApp((s) => s.settings.game);
  const update = useApp((s) => s.updateSettings);
  const save = (patch: Partial<typeof game>) => {
    update((st) => ({ ...st, game: { ...st.game, ...patch } }));
    const b: { targetPct?: number; stopMult?: number } = {};
    if (patch.planTargetPct !== undefined) b.targetPct = patch.planTargetPct;
    if (patch.planStopMult !== undefined) b.stopMult = patch.planStopMult;
    if (useTrading.getState().session)
      useTrading.setState({ builder: { ...useTrading.getState().builder, ...b } });
  };
  const ti = TARGETS.reduce(
    (b, x, i) => (Math.abs(x - game.planTargetPct) < Math.abs(TARGETS[b] - game.planTargetPct) ? i : b),
    0,
  );
  const si = STOPS.reduce(
    (b, x, i) => (Math.abs(x - game.planStopMult) < Math.abs(STOPS[b] - game.planStopMult) ? i : b),
    0,
  );
  return (
    <div className={`plan-setup ${compact ? 'compact' : ''}`} data-testid="plan-setup">
      <SnapSlider
        label="Take profit"
        tip="g:bracket_target"
        accent="up"
        testId="plan-target"
        options={TARGETS.map((t) => ({ value: t, major: t === 0.5, mark: `${Math.round(t * 100)}%` }))}
        index={ti}
        onIndex={(i) => save({ planTargetPct: TARGETS[i] })}
        readout={`at ${Math.round(TARGETS[ti] * 100)}% of max`}
      />
      <SnapSlider
        label="Stop"
        tip="g:bracket_stop"
        accent="magenta"
        testId="plan-stop"
        options={STOPS.map((x) => ({ value: x, major: x === 2, mark: `${x}×` }))}
        index={si}
        onIndex={(i) => save({ planStopMult: STOPS[i] })}
        readout={`at ${STOPS[si]}× the credit`}
      />
    </div>
  );
}
