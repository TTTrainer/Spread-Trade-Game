# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** Phase 8 (the balance simulator and tuning) is next.

## How to run (on your PC)

- **Installer:** `npm run build:win` writes `release/SpreadTradingGame-Setup-<version>.exe` (installer) and `release/SpreadTradingGame-Portable-<version>.exe` (runs without installing).
- **From source:** install Node.js LTS once (`winget install OpenJS.NodeJS.LTS`), then in this folder `npm install` and `npm run dev`.

## Done

### Phase 7: Content
- **Characters:** Director Kessler (Head of Desk), Ines Ortiz (mentor, ex-market-maker), Bradley Stroud IV (rival) and COMPLY-3000 (AI compliance). Each has a 64×64 pixel portrait drawn in code with four expressions (neutral, pleased, angry, worried).
- **174 lines of dialogue**, dark and dry, triggered by what happens: run start, round start, Review intro, big wins and losses, declining a stop, closing at plan, skipping, high stress, burnout, hitting or missing a target, crossing the Max-Loss Line, the shop, victory, "why didn't you just buy SPY", defeat, Rival's Bet, the Golden Parachute, and Endless (Phase 9). Only the most important line of each moment is spoken, it types out in a box with the portrait, and it never blocks a click.
- **Headlines:** 208 templates (8+ for every event type × size × direction): earnings reactions (inside, beyond, or blowing through the implied move), unscheduled gaps, ex-dividend days, FOMC and CPI days, VIX spikes. They're filled from the real event data on the day it happens (never before) and slide in over the chart. Blind mode uses the codename; open mode about real companies uses plain facts only. Everything goes through a `HeadlineProvider`, so a live writer can replace the library later.
- **Clients:** 14 satirical clients (a treasury bot, a dentist with a spreadsheet, a pension fund for bus drivers, Crypto Kyle…). About 1 round in 3 one asks for a specific trade (direction, max loss in dollars, POP, days to expiration, structure, reward/risk, Edge Rank). The card shows a live ✔/✘ checklist against what's on the builder; filling it pays cash and reputation, missing it costs reputation. (The Contracts board mode comes in Phase 9.)
- **47 achievements** (50 spreads closed at 50%+, 10 IV crushes, 25 planned stops, calibration A over 100 calls, beat SPY in 5 runs, win on every desk, Tier 8, Pin Master, complete the wheel…), computed from the real ledger, finished runs and drills, with an Achievements screen (from Stats or Career). A few depend on Phase 9 modes. Practice runs don't count.
- **Every desk plays:** Income (cash-secured puts and covered calls, now dealt on affordable $6–$18 stocks), Condor, Volatility and Calendar all run full years through the engine and the bots. They unlock with Bonus in Phase 9.
- **Every item is reachable:** a test generates thousands of shops across all desks and confirms every cartridge, analyst, memo, Playbook Page and voucher can appear.
- Tests: 258 unit/integration tests, including one per cartridge (triggers when it should, stays quiet otherwise), every memo, voucher, tag and Review against the engine, client fills, headline timing, dialogue and portrait checks, achievements. E2E adds the run-start dialogue and the Achievements screen; screenshots reviewed.

