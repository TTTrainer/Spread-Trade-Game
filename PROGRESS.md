# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** Phase 3 (trading UI and Sandbox) is next.

## How to run (on your PC)

1. Install Node.js LTS (one time): `winget install OpenJS.NodeJS.LTS`
2. In this folder: `npm install`
3. `npm run dev` opens the game.

## Done

### Phase 2: Options engine
- **Pricing:** Black–Scholes–Merton with dividends, all Greeks, an implied-volatility solver. Checked against textbook values (Hull, Haug), put-call parity, and finite differences.
- **14 structures** (bull put, bear call, debit verticals, iron condor, iron fly, broken-wing condor, straddle, strangle, covered call, cash-secured put, calendar, diagonal, double calendar), built on real listed strikes; credit spreads default to a ~30Δ short strike. Illegal builds explain themselves in plain words.
- **Trade metrics:** payoff at expiration and today, max profit and loss, breakevens, probability of profit, R:R, Greeks and plain-English Greeks ("you make about $6 a day from time decay"), expected move.
- **Edge Rank:** your pay-for-risk ranked against every comparable spread on the same chain that day (same type and expiry, short delta within ±0.05, width within one strike).
- **Orders and fills:** natural always fills; limits between mid and natural fill 35%→100% with the seeded dice; unfilled limits rest; execution perks only move fills toward mid, never outside the real bid/ask. Fees, PDT and the risk cap are enforced.
- **Position lifecycle:** daily marks (modeled when a quote is missing), brackets (50% target, 2× credit stop by default), all six decision points, dividends, early assignment, expiration with assignment into shares, pin risk coin flips, rolls, adjustments, exercise. Money is integer cents throughout.
- **Scoring math:** chips × mult with order-dependent cartridge slots, losers never multiplied, call buckets scaled by expected move, Brier calibration grades, P/L attribution that always sums to the real P/L (residual shown honestly), process grade A–F with "good trade, bad luck" labels, mistake tags, alternates, SPY benchmark.
- 112 tests; 97% line coverage on the engine.


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

- **Calls on trades closed early.** The plan resolves a call at the trade's expiration. If you close early, the game grades the call on the move so far, with the expected move scaled by the square root of the time that passed. That way closing a winner early never leaves the call hanging, and the same skill is measured either way.
- **Income trades and the risk cap.** A cash-secured put or covered call can in theory lose nearly all its collateral, which would never fit a 10% risk cap on a small account. For those two, the cap measures a stress loss (a drop of three expected moves, at least 25%) while the full collateral must still fit in your equity.
- **Stops are "2× the credit" in spread price.** A stop at 2× credit closes when buying the spread back costs twice what you collected (a loss about equal to the credit). A loss of 2× credit would usually equal the whole max loss on a 1/3-width spread, which makes the stop pointless.

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

Phase 3: the trading screen (chart, builder, chain ladder, payoff, ticket, positions, fast-forward, decision points, debrief, hotkeys) and Sandbox mode.
