# Spread Trading Game: project rules for Claude Code

Read this file at the start of every session. The full design and build plan lives in `MASTER_PROMPT.md`. Current status lives in `PROGRESS.md` (create it in Phase 0 and keep it current). Before starting or resuming a phase, re-read that phase's section of `MASTER_PROMPT.md`.

## What we're building

A single-player Windows desktop roguelite about trading options spreads on real historical market data. Runs play like Balatro or Hades: short goal rounds, a shop between rounds, strategy "builds", stacking combos and escalating targets. Underneath is a truthful market with real option chains, real earnings reactions and real P/L. Fun comes first. The trading skills (calling direction, feeling the Greeks, handling events, exiting losers) come from playing, not from lessons.

## The player (Jacob)

- Advanced options trader. His main strategy is **selling credit spreads** (bull put and bear call verticals). Other structures are "advanced" content he unlocks later.
- Trades weeklies (1–10 DTE) and 30–45 DTE swings at Schwab (thinkorswim). Small account; the starting capital is a setting.
- Top goals: calling direction, Greeks intuition, handling events (earnings, IV crush, assignment, expiration).
- Known weakness: **holding losers too long**. The game should make taking a planned stop feel good and make holding past it costly.
- Wants 20–40 minute runs that can end early, a Balatro-style shop between goals, strategy-focused builds with creative powerup combos, and fast, tactile trade entry.
- Would quit over a repetitive loop, dull powerup combos, or boring UI.
- **Does not code.** Explain decisions, problems and anything he must do in plain language, without jargon about the code. He playtests.

## Design pillars

1. **The market is sacred.** Prices, IV, Greeks, events and outcomes come from real data (or a clearly labeled model when real data is missing). Nothing in the game layer changes them.
2. **The arcade lives in the game layer.** Powerups change score, multipliers, cash, stress, shop economy, what information you can see, and execution quality *within* the real bid/ask. Each powerup is tagged `REAL` (mirrors a real-world edge) or `ARCADE` (a game-only advantage).
3. **No lookahead, ever.** The player and every system only see data up to the current simulated day.
4. **Every loss is explainable.** The debrief shows why: direction, time decay, volatility, execution, or a decision mistake.
5. **Percent scaling everywhere.** Targets, risk caps and loss limits are percentages of equity, so any starting capital works and a big account never trivializes the game.
6. **Juice on every action.** Every click, fill, tick and score count gets sound and motion within 100 ms.
7. **Balatro/Hades luck-to-skill balance**, proven by the balance simulator rather than by gut feel.
8. **Fast input.** An experienced player places a trade in under 10 seconds.

## Hard invariants (enforce with tests)

- All market data access goes through the time-gated `MarketView` (`src/engine/market/`). Asking for anything after the current simulated date throws. Indicators, IV rank, fundamentals and "known" events are computed only from data dated on or before the clock.
- Scheduled events (earnings dates, ex-dividend dates, Fed and CPI days) may be shown ahead of time. Their *outcomes* and headlines appear only on or after the day they happen.
- Powerups never alter prices, IV, Greeks, fills outside the bid/ask, assignment outcomes, or events.
- All randomness uses the seeded RNG (`src/engine/rng.ts`). A run is fully reproducible from its seed plus its action log.
- No undo of trades or shop purchases. Autosave after every state change. (Undo is allowed only for unplaced edits in the strategy builder and for chart drawings.)
- Money is integer cents. Percentages are decimals. Never accumulate currency in floats.
- Blind-mode transforms (codename ticker, hidden dates, price rescale) apply consistently to the underlying, the chain, P/L and headlines inside a window. Chart flipping is allowed only in drills and in modeled/synthetic markets, never on real chains.
- Windows that span a stock split are excluded from dealing (prices and chains are unadjusted).

## Tech stack

- **Electron + Vite + React + TypeScript (strict)**, packaged as a Windows installer and a portable `.exe` with electron-builder. Remove Electron's default menu so Alt-key hotkeys reach the game.
- **Engine:** pure TypeScript in `src/engine/` with no UI imports, so it runs in the renderer, in tests and in the headless balance simulator.
- **Storage:** SQLite via better-sqlite3 in the main process; the renderer talks to it through a typed preload bridge (IPC). Market data is read-only in `game.db`. Saves, stats and settings go in `user.db`.
- **Charts:** TradingView Lightweight Charts v5 (panes for RSI/MACD, plugins for strike lines and payoff shading). Keep its attribution logo on; list it in Credits.
- **Motion/FX:** Motion (framer-motion) for card juice. PixiJS (plus pixi-filters) on an overlay canvas for particles, the backdrop and effects. CSS for the CRT scanline and vignette overlay.
- **Audio:** Tone.js for procedural, adaptive synthwave music; jsfxr-style generated SFX. No licensed audio.
- **State:** Zustand stores that wrap engine state machines.
- **Tests:** Vitest (unit and integration) and Playwright for Electron (E2E plus screenshots).
- **Data tooling:** Dolt CLI (`dolt clone --depth 1`, `dolt sql-server`) with mysql2 from Node scripts in `data-pipeline/`.

## Commands (keep these working)

| Command | Does |
|---|---|
| `npm run dev` | Launch the game in development mode |
| `npm run verify` | Typecheck, lint, unit tests. **Must pass before every commit.** |
| `npm run test:e2e` | Playwright Electron tests, saving screenshots to `test-results/` |
| `npm run data:build` | Clone or refresh the Dolt sources and build `game.db` |
| `npm run data:sync` | Pull the latest trading days (Live mode) |
| `npm run data:report` | Write `data/REPORT.md` (tickers, ranges, row counts, gaps) |
| `npm run sim -- --runs 2000` | Headless balance simulation; writes `sim/REPORT.md` |
| `npm run build:win` | Build the Windows installer and portable exe into `release/` |
| `npm run build:mac` | Build, ad-hoc sign and zip the Mac apps (Apple chip and Intel) into `release/`, plus chat-sized parts and `join-mac.sh` in `release/mac-download/` (needs `rcodesign` on Linux) |

