import { TitleScreen } from './screens/TitleScreen';

export function App() {
  return (
    <>
      <TitleScreen />
      <div className="crt-overlay" aria-hidden="true" />
    </>
  );
}
