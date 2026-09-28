# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** Phase 2 (options engine) is next.

## How to run (on your PC)

1. Install Node.js LTS (one time): `winget install OpenJS.NodeJS.LTS`
2. In this folder: `npm install`
3. `npm run dev` opens the game.

## Done

### Phase 1: Market data
- **The time gate (`MarketView`).** Every system reads market data through a clock. Asking for anything dated after the current simulated day throws. Earnings dates, ex-dividend dates and Fed/CPI days show ahead of time; what happened only appears on the day. The main process re-checks every request against the caller's date too, so the future is blocked twice.
- **Property tests** open 25 random windows, take random actions, and prove no request and no returned row ever passes the clock. Indicators computed in the game equal indicators on the true history cut at today.
- **Blind mode transforms**: codename tickers, "Day N" dates, and split-style price rescaling (strikes, premiums and spot scale together; percentages, IV and delta don't change, so the ledger stays truthful).
- **`game.db` pipeline** (`npm run data:build`): clones the four DoltHub databases, downloads Cboe's VIX history, scores and picks about 20 tickers by the plan's rule, extracts bars, chains (1–70 DTE, strikes within ±30%), dividends, splits, rates, earnings (gap, move, implied move, IV crush), point-in-time fundamentals, IV/HV/IV rank, fills missing days with modeled prices (labeled `modeled`), builds ~40k dealable windows with regime tags, validates, and writes `data/REPORT.md`. `npm run data:sync` pulls new days; the same build can run from inside the game (Settings > Data) in a background process, and can download Dolt by itself.
- **The SIM market**: 18 fictional companies (Helix Robotics, MemeStonk Arcade, Solace Therapeutics…) with invented but realistic price histories: fat-tailed moves, volatility clustering, crashes, earnings jumps with IV crush, an implied-volatility premium over realized, put skew, bid/ask spreads that widen with VIX, dividends and one stock split. Always labeled SIM. The game uses it until real data is built.
- **Tested against a local Dolt server** loaded with fixture rows in DoltHub's table layout: the real pipeline extracts, models gaps, enriches earnings and builds valid windows end to end.


### Phase 0: Setup
- Electron + Vite + React + TypeScript (strict), ESLint, Prettier, Vitest and Playwright (Electron) are set up.
- `npm run verify` (typecheck, lint, unit tests) passes. `npm run test:e2e` opens the real app and screenshots it.
- The default Electron menu is removed, so Alt-key hotkeys will reach the game.
- A retro title screen: synth-grid horizon, pixel fonts (DotGothic16, VT323, bundled locally under the Open Font License), CRT scanlines.
- The seeded random-number generator every system will use (so runs replay exactly).

## Decisions and deviations (why things differ from the plan)

- **Modeled days use only the chain before them.** The plan says to interpolate between the nearest real chains. Using the chain *after* a missing day would leak the next day's volatility (an earnings crush, say) into the past, so modeled days carry forward the most recent real chain's volatility surface instead.
- **Compact database.** Option rows are stored as small integers (cents, thousandths, scaled Greeks) to keep `game.db` under the 3 GB target. Greeks are recomputed from each quote's own IV so every row uses the same units.

- **Built in a Linux cloud container, not on Windows.** Phase 0 asked to confirm native Windows. This session runs in a cloud Linux box, so everything is built and tested here, and the Windows installer is cross-built. Things that only a Windows machine can prove (the installer on a fresh profile) are listed in `PLAYTEST.md` for you to check.
- **Project moved to the repository root.** `CLAUDE.md` and `MASTER_PROMPT.md` now sit at the top of the repo so Claude Code picks them up automatically.
- **SQLite without a native module.** The plan named better-sqlite3. Electron 44 ships SQLite built in (`node:sqlite`), which needs no compiling for Windows and behaves the same in the game, the tests and the data scripts. Same database files, fewer ways for the install to break.
- **`.npmrc` sets `legacy-peer-deps`.** Some current packages declare over-strict version ranges for each other; this keeps `npm install` from refusing.

## Known issues

- **Real market data has not been downloaded yet.** This cloud session's network blocks DoltHub, Cboe and federalreserve.gov, so `data/REPORT.md` currently describes the SIM market. On your PC, run `npm run data:build -- --yes` (or use Settings > Data in the game) to build the real database: roughly 16 GB of downloads and a few hours the first time.
- **FOMC and CPI dates were compiled offline** (the official sites were unreachable), so they're marked unverified in the database. They match the published schedules to the best of my knowledge.
- The DoltHub table layouts were written from documentation and checked against a local imitation, not against the live repositories. The pipeline inspects the real column names when it runs and stops with a plain message if something doesn't match.

## Next

Phase 2: the options engine (pricing, strategies, orders and fills, position lifecycle, scoring math).