## Repository layout

```
app/                 Electron main + preload (IPC, db access, window)
src/engine/          Pure TS: market view, pricing, strategies, fills, expiry/assignment,
                     scoring, run state machine, shop, stress, rng
src/content/         Data-driven definitions: desks, cartridges, analysts, memos, vouchers,
                     tags, bosses, clients, characters, dialogue, headlines, achievements
src/ui/              React screens and components (chart, builder, cards, shop, debrief, stats)
src/fx/ src/audio/   Juice, CRT overlay, particles, music, SFX
data-pipeline/       Dolt extraction, derived metrics, windows, events, validation
tools/sim/           Balance simulator and bots
tests/               unit/, integration/, e2e/
assets/              Bundled fonts (OFL) and generated pixel art
```

## Data rules

- Sources: DoltHub `post-no-preference/options`, `/stocks`, `/earnings` and `/rates` (the options data is CC BY-SA 4.0, so credit it in the Credits screen), plus Cboe's free daily VIX history.
- Dolt clones live **outside the repo** at `%USERPROFILE%\SpreadTradingGameData\dolt\`. The built database goes to `%APPDATA%\SpreadTradingGame\data\game.db` (path configurable in settings). Never commit data. Keep `.gitignore` covering data, clones, `release/` and `test-results/`.
- The free options data starts in February 2019. Recent years are recorded every weekday; some older years only Monday/Wednesday/Friday or weekly. Fill missing days with modeled prices and mark those rows `source='modeled'`.
- QQQ and IWM are not in the free options data. Use SPY and DIA for market context and the benchmark.
- Fundamentals and earnings are point-in-time: use report dates, never later restatements.

## Coding conventions

- TypeScript strict; no `any` in the engine. Small pure functions. Engine functions take state and return new state.
- Content is data (typed definitions in `src/content/`) and is validated by schema tests. Adding a cartridge must never require touching engine internals beyond a documented effect hook.
- Every engine change ships with tests. Options math has golden-value tests.
- Keep UI components dumb. Game rules live in the engine.
- Comments explain *why*, not what.

## Look and tone

- Retro-futurist: a PC-98 / 80s-PC terminal look with a futuristic edge. Pixel fonts (bundled locally: DotGothic16 for display, VT323 for numbers and terminal text), a limited neon-on-indigo palette with dithering, CRT scanlines and vignette (intensity setting), and card-style UI with tilt, wobble and flip.
- Tone: dark, dry satire of trading culture, grounded in reality (less absurd than Space Warlord). All companies and characters are fictional. In open mode, headlines about real companies state only facts (report date, beat or miss, % move); jokes target the fictional firm and the trading life.
- Take structure and feel from Balatro, Hades, STONKS-9800 and Space Warlord, **never their assets, art, fonts, names or exact visuals.** All art is original: pixel maps authored in code, or CC0 packs listed in Credits.
- P/L is never color-only: use ▲/▼ glyphs and signs. Include a colorblind-safe palette option.

## Hotkeys (thinkorswim defaults, remappable in settings)

`Ctrl+1` positions (Monitor) · `Ctrl+2` trade builder (Trade) · `Ctrl+3` analyze/what-if (Analyze) · `Ctrl+4` lineup (Scan) · `Ctrl+6` chart focus · `Ctrl+8` help/glossary · `Ctrl+H` home · ``Ctrl+` `` back · `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle panels · `Alt+1–9` select lineup card or position · `Ctrl+E` edit studies · `Ctrl+T` timeframe · `Ctrl++` / `Ctrl+-` chart zoom · `Ctrl+S` settings · `Alt+B` buy (debit/long) · `Alt+S` sell (credit) · `Alt+F` flatten (close selected) · `Alt+R` reverse (flip side, e.g. bull put ↔ bear call) · `Alt+A` auto-send on/off · `Alt+[` / `Alt+]` / `Alt+\` price-ladder zoom in/out/reset.
Game-only: `1–5` pick a forecast bucket · `Shift+1–5` confidence 50–90% · `Space` play/pause fast-forward · `R` reroll lineup · `K` skip round · `Enter` confirm.

## Working agreement

- Work through `MASTER_PROMPT.md` phases in order **without waiting for approval** (Jacob chose "build the whole plan, then I test"). Stop only for something only Jacob can do (an install that needs his OK, disk space, a Windows prompt), and ask in plain language.
- After each phase: `npm run verify` and `npm run test:e2e` pass, commit with a clear message, and update `PROGRESS.md` (done, next, known issues, how to run).
- Look at E2E screenshots of every new screen before calling it done. Fix clipped text, overlaps and unreadable numbers.
- Build a Windows exe at the v1 milestone (end of Phase 5) and at the end.
- If a requirement is impossible with the free data, choose the closest honest alternative, note it in `PROGRESS.md`, and keep going.
- Nothing in the game connects to a broker or places real trades. It is a paper-trading game, not financial advice (say so in Credits).

## Definition of done (any feature)

It works in the built app, has tests for its rules, has sound and motion feedback, is reachable by mouse and hotkey, reads cleanly at 1366×768 and 1920×1080, and is recorded in `PROGRESS.md`.
