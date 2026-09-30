import { useApp } from '../store/app';
import './screens.css';
import './settings.css';

export function CreditsScreen() {
  const back = useApp((s) => s.back);
  return (
    <div className="screen" data-testid="credits-screen">
      <h1 className="screen-title">CREDITS</h1>
      <div className="credits-body">
        <h2>Not financial advice</h2>
        <p>
          Spread Trading Game is a paper-trading game. It never connects to a broker and never places real
          trades. Nothing in it is investment advice. Past prices do not predict future results, and the
          arcade scoring layer rewards things real markets do not.
        </p>
        <h2>Market data</h2>
        <p>
          Options, stock, earnings and rates data: DoltHub databases <b>post-no-preference/options</b>,{' '}
          <b>/stocks</b>, <b>/earnings</b> and <b>/rates</b>. The options data is licensed under{' '}
          <b>Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)</b>. VIX history: Cboe Global Markets
          daily VIX history. When you connect your own Schwab developer app: Charles Schwab market data
          (read-only prices and option chains), pulled on your computer for your own use and never shared.
          Days the free data skipped, and option chains Schwab has no history for, are modeled and labeled
          MODEL. The SIM market (fictional companies such as Helix Robotics and MemeStonk Arcade) is invented
          and labeled SIM.
        </p>
        <h2>Charts</h2>
        <p>
          Charts powered by <b>TradingView Lightweight Charts™</b> (Apache License 2.0), Copyright ©
          TradingView, Inc. — https://www.tradingview.com/
        </p>
        <h2>Fonts</h2>
        <p>
          <b>DotGothic16</b> by Fontworks, and <b>VT323</b> by Peter Hull, both under the SIL Open Font
          License 1.1 (license texts in assets/fonts).
        </p>
        <h2>Art, music and sound</h2>
        <p>
          All pixel art (portraits, The Pad, icons, the backdrop) is drawn in code for this game; no art packs
          are used. Music is composed and played live with <b>Tone.js</b> (MIT). Particles and the backdrop
          render with <b>PixiJS</b> (MIT). Sound effects are synthesized in code, sfxr-style, with no sample
          packs.
        </p>
        <h2>Software</h2>
        <p>
          Electron (MIT), React (MIT), Vite and electron-vite (MIT), TypeScript (Apache 2.0), Zustand (MIT),
          Motion (MIT), PixiJS and pixi-filters (MIT), Tone.js (MIT), mysql2 (MIT), Dolt (Apache 2.0) and the
          Node.js built-in SQLite (public domain). Built with the help of Claude Code.
        </p>
        <h2>Characters</h2>
        <p>
          All companies and characters in career mode are fictional. Any resemblance to real firms or traders
          is satire.
        </p>
      </div>
      <button className="pixel-btn" onClick={back}>
        ◀ BACK
      </button>
    </div>
  );
}