### Phase 6: The Career run loop
- **Career menu:** pick a desk (Verticals is open; the other four show their Bonus price and unlock in Phase 9), an optional seed, and START RUN. A run in progress shows up with CONTINUE and ABANDON (with a no-undo warning).
- **A run is a fiscal year:** 4 quarters × (Month 1, Month 2, Review) = 12 rounds. Targets start at 150 / 250 / 400 points and grow ×1.6 a quarter; the Annual Review is ×1.25 more.
- **Each round:** 3 blind lineup cards (codenames, rescaled prices, "Day N"), dealt 75% from the last three years; **3 tickets**; **2 rerolls** (`R`, redraws every card you haven't traded); **skip** Month 1 or 2 (`K`) for −10 stress and a Tag (shown on the button before you choose). A call is required before every trade, one position per card, only your desk's playbook, and no new trades once the clock runs.
- **Max-Loss Line:** checked at every close. Cross it and the risk desk liquidates everything at the natural price and the round fails. The top bar shows the room you have left.
- **Scoring:** every closed trade goes through chips × mult in order: structure base and level, good R:R +1, call bonus, closed at plan +0.5, the desk passive, family bonuses, then Edge Rank ×, then each cartridge in slot order (order matters), then memos. Losers are never multiplied. The meter fills live during the fast-forward.
- **Tally:** receipts print line by line (chips count, mult pops, sounds), the meter fills, TARGET MET / MISSED / LIQUIDATED is stamped, and the debrief strip reveals the real tickers and dates.
- **Stress** (0–100, always on screen; click it for every change and its cause): +15 declining your own stop, +10 a drawdown over 5%, +5 per loser, +10 a wrong call at 80%+, +10 entering a Review, +5 an assignment; −10 skipping, −5 closing at plan, −30 Vacation Day. At 100: burnout (next round one fewer ticket and a random analyst goes silent), then back to 50.
- **Cash and the shop:** round wins pay $3/$4/$5, +$1 per unused ticket, interest $1 per $5 (cap $5). The shop offers 2 cartridges (rarity 60/28/10/2, 60/40 toward your desk), an analyst (or a level-2 upgrade), 2 boosters (memos or Playbook Pages), and a voucher; rerolls cost $5, $6, $7…; cartridges sell back for half; drag order with ◀ ▶.
- **All 50 cartridges** are implemented through a hook pipeline (entry, day close, decision point, close, tally, round end, passives), plus **family bonuses** at 2/3/4 of a kind, **9 analysts** (each with a live readout on the Analyst desk: IV rank history, volatility risk premium and term structure, earnings history vs implied moves, extra chart studies, skew, SPY/VIX with the Fed/CPI calendar, base rates from the stock's own past, portfolio Greeks), **11 memos**, **10 vouchers**, **8 tags**, **10 Reviews**, and **8 Risk Tiers** (Tier 0 is the default until Phase 9 adds the picker).
- **Reviews:** COMPLY-3000 announces each one (typed out), the lineup is dealt only from matching market regimes, and the rule applies (e.g., The Chop halves debit directional wins, Wide Markets disables market orders). Q4 is always the Annual Review.
- **Endings:** victory needs the Annual Review passed *and* positive alpha against SPY for the year; otherwise "You survived, but the board asks why you didn't just buy SPY." Defeat when a round misses its target or crosses the line (the Golden Parachute saves you once). The end screen shows rounds, points, real P/L, alpha, the calibration grade (Brier), career XP and Bonus (spent in Phase 9). Every trade goes to Stats.
- **Autosave with no undo:** the run saves after every action. It stores a checkpoint plus the actions since, so quitting mid-round and pressing CONTINUE replays the round to the exact same state. A whole run replays from its seed and action log (tested).
- **Realism toggles now wired:** liquidity limits (max 10 contracts per order; legs wider than 50% of mid refuse to trade), taxes (Career sets aside 24% of each round's net gain), approval levels (spreads need $2,000 equity, like a Level 3 margin account).
- **Headless bots** (disciplined, hold-to-expiry, random, greedy) drive the real engine; a full year takes well under a second on the SIM market, which is what the Phase 8 simulator will use.
- Fixed along the way: the price ladder now thins out strikes when they're packed too tightly to read, and meter labels sit on a dark pill so they stay readable over bright fills.
- Tests: 159 unit/integration tests (scoring order, losers never multiplied, family thresholds, shop odds and prices, dealing, content rules, burnout, Reviews, replay, save/resume, "arcade cartridges never change the ledger"). E2E: start from the menu, reroll, save and exit, continue, abandon; and a full 12-round Verticals year (first two rounds through the real UI, a quit and resume mid-round in a fresh process, then a bot finishes the year) with screenshots reviewed.

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
- **Practice runs.** A run can be flagged "practice" (a missed round doesn't end it). The tutorial will use it; the end-to-end test uses it so a whole year always plays out regardless of balance.
- **Rerolls redraw every card you haven't traded** (traded cards stay), rather than the whole lineup, so a reroll never throws away an open position.
- **Skipping goes straight to the next round with no shop**, like skipping a blind in Balatro.
- **Assignments add +5 stress** (not in the plan's table). The Assignment Artist cartridge says assignments give chips "instead of stress", so they needed a stress cost to replace; the Income desk and that cartridge remove it.
- **The Chop's rule** ("debit and directional wins score ×0.5") is read as *debit trades with a bull or bear lean*, so a bull put credit spread in a range isn't punished for being the right trade there.
- **Algo Execution** makes brackets execute on their own (no confirm step), since brackets already default on.
- **Crossing the Max-Loss Line liquidates** open positions at the natural price, the way a real risk desk would, so the ledger records what that costs.
- **Taxes** reduce equity by a 24% short-term estimate on each round's net gain; the trade ledger itself stays pre-tax so Stats compare like with like.
- **Duo Legendaries** get a 15% chance to show up once you own both parents (the plain 2% Legendary rate would make them almost unseeable).
- **`npm run verify` now also checks formatting** (Prettier), and the whole codebase was formatted once.

- **`.npmrc` sets `legacy-peer-deps`.** Some current packages declare over-strict version ranges for each other; this keeps `npm install` from refusing.

## Known issues

- **Balance is untuned.** The simple disciplined bot clears only a few rounds a year right now, so targets, payouts and cartridge strengths will move in Phase 8 (the simulator), not by feel.
- The other four desks play fully in the engine but stay locked until Phase 9's Bonus unlocks. Early balance numbers vary a lot by desk (condors clear most rounds, income very few), which Phase 8 fixes.
- The v1 Windows installer was built and checked in this cloud session, but only a real Windows PC can prove the installer end to end (see `PLAYTEST.md` at hand-off).

- **Real market data has not been downloaded yet.** This cloud session's network blocks DoltHub, Cboe and federalreserve.gov, so `data/REPORT.md` currently describes the SIM market. On your PC, run `npm run data:build -- --yes` (or use Settings > Data in the game) to build the real database: roughly 16 GB of downloads and a few hours the first time.
- **FOMC and CPI dates were compiled offline** (the official sites were unreachable), so they're marked unverified in the database. They match the published schedules to the best of my knowledge.
- The DoltHub table layouts were written from documentation and checked against a local imitation, not against the live repositories. The pipeline inspects the real column names when it runs and stops with a plain message if something doesn't match.

## Next

Phase 8: the balance simulator (`npm run sim`) with the Disciplined Seller, Hold-to-Expiry, Random and Greedy bots, tuned until skill clearly beats luck (section 17 targets), with `sim/REPORT.md`.
