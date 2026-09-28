# Master prompt: build the Spread Trading Game

> **For Jacob: how to use this file.** Open Claude Code in your Spread Trading Game folder (the one with this file and `CLAUDE.md`) and send:
> `Read CLAUDE.md and MASTER_PROMPT.md, then build the game by following MASTER_PROMPT.md from Phase 0 through Phase 11. Don't wait for my approval between phases.`
> If a session ends before it's finished, start a new one and send:
> `Read CLAUDE.md, MASTER_PROMPT.md and PROGRESS.md, then continue from where PROGRESS.md says we are.`
> Claude Code will ask you to approve installs (Node.js, Git, Dolt) and may ask about disk space. Everything else it does on its own.

You are building a complete, polished, single-player Windows desktop game for Jacob. Read `CLAUDE.md` first: its pillars, invariants, stack and working agreement apply to everything below. This document is the full design spec and the build plan. Jacob answered a detailed design questionnaire; his answers are summarized in Appendix A and are the source of truth when anything here is ambiguous.

Work through the phases in section 18 in order, without stopping for approval. Commit after each phase, keep `PROGRESS.md` current, and hand over a Windows installer at the end.

---

## 1. Mission and success criteria

Make a roguelite that Jacob *wants* to play, built on a truthful options market, so that playing it makes him sharper at calling direction, feeling the Greeks, handling events, and exiting losers.

The build succeeds when:
- A full run takes 20–40 minutes, can end early, and feels different each time (desks, cartridges, reviews, market regimes).
- Every price, chain, event and outcome comes from real data (or clearly labeled modeled data), and no screen ever leaks the future.
- The balance simulator shows skill clearly beats luck (section 17).
- Placing a spread feels tactile and fast, and scoring feels like Balatro: chips count up, multipliers pop, the meter fills.
- It installs and runs offline on Jacob's Windows PC and stores everything locally.

## 2. Decisions made from Jacob's answers

These resolve places where his answers pull in different directions. Keep them unless Jacob says otherwise.

1. **Market truth vs. arcade perks** (he asked for a realistic main game *and* strategy powerups mixing real and "forced" advantages). The market is never altered. `ARCADE` powerups act only on the score meter, multipliers, cash, stress and the shop. `REAL` powerups mirror real edges (information, better execution inside the real bid/ask, more buying power). A **Pure Market** setting disables `ARCADE` cartridges for anyone who wants undiluted stats. Career stats always come from the real ledger, never the arcade meter.
2. **AI headlines on a $0 budget, with Claude in-game "later".** You (Claude Code) write the headline template libraries once during the build. The game fills them from real event data at runtime, so there's no API cost. Keep a `HeadlineProvider` and an `AdvisorService` interface so a live Claude mentor or writer can be plugged in later.
3. **Platform.** He picked a desktop .exe and said Unity is fine if it fits best. Use Electron + TypeScript: you can build, test and screenshot it end to end from the command line, and he doesn't have to operate an editor. It is still a native-feeling Windows app with local storage.
4. **Forecast buckets.** Keep his five buckets (down big, down, flat, up, up big), but scale the cutoffs to each stock's expected move over the trade's horizon so "big" means the same thing for SPY and TSLA. A setting switches to fixed ±1% / ±5%.
5. **Information.** The standard spread-trading kit is always visible: payoff (expiration and T+0), POP, max profit and loss, breakevens, R:R, Greeks in plain English, IV rank, what-if sliders, candles, volume, RSI, MACD, Bollinger Bands, earnings date, option chain and a fundamentals snapshot. Deeper edge tools are earned by hiring analysts in the shop.
6. **Realism defaults.** On: bid/ask spreads, earnings gaps and IV crush, early assignment, expiration mechanics, PDT rule. Off but available: fees, liquidity limits, taxes, broker approval levels. Every rule is an individual toggle. Defined-risk collateral (max loss) is always enforced; margin calls don't exist because nothing has undefined risk.
7. **"Rounds of 20–40 minutes"** means a full run: 4 quarters of 3 rounds. A failed round ends the run early.
8. **Luck vs. skill** (he left the checkbox blank but asked for Hades/Balatro balance). Hit the simulator targets in section 17. Difficulty never adapts to the player in Career; you learn combos over time. Only Drills adapt.
9. **Debrief.** He didn't tick "forecast vs. outcome", but calibration scoring needs it, so the debrief shows the call result as one line.
10. **Chart flipping** only happens in Drills and synthetic markets, because flipping real option chains breaks skew.
11. **Credit spreads are home.** The starting desk is Verticals, which leads with bull put and bear call credit spreads. Other structures are advanced desks bought later.

## 3. The game in one paragraph

You're a junior options trader at a fictional near-future firm. Each run is one fiscal year: four quarters, three rounds each. Every round, you're dealt anonymized real stocks at real moments in history. You call your shot, build a spread on the real option chain, and fast-forward through what actually happened. Hit the round's score target without crossing the Max-Loss Line. Spend your cash in the shop on cartridges (combo powerups), analysts (information), playbook pages (structure level-ups), memos and vouchers. Then survive the quarter-end Review. Blow up and the run ends, but career rank, unlocks and your lifestyle carry over.

```
Career (meta) ──► Pick a Desk ──► Q1: Month 1 → Month 2 → Review (boss) ──► Q2 … Q4 Annual Review ──► Victory ──► Endless (optional)
                                    │
                        each round: Lineup → Call → Build → Place (×tickets) → Fast-forward w/ decision points
                                    → Tally (chips × mult) → Debrief → Shop
```

## 4. Run structure

- **Run = 1 fiscal year = 4 quarters × 3 rounds** (Month 1, Month 2, Review). 12 rounds.
- **Skipping.** Month 1 and Month 2 can be skipped for a Tag (section 8.7). Reviews can't be skipped. This is the reward for sitting out bad setups.
- **Failing.** The run ends if the round finishes (tickets used and positions closed) below target, or if equity crosses the round's Max-Loss Line at any close. The Golden Parachute cartridge saves you once.
- **Victory** comes after the Q4 Annual Review. Then the player may continue into **Endless**: Year 2 and beyond, targets ×1.8 per quarter, Reviews drawn as random pairs of rules, and synthetic markets allowed if toggled.
- **Seeds.** Every run has a seed. Daily uses the date as its seed. Store seed + action log for replays and rival ghosts.

## 5. A round, step by step

