import { useEffect } from 'react';
import { Toasts } from './components/ui';
import { useHotkeys } from './hotkeys';
import { useApp, type Screen } from './store/app';
import { TitleScreen } from './screens/TitleScreen';
import { SandboxSetup, SandboxTrading } from './screens/Sandbox';
import { HelpModal } from './trading/TradingScreen';
import { PlaceholderScreen } from './screens/Placeholder';
import { DrillsScreen } from './screens/Drills';
import { StatsScreen } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';
import { CreditsScreen } from './screens/Credits';

const SCREENS: Partial<Record<Screen, () => React.ReactElement>> = {
  title: TitleScreen,
  sandboxSetup: SandboxSetup,
  trading: SandboxTrading,
  drills: DrillsScreen,
  stats: StatsScreen,
  settings: SettingsScreen,
  credits: CreditsScreen,
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

  useHotkeys({
    home: () => home(),
    back: () => back(),
    settings: () => go('settings'),
    help: () => setHelp(true),
  });

  const Comp = SCREENS[screen] ?? (() => <PlaceholderScreen screen={screen} />);
  return (
    <>
      {settingsLoaded && <Comp />}
      <HelpModal />
      <Toasts />
      <div className="crt-overlay" aria-hidden="true" />
    </>
  );
}
