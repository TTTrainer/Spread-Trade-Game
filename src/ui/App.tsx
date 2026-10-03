import { useEffect, useRef } from 'react';
import { Toasts } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevLayer } from './components/DevPanel';
import { TooltipLayer } from './components/Tooltip';
import { useHotkeys } from './hotkeys';
import { useMusicDirector } from './musicDirector';
import { useApp, type Screen } from './store/app';
import { TitleScreen } from './screens/TitleScreen';
import { SandboxSetup, SandboxTrading } from './screens/Sandbox';
import { HelpModal } from './trading/TradingScreen';
import { PlaceholderScreen } from './screens/Placeholder';
import { DrillsScreen } from './screens/Drills';
import { StatsScreen } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';
import { CreditsScreen } from './screens/Credits';
import { CareerScreen, RunScreen } from './screens/Career';
import { DialogueBox } from './run/Dialogue';
import { AchievementsScreen } from './screens/Achievements';
import { PadScreen } from './screens/Pad';
import { DailyScreen } from './screens/Daily';
import { LiveScreen, LiveTrading } from './screens/Live';
import { ContractsScreen, ContractTrading } from './screens/Contracts';

const SCREENS: Partial<Record<Screen, () => React.ReactElement | null>> = {
  title: TitleScreen,
  sandboxSetup: SandboxSetup,
  trading: SandboxTrading,
  drills: DrillsScreen,
  stats: StatsScreen,
  settings: SettingsScreen,
  credits: CreditsScreen,
  career: CareerScreen,
  run: RunScreen,
  achievements: AchievementsScreen,
  pad: PadScreen,
  daily: DailyScreen,
  live: LiveScreen,
  liveTrading: LiveTrading,
  contracts: ContractsScreen,
  contractTrading: ContractTrading,
};

export function App() {
  const screen = useApp((s) => s.screen);
  const loadSettings = useApp((s) => s.loadSettings);
  const refreshData = useApp((s) => s.refreshData);
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const home = useApp((s) => s.home);
  const setHelp = useApp((s) => s.setHelp);
  const settingsLoaded = useApp((s) => s.settingsLoaded);

  useEffect(() => {
    void loadSettings();
    void refreshData();
  }, []);

  useMusicDirector();

  useHotkeys({
    home: () => home(),
    back: () => back(),
    settings: () => go('settings'),
    help: () => setHelp(true),
  });

  const Comp = SCREENS[screen] ?? (() => <PlaceholderScreen screen={screen} />);
  return (
    <>
      {settingsLoaded && (
        <ErrorBoundary name={`screen ${screen}`} key={screen}>
          <Comp />
        </ErrorBoundary>
      )}
      <HelpModal />
      {(screen === 'run' || screen === 'career') && (
        <ErrorBoundary name="dialogue" quiet>
          <DialogueBox />
        </ErrorBoundary>
      )}
      <DevLayer />
      <Toasts />
      <TooltipLayer />
      <CrtOverlay />
    </>
  );
}

/**
 * The CRT scanlines and vignette, with a brief flicker every few seconds. The flicker is switched
 * on by a timer rather than a CSS animation that never stops: a running animation on a
 * full-screen layer makes the browser recomposite the whole window every frame, which halved the
 * frame rate on PCs without a graphics card.
 */
function CrtOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const el = ref.current;
      if (!el || document.documentElement.dataset.reducedMotion === 'true') return;
      el.classList.add('flick');
      setTimeout(() => el.classList.remove('flick'), 260);
    }, 6000);
    return () => clearInterval(id);
  }, []);
  return <div ref={ref} className="crt-overlay" aria-hidden="true" data-testid="crt-overlay" />;
}