1. **Deal the lineup.** Deal 3 cards (4 with the Second Monitor voucher, max 5). Each card is one real ticker at one real moment (a *window*). It shows a codename, a mini chart, the history length, and any analyst badges (IV rank, earnings inside the window, sector). **Rerolls: 2 per round.** Deal windows 75% of the time from the last three years and 25% from earlier years (February 2019 up to three years ago).
2. **Tickets.** 3 trades per round (Extra Ticket memos add more). One open position per card unless a cartridge says otherwise.
3. **Call your shot (required, fast).** Drag a Call card (▼▼ ▼ ■ ▲ ▲▲) onto the chart, or press `1–5`. Set confidence at 50/60/70/80/90% with `Shift+1–5` or the scroll wheel. The horizon is the trade's expiration. Cutoffs scale with the expected move (EM, from the ATM straddle): flat is within ±0.25 EM, small is 0.25–1 EM, big is beyond 1 EM. Show the resulting % cutoffs on the cards.
4. **Build.** This is a TradingView-style strategy builder made tactile:
   - Drag a structure card from your desk's playbook onto the chart. Its legs appear as handles on the price ladder, snapped to real listed strikes. Credit structures default the short strike to ~30Δ (setting).
   - Scroll to change width. Click expiry chips: weeklies 1–10 DTE and monthlies 30–45 DTE (calendars pick two).
   - Use `+/−` for contracts. The risk readout shows % of equity against the risk cap.
   - Everything updates live: payoff (expiration + T+0), POP, max profit and loss, breakevens, R:R, Greeks in plain English ("you make about $6 a day from time decay"), IV rank, the **Edge Rank meter**, and a **Score Preview** Balatro-style ("at max profit: 320 chips × 3.5 mult").
5. **Place.** A limit-price slider runs from mid to natural and shows live fill probability. `Alt+S` sells, `Alt+B` buys, with a stamp animation and sound. Credit structures get brackets by default at 50% of max profit and a stop at 2× credit (editable, drawn on the chart). `Alt+A` toggles auto-send (skips the confirm step).
6. Repeat until tickets run out, or press `Space` to start the clock.
7. **Fast-forward** (turn-based decisions, then animated replay). All open positions advance day by day in parallel, each on its own window, synced by trading-day index. Candles animate in, P/L ticks, headlines slide in on event days, the screen shakes on gaps over 2 ATR, and the music intensifies with realized volatility.
   - **Decision points** auto-pause at: bracket hit (confirm or override), short strike touched, 21 DTE, earnings tomorrow, ex-dividend tomorrow with an ITM short call, and expiration day with price between strikes (pin risk).
   - Actions: hold, close (`Alt+F`), roll, adjust, exercise. Speed is a setting.
8. **Tally.** Each closed trade flips a receipt card: chips count up, mult bubbles pop in slot order, and the result flies into the round meter. Losses drain the meter.
9. **Round end.** Pay out cash, interest and the unused-ticket bonus, and update stress. Show a debrief strip with one card per trade; click to expand (section 11.7). Reveal each card's real ticker and dates.
10. **Shop** (section 8).

## 6. Scoring, targets, cash and stress

All numbers are **starting values** in `src/content/balance.ts`. Tune them with the simulator, not by editing code.

