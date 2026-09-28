import { useApp, type Screen } from '../store/app';
import './screens.css';

/** Shown for modes that are still being built in later phases. */
export function PlaceholderScreen({ screen }: { screen: Screen }) {
  const back = useApp((s) => s.back);
  return (
    <div className="screen" data-testid={`screen-${screen}`}>
      <h1 className="screen-title">{screen.toUpperCase()}</h1>
      <p className="screen-sub">This desk is still being wired up.</p>
      <button className="pixel-btn" onClick={back}>
        ◀ BACK
      </button>
    </div>
  );
}
