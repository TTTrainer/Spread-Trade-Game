# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** Phase 6 (the Career run loop) is next.

## How to run (on your PC)

- **Installer:** `npm run build:win` writes `release/SpreadTradingGame-Setup-<version>.exe` (installer) and `release/SpreadTradingGame-Portable-<version>.exe` (runs without installing).
- **From source:** install Node.js LTS once (`winget install OpenJS.NodeJS.LTS`), then in this folder `npm install` and `npm run dev`.

## Done

### Phase 5: Stats and the v1 Windows build
- **Stats** (from the real ledger only, filterable by mode): trades, win rate, expectancy, average win and loss, profit factor, total P/L with max drawdown, and alpha vs the SPY benchmark; an equity curve against the benchmark (hover for each trade); a calibration chart (your confidence vs your hit rate, with Brier score and grade); breakdowns by structure, desk, ticker, VIX regime, IV rank, trend and earnings; mistake-tag trends per 10 trades.
- **Export CSV** writes an Excel-ready file (UTF-8 with BOM, CRLF lines, properly quoted fields).
- **Settings:** starting capital, default short delta, bucket mode, fast-forward speed, which decision points pause, Pure Market; every realism rule as its own toggle; blind-mode options; CRT, UI scale, shake, reduced motion, colorblind palette, terminal theme (indigo, amber, phosphor); audio levels and music style; remappable hotkeys with a reset to thinkorswim defaults; and **Data** (build real data, sync, rebuild SIM, view the data report). Settings persist.
- **Credits** with the CC BY-SA 4.0 notice for the options data, TradingView Lightweight Charts, the fonts, and "not financial advice".
- **v1 Windows build:** `SpreadTradingGame-Setup-0.1.0.exe` and `SpreadTradingGame-Portable-0.1.0.exe`, cross-built from Linux with an original pixel-art icon. Checked that the Windows binary runs the built-in SQLite. (Trading, drills and stats are playable; Career arrives in Phase 6.)
- Chart colors for Stats were checked with a colorblind-safety validator against the dark background.


### Phase 4: Drills
- **60-Second Blind Call:** a blind chart (codename, rescaled prices, sometimes flipped), a ticking timer, five buckets and a confidence level; scored with the Brier score, streaks tracked, the reveal animates the next 10 days.
- **Guess the IV:** read the straddle price and the chart, estimate implied volatility; the answer explains the rule of thumb (IV ≈ straddle ÷ (0.8 × price × √(days/365))).
- **Greeks Speed Round:** a position's Greeks and a scenario (move, days, IV change); pick the P/L from four choices built from the common mistakes (delta only, forgetting theta, wrong sign).
- **Spot the Setup:** RSI divergences, Bollinger squeezes and 50-day trend breaks found by detectors that only look backward; the reveal shows what happened next.
- **Expected Move Darts:** drag a price range on the chart; tighter ranges score more, misses score nothing; the reveal draws the ±1 expected move.
- **Drill-only adaptation:** the adaptive session deals more of the skills you score worst on, and blind calls lean toward the market regimes you read worst. Career never adapts.
- Every session is saved (score, hits, streak, Brier, per-question results) and feeds a calibration chart.
- Fixed along the way: dealer probes (the entry-day price used for blind rescaling) now pass their date through the main process's time gate, which Career's blind cards also rely on.


### Phase 3: Trading screen and Sandbox
- **The trading screen** (1920×1080 layout, with a compact layout for 1366×768): top bar, lineup cards with sparklines and badges (IV rank, earnings countdown, SIM/MODEL labels), the chart, the bottom tray, and a right panel with payoff and stats.
- **Chart** (TradingView Lightweight Charts, attribution logo kept on): candles, volume, Bollinger Bands, RSI and MACD panes; daily/weekly; pan and zoom; strike lines, breakevens and the expected-move band; trendline and horizontal-line drawing with undo; a study picker (`Ctrl+E`) with the analyst studies (SMA 20/50/200, EMA 9/21, Keltner, ATR, support/resistance, relative volume) ready to be earned in Career.
- **Price ladder** on the chart's right edge, lined up with the price axis: click a strike to move the short strike there, Shift+click to set the far strike; `Alt+[` `Alt+]` `Alt+\` zoom it.
- **Builder:** call cards (`1–5`, `Shift+1–5` confidence, scroll wheel), all 14 structure cards, weekly and monthly expiry chips (plus a back month for calendars), delta, width and contracts with a live risk-vs-cap readout, plain-word errors for illegal builds.
- **Order ticket:** limit slider from mid to natural with a live fill probability, market orders, brackets (50% target, 2× stop, editable), an "earnings inside: on purpose" checkbox, `Alt+S` sell / `Alt+B` buy with a confirm step, `Alt+A` auto-send.
- **Payoff diagram** (expiration and today, expected-move shading, hover readout) and **Analyze** (`Ctrl+3`): what-if sliders for price, days and IV, a P/L heat strip, and the full chain table.
- **Positions dock** (`Ctrl+1`): mark, P/L in $ and % of risk, DTE, Greeks, brackets, distance to the short strike in ATR and expected moves, close and roll (`Alt+F` flattens).
- **Fast-forward** (`Space`) with decision points that pause the clock (target, stop, short strike touched, 21 DTE, earnings tomorrow, ex-dividend with an ITM short call, pin risk, assigned shares). Declining your own stop is called out.
- **Debrief:** receipt cards flip in, then expand to show the reveal, P/L attribution bars, the call result, the benchmark and alpha, the process grade checklist, mistake tags and alternates. Every closed trade is saved to your local stats ledger.
- **Sandbox** (open mode): pick up to 3 tickers and any date, filter for dates with earnings, big gaps or high IV rank ahead, set starting capital, trade with every tool, no score.
- **Sound:** generated retro sound effects for clicks, fills (stamp), wins, losses, stops, decision points and gaps (with screen shake). Help and glossary on `Ctrl+8`.
- E2E: open Sandbox, call the shot with hotkeys, sell a bull put, fast-forward through five decision points to expiration, and check the debrief P/L matches the engine. Screenshots reviewed at both resolutions.


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

- **Three realism toggles are placeholders until the run loop lands:** liquidity limits, taxes and broker approval levels are in Settings but don't act yet (Phase 6 wires them in).
- The v1 Windows installer was built and checked in this cloud session, but only a real Windows PC can prove the installer end to end (see `PLAYTEST.md` at hand-off).

- **Real market data has not been downloaded yet.** This cloud session's network blocks DoltHub, Cboe and federalreserve.gov, so `data/REPORT.md` currently describes the SIM market. On your PC, run `npm run data:build -- --yes` (or use Settings > Data in the game) to build the real database: roughly 16 GB of downloads and a few hours the first time.
- **FOMC and CPI dates were compiled offline** (the official sites were unreachable), so they're marked unverified in the database. They match the published schedules to the best of my knowledge.
- The DoltHub table layouts were written from documentation and checked against a local imitation, not against the live repositories. The pipeline inspects the real column names when it runs and stops with a plain message if something doesn't match.

## Next

Phase 6: the Career run loop (desks, lineup, calls, tickets, targets, Max-Loss Line, stress, skips and tags, tally, shop, Reviews, victory and defeat, autosave).