**Real ledger (powerups never touch it).** Equity, trade P/L, a benchmark (SPY buy-and-hold over each trade's dates with the same capital at risk), and alpha (your P/L minus benchmark P/L). Default starting equity is $5,000; the setting runs from $1,000 to $100,000, and every target and limit is a percentage.

**Chips** (per closed trade) = realized P/L ÷ round-start equity × 10,000. So +1% of equity is 100 chips. Winners also add their structure's base chips.

**Mult** applies to winners only. Start at 1 and add every additive (+) source. Then apply the multiplicative (×) sources: Edge Rank first, then cartridges in slot order from left to right, so ordering matters like Balatro:

| Source | Effect |
|---|---|
| Structure level | +0.5 per level above 1 (plus +10 base chips per level) |
| R:R quality | +1 if the trade meets its structure's "good R:R" threshold (credit ≥ ⅓ of width for credit verticals; debit ≤ ½ width for debit verticals; per-structure thresholds live in content) |
| **Edge Rank** | Jacob asked for a bonus when R:R is high *relative to the rest of the chain*. Rank the trade's credit ÷ width (or reward ÷ risk) against comparable spreads on the same chain that day: same type and expiration, short-strike \|Δ\| within ±0.05, width within one strike increment. Top 10% ×1.5, top 25% ×1.25. |
| Call bonus | Exact bucket: +(confidence − 40%) ÷ 20% (90% gives +2.5). Adjacent bucket: +0.25. Wrong: 0. |
| Discipline | Closed at the planned target: +0.5 |
| Cartridges, memos | As written on each |

**Losers.** Chips are negative and are **never multiplied**. Cartridges may soften a loss on the meter (never on equity).

**Round targets** (points): Q1 is 150 / 250 / 400 for Month 1 / Month 2 / Review. Multiply by 1.6 each quarter, by 1.8 per quarter in Endless, and by the Risk Tier multiplier.

**Max-Loss Line:** −10% of round-start equity at Tier 0. **Risk cap per trade:** 10% of equity at Tier 0; a trade's max loss can't exceed it.

**Calibration.** A multi-class Brier score over the run's calls (confidence on the chosen bucket, the remainder spread evenly across the other four). It becomes a run-end grade from A to F that pays bonus cash and career XP.

**Cash** (shop money, separate from equity):
- Round-win payout of $3 / $4 / $5.
- +$1 per unused ticket.
- Interest of $1 per $5 held, capped at $5.
- Cartridges sell back for half price.

**Stress** (0–100, always visible). Every change shows its cause, so there's no mystery meter.

| Stress up | Stress down |
|---|---|
| +15 declining your own stop at a decision point (this targets Jacob's weakness) | −10 skipping a round |
| +10 a drawdown over 5% inside a round | −5 closing at plan (target or stop) |
| +5 per losing trade | −30 Vacation Day memo |
| +10 a wrong call at ≥80% confidence | Lifestyle perks lower starting stress |
| +10 entering a Review | |

At 100 you hit **Burnout**: the next round has −1 ticket and one analyst goes silent, then stress resets to 50. Stress never ends a run by itself.

## 7. Desks (strategy builds)

Jacob wants each run built around one kind of trade, with powerups that help each strategy differently. Pick a desk at run start. The shop weights cartridges 60/40 toward the desk's affinity. There are no undefined-risk structures anywhere.

| Desk | Playbook structures | Passive | Starting kit | Unlock |
|---|---|---|---|---|
| **Verticals** (home desk) | Bull put and bear call credit spreads; bull call and bear put debit spreads | Credit spreads that expire worthless or close at ≥50% of max profit: +1 mult | Analyst: The Quant. Cartridge: Stop Discipline | Start |
| **Income** | Covered call, cash-secured put, the wheel (CSP → assignment → covered call) | Assignment isn't a loss event; dividends pay chips | Cartridge: Dividend Radar | Bonus |
| **Condor** | Iron condor, iron butterfly, broken-wing condor | Correct "flat" calls pay double call bonus | Cartridge: Wing Clipper | Bonus |
| **Volatility** | Long straddle, long strangle | Earnings events show the implied move; long premium held through an event +50 chips | Analyst: The Earnings Whisperer | Bonus |
| **Calendar** | Calendar, diagonal, double calendar | IV term-structure panel always on | Cartridge: Term Structure Tap | Bonus |

## 8. Content

All content is typed data in `src/content/`, validated by schema tests. Jacob named "lack of fun combos for powerups" as a reason to quit, so combos get real design attention.

### 8.1 Cartridge families (synergy traits)

Each cartridge belongs to one or two families. Owning 2, 3 or 4 of a family triggers a family bonus, shown on the cartridge rail (TFT-style trait counters).

| Family | 2 | 3 | 4 |
|---|---|---|---|
| THETA (time decay) | +20 chips on short-premium wins | +1 mult on short-premium wins | theta-based chips ×2 |
| VEGA (volatility) | live IV-change readout | IV-crush wins ×1.25 | ×1.5 |
| DELTA (direction) | trend arrow on lineup cards | correct direction calls +1 mult | +2 |
| DISCIPLINE (exits) | stop refunds +10% | stress from losses halved | closing at plan +1 mult |
| EXECUTION (fills) | fills 5% closer to mid | 10% closer | rolls and adjustments with no slippage |
| EVENT (catalysts) | implied move on lineup cards | event-day wins +1 mult | ×1.5 |
| ECONOMY (cash) | interest cap +$1 | +1 shop slot | first reroll free each shop |
| CHAOS (cursed) | each CHAOS cartridge raises both winner mult and loss or stress penalties | | |

### 8.2 Cartridges (build all 50; expand toward 60 if time allows)

Rules:
- 5 cartridge slots.
- Rarity weights: Common 60%, Uncommon 28%, Rare 10%, Legendary 2%.
- Every cartridge lists at least 2 synergy partners in its definition, and a test enforces it.
- A **duo** Legendary appears only when both of its parents are owned (Hades-style).
- Prices: $4 / $6 / $8 / $10 by rarity.

| # | Cartridge | Family | Desk | Rarity | Tag | Effect |
|---|---|---|---|---|---|---|
| 1 | Theta Engine | THETA | Vert/Condor/Income | C | ARCADE | +8 chips per trading day a short-premium position is open and in profit |
| 2 | Fifty-Percent Club | THETA·DISC | any short premium | U | ARCADE | Close at ≥50% of max profit before expiry: +3 mult |
| 3 | Weekend Warrior | THETA | any | C | ARCADE | Short premium held over a weekend: +15 chips |
| 4 | 21-Day Rule | THETA·DISC | any | U | ARCADE | Close or roll a winner at ≤21 DTE: +2 mult; winners held into the last 7 DTE: −1 mult |
| 5 | Credit Where Due | THETA | Verticals | C | ARCADE | Credit ≥ ⅓ of width: +2 mult |
| 6 | Ladder Up | THETA | Verticals | R | ARCADE | +1 mult per consecutive winning credit spread this run; resets on a loss |
| 7 | Premium Printer (duo of 1 + 2) | THETA | any | L | ARCADE | Theta Engine chips ×3 on trades closed at ≥50% |
| 8 | IV Crusher | VEGA | Vert/Condor | U | ARCADE | Short-vega trade opened at IVR ≥ 50 whose IV drops ≥20% while open: ×1.5 |
| 9 | Vol Arb | VEGA | any | R | REAL+ARCADE | Shows IV minus 20-day HV; trades opened when IV beats HV by ≥5 points: +2 mult |
| 10 | Long Gamma | VEGA | Volatility | U | ARCADE | Straddle or strangle whose move beats the expected move: ×2 |
| 11 | Term Structure Tap | VEGA | Calendar | U | ARCADE | Calendar opened with front-month IV above back-month IV: +3 mult |
| 12 | Crush It | EVENT·VEGA | Condor/Vert | R | ARCADE | Short premium held through earnings, stock stays inside the expected move: ×3 |
| 13 | Earnings Sniper | EVENT | Volatility | U | ARCADE | Long straddle through earnings: +100 chips × (actual move ÷ expected move) |
| 14 | Earnings Whisper | EVENT | any | C | REAL | Lineup cards show the earnings date and implied move |
| 15 | Fed Watcher | EVENT | any | U | REAL+ARCADE | Flags FOMC and CPI days; profitable closes the day after one: +2 mult |
| 16 | Dividend Radar | EVENT | Income | C | REAL | Warns about ex-dividend assignment risk; covered calls that collect a dividend: +40 chips |
| 17 | Trend Rider | DELTA | any | C | ARCADE | Trades aligned with the 50-day SMA slope: +1 mult |
| 18 | Contrarian | DELTA | any | U | ARCADE | Correct calls against the 5-day trend: call bonus ×2 |
| 19 | Bollinger Bouncer | DELTA | Verticals | C | ARCADE | Short strike outside the Bollinger Band at entry: +30 chips |
| 20 | RSI Radar | DELTA | Verticals | C | ARCADE | Winning bear call opened at RSI > 70, or bull put at RSI < 30: +2 mult |
| 21 | MACD Cross | DELTA | any | C | ARCADE | Entry within 2 days of a MACD cross in your direction: +1 mult |
| 22 | Gamma Scalper | DELTA·VEGA | Volatility | U | ARCADE | Correct "big" bucket calls: call bonus ×2 |
| 23 | Diagonal Drift | DELTA | Calendar | C | ARCADE | Diagonals pointed with the trend: +1 mult |
| 24 | Stop Discipline | DISC | any | C | ARCADE | Closing a loser at or before its stop refunds 30% of its lost chips; declining a stop decision point: +10 stress |
| 25 | Iron Stomach | DISC | any | U | ARCADE | Stress gains −50% |
| 26 | Patience Pays | DISC | any | C | ARCADE | Each skipped round or unused ticket: +1 mult on your next winner (max +3) |
| 27 | Roll Artist | DISC·THETA | any | U | ARCADE | Each roll for a net credit: +1 mult for the rest of the round |
| 28 | Right-Sized | DISC | any | C | ARCADE | Trades risking ≤3% of equity: +25 chips |
| 29 | Breakout Insurance | DISC·DELTA | Verticals | U | ARCADE | The first gap through a short strike each round counts half on the meter |
| 30 | Level II Feed | EXEC | any | C | REAL | Limit orders fill 15% closer to mid |
| 31 | Smart Router | EXEC | any | U | REAL | Market orders pay 75% of the spread instead of all of it |
| 32 | Legging Pro | EXEC | any | U | REAL | Rolls and adjustments pay no extra slippage |
| 33 | Portfolio Margin | EXEC | any | R | REAL | Risk cap +25% |
| 34 | Edge Hunter | EXEC | Verticals | U | ARCADE | Edge Rank top 10% pays ×2 instead of ×1.5 |
| 35 | Compound Interest | ECON | any | C | ARCADE | Interest cap +$5 |
| 36 | Bonus Pool | ECON | any | U | ARCADE | +$1 per 100 points over the round target |
| 37 | Expense Account | ECON | any | C | ARCADE | Rerolls cost $1 less |
| 38 | Golden Parachute | ECON | any | L | ARCADE | Once per run, survive a failed round or a Max-Loss breach; then it's destroyed |
| 39 | 2× Leverage | CHAOS | any | R | ARCADE | All meter chips ×2 (gains and losses); Max-Loss Line tightens by 2% |
| 40 | Bag Holder | CHAOS | any | U | ARCADE | +3 mult on winners, but losers can't be closed before expiration |
| 41 | Meme Energy | CHAOS | any | R | ARCADE | Names with IV above 60%: winners ×2; +10 stress per trade |
| 42 | Rival's Bet | CHAOS | any | U | ARCADE | Outscore Bradley's ghost this round: +$10; lose: −$5 |
| 43 | The Wheel | THETA | Income | U | ARCADE | After a cash-secured put is assigned, your next covered call scores ×2 |
| 44 | Covered & Chill | THETA | Income | C | ARCADE | Covered calls that expire OTM: +2 mult |
| 45 | Assignment Artist | EVENT | Income | U | ARCADE | Assignments give +50 chips instead of stress |
| 46 | Delta Neutral | DELTA·VEGA | Condor | U | ARCADE | Portfolio \|Δ\| under 5 at each close: +1 mult for the round |
| 47 | Wing Clipper | THETA | Condor | C | ARCADE | Condors with both short strikes outside the expected move: +40 chips |
| 48 | Pin Master | THETA | Condor | L | ARCADE | Iron fly expiring within 1% of its center strike: ×4 |
| 49 | Straddle Stack | VEGA | Volatility | R | ARCADE | Each straddle opened this round adds +1 mult to the next |
| 50 | Double Time | THETA·VEGA | Calendar | U | ARCADE | Double calendars: +2 mult |

Implement effects through an ordered hook pipeline (`onEntry`, `onDayClose`, `onDecisionPoint`, `onClose`, `onTally`, `onRoundEnd`, `onShop`). Each cartridge declares its triggers, and each gets its own unit test.

### 8.3 Analysts (information you earn)

Analysts are hired in the shop for $5–$8 and keep working all run. There are 2 seats (+1 with the Terminal Pro voucher). Each has a level-2 upgrade that adds detail. They are real tools, so hiring one teaches it.

| Analyst | Reveals |
|---|---|
| The Quant | IV rank and IV percentile on lineup cards, plus an IVR history sparkline (the Verticals desk starts with this analyst) |
| The Vol Surfer | 20-day HV vs IV (the volatility risk premium) and IV term structure |
| The Earnings Whisperer | Earnings date, implied move from the ATM straddle, last 8 reactions vs their implied moves |
| The Chartist | Extra studies: SMA 20/50/200, EMA 9/21, ATR(14), Keltner Channels, auto support/resistance, relative volume |
| The Skew Doctor | Put/call skew by delta; highlights the richer side to sell |
| The Macro Desk | SPY and VIX panel; FOMC and CPI calendar |
| The Ghost | Base rates: how this structure (same Δ and DTE) did in this stock's past similar setups, using only data before today |
| The Scout | Sector and size tier on lineup cards (semi-blind), +1 reroll per round |
| The Risk Officer | Portfolio Greeks dashboard, correlated-risk warnings across open positions, bracket suggestions |

### 8.4 Memos (consumables, 2 slots, $3 each)

- **Reroll Memo:** redraw the lineup.
- **Extra Ticket:** +1 trade this round.
- **Time Skip:** enter a card 1–3 trading days later (see more bars first).
- **Roll Voucher:** your next roll fills at mid.
- **Vacation Day:** −30 stress.
- **Lens:** sector and size for all cards this round.
- **Hedge Memo:** your next losing trade counts 50% on the meter.
- **Analyst Loan:** any analyst for one round.
- **Due Diligence:** this card's last 5 earnings reactions.
- **Double Down:** your next trade's meter chips ×2, gains and losses.
- **Compliance Waiver:** no Max-Loss Line for one round, +20 stress.

### 8.5 Playbook Pages (structure level-ups, like Balatro's planet cards)

Each page gives one structure +1 level: +10 base chips and +0.5 mult. Pages for your desk's structures appear more often. $3 each.

### 8.6 Vouchers (one offered per shop, $10, permanent for the run)

- **Second Monitor:** +1 lineup card.
- **Terminal Pro:** +1 analyst seat.
- **Prime Broker:** +1 cartridge slot.
- **DMA:** fills 10% closer to mid.
- **Margin Upgrade:** risk cap +20%.
- **Algo Execution:** brackets auto-apply with your desk defaults.
- **Research Budget:** +1 analyst offer per shop.
- **Clearance:** shop prices −25%.
- **Seed Capital:** +$10 now and interest cap +$1.
- **Friend on the Risk Committee:** Max-Loss Line +1%.

### 8.7 Tags (rewards for skipping a round)

- **Discipline:** −20 stress, +$4.
- **Analyst:** a free analyst in the next shop.
- **Cartridge:** a free Uncommon in the next shop.
- **Playbook:** 2 free Playbook Pages for your desk.
- **Investment:** +$15 after the next Review.
- **Double:** copies the next tag.
- **Reroll:** 2 free rerolls in the next shop.
- **Calm:** next round's Max-Loss Line +2%.

### 8.8 Reviews (bosses)

Each Review deals only real windows that match a regime filter, and adds a rule. COMPLY-3000 announces it.

| Review | Real-data filter | Rule |
|---|---|---|
| Earnings Gauntlet | Every card has earnings inside the window | Outcomes as they happened; call bonus ×1.5 |
| The Fed | Window includes an FOMC day | SPY/VIX panel forced on; one card is SPY or DIA |
| The Chop | ADX(14) < 18 at entry | Debit and directional wins score ×0.5 |
| Trend Train | ADX(14) > 30 at entry | Counter-trend losses count ×1.5 on the meter |
| Vol Spike | VIX > 25 at entry | Max-Loss Line 2% tighter |
| Dead Calm | IVR < 15 | Structure base chips ×0.5 |
| Wide Markets | Real days in the top decile of bid/ask width | Market orders disabled |
| Assignment Week | Ex-dividend date inside the window | Early assignment always on |
| Gap Risk | At least one gap > 2 ATR in the window | No decision points on gap days |
| **Annual Review** (Q4) | Mixed regimes | Target ×1.25. The full victory ending also needs positive alpha vs SPY for the run; otherwise the ending is "You survived, but the board asks why you didn't just buy SPY." |

### 8.9 Clients (contracts)

Clients appear as optional side objectives in about 1 of 3 rounds, and as a Contracts board mode. Each request has constraints (direction, max loss in $, POP ≥ x, DTE ≤ y, structure family, R:R ≥ z). Filling one pays cash and reputation (career XP); failing costs only reputation. Clients are fictional satirical personalities, for example a robotics startup's treasury bot that wants defined-risk income with max loss $300 and POP ≥ 70%.

### 8.10 Characters and dialogue (all fictional)

- **Director Kessler:** Head of Desk. Sets targets, runs Reviews, speaks fluent corporate doublespeak.
- **Ines Ortiz:** mentor, an ex-market-maker who has seen every blowup. Gives rules of thumb, calls out holding past a stop, and hosts the optional tutorial.
- **Bradley Stroud IV:** rival, a trust-fund momentum trader. His ghost runs appear in Daily and Rival rounds.
- **COMPLY-3000:** the AI compliance officer. Announces rules and Review modifiers.

Write at least 150 short lines as data, triggered by situations: run start, Review intro, big win, big loss, declining a stop, skipping, high stress, burnout, victory, defeat, Endless milestones. Tone is dark, dry, grounded satire. Portraits are 64×64 pixel art with 3–4 expressions, authored as pixel maps in code.

### 8.11 Events and headlines

- **Event types**, derived from data:
  - earnings reactions: gap % vs implied move, and IV crush %
  - unscheduled gaps (>2 ATR with no scheduled event)
  - ex-dividend dates
  - FOMC and CPI days (compile static date lists for 2019–present from federalreserve.gov and bls.gov; verify them)
  - VIX spikes
- **Templates.** Write template libraries during the build: ≥8 templates per (event type × magnitude bucket × direction), in the game's voice, with placeholders filled at runtime.
- **Timing.** Outcome headlines appear only on the day the move happens. Scheduled events appear on the calendar ahead of time. That keeps events real and in proportion to their real impact without letting Jacob predict them.
- **Blind vs. open.** Blind mode uses codenames. In open mode, lines about real companies state only facts.
- **Pluggable.** Everything goes through `HeadlineProvider`, so a live Claude writer can replace it later.

## 9. Meta-progression

- **Career ladder.** Career XP comes from every run, including failed ones (Hades-style): Intern → Analyst → Associate → Trader → Senior Trader → Portfolio Manager → Head of Desk → Fund Founder. Each rank unlocks something: a desk discount, new cartridges added to the pool, cosmetics, or a lifestyle tier.
- **Bonus** is the meta currency. It comes from run score, calibration grade, alpha vs SPY, and achievements. It's spent on desk unlocks, cartridge-pool unlocks, lifestyle and cosmetics.
- **Lifestyle ("The Pad").** A pixel-art apartment that upgrades from Studio → Loft → Penthouse → Orbital Suite. There are collections of 12 art pieces, 8 watches and 6 vehicles (hover-bike through orbital yacht), plus desk setups (monitor count, chair, plants, lighting). Each tier grants a small, capped comfort perk (e.g. −5 starting stress, +1 free reroll per run). Collections get pricier as they grow, so money always has somewhere to go. STONKS-9800 players complained that once rich there was nothing left to buy.
- **Cosmetics.** Terminal themes (PC-98 amber, phosphor green, neon indigo), card backs, CRT styles, music styles, desk items. Finishing the optional tutorial unlocks "Ines's Mug" (a desk item) and a card back.
- **Achievements** (~40). Examples:
  - 50 spreads closed at ≥50% of max profit
  - profit from 10 IV crushes
  - take 25 planned stops
  - beat SPY in 5 runs
  - calibration grade A over 100 calls
  - Pin Master triggered
  - complete the wheel
  - win a run on each desk
  - win at Risk Tier 8
- **Risk Tiers** (ascension, cumulative, like Balatro's stakes). Beating a tier unlocks the next.
  - T1: fees on ($0.65/contract)
  - T2: Max-Loss Line 2% tighter
  - T3: risk cap 7.5%
  - T4: early assignment and pin risk always on
  - T5: targets +25%
  - T6: −1 reroll
  - T7: fills one step worse
  - T8: −1 ticket
- **Compliance Rules** (optional, Hades-pact style). Switching on extra realism toggles or harsher modifiers adds Heat; Heat milestones unlock cosmetics.

## 10. Modes (main menu)

Career · Daily · Drills · Live · Contracts · Sandbox · Stats · The Pad · Settings · Credits

- **Career:** roguelite runs plus meta-progression. Endless after a victory.
- **Daily:** a seeded short run (1 quarter), a streak counter, and Bradley's ghost to beat.
- **Drills:**
  - A 60-second blind chart: call a bucket plus confidence, with streaks and calibration.
  - Mini-games: *Guess the IV* (read the chart and chain, estimate IV), *Greeks Speed Round* (predict a position's P/L after a move), *Spot the Setup* (RSI divergence, Bollinger squeeze, trend break), *Expected Move Darts* (drag a range and score on containment).
  - Only Drills adapt to weak spots. Flipped charts are allowed here.
- **Live:**
  - Uses this week's real market (open identity).
  - A **Sync data** button runs the incremental data sync.
  - Make calls and paper spreads on the latest end-of-day chain; positions update after each sync and are scored at expiration.
  - No broker connection, ever.
- **Contracts:** a board of client requests on blind windows; pays Bonus.
- **Sandbox:** open mode, any ticker and date, all tools, no score, realism toggles free. Use it to study famous events.
- **Tutorial** (optional): 3 guided rounds with Ines, with a cosmetic reward.

## 11. Trading interface

Baseline 1920×1080; must work at 1366×768.

### 11.1 Layout

- **Top bar:** round meter vs target, Max-Loss Line gauge, stress, cash, tickets, rerolls, day counter, and the cartridge rail (5 slots with family counters).
- **Left:** lineup cards and analyst seats.
- **Center:** the chart, with the price ladder overlay on its right edge.
- **Bottom tray:** Call cards, structure cards (with levels), expiry chips, width and size controls, order ticket.
- **Right:** payoff diagram, trade stats, Greeks in plain English, Edge Rank meter, Score Preview.
- **Positions dock:** `Ctrl+1`.

### 11.2 Chart

Use Lightweight Charts v5.
- Candles and volume; RSI and MACD in their own panes; Bollinger Bands overlaid.
- Daily and weekly timeframes.
- The full history up to the decision point, with pan and zoom like thinkorswim and TradingView.
- Strike lines, breakevens, brackets and expected-move bands drawn with plugins.
- Drawing tools: trendline and horizontal line.
- Analyst-unlocked studies appear in the study picker (`Ctrl+E`).

### 11.3 Strategy builder

Covered in section 5, step 4. Additional requirements:
- Handles snap to real strikes.
- An illegal build (width 0, max loss over the risk cap, no quote) shows why in plain words.
- `Alt+R` reverses the structure (bull put ↔ bear call).
- The chain ladder (bid, ask, mid, IV, Δ per strike) can be clicked to add or move legs.

### 11.4 Payoff and what-if

- Expiration and T+0 curves, with a hover readout.
- What-if sliders for price, days and IV (`Ctrl+3`).
- An optional P/L heat strip across price × date.

### 11.5 Positions and management

- Each position shows live mark, P/L ($ and % of risk), DTE, Greeks, brackets, and distance to the short strike in ATR and in EM.
- Actions: close, roll (pick a new expiry and strikes and see the net credit or debit), adjust (add or remove a leg), exercise.

### 11.6 Fast-forward

Covered in section 5, step 7. The speed setting ranges from 0.15 to 1.0 seconds per day.

### 11.7 Debrief (after each round)

Each trade gets a receipt card. Expanded, it shows:
- **Reveal:** real ticker, dates, and the real catalyst headline.
- **P/L attribution:** direction (Δ+Γ), time (Θ), volatility (vega), execution and fees, and residual. Compute it daily from Greeks × changes and show the residual honestly.
- **Decision grade vs. outcome.** A process checklist grades A–F:
  - sized within plan
  - IVR suited to the structure
  - short strikes relative to the expected move
  - earnings exposure intentional
  - exit per plan
  - Edge Rank at or above median
  
  Label the outcome separately ("good trade, bad luck").
- **Mistake tags:** held past stop, sold premium at low IVR, short strike inside the expected move, unplanned earnings exposure, oversized, poor Edge Rank, held into the last 7 DTE, ignored pin risk, ignored ex-dividend risk, rolled for a debit, counter-trend.
- **Alternates:** what shares, a long ATM call or put, a debit spread, a 30Δ credit spread and a 16Δ iron condor would have returned over the same dates on the same chain.
- **Call result**, on one line.

### 11.8 Stats (`Stats` menu)

- Win rate, expectancy, average win and loss, profit factor.
- Breakdowns by structure, desk, ticker and market regime.
- Calibration chart.
- Equity curve vs SPY, with alpha.
- Mistake-tag trends over time.
- **Export to CSV.**

All of it comes from the real ledger, not the arcade meter.

## 12. Market simulation rules

- **Clock.** Decisions happen at a day's close using that day's end-of-day quotes. Advancing reveals the next day.
- **Fills:**
  - Natural (bid for sells, ask for buys) always fills.
  - A limit between mid and natural fills with a probability that rises from ~35% at mid to 100% at natural (tunable), resolved with the seeded RNG.
  - Unfilled orders rest and fill at a later close if the quote crosses the limit.
  - A spread's price is the net of its leg quotes.
- **Marks** use leg mids; realized P/L uses fill prices.
- **Brackets and stops** are checked at each close. Gaps can jump past them, in which case the fill is at the next close's natural.
- **Expiration** (toggle "expiration mechanics"):
  - Options ITM by ≥ $0.01 auto-exercise.
  - A spread with both legs ITM settles at max value.
  - If the price finishes between the strikes, the short leg is assigned into shares and a decision point opens. The shares are marked at the next open, which stands in for after-hours movement.
  - If the close is within ±0.5% of a short strike, assignment is a seeded coin flip (pin risk).
- **Early assignment** (toggle):
  - A short call that is ITM with extrinsic value below the upcoming dividend, with the ex-date tomorrow, is assigned at the close.
  - A deep-ITM short put with extrinsic under $0.05 has a 20% daily chance of assignment (seeded).
  - Warnings come through decision points.
- **Fees** (toggle, off by default; on from Risk Tier 1): $0.65 per contract per leg to open or close; nothing on expiration.
- **PDT** (toggle, on): under $25k equity, at most 3 day trades per rolling 5 trading days. Implement it to spec even though daily steps make it rare.
- **Buying power.** Defined-risk collateral (max loss) is always enforced against the risk cap and equity. Covered calls hold 100 shares per contract; cash-secured puts reserve strike × 100 minus the credit.
- **Blind transforms:**
  - A 4-letter codename from the seed.
  - Dates shown as Day 1, Day 2, and so on.
  - Prices rescaled by a split-like factor *f*: the displayed price lands in a plausible range and strike increments stay round. Every $ amount scales by *f*; percentages don't change.
  - Reveal after the round.
- **Modeled pricing** fills days the real data is missing:
  - Black–Scholes–Merton with dividend yield and the Treasury rate.
  - IV comes from interpolating the nearest real chains on a (moneyness, DTE) grid.
  - Mark these rows `source='modeled'` and show a small "MODEL" badge.
- **Synthetic markets** (toggle, used in Endless, tutorial and drills): a GARCH-style price model calibrated on the real tickers, with model-priced chains and realistic skew. Always labeled SIM.

## 13. Data pipeline (Phase 1 detail)

1. **Tools.** Install Dolt if missing (`winget install DoltHub.Dolt`). Check free disk space: if under 40 GB, ask Jacob before downloading.
2. **Clone.** Clone into `%USERPROFILE%\SpreadTradingGameData\dolt\` with shallow clones (`dolt clone --depth 1 <repo>`): `post-no-preference/options` (~9 GB full), `post-no-preference/stocks` (~5 GB), `post-no-preference/earnings` (~2 GB), `post-no-preference/rates`. Run `dolt sql-server` and query through mysql2. Inspect the schemas yourself before writing queries; the options table has bid, ask, IV (`vol`), delta, gamma, theta, vega and rho, with no volume or open interest.
3. **Download VIX.** Get Cboe's daily VIX history CSV (`https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv`; verify the URL).
4. **Choose tickers.** Target about 20, with reasons written to `data/REPORT.md`. Candidates:
   - Mag 7: AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA.
   - Liquid and spread-friendly: AMD, NFLX, AVGO, JPM, BA, UBER, COST, ORCL, CRM, DIS.
   - High IV: PLTR, SMCI, COIN, MU, GME, HOOD.
   - Context and benchmark: SPY, DIA.

   Verify each ticker's presence and date coverage in the data. Score liquidity as the median (ask − bid) ÷ mid for 20–40Δ options at 7–45 DTE over the last year, and IV level as median ATM IV. Keep all 7 Mag 7 names, 6–8 of the most liquid others, and 4–5 of the highest-IV names with acceptable liquidity.
5. **Extract** into `game.db`:
   - `symbols`
   - `bars` (unadjusted OHLCV)
   - `chains`: expirations 1–70 DTE, strikes within ±30% of spot or |Δ| 0.02–0.98
   - `vol` (IV/HV plus IVR and IVP computed from trailing data only)
   - `earnings` (date, before or after the open, estimate, actual, surprise, reaction day, gap %, implied move, IV before and after)
   - `dividends`
   - `splits`
   - `rates`
   - `vix`
   - `macro_events`
   - `fundamentals` (point-in-time by report date)
   
   Index `chains(symbol, date, expiration, strike, cp)`.
6. **Model missing days** as described in section 12.
7. **Build windows** per ticker: an entry date with a real chain, up to 50 trading days forward, and at least 252 trading days of bars behind it. Exclude windows that span a split. Tag regimes: ADX, trend slope, VIX level, IVR, earnings, ex-dividend, FOMC, gaps, spread-width decile. Store weights so the last three years are dealt 75% of the time.
8. **Validate** with tests:
   - bid ≤ ask; no negative prices; IV between 0 and 5; sane Greeks
   - no duplicate keys
   - recent years have a chain every trading day
   - no windows across splits
   - lookahead property tests
9. **Report** (`data/REPORT.md`): tickers and reasons, date ranges, row counts, % modeled, gaps, database size. Target `game.db` under 3 GB.
10. **Sync** (`npm run data:sync`, also triggered from Live mode): run `dolt pull` in each clone, extract new dates for the curated tickers, and recompute derived data.

Indicators are computed at runtime from the visible slice of bars, so they can't see the future.

## 14. Look, sound and feel

Jacob wants a futuristic look with retro style, like Balatro or an 80s PC, and he named "lack of interesting UI" as a reason to quit.

- **Visual identity:**
  - A PC-98 inspired, dithered pixel look with a futuristic edge: deep indigo and black ground, neon cyan, magenta and amber accents, a limited palette.
  - Bundle local fonts: DotGothic16 for display and VT323 for numbers and tables.
  - CRT scanlines and vignette as a CSS overlay, with an intensity setting.
  - An original animated backdrop, such as a synth-grid horizon with slowly drifting candlesticks. Don't copy any game's background.
- **Cards** (lineup, calls, structures, cartridges): pixel frames with rarity colors, tilt on hover, idle wobble, flip on reveal, shine on Legendaries (Motion).
- **Juice:** screen shake on big moves and big hits (setting); particles and celebrations on targets met, Legendaries and victories (PixiJS overlay); number count-ups with rising pitch; "PROFIT" / "STOPPED OUT" stamps.
- **Audio:**
  - Procedural adaptive synthwave in Tone.js: four layers (pad, bass, arp, drums) that build with realized volatility, stress and meter pressure, and shift tempo in Reviews.
  - SFX generated sfxr-style (verify the generator's license) for select, fill, stamp, P/L ticks, mult pop, coin, win jingle, loss thud.
  - Keep the variety up: at least 3 music styles, and never one loop for a whole run.
- **Art:** all original. Pixel maps authored in code (icons 16×16, portraits 64×64, The Pad scenes), or CC0 packs listed in Credits.
- **Readability comes first.** Numbers in tables must be crisp. P/L always carries ▲/▼ and a sign. There's a colorblind-safe palette option.

## 15. Settings

- **Game:** starting capital ($1k–$100k); default short-strike delta; bucket mode (EM-scaled or fixed %); fast-forward speed; which decision points auto-pause; Pure Market (no ARCADE cartridges).
- **Realism toggles:** bid/ask, earnings and IV crush, early assignment, expiration mechanics, PDT, fees, liquidity limits, taxes, approval levels.
- **Blind transforms:** rescale on/off (Career stays blind by default), flip in drills, synthetic markets.
- **Display:** CRT intensity, screen shake, reduced motion, colorblind palette, UI scale.
- **Audio:** master, music, SFX, music style.
- **Hotkeys:** remap, reset to thinkorswim defaults.
- **Data:** data folder path, Sync data, and the data report.

## 16. Architecture

- `src/engine/market`: `Clock`, `MarketView` (time-gated reads plus blind transforms), window dealing.
- `src/engine/pricing`: BSM price and Greeks, IV solver, rates and dividends, modeled-chain builder.
- `src/engine/strategies`: structure definitions (legs, defaults, R:R rule), payoff at expiry and T+0, POP (lognormal from IV), breakevens, Edge Rank.
- `src/engine/orders`: order types, fill model, resting orders, fees, PDT.
- `src/engine/lifecycle`: daily step, brackets, decision points, expiration, assignment, rolls and adjustments.
- `src/engine/scoring`: chips, mult pipeline, call scoring, calibration (Brier), meter vs ledger, attribution, alternates, process grade, mistake tags.
- `src/engine/run`: run and round state machine, targets, the Max-Loss Line, stress, tags, Reviews, Endless.
- `src/engine/shop`: offers, rarity weights, desk affinity, pricing, rerolls, selling.
- `src/engine/content`: effect hook pipeline and registry.
- Every player action is a serializable `Action` appended to the run's action log. The log drives autosave, replays, ghosts, debugging and the simulator.
- The UI subscribes to engine state through Zustand. It contains no rules.

## 17. Testing and balance

- **Unit tests:**
  - BSM golden values; IV-solver round trips
  - payoff tables for every structure; spread pricing from legs
  - attribution summing to actual P/L plus residual
  - expiration, assignment and pin scenarios
  - fill probabilities (statistical, seeded)
  - Edge Rank, call scoring, Brier score
  - stress rules, shop pricing and weights
  - every cartridge, analyst, memo, voucher, tag and Review
- **Invariant tests:** no lookahead (property tests over random windows and dates); powerups never change ledger P/L; runs are deterministic from seed + action log.
- **Content tests:** schema checks; every cartridge has ≥ 2 synergy partners; duo parents exist.
- **E2E tests** (Playwright + Electron, with screenshots):
  - new Career run → place a bull put spread → fast-forward → decision point → tally → shop → next round
  - save, quit and resume mid-run
  - a Drill session
  - the Stats dashboard and CSV export
  - settings toggles
  - Live sync (mocked)
  
  Review the screenshots yourself.
- **Balance simulator** (`npm run sim`). Run headless runs through the real engine with bots:
  - *Disciplined Seller:* 20–30Δ credit verticals outside the expected move when IVR ≥ 30, trend-aligned, closes at 50% or at a 2× stop; buys DISCIPLINE, THETA and EXECUTION cartridges.
  - *Hold-to-Expiry:* same entries, no management.
  - *Random:* random structures, strikes and sizes.
  - *Greedy:* maximum size, ignores stops.

  Targets at Tier 0:

  | Bot | Run win rate |
  |---|---|
  | Disciplined Seller | 55–65% |
  | Hold-to-Expiry | 20–35% |
  | Greedy | < 15% |
  | Random | < 5% |

  Also required:
  - No cartridge's win rate when picked more than 15 points above average. Insider Trading reviewers complained that a few overpowered cards let them coast.
  - Every desk within ±10 points of Verticals.
  - Estimated run time (simulated actions × typical UI seconds) inside 20–40 minutes.
  
  Write `sim/REPORT.md` and tune `balance.ts` until the targets are met.

## 18. Build phases

Work straight through. After each phase, `npm run verify` and `npm run test:e2e` must pass. Then commit and update `PROGRESS.md`.

| Phase | Build | Done when |
|---|---|---|
| **0. Setup** | Confirm this is native Windows (PowerShell or Git Bash, not WSL: native modules and the Windows installer need it). Install Node.js LTS and Git if missing (`winget install OpenJS.NodeJS.LTS`, `winget install Git.Git`). Scaffold Electron + Vite + React + TS (strict), ESLint and Prettier, Vitest, Playwright for Electron, `.gitignore`, `npm run verify`, and `PROGRESS.md`. Remove the default Electron menu. | `npm run dev` opens a retro placeholder title screen; verify passes |
| **1. Data** | Everything in section 13, plus the `MarketView` time gate with tests | `game.db` built, `data/REPORT.md` written, validation and lookahead tests pass |
| **2. Options engine** | Pricing, strategies, orders, lifecycle, scoring math (sections 6, 12, 16) as pure TS | Golden and invariant tests pass; ≥90% line coverage on the engine |
| **3. Trading UI + Sandbox** | Chart, builder, chain, payoff, ticket, positions, fast-forward, decision points, debrief, thinkorswim hotkeys, blind transforms, Sandbox mode | E2E: place a bull put on a real chain, fast-forward to expiry, P/L matches the engine; screenshots reviewed |
| **4. Drills** | 60-second blind calls, calibration, the four mini-games, drill-only adaptation | A 10-question drill completes and its results are stored |
| **5. Stats** | Everything in 11.8, including CSV export | Aggregates tested; CSV opens in Excel. **Run `npm run build:win` → the v1 exe (Jacob's first playable: trading, drills, stats)** |
| **6. Run loop** | Desks (Verticals first), lineup, calls, tickets, targets, Max-Loss Line, stress, skip + tags, tally animation, shop, Reviews, victory and defeat, autosave with no undo, seeds | A full 12-round Verticals run plays start to finish; save and resume works |
| **7. Content** | All desks, 50 cartridges, analysts, memos, Playbook Pages, vouchers, tags, Reviews, clients, characters and 150+ lines, headline libraries, achievements | Content and synergy tests pass; every item is reachable in play |
| **8. Balance** | The simulator and bots; tune to section 17 targets | `sim/REPORT.md` meets every target |
| **9. Meta and modes** | Career ladder, Bonus, desk unlocks, The Pad and lifestyle, cosmetics, Risk Tiers, Compliance Rules, Endless, Daily plus ghost, Contracts, Live mode plus sync, optional tutorial with cosmetic | Every mode reachable from the menu with an E2E smoke test |
| **10. Juice and polish** | Section 14 in full: pixel art, CRT, backdrop, card motion, particles, shake, adaptive music, SFX, settings, accessibility, 60 fps on the chart and fast-forward | Screenshot review against section 14; no frame drops during fast-forward on a mid-range PC |
| **11. Package and hand off** | electron-builder NSIS installer + portable exe, app icon, Credits (DoltHub CC BY-SA, TradingView Lightweight Charts, fonts, any CC0 art, "not financial advice"), `README_PLAY.md`, `PLAYTEST.md` | The installer works on a fresh Windows user profile and the game runs offline |

If you ever must cut scope to finish, keep what serves the pillars first: truthful market, the run loop, tactile building, combos. Cut Contracts, Live mode or lifestyle breadth before cutting any of those, and note every cut in `PROGRESS.md`.

## 19. Handoff

- **`README_PLAY.md`** in plain language: how to install, the first-run data build (how long it takes, how much disk it uses), how to sync data for Live mode, where saves live, and how to report a bug to Claude Code (what to copy from the game's log folder).
- **`PLAYTEST.md`:** 15–20 things for Jacob to try and rate. Examples: the first run on the Verticals desk, a Review, declining a stop, the shop, a debrief, a drill, Stats and CSV, a second desk, Endless, Live sync.
- **A final message to Jacob** in plain language: what's done, anything cut and why, how to start playing, and what to try first.

---

## Appendix A: Jacob's answers (condensed)

| # | Topic | Answer and notes |
|---|---|---|
| A1 | Experience | Advanced: multi-leg, Greeks, rolling, adjusting |
| A2 | "Spread" means | Options spreads, **mostly verticals**; other structures come later as advanced content |
| A3 | Priorities | Calling direction, Greeks intuition, events (all skills eventually) |
| A4 | Holding periods | Weeklies (1–10 d) and 30–45 DTE |
| A5 | Sessions | 20–40 min, can end early. **Fun first, something he wants to play. Roguelite dopamine, healthy scaling, enough variety to stay interesting** |
| A6 | Mistakes | Holds losers too long. **Sells credit spreads as his main approach** |
| A7 | Broker | Schwab / thinkorswim |
| A8 | Account | Small ($2k–$5k); starting capital as a setting, scaled by percentages |
| B1–B3 | Spine | Hybrid; layered like Balatro with a **shop between goals**, plus Endless with random generation; turn-based decisions with an animated fast-forward |
| B4–B6 | Setting and tone | Modern; dark satire with a futuristic tone and retro look, less detached than Space Warlord; boss, mentor, rival |
| B7 | Tickers per round | 3–5; Mag 7 plus high-options-volume, high-IV, spread-friendly names |
| B8 | Skipping | Rewarded |
| C1 | Blind | Blind for scored play, open for study; likes prices and names changed; real events in proportion to their impact, not predictable, fitting the tone |
| C2 | Periods | Recent (mostly the last 2–3 years) plus random |
| C3–C5 | Universe and data | Mega-caps and high-IV names; real chains, modeled where missing; daily bars |
| C6–C8 | Realism | Bid/ask, earnings/IV crush, early assignment, expiration, PDT; individual toggles; realistic fills |
| C9–C10 | News and transforms | AI-written headlines from real events; rescale, flip and synthetic markets as settings |
| D1 | Strategies | Verticals, income, condors, straddles, calendars: **one strategy focus per run with its own creative powerups, mixing real and forced advantages** |
| D2–D5 | Mechanics | Strategies bought with in-game money; builder like TradingView's but more interactive and game-like; close, roll, adjust, brackets, exercise; the normal spread-trading info (payoff, Greeks, plain English, POP, IVR, what-if) |
| E1–E4 | Scoring | Explicit calls, **fast and fun to input like Balatro**; 5 size buckets; P/L, calibration, benchmark; **bonus for high R:R, more if high relative to the rest of the chain**; Hades/Balatro luck–skill balance |
| F1–F3 | Info | Chart, RSI/MACD/Bollinger (suggest others and why; see Appendix B), earnings, chain, fundamentals; info earned; history open and adjustable like trading platforms |
| G1–G8 | Progression | Ladder, achievements, cosmetics, lifestyle; quotas plus stress; return target plus max-loss rule; percentage scaling plus ascension; roguelike run over; modes: career, drills, live, clients, sandbox, daily; realistic main game with an arcade layer; learning mini-games |
| H1–H6 | Feedback | Reveal, attribution, grade, tags, alternates; Claude in-game later; no journal (keep the loop seamless); optional tutorial with a cosmetic unlock; Balatro-style learning in Career, adaptation only in drills; basic stats, breakdowns, CSV |
| I1–I4 | Feel | PC-98 / futuristic-retro, Balatro or 80s-PC; sounds, celebrations, shake; synthwave; mouse plus **thinkorswim-style hotkeys** |
| J1–J6 | Platform | Desktop on his PC with local storage (Unity was fine if it fit best); he doesn't code; local data bundle; $0 budget; autosave with no undo; single player |
| K1–K6 | Scope | First playable: trading verticals on real chains + drills + stats; build the whole plan, then he tests; CLAUDE.md + master prompt; 1–2 weeks. **Would quit over a repetitive loop, dull combos, or boring UI.** Inspiration: Balatro, Hades and other luck-plus-skill roguelites; be creative with combos |

## Appendix B: Indicators and why (answering F1)

Always visible (Jacob's picks): **RSI** (stretched moves and which side to sell), **MACD** (momentum turns), **Bollinger Bands** (volatility envelope; natural short-strike anchors).

Earned through analysts:

| Indicator | Why it matters for spread trading |
|---|---|
| IV rank and IV percentile | Sell premium when IV is rich relative to its own year; favor debit spreads when it's cheap |
| 20-day HV vs IV | The volatility risk premium, the core edge of credit selling. When IV is below realized volatility, premium is cheap |
| Expected move (ATM straddle) | The market's ±1σ range to expiration; keep short strikes outside it |
| SMA 20/50/200 | Trend direction and where buyers tend to show up, which tells you which side to sell |
| ATR(14) | Typical daily range; place strikes at least ~1–1.5 ATR × √days away and size stops |
| Keltner Channels (with Bollinger) | The "squeeze": volatility contraction before expansion, so avoid selling into a breakout |
| Support and resistance | Natural anchors for short strikes |
| Relative volume | Separates real breakouts from fakeouts |
| Put/call skew | Shows which side's premium is richer |
| IV term structure | Essential for calendars and diagonals; backwardation flags an event |
