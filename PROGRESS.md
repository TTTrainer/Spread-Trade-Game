# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** All phases (0–11) are done, plus playtest rounds 1–4, a Mac version, the read-only Schwab connection, 1.4.2 through 1.6.1, and **1.7.0**: your boss checklist and playtest notes, and the **Trade Builder** (Live mode repurposed for building real trades on today's market, with 25 more tickers). Version 1.7.0. Next: your playtest of 1.7.0 (items 65–73 in `PLAYTEST.md`) while the Trade Builder's second version (an options tutorial and another 25 tickers) is built.

## How to run (on your PC)

- **Play:** download from the [1.7.0 release](https://github.com/TTTrainer/Spread-Trade-Game/releases/tag/v1.7.0) and see `README_PLAY.md`. Install with `SpreadTradingGame-Setup-1.7.0.exe`, or run `SpreadTradingGame-Portable-1.7.0.exe` directly. Macs: the `mac-arm64` (Apple chip) or `mac-x64` (Intel) zip.
- **Publish a new version:** bump the version in `package.json` and edit `RELEASE_NOTES.md`; the push builds Windows and Mac on GitHub's machines and publishes the release (`.github/workflows/release.yml`).
- **Play on a Mac:** see "On a Mac" in `README_PLAY.md` (Apple chip or Intel; `join-mac.sh` puts the game in Applications).
- **Rebuild the installer:** `npm run build:win` writes both files to `release/`. `npm run build:mac` builds the two Mac versions.
- **From source:** install Node.js LTS once (`winget install OpenJS.NodeJS.LTS`), then in this folder `npm install` and `npm run dev`.

## Done

### 1.7.0: your boss checklist, your playtest notes, and the Trade Builder
**The Trade Builder (your note 6: Live mode repurposed).** On the title screen, TRADE BUILDER replaces Live.
- **Today's data first.** When Schwab is connected (Settings → Data), opening a ticker asks Schwab right then for two years of daily prices and today's option chain (read-only market data; nothing touches your account). During market hours today joins the chart at the current price. The badge at the top says **● LIVE**, **✔ CURRENT** (through the latest close) or **⚠ OUT OF DATE: data ends 2026-09-25, 6 trading days old**, with where the data came from. Without Schwab it uses the newest saved data: what PULL FROM SCHWAB saved, or the game's own data. When no real chain exists for that day, the chain is modeled from the stock's own volatility and labeled MODEL CHAIN.
- **25 more tickers**, the next most heavily traded option markets: QQQ, IWM, TLT, GLD, SLV, XLF, SMH, XLE, UNH, MSTR, SOFI, INTC, BABA, F, BAC, MARA, RIVN, PYPL, WMT, XOM, C, SNAP, NIO, ARM, SHOP. PULL FROM SCHWAB now fetches two years of daily prices for each, plus each close's option chain, alongside the game's 25. Type a ticker in OPEN A TICKER (left) or press ALL for the full list.
- **Studies you can toggle** in one click from the tray: Bollinger Bands, the expected move (1σ) and a new **2σ** line, SMA 50 and 200, EMA 21, Keltner Channels, support and resistance, RSI, MACD, ATR and volume.
- **Every strategy, buildable and readable.** All 14 structures (verticals, iron condor, iron fly, broken-wing condor, straddle, strangle, covered call, cash-secured put, calendar, diagonal, double calendar). Shape them with the same sliders as the game, or leg by leg in **LEGS** on the TRADE tab (buy or sell, call or put, strike, expiration). Size is a plain contract count.
- **The payoff, full size** (⟋ PAYOFF above the chart): P/L at expiration (filled green and red), today, and on any day before expiration (the DATE slider), with an IV slider for "what if volatility drops". Breakevens, max profit and max loss, the strikes, today's price, the ±1σ and ±2σ expected move and a shaded curve of where the price is likely to end are all labeled on the chart. Hovering reads out any price: P/L at expiration and on the chosen day, and the odds the price ends below or above it. The side panel says the trade in plain words ("You SELL the iron condor for $209 up front, betting MKTX stays in a range…"), lists the legs and shows the Greeks.
- **COPY ORDER** (Alt+C) copies the order as text in thinkorswim's style (`SELL -1 VERTICAL SPY 100 17 OCT 25 450/445 PUT @1.20 LMT`), for you to check and enter yourself. Nothing is ever sent to a broker.
- The old Live month is still there: TRADE BUILDER → **PAPER MONTH**.

**Your boss checklist:**
- **The Collector** is redesigned: at each day's close, every trade that is losing **and** has the price at or past a strike you sold pays 5% of its risk in points, every day it stays there, on its own **INTEREST NOTICE** screen (the trade, its strike and price, its loss, how many days it's been charged, PAY). His banner shows what he's taken and which trades will be charged at the close. Style bonus: never pay him a day's interest.
- **The Margin Clerk:** the width slider now stops at the widest spread your cap allows, so even one contract never risks over the cap ("max 3 at your 5% risk cap").
- **The Underwriter's trophy** moves the max-loss line 5% (was 1%). **The Shell Company's trophy** takes $2 off rerolls. Other trophies got stronger too, the boss bounty is $8, and the first spoil is a rare cartridge when one fits (your "slightly underwhelming").
- **The Tax Man** taxes wins closed within their first week (5 trading days); his style bonus asks for wins held 6 days.
- **The Rebalancer's and the Early Retiree's race charts** are bigger.
- Simulator, after the changes: a typical boss is beaten 87% of the time, the Rebalancer 67%.

**The month menu:** each Month has its own pixel emblem and name (Month 1 rings the **Opening bell**, Month 2 is **The climb** of three rising candles); the three rounds flip in like dealt cards, targets count up, and the round you're about to play glows with a light sweep. **The exit plan** now has a feedback loop: under YOUR BUILD, a sample spread shows what the plan banks and cuts as you move the sliders, and THIS RUN counts your targets banked, stops taken (with what each saved against the max loss), expiries and closes by hand. Every payout is stamped with how the trade closed (✔ YOUR PLAN · TARGET BANKED, ✔ YOUR PLAN · STOP TAKEN · saved $X, ✋ CLOSED BY HAND · off the plan, ⌛ HELD TO EXPIRATION), and plan exits get their own stamp sound.

**Your playtest notes:**
1. **Rerolls you couldn't see:** REROLL and SIT OUT are now pinned above the round goal before the clock starts, so they're in view where Ines points, even at 1366×768.
2. **The tutorial:** after the credit-spread lesson, Ines explains what a strike is, then marks a **floor** (or ceiling) the stock keeps turning at on the real chart, with a ring on each turn, and shows her **practice trade** past it at about 80% POP before you build your own. Lessons now spell out the position ("You're SELLING the 95 put: the pink line"), and a live POP bar in her bubble shows where your trade sits against 80%.
3. **The stock's name** sits in the chart's top-left corner, with its price and today's move.
4. **The stuck loop** after cashing out with market orders off is fixed (exits go as a limit at the natural price).
5. **Controls follow the rules:** the size slider's contract counts stop at the contract limit and say so, approval levels hide spreads you can't open, and a rule that removes a button removes it (the Attendance Policy hides SIT OUT).
- Tests: the Trade Builder end to end (open, freshness, studies, a condor edited leg by leg, the payoff, copy order, a second ticker, a ticker with no data), its data loader (Schwab live, saved, game data, nothing), the in-memory market behind it, freshness, the order text and descriptions, the Collector and his notice, the exit scorecard, the practice trade's floor finder, the tutorial, and the controls under each rule.

### 1.6.1: your 1.6.0 notes
- **The payout (your Balatro note).** Closing a trade now plays its score out before the clock moves on: the P/L lands as chips, then every bonus fires in the order the game applied it, with the blue CHIPS and red MULT boxes ticking (and an amber SCORE box for score multipliers). Your cartridges sit in a row on the panel: each one that fires jumps and pops what it added ("+3 mult", "×2 score") with its trigger in plain words, the same cartridge jiggles on the top bar, and the ones that did nothing stay dim. Each step plays a note a semitone higher and speeds up; the total slams in, flies into the score (which only then counts it), and a trade that clears the round catches fire. The clock, coworker lines and the next decision wait for it; click, Space or Enter skips; Settings → "Payout when a trade closes": FULL, FAST or OFF. The research and the design are in `SCORING_FEEL.md`.
- **Closing at a profit.** Whatever closes the trade (CASH OUT, a filled target, expiry, the end of the window), the moment is the payout, with its own headline (EXPIRY PAYDAY for a win that expired, STOP TAKEN · PLAN KEPT for a planned stop). The month menu's pause switches ("stop the clock when a target hits") now take effect in the run you're playing, not only the next one, which is likely why your targets were filling on their own.
- **Boss rewards on two screens.** First the trophy: a gold card flips in to a fanfare and fireworks, says PERMANENT, and counts in exactly what it changed (for example "Max-Loss Line 13% → 14%"). Then, on its own screen, the 1-of-3 free cartridges. On YOUR DESK the trophy is a pixel cup in the boss's color.
- **Covered calls on pricey stocks.** A covered call now always carries an **automatic stop**: it buys the call back, without asking, once the loss reaches 1×, 1.5×, 2× or 3× the premium (pick it on the ticket, next to AUTO STOP). The risk cap measures the trade at that stop plus 25% for a gap, so a tighter stop fits a $700 stock. Before, the game sized every covered call as if the stock jumped 25%, which on META was about $17,500 a contract. The stop can be tightened later but never loosened or removed, and the trade shows RISK AT AUTO STOP.
- **The shop's overlapping icons.** At 1536×864 (a 1920 screen at Windows' 125% scaling) the shop switched to its five-across layout and its windows ran past the right edge and over each other; at 1366 the desk's vouchers and trophies sat under the bottom bar; and a style-name clash had blown up the LAST ROUND rows into big boxes. The shop now uses one layout at every size, with cards that shrink to fit, and a test checks at 1366, 1536 and 1920 that nothing overlaps, runs off the screen or hides under the bar.
- **Harder runs (your "too easy" note).** The simulator showed why it felt easy: in rounds they passed, its players scored 3 to 8 times the target, and they only lost runs to bad streaks, never to a target out of reach, while half of every overshoot carried into the next round as a head start. Now Months ask more (200 and 220 to start, growing 34% a quarter instead of 30%), only 35% of a surplus carries over and never more than a quarter of the next target, and Reviews and the bosses stay about where you agreed (about 9 in 10, the Rebalancer about 7 in 10). And **every Risk Tier now adds +10% to targets** (Tier 5 still adds its own +25% too), so once a tier feels easy you can climb into the pressure you want (Career → CHALLENGE & OPTIONS). Simulator, 200 runs per bot: the careful bot wins 33.5% of runs (42% in 1.6.0) and the active one 35%; a typical boss is beaten 85% of the time and the Rebalancer 63%; every desk is within 10 points of Verticals (Calendar's targets went up a little to stay there). **Bag Holder** now gives +1 mult on winners (it was +3): with tighter targets, a mult on every winner made it the strongest card in the simulator (+23 points of run win rate; the cap is 15), and it now measures +13.
- Tests: the payout (cartridges firing, the score waiting, skipping), the trophy and spoils screens and the shop at three sizes, the covered-call stop (risk, the ticket, a stop that fires without asking and only tightens), the pause switches mid-run, and the end-to-end runs updated for payouts.

### 1.6.0: your 1.5 notes, and boss rounds
**Part 1, your notes:**

- **Points follow the money.** Losing trades now count in full, a trade's bonus chips grow with its return on what it risked (income trades have their own bar, so a covered call isn't judged like a debit spread), a round that made money gets a bonus on top and a red one a penalty, and part of a strong round's surplus carries into the next. Targets grow 30% a quarter so a good build keeps being tested. Every desk is within 10 points of Verticals in the simulator.
- **Taking profit feels like something.** When a profit target is hit, the clock stops and a TAKE PROFIT dialog shows the money you'd bank, where it sits between max loss and max profit, and TAKE PROFIT or LET IT RIDE. Closing a winner bursts PROFIT TAKEN into the score; taking a planned stop stamps PLAN KEPT (the habit you said you want to build).
- **P/L next to its max** everywhere a trade shows: a bar from max loss to max profit with the stop and target ticks, on the trade card, the positions table and the dialog.
- **The miniplayer:** small live charts of your open trades on cards that aren't on screen.
- **Cleaner screens:** the run's top bar regrouped with the score as the biggest number; notices top right, cleared between phases; the tally counts up in steps; the shop shows every shelf in one row on big screens and YOUR DESK shows your cartridges as cards in firing order with sell and reorder; Ines speaks over the chart's oldest candles.
- **Controls by color:** each slider wears the color of the line it moves on the chart; the first time you use a structure, its controls are explained (debit spreads say Long Δ).
- **Market orders by default**, with "use a limit price" explained beside them.
- **Tutorial:** pick the strategy before the direction, a drag lesson with an animated hand, and a "safe vs spicy" lesson.
- **Live is marked WORK IN PROGRESS** on the title screen (see Next for what it still needs), and every BACK button goes where you came from (a test walks every menu path).

**Part 2, boss rounds** (your questionnaire answers are in `BOSS_QUESTIONNAIRE.md`):

- **Twelve bosses, one per pillar of financial planning.** Each brings a market (with its logo) and exactly one twist that shows on the chart, and nothing about prices, fills or events changes:
  - **The Controller** seals running P/L and equity until a trade closes (brackets still fire).
  - **The Margin Clerk** halves your risk per trade.
  - **The Underwriter** makes losing trades count double.
  - **The Landlord** takes 35% of your total mult.
  - **The Early Retiree** duels you: **Chad** trades the same cards in his own book (lottery-ticket call spreads, no stops), live beside yours. Finish ahead of his P/L and the round scores x1.5; behind him, x0.75.
  - **The Tax Man** taxes wins closed in their first 2 trading days 25%.
  - **The Bursar** holds your leftmost cartridge as tuition.
  - **The Allocator** adds a second goal: 3 different structure types (with a 4th ticket to do it), with a progress chip.
  - **The Shell Company** seals chart studies and IV rank.
  - **The Executor** seals days to expiration ("? days") until the trade is open; max profit and loss still show.
  - **The Collector** compounds losing streaks: each loss in a row costs 25% more.
  - **The Rebalancer** (every year end) asks x1.25 and draws a YOU vs SPY race on the chart; finish ahead for the full victory, behind and you survive.
- **The look:** the whole board takes the boss's colors with a pulsing vignette, a case file introduces it (pillar, person, line, twist, what it blocks, its market, target and style bonus), the twist sits on the chart in one line with its live number, and sealed panels wear a lock stamp.
- **A failed boss ends the run** (one switch in `balance.ts` turns that off).
- **The month menu** before each Month: the quarter's three rounds with targets and payouts, the boss card with a once-per-boss reroll ($10, $25, $40, then $60), your build in firing order, and the exit plan for the whole run (take profit, stop, debit target and stop, and the pause switches). The shop shows next quarter's boss a quarter ahead, also rerollable. The tutorial skips the menu.
- **Rewards:** a $5 bounty, a **trophy** (a permanent buff themed on the boss, shown on YOUR DESK; cash if you already hold it), the boss's **spoils** (take 1 of 3 free cartridges in the next shop), and a **style bonus** (+$3) for clearing a boss a certain way, shown under the banner as ON TRACK / MET / MISSED.
- **Endless years are showdowns:** each year after the first, every boss's twist is a notch harsher (double losses become x2.5, the Margin Clerk leaves 40%...), labeled SHOWDOWN I, II...
- **Flat charts for neutral desks:** every Condor, Iron Fly and Calendar lineup includes at least one range-bound chart (judged only from past prices), and no boss limits trade direction.
- **Developer test checklist:** Settings → Game → Developer mode, then the DEV button → **TEST CHECKLIST**. Every boss, the menu, rewards and run rules are listed with what to look for, a **SET UP** button that takes you straight there, **WORKS / PROBLEM** ticks and a note. It's saved on your computer; COPY ALL or SAVE AS FILE gives me the list.
- **Art:** the bosses use their market logos for now; `BOSS_ART_BRIEF.md` lists the 12 portraits and 12 pillar icons to make (with a prompt), and they'll replace the logos when they arrive.
- **Balance** (simulator, 200 runs per bot): a careful player wins 42% of runs (Active Trader 38.5%, holding everything to expiry 18.5%, greedy 1%, random 0.5%); a typical boss is beaten 86.6% of the time and the Rebalancer 69.7%, close to the 9 in 10 and 7 in 10 you agreed (per boss: Bursar 94%, Tax Man 89%, Controller 88%, Underwriter 88%, Executor 88%, Collector 86%, Margin Clerk 85%, Allocator 85%, Chad 84%, Landlord 83%, Shell Company 83%). Every desk is within 10 points of Verticals (Income −5, Condor +3, Volatility +4, Calendar +8) and no cartridge adds more than 10 points. To get there: Condor and Calendar targets went up (the flat chart they're always dealt made them easier), The Wheel moved to the EVENT family (its THETA badge lit the family on the Income desk by itself), Long Gamma is x1.5 and Straddle Stack tops out at +2 (1.6's return-on-risk chips already reward big straddle wins). The bots don't read the screen, so the bosses that only hide information (Controller, Executor, Shell Company) were set a little easier by hand. One check misses: a completed run takes about **41 minutes** at an experienced pace, a minute over your 40 (see Known issues).
- Tests: every boss's twist in the score and the round, the boss draw (no repeats, Rebalancer last), rerolls and their prices, the exit plan, rewards and spoils, showdown tiers, style rules, the Allocator's goal, the Rebalancer's race, Chad's duel (including a save resumed mid-duel), and end-to-end tests that play a whole year of bosses, each sealing boss, the duel, the rewards and the checklist, with screenshots at 1920 and 1366.

### 1.5.0: your 1.4.2 notes, a tutorial for new traders, and The Pad's art
Your notes, item by item:

- **A trade on the chart vs a trade you're only planning.** An open trade now draws bold, solid lines labeled **● YOUR S P / YOUR L P**, a solid-bordered box from the day you opened it to its expiration with an **▶ OPENED · SOLD +1.05** tag, and an **OPEN TRADE** badge at the top left with its live P/L. A trade you're shaping draws thin dashed **PLAN** lines in paler colors, a hatched box, and a dashed **PLANNING … not placed yet** badge. On a card that already has a trade, the drag handles for a new one are gone (one trade per card).
- **Which charts have positions.** Each lineup card with an open trade has a magenta **● IN TRADE** banner across the top with its live profit or loss; a finished one shows **✓ CLOSED** with the result. You can see where your money is without clicking through.
- **Shop windows in plain words.** The `.SYS`/`.EXE` names are gone. Each window has a plain name and a short line saying what it's for: CARTRIDGES · powerups: boost how your trades score, LAST ROUND · what you earned, YOUR BUILD · family bonuses, ANALYSTS · hire extra information, MEMOS · one-use tricks, PLAYBOOK · level up a trade type, VOUCHERS · permanent upgrades, YOUR DESK · what you own, fires left to right. The window frames keep the retro look.
- **Messages you notice.** Pop-up messages moved from the corner to the lower middle of the screen, about twice the size, with an icon, a springy entrance, and they stay up longer for longer messages (4.5 to 9 seconds). At most three show at once, and clicks pass through them.
- **Covered calls, the right way round.** A covered call is a bearish-to-neutral trade (it wins if the stock stays below the strike), so it's now tagged bearish, and its **chance of profit rises** as the strike moves further from the price, like a real call you sell. It was being treated as a share purchase plus a call, which is where both problems came from.
- **Cash-secured puts checked against real life:** bullish, chance of profit rises as the strike moves lower, the cash to buy 100 shares per contract set aside, assigned shares bought at the strike.
- **500 shares assumed, kept off the books.** As you asked: every stock is treated as if you own 500 shares. A covered call is now just the call you sell against them (at most 5 contracts, 100 shares each). Profit, loss and equity count **only the option**, never the shares or their price changes. If the call finishes in the money, the shares are "called away" and the trade settles at the option's value at expiration; the shares themselves never touch your P/L. Its risk is shown as **RISK IF IT JUMPS**: what the call would cost if the stock jumped 25% (or three expected moves, whichever is bigger), since that's the real danger of selling a call. The SELL button says "covers 300 of your 500 sh". Puts work the same way: an assigned put settles at its value at expiration.
- **The freeze after Ines's message.** I couldn't make it happen here, on purpose or by replaying your steps (skipping a day, sitting out, Ines and COMPLY-3000 lines on the Mac build). I fixed everything that could plausibly cause it and added a safety net:
  - **A real crash, fixed:** after a reroll or a new round, the screen could ask for a card that no longer existed, and that error took the whole screen down. It now can't.
  - **A drawing error, fixed:** the payoff chart could be handed an impossible number and spam errors.
  - **Less work per frame:** the strike handles stopped recalculating sixty times a second when nothing was being dragged.
  - **Automatic recovery:** the screen now checks in with the game every second. If it stops answering for 12 seconds, the game reloads the screen by itself and says "The screen stopped responding and was restarted. Your run was autosaved." Your run is never lost (it saves after every action).
  - **Better clues:** `game.log` now records the last 40 things the screen did before any freeze or error, so if it happens again, that file shows exactly where.
- **The tutorial, rebuilt for someone who has never traded an option.** The plan is in `TUTORIAL_PLAN.md`. The desk starts almost empty and Ines switches it on one piece at a time, with a spotlight (everything else dimmed) on the one thing she's talking about and two short sentences per lesson. The order is what you asked for: **the goal first** (the points bar, the safety line), then **one trade, step by step** (pick a stock, read the chart, up or down?, your line, paid up front, safer or richer, SELL), then **time** (play a day, the recap, your exit plan), **the score** (the tally), and **the bonuses and powerups** (shop cash, cartridges, your desk, families; then analysts, memos, the playbook and vouchers in the second shop), then the remaining tools in Month 2 (tickets, expiration, size and width, the brief, the payoff picture, reroll and sit-out) and finally the whole desk in the Review. Lessons that only explain wait for GOT IT (or Enter); the rest wait for you to do the thing. Things that happen at unpredictable times (a decision point, a closed trade, stress rising, nothing left open) get a one-time lesson the first time they happen. The clock is locked until your first trade is in, the planned trade stays off the chart until Ines has explained the chart, Director Kessler's pop-ups are muted so only one voice talks, and missing a round in the tutorial no longer writes you up. **SKIP LESSONS** in every bubble turns the whole desk on. Leave mid-tutorial and **CONTINUE** on the Career screen picks up at the same lesson.
- **The Pad, drawn from your art sheet** (sheet 4): 4 furnished homes (Studio, Loft, Penthouse, and the Orbital Suite is now the **Sky Villa** to match its picture), 5 desks (a new DESK upgrade track), a laptop and 3 monitor setups, 5 chairs, 6 plants (the vine hangs from the ceiling), 5 desk lamps with a soft glow, 8 paintings, 9 watches in a wall case, 4 vehicles on turntables, and 15 desk items (11 of them new; the desk now holds six). Each picture is placed and sized into its own spot in each room. The shop lists show each piece's picture. Seven pieces with no picture on the sheet (four paintings and the three flying vehicles) are no longer sold; if you own one, it stays in your list.
- Tests: the covered call's single call leg, its credit, bearish tag, rising chance of profit and 5-contract cap; settling assignments at the option's value; the tutorial's script (short lessons, in order, every part of the desk introduced by the end) and its rules (what's hidden when, what moves a lesson on, one-time lessons, skipping); practice runs never writing anyone up; the Pad's desk track, six desk items, retired pieces and old saves; an end-to-end run of the tutorial from the empty desk through the first trade, the tally, the shop and Month 2, and resuming it; and the screen's automatic recovery after a 40-second freeze.
- Balance: all ten simulator checks pass. A careful player wins 57.5% of runs, holding to expiration 32%, greedy 1.5%, random 1%; a full run takes about 37 minutes; every desk is within 5 points of Verticals (Income +4.2, Condor 0, Volatility +4.2, Calendar −4.2); the strongest cartridge adds 8.8 points. The first run after the covered-call change flagged Covered & Chill at +15.7 points (limit 15). Halving its bonus changed nothing, which showed the real cause: as a cheap THETA card it pushed Income runs (where every trade collects premium up front) into the THETA family bonus. It's now an EVENT card (it pays off when an option expires) with its +2 mult unchanged.

### 1.4.2: your 1.4.1 notes, and market data from Schwab
Your notes, item by item:

- **Market data from Schwab, kept in its own file.** Settings → Data → Schwab now has two more steps after the login. **4 · PULL FROM SCHWAB** saves daily prices for every ticker (since 2018 on the first pull, then just the new days), the VIX and the T-bill rate, and, when you pull after the 4 pm close, that day's real option chains, all into **`schwab.db`**, a separate file next to the game's database. A line under the button shows what it holds. **5 · BUILD GAME DATA FROM SCHWAB** turns it into the game's market in a minute or two, with no 16 GB download: real prices, real option chains on each close you pulled after, and modeled chains (labeled MODEL) on the other days, worked out from each stock's own recent movement. If you already built the DoltHub data, step 5 instead adds the days DoltHub hasn't published yet. After that, SYNC LATEST DAYS and Live's CHECK FOR NEW DAYS do both steps for you. Pull once a day after the close and `schwab.db` collects a real chain for every day. `README_PLAY.md` has the steps.
- **Covered calls and cash-secured puts behave like the real thing.** An option that expires out of the money now always expires worthless: no shares assigned, the premium kept. In the money by even a cent means assignment (that's how the options clearing house handles expiration). The old "pin risk" coin flip near the strike is gone. A covered call's SELL button now shows the premium you collect ("+1.85, buys 100 sh @ 42.10") instead of a debit, its take-profit and stop are measured on that premium, and when the call expires worthless the trade completes: the shares are sold at the close and the result is your premium plus or minus what the shares did. A call that finishes in the money has the shares called away at the strike.
- **Income runs ask for starting capital.** Starting an Income run opens a box: $25,000, **$50,000 (recommended)**, $100,000, $250,000 or any amount, explaining that a cash-secured put ties up the whole strike. Your choice is remembered. Targets and risk limits are percentages, so a bigger account doesn't make the run easier. Sandbox now allows up to $1,000,000.
- **Round targets that take more than one trade.** A typical winning Verticals trade scores about 220 points in round 1, and the old target was 30. Targets now start at **200 / 220 / 180** (Month 1 / Month 2 / Review) and grow 12% a quarter. To keep that fair, a missed **Month** target is a **write-up**, not the end: +15 stress, a warning, and that quarter's Review asks 10% more. A second miss in the same quarter, a missed Review or the Max-Loss Line still ends the run. Desks that score more per trade ask for more (Condor ×2.2, Volatility ×1.7, Calendar ×1.2, Income ×1.1; the desk's tooltip says so). With the bigger targets, the Theta Engine cartridge's +8 chips a day nearly doubled the win rate on its own, so it's now +3 a day. The balance simulator passes all ten checks again: a careful player wins 57.5% of runs, holding to expiration 32%, greedy 1.5%, random 1%; every desk is within 10 points of Verticals; no cartridge adds more than 15 points; a full run takes about 37 minutes. Round 1 on Verticals still passes about 84% of the time, but one trade clears it on its own only about 4 times in 10 (a losing trade or a small win never does), so more often than not it takes two or three.
- **Strike lines don't vanish.** Dragging a strike line past the edge of the chart now pins it at the edge with a ▲/▼ grip instead of letting it disappear. A spread's far strike always stays listed, so the trade never turns invalid mid-drag.
- **Iron condors (and broken-wing condors) have two lines to drag**: one for the put side and one for the call side.
- **While you drag, only your trade shows.** The price labels and names of the strike lines on the right-hand scale, the expected-move band and support/resistance lines hide until you let go, and the chart stops re-zooming under your mouse.
- **Where your trades are on the chart.** Each open trade's profit and loss zones are drawn as a box from the day you opened it to its expiration, with a small "SOLD +1.20" tag at the entry, instead of shading the whole chart. The cushion bracket sits at today's candle.
- **The expiration line keeps up with the slider.** It moved a step behind the DTE slider; it now moves with it.
- **Risk tiers read as a ladder**: one row per tier with its rule. Tiers stack, so picking one puts a ✔ on its rule and every rule below it; tiers you haven't reached show a padlock and "clear a year at Tier N".
- **Ines in the shop** now speaks from the empty middle of the BUILD.SYS panel, clear of the offers, the payouts and the NEXT button, at both 1366 and 1920 wide.
- **The Pad: an art list for another AI.** `PAD_ART_BRIEF.md` is a brief you can hand to an image AI: the scene's layout in pixels, style rules (crisp pixels, a limited neon-on-indigo palette with the exact colors, one front-on camera, one light source, transparent backgrounds, no text or logos), four copy-paste prompts for sprite sheets, and the full list of 53 pictures (4 rooms, the desk, 5 monitor setups, 4 chairs, 3 plants, 4 lights, 12 paintings, 8 watches, 6 vehicles, 6 desk items) with exact sizes. The Pad now draws uploaded art at twice the detail of the code-drawn version and falls back to the drawing piece by piece. The list is also in `ASSETS_NEEDED.md` (The Pad section).
- Tests: expiration by exception (out of the money by a cent expires, in by a cent is assigned), covered-call completion, the write-up rule, desk-scaled targets, the Schwab pull (history, incremental pulls, no chains during market hours, stock splits), building a market from `schwab.db` alone (with a check that a modeled day prices exactly the same with or without later prices), adding Schwab days to DoltHub data, and an end-to-end test that builds game data from a `schwab.db` inside the real app.

### 1.4.1: the achievement badges
Art sheet 3 is in: all 47 achievement badges, cut from your sheet with their backgrounds removed. The 20 badges that already had pictures now use the new sheet too, so the whole set matches. That completes the art checklist: 193 of 193.

### Playtest round 4: honest risk, bigger payoffs, a clear goal, Live as "the last month", Schwab
From your notes: make it obvious that confidence means contracts and risk, a truthful risk-to-reward, too much on screen, a scrolling career setup, trades that didn't feel rewarding, missing candles, no sense of how close you were to winning, needing the chart at decisions, an expiration line, greyed-out buttons with no reason, and Live mode being unclear and running out of data.

- **Size is contracts, and the screen says so.** The Conviction slider is now **Size**: its marks show the contract count (1×, 2×…), the readout says "3 CONTRACTS", and a **RISKING** bar underneath fills with the dollars and the share of your account at risk.
- **Risk to reward that tells the truth.** A straight line from price to strike made every close strike look "cheap". The trade panel now shows **LIKELY LOSS** and **LIKELY GAIN**: the dollars you'd lose or make, weighted by how likely each price at expiration is, using how much the stock has actually been moving (20-day realized volatility; the option price's implied volatility when that's missing). It also shows the odds the stock touches your short strike and the odds of the full max loss, and an **EDGE** line (expected dollars per trade). With implied volatility alone a fairly priced trade always comes out even, so realized movement is what separates a good trade from a bad one. The +1 mult "good risk:reward" rule is unchanged and shown separately.
- **Less on screen.** The option-chain preview ladder is gone. The chain is now a **CHAIN** tab that swaps with the chart (Ctrl+5, Esc returns). The right-hand trade column is wider, and "What moves this trade" shows every line in full (Θ Δ ν Γ), with cents for small amounts ("about $0.49 a day" instead of "$0").
- **Career setup in two tabs, no scrolling:** **▶ QUICK START** (desk and your save) and **⚙ CHALLENGE & OPTIONS** (tier, Heat, seed). Only the lists inside a tab scroll. Checked at 1366×768.
- **Selling a credit pays out.** A big **+$45.00 CREDIT DEPOSITED** flies into a new **BALANCE** readout in the top bar, which counts up with a coin sound. (BALANCE is the cash in the account; EQUITY still counts what open trades are worth.)
- **Missing candles: found and fixed.** Once a trade closed early (at the take-profit, say), that stock stopped moving with the clock while the round kept going, so its chart froze for the rest of the round. Every card now moves with every day, traded, untraded or closed. A test plays 10 days and checks that a new candle lands in view each day.
- **How close you are to winning:** a **ROUND GOAL** card pinned under the lineup: "18 TO GO", a bar with your points, a striped piece showing what your open trades would add (or take away) if closed now, and a plain line ("Closing your open trades now would clear the target").
- **The expiration line.** A vertical amber line where the trade expires: **dotted** while you're planning, **solid** once the trade is on, labeled "EXP 29d" / "EXPIRES 18d". The chart leaves room on the right so it's usually on screen; otherwise an arrow at the edge points to it.
- **Review the chart at decisions.** A decision (stop hit, strike tested) now shows the last 30 candles with your strikes, and **◐ REVIEW CHART (V)** tucks the dialog into a bar so the full chart can be scrolled and zoomed before you choose Close / Hold / Roll. The chart switches to that stock by itself.
- **Also fixed:** the day recap called a stock "SAFE · 3.4% from the short strike" when it was already 3.4% *past* a short put. It now knows which side is danger for puts and calls, says "THROUGH THE SHORT STRIKE · 3.4% past", and slows and flags that day like any strike test.
- **Smoother fast-forward on PCs without a graphics card.** The CRT flicker was an animation that never stopped, so the whole window was redrawn every frame even between flickers. It now flickers on a timer: same look, and fast-forward went from 30 back to 60 frames a second on the test machine.
- **Greyed-out SELL explains itself.** A short ⚠ message sits on the disabled buttons: "One trade per card: manage this one in Positions (Ctrl+1)", "No tickets left this round…", "The trading window closed…", and so on.
- **Live mode rebuilt as "the last month".** **▶ START THE MONTH** drops you 20 trading days before the latest close with a dealt lineup (the market plus four liquid stocks). Trade like any desk; Space plays a day. A month card shows "DAY 8 OF 20" and your P/L against simply holding the market ("▲ AHEAD OF THE MARKET by 1.9 pts"). A how-to bubble covers the four moves until your first trade. At the latest close the clock waits ("● CAUGHT UP"). **⟳ CHECK FOR NEW DAYS** brings newer days and the month plays on from there, so it never runs out; **NEW MONTH** starts over.
- **Schwab (read-only market data).** Settings → Data → Schwab: save your App Key, Secret and Callback URL, log in at Schwab in your browser, paste back the address it lands on, CONNECT. After that, every sync also fetches the days DoltHub hasn't published yet: daily candles for each ticker and, after the 4 pm close, that day's real option chain. Days in between get modeled chains labeled MODEL, like DoltHub's own gaps. Only market-data endpoints are called; the keys and login live in one file in your save folder, encrypted by Windows or macOS. The login lasts 7 days. `README_PLAY.md` has the steps.

### A Mac version
You asked to playtest on a Mac as well. The game is the same app on both; the Mac build differs only in packaging:

- **Two builds:** Apple chip (M1 and later) and Intel. Each is a zip holding `Spread Trading Game.app`.
- **Signed so a Mac will open it.** Macs with Apple chips refuse apps without a code signature, so each build is signed "ad hoc" (a signature without a paid Apple developer certificate). Because the cloud machine here runs Linux, the signing uses rcodesign, an open-source Linux version of Apple's signing tool.
- **join-mac.sh** glues the downloaded parts back together, checks them, puts the game in Applications and opens it. Files it creates on your Mac carry no "downloaded from the internet" flag, which usually skips the "can't verify this app" warning. If the warning still shows, Privacy & Security → Open Anyway fixes it once.
- **A Mac menu bar:** hide, quit, copy and paste (for the seed box and dev notes), minimize and full screen. None of it uses a key the game needs.
- **Keys:** Command works wherever the game says Ctrl, and key hints show ⌥ for Option.
- **Real data on a Mac:** BUILD REAL DATA downloads the right Dolt tool for Apple chip or Intel Macs, and also finds Dolt if you installed it with Homebrew.

### Playtest round 3: sliders and drag lines, the day recap, a new shop, trade any day
From your notes: studies broke the game, too many buttons and number boxes, the call-your-shot step felt useless, sizing was redundant, the brief was hard to read, powerups weren't clear, days went too fast, the shop needed work, the chain needed its own screen, you wanted a developer mode, and more.

- **The studies crash is fixed.** Changing studies rebuilt the chart and left it blank. It now reloads its candles every time, and a test changes four studies and the timeframe to prove it. Escape also closes any dialog now.
- **Art sheet 2 is in: 166 of 193 pictures.** The 8 cartridges, the Algo Execution voucher and the Diagonal and Double Calendar pages. Only the 27 achievement badges are left.
- **Shaping a trade with sliders instead of numbers.**
  - Snap sliders for **Expires** (monthlies marked), **Short Δ**, **Width** and **Conviction**. Drag them, click the track, scroll the wheel or use the arrow keys. They click like a dial as they pass each value.
  - **Drag the lines on the chart:** the short-strike handle, plus a second handle for the far strike that sets the width.
  - **Everything updates live as you move:** a chance-of-profit gauge, "risk X to make 1", a bar for the credit against the width, breakeven, expected move, IV rank and Edge. POP and IV explain themselves on hover.
  - **On the chart:** a soft green band where the trade makes its most at expiration, red where it loses its most, a gold MAX PROFIT line for narrow peaks, and a bracket showing the % cushion from price to your short strike (it turns red under 2%).
- **Call your shot is now part of the trade.** "YOUR VIEW ▲ UP · profits above 362.90 (−3.0%)" is read from the structure and strikes you pick. Conviction is the confidence: FEELER 50% up to ALL IN 90%, and it also sets the size as a share of your risk cap. The separate sizing buttons are gone.
- **The plan moved out of the order ticket.** Take-profit and stop sliders are set once: on the Career screen before a run, in the Sandbox setup and in Settings. The ticket shows one small line.
- **Slower days you can react to.**
  - **DAY BY DAY is the default.** Each Space or N plays one candle over about 3 seconds, then waits.
  - 1× is a quarter of its old speed (5.6 seconds a day).
  - **After each day, a recap:** every trade's last weeks of candles with its strikes, SAFE / GETTING CLOSE / TESTING / THROUGH, the % to the short strike, the day's news, and a CLOSE button.
  - Any day with news holds the clock until you've read it.
- **Credit spreads read like credit spreads.** The trade card shows the credit IN HAND and what closing now would leave ("not locked in"). Paper gains float up muted; only closed trades pay.
- **Trade on any day.**
  - Cards you haven't traded now move with the clock. You can watch a day or two, then trade on day 3.
  - New trades may start on any of a round's first 10 trading days while you have tickets.
  - A **⏱ days-to-open-trades** chip counts down, and **END ROUND** settles early when nothing is open.
  - The recap lists your untraded cards (a watchlist) with the day's move. Click one to trade it.
- **Skip is now a sit-out.** Skipping locks trading for 5 trading days while the market moves without you. Then the Tag and −10 stress pay. Waiting a day on your own is free.
- **The option chain has its own screen (Ctrl+5, or ⤢ on the price ladder).**
  - Every expiration, with calls and puts side by side: Δ (with a bar), Γ, Θ, Vega, IV, bid and ask.
  - Your legs are marked, the price-now row and the one-expected-move rows are highlighted, and it opens centred on the price.
  - Click a bid to sell there (a credit spread with that short strike). Click an ask to buy.
- **The brief is widgets now.**
  - A street-read gauge with a needle.
  - Price (60-day line with the 50-day average) and a 52-week range bar.
  - An RSI meter with 50- and 200-day trend chips.
  - The month's expected move, an IV rank bar, and implied against actual volatility.
  - The market line and VIX on a calm-to-fear meter.
  - A timeline of what's coming (earnings, ex-dividend, Fed, CPI) with your trade's expiration laid over it. "⚠ EARNINGS INSIDE YOUR TRADE" if it lands before expiry.
  - **⤢ opens a big version** with a one-year chart, every headline and the notes behind each widget.
- **Rolling shows charts.** The roll dialog draws the candles with the old strikes (faint) and the new ones, plus the P/L at expiration for STAY against ROLL. A table compares chance of profit, breakeven, best and worst case and days left. It says what closing now locks in and whether the roll pays a credit. Sliders pick the expiration and how far to move the strikes.
- **A new shop: DESK/OS.**
  - The shop is an old trading terminal's desktop. Every category has its own window: CARTRIDGES.EXE, ANALYSTS.DIR, VOUCHER.SYS, MEMOS.TXT and PLAYBOOK.PDF. The windows pop open one by one, with the last round's receipt in LAST_ROUND.LOG.
  - Every shelf is stocked: each shop now always has a memo and a playbook page (it used to be a coin flip).
  - **Cards are picture-first:** big art, a price tag, family and REAL/ARCADE chips, a **WHEN** line and a colored **GET** badge (◆ chips, ✚ mult, ✖ ×mult, $ cash, ♥ stress…), plus the catch in amber. All 50 cartridges have hand-written one-line summaries.
  - **BUILD.SYS** shows each family's pips toward its 2/3/4 bonuses and what the next pip unlocks. Offers on the shelf show as pulsing hollow pips, so combos are visible before you buy.
  - The reroll button is a spinning ⟳ with its price. Selling a cartridge is a ↩$ chip.
  - Your loadout (analysts, memos, playbook levels, vouchers) shows as icon slots, with empty slots as dashed boxes.
- **Clearer powerups before a run.** The Career screen shows your desk's **starting kit** as cards (the same WHEN/GET look) and **"How runs are won"** in three lines: winners score chips × mult, stack a family, close at your plan. During a run, the family counters in the rail are bigger and have pips.
- **The combo panel.** "IF IT WINS" counts up, a bar shows how much of the round target the trade would fill ("✔ CLEARS THE ROUND"), and each bonus that would fire is a chip with its cartridge picture.
- **Coworker tips.** Ines (and occasionally Kessler or Bradley) speaks up the first time you meet something: earnings inside a trade, a stop hit, a roll, your first win, watching before trading, or the trading window closing with tickets left. She also speaks when you're struggling (two losses in a row, or a negative meter), once per round.
- **Developer mode (Settings → Game → Developer mode).**
  - A DEV button, and Ctrl+Shift+D, opens a panel.
  - **Playtest notes** are stamped with where you are (screen, run, round, day, card with its real name and date). **SCREENSHOT + NOTE** saves a picture in the game's data folder under `playtest`. Export the notes as a .md file or copy them.
  - **UNLOCK EVERYTHING:** every desk, pack, tier, Pad upgrade and cosmetic, plus 5000 Bonus.
  - **Run levers:** cash, stress, tickets, rerolls, meter, and any cartridge, analyst, memo or voucher. They go through the run's action log, so a saved run replays them exactly, and they never touch market data.
- **Bugs found on the way:**
  - The put side of the chain showed ask under the "Bid" header.
  - Rerolling the lineup could crash the round screen.
  - Two style names collided with older ones (a meter and a sparkline).
  - The CRT overlay halved the frame rate while candles moved. It now keeps 60 fps and looks the same.

### Playtest round 2: your art, candles you can watch, faster trade entry
From your notes: the loop after placing a trade felt like a simulation; you wanted candle animations, anticipation, time and control day to day, easier or more fun trade input, and your asset sheet in the game.

- **Your art is in: 155 of 193 pictures.** I cut your sheet into individual pictures, removed the icons' tile backgrounds, scaled each to its slot, and matched every picture to the item it fits best.
  - The first 16 cartridges followed the checklist order exactly. The rest I matched by meaning, for example: phoenix → Golden Parachute, crown → Pin Master, book → Stop Discipline, speedometer → RSI Radar, infinity → The Wheel.
  - They show on shop cards, the cartridge rail, analysts, memos, the client card, desk banners, boss intros, achievements, hover panels, family counts (new), and the tag picture on the SKIP button (new).
  - The card backs on your sheet are tall, thin strips, so a card back now repeats across the card instead of being stretched.
  - `tools/assets/sheet-import/` holds the cutting script and the exact mapping. Your sheet is saved as `assets/source/sheet-1.webp`, so a future sheet goes in the same way.
- **Candles you can watch (the day player).** The engine still settles each day from the real data exactly as before; the screen now plays it back:
  - Each day's candle forms on the chart, from its open through its real high and low to its close, with the volume bar growing alongside. The chart zooms in on recent candles while the clock runs.
  - Your P/L ticks live with the price, in the new trade card on the chart, on the stock card and in the positions table. When the day settles, a "+$18" or "−$30" floats off the trade.
  - The trade card shows a **stop ◄──●──► target** meter, days left, what time decay pays per day, and how far price is from your short strike.
  - Near your short strike the day plays in slow motion: the strike line flashes, a heartbeat plays and "TESTING" flashes on the chart.
- **More control, day to day.**
  - Pace chips next to the clock: **DAY BY DAY** (one candle per Space press, then it waits for you), 1×, 2× and 4×. N plays one day; `,` and `.` change the pace.
  - At 1×, 2× and 4× the clock stops on its own, without a pop-up, the first time price tests your short strike. You can then keep going (Space) or close (Alt+F, or the CLOSE button on the trade card). This can be switched off in Settings.
  - While paused, CLOSE and ROLL sit right on the trade card.
- **Faster trade entry.**
  - **Your call picks the structure.** Call up and you get a bull put; call down, a bear call; flat, an iron condor, always within your desk's playbook. This can be switched off in Settings.
  - **Setups in one key:** WEEKLY (W: 3-10 days, 0.20 delta), SWING (M: 30-45 days, 0.30 delta) and MINE (Y).
  - **SAVE** remembers your own setup: structure, days, delta, width, plan and risk size.
  - **Delta chips** (.10 to .40) replace the slider.
  - **Drag the strike handle** on the chart to move your short strike. It snaps to listed strikes, ticks as it moves, and shows the credit and POP live. The mouse wheel and the ↑/↓ keys move it one strike at a time; ←/→ change the expiration.
  - **Size to 1%, 2%, 3% or MAX** of your equity in one click; - and = change contracts.
  - **Selling or buying slams a SOLD/BOUGHT stamp** onto the chart, with coins flying off the button.
- **Two more bugs found by the screenshots:** two style names were shared across screens, and one of them stretched the MINE button to three times its height. Both are fixed.
- **Settings update once for older saves:** 1× now means 1.4 seconds per day, so each candle is watchable.

### Playtest round 1: art slots, hover help, fewer clicks, the news brief
From your notes: assets need work; too cluttered and too many needy clicks; hover explanations like Balatro; more news for predictions.

- **Art slots and your upload list.** Every item that can have a picture now has a named slot: 193 in all, covering cartridges, memos, vouchers, analysts, tags, playbook pages, reviews, desks, clients, family badges, card backs and achievements.
  - `ASSETS_NEEDED.md` lists every file name, its size, the upload steps (GitHub website, no coding) and a drawing idea for each first-priority item.
  - Anything not uploaded yet shows a clean placeholder tile with the item's initials, so you can upload in any order.
  - `npm run assets:list` refreshes the list and flags wrong sizes.
- **Hover explanations everywhere (Balatro-style).** Rest the mouse on almost anything for a short, plain explanation. Where it maps to real trading, a second line says what it is at a real broker.
  - Items: cartridges, memos, vouchers, analysts, tags, reviews, desks, structures and clients. Each shows its picture, rarity and effect.
  - Screens and numbers: the top bar, lineup chips, builder controls, key trade numbers, the positions table, the clock buttons, the payoff chart, the shop, Career options and the run-end stats.
  - The old plain browser hints now use the same styled panel.
- **Fewer clicks, less clutter.**
  - Orders send immediately by default. A confirm box is optional in Settings.
  - "Target hit" closes at your plan without asking. "Short strike touched" and "21 days left" are now small alerts instead of pop-ups that stop the clock. Stop hits, earnings (unless you ticked "holding through earnings on purpose"), ex-dividend, pin risk and assignment still ask.
  - Existing saves get these new defaults once.
  - The right panel now shows six big numbers (credit, max profit, max loss, POP, breakeven, expected move) and three chips (R:R, IV rank, Edge Rank). The rest lives in hover text.
  - The score preview is one line. The SELL and BUY buttons show risk and POP right on them.
  - Lineup cards lost the "days of history" chip, and blind cards lost the "Day 1" chip (every card showed the same one).
  - The chart no longer opens with MACD. It's one click away in Studies.
  - On laptop screens (1366 wide) the structure picker keeps two columns.
  - In the shop, character lines now appear as a small box in the top corner instead of covering the NEXT button.
- **The news brief (new).** Every stock now has a one-screen overview of where the market and the news stand, so you don't have to research made-up companies:
  - **Street read:** Bullish, Leans bullish, Mixed, Leans bearish or Bearish, with the top three reasons (▲/▼). It's built from the trend, the last month's moves, recent news and the market. It also shows as a chip on every lineup card, with the reasons on hover.
  - **Coming up:** earnings, ex-dividend, Fed decisions and CPI. In Career the exact earnings date still comes from the Earnings Whisperer (or the Event family, or the Volatility desk). Without it the brief says "in about 2 weeks".
  - **News, last 30 days:** up to six headlines. They cover earnings reactions against the implied move, gaps, heavy volume, win and loss streaks, new 52-week highs and lows, golden and death crosses, and Fed or CPI days that moved it. There are 64 new satirical headlines; real companies by name get plain facts only.
  - **Market** (SPY's month and the VIX mood), **the stock** (moves, trend, RSI, 52-week range) and **options** (the expected move; IV rank detail comes with the Quant or the Vol Surfer).
  - A fresh card opens on BRIEF. Once you make your call, the panel flips to TRADE (payoff and numbers). You can switch either way any time.
  - It only uses what was known on that day. A test proves the brief is identical whether or not the future exists.
- **Bug found while testing:** the Stats screen's chart hint shared a style name with the new hover panel and stretched it to full screen height. Renamed.

### Phase 11: Package and hand off
- **Windows builds, version 1.0.0:** `SpreadTradingGame-Setup-1.0.0.exe` (installer: pick a folder, desktop and Start-menu shortcuts, uninstall from Windows settings) and `SpreadTradingGame-Portable-1.0.0.exe` (no install). Both use the original pixel-art icon and are cross-built from Linux with electron-builder.
- **Packaged-app check:** the exact same app archive was packaged for Linux and launched headless in a new test. It boots on the SIM market, shows v1.0.0 and deals a Career round, with zero page errors. That test caught two real bugs:
  - The first reverb I used needs an audio "worklet", which the app's security policy blocks, so it failed silently. I replaced it with a convolution reverb and kept the security policy strict.
  - When the machine is busy, as right after launch, late music notes could collide and throw an error. Late notes are now skipped instead.
- **Settings → Data** has OPEN LOG FOLDER and OPEN SAVE FOLDER buttons, so a bug report is one click away.
- **Credits** list every library with its license: Tone.js, PixiJS and pixi-filters, TradingView Lightweight Charts, the fonts, the DoltHub data (CC BY-SA 4.0) and "not financial advice". There is no third-party art; everything is drawn in code.
- **`README_PLAY.md`** (plain language): installing, and the "Windows protected your PC" warning; playing the SIM market right away; the optional real-data build (about 16 GB, about 40 GB free, a few hours); syncing and Live; where saves and logs live; and how to report a bug.
- **`PLAYTEST.md`:** 20 things to try and score from 1 to 5, starting with the three only a Windows PC can prove: the installer, offline play, and smoothness.

### Phase 10: Juice and polish
- **Adaptive music** (Tone.js, MIT), composed live in code in three styles:
  - Synthwave, darkwave and chiptune. Pick one in Settings; darkwave unlocks at Associate, and chiptune costs 25 Bonus.
  - Four layers (pad, bass, arpeggio, drums with hats) fade in as things heat up. The intensity mixes how much your stocks are moving, your stress, and how far the meter is from the target as the round runs.
  - Menus stay calm, and the shop has a mellow groove. Reviews speed up and shift into a darker key. A victory brightens, and a defeat thins out.
  - A new section (key, chords, arpeggio, bass line and drum pattern) is written every eight bars and at every scene change, so a run never sits on one loop.
  - Music starts on your first click or key press, the way every browser engine requires. The Music slider at 0 stops it entirely.
- **Particles and celebrations** (PixiJS, MIT) on an overlay above the UI, in square pixels:
  - confetti when a round's target is met (during the round and at the tally);
  - coins for winning receipts and shop purchases, and embers for losers;
  - sparkles when you buy a Legendary or unlock an achievement;
  - fireworks for a victory.
  - The overlay sleeps when nothing is flying, so it costs nothing during a quiet fast-forward.
- **Animated backdrop** on the title screen: pixel candlesticks drift along the horizon over the synth grid, fading out before the menu.
- **Card motion:**
  - Lineup cards deal face down showing your chosen card back, then flip up.
  - Lineup and shop cards bob gently while they wait, and still tilt on hover.
  - Legendaries get a light band sweeping across them.
- **Juice:**
  - The screen shakes on gaps (as before) and on any single trade that scores more than the round's target.
  - Tally count-ups rise in pitch.
  - Debrief receipts now stamp STOPPED OUT or LIQUIDATED, not just PROFIT and LOSS.
- **Accessibility:**
  - Every button, card and input shows a dashed amber outline when reached by keyboard.
  - Dialogs are announced as dialogs, and toasts and Ines's tips are read out by screen readers.
  - Reduced motion turns off the card wobble, deal flips, shine, backdrop drift and all particles.
- **Performance:**
  - During fast-forward the chart now recomputes once per new day instead of on every click, and each day redraws the screen once instead of twice.
  - The pause between days now subtracts the time spent drawing, so the speed setting is the real pace.
  - Measured in this cloud box (no graphics card, software rendering): about 55 frames per second, median frame 16.7 ms (the 60 fps mark), no main-thread stalls at all, and the clock holds its 0.35 s/day pace. A new E2E test measures this every run.
  - A mid-range PC with a real graphics card should do better. I can't measure that here; it's on the playtest list.
- **Fixes from the screenshot review:**
  - Speech boxes move to the bottom outside a round (they were covering the TARGET MET stamp and three shop cards) and are properly centered.
  - The debrief's PROFIT stamp no longer sits on top of the P/L.
- Tests: composer tests (seeded, keeps changing, styles differ, Reviews faster and darker, layers build with intensity). New E2E tests: polish (backdrop canvas, music starts and follows scenes, particles spawn, reduced motion blocks them) and performance (frame times, stalls, pace).

### Phase 9: Meta-progression and every mode
- **Career ladder.** Every run pays career XP, failed runs included. Eight ranks:
  - Intern → Analyst → Associate → Trader → Senior Trader → Portfolio Manager → Head of Desk → Fund Founder.
  - Each rank unlocks something: a cartridge pack, a terminal theme, cheaper desk unlocks (25% off, then 50%), a card back, or a new home for The Pad.
  - A promotion pops up the moment you earn it.
- **Bonus**, the money you keep between runs, comes from:
  - each run's score, calibration grade, beating SPY and finishing the year;
  - every achievement (paid once, including ones unlocked before Bonus existed);
  - Contracts.
- **Spending Bonus:**
  - Unlock the other four desks from the Career screen.
  - Buy cartridge packs: 12 of the 50 cartridges start locked, in three packs that also open for free at a rank. The Career shop only offers what you've unlocked. The balance simulator uses all 50.
  - Upgrade The Pad and buy cosmetics.
- **Risk Tiers.** A picker on the Career screen, 0 to 8. Clearing a whole year at your highest tier unlocks the next one. Each desk remembers the best tier you've cleared on it.
- **Compliance Rules (Heat).** Twelve optional rules that make a run harder, each worth 1–2 Heat. Clearing a year with more Heat unlocks cosmetics at Heat 3, 6, 10 and 12. The rules:
  - fees on, taxes on, liquidity limits, approval levels;
  - no market orders, no skipping, no interest;
  - start at 25 stress;
  - Max-Loss Line 3% tighter;
  - one fewer card, two fewer rerolls;
  - targets +20%.
- **The Pad.** Your apartment, drawn in pixel art in code. It fills up as you buy things:
  - Four homes: Studio → Loft → Penthouse → Orbital Suite. Each has a small, capped comfort perk: +$2 starting cash, +1 reroll in every Month 1, and −5 stress at each new quarter.
  - Collections: 12 art pieces, 8 watches and 6 vehicles, each piece pricier than the last.
  - Desk upgrades (monitors, chair, plants, lighting) and up to four desk items on display.
- **Cosmetics.** Settings now shows every theme, CRT style, card back and music style, with locked ones saying how to earn them:
  - Themes: four in all (new: Vapor Audit).
  - CRT styles: scanlines, clean LCD, aperture grille, rolling bar.
  - Card backs: seven.
  - Music styles: three.
- **Endless.** After a Career victory, CONTINUE INTO ENDLESS keeps your build and plays on into Year 2 and beyond:
  - Targets grow ×1.8 a quarter, and every fourth quarter is another Annual Review.
  - The year's victory is already banked, so Endless can only add to it: more rounds, more XP and Bonus.
- **Daily.** One seeded quarter (Month 1, Month 2, a Review), the same for everyone that day, on default rules. The desk rotates daily.
  - Bradley's ghost is the disciplined bot playing the same seed. His round-by-round score shows in the top bar, and the end screen says who won.
  - The first finish of the day counts toward your streak, which breaks if you miss a day.
- **Contracts.** A weekly board of five clients, each with one request on a blind chart:
  - Place one trade that meets every line of the checklist (it ticks live as you build) to earn Bonus, plus half again if the trade makes money.
  - Once you place the trade the contract is taken, so you can't peek at the outcome and retry.
  - A request that needs a desk you haven't unlocked says so.
- **Live.** Paper spreads on the latest end-of-day chain, real names.
  - Your positions carry over: the game replays your trades against the newer data after each sync, and the clock runs up to the latest close, then waits.
  - Closed trades go to Stats under "Live".
  - With real data, SYNC DATA pulls the newest days. On the SIM market there's nothing to download, so SYNC moves a simulated calendar forward one week, and the screen says so.
  - Nothing connects to a broker.
- **Tutorial.** Three practice rounds with Ines, from a banner on the Career screen (or its TUTORIAL button). Her tips follow what you're doing and never block a click:
  - read the card, call your shot, build a bull put, start the clock;
  - decision points, the tally, the shop, Month 2, the Review.
  - Finishing it gives you Ines's Mug (a desk item) and her Notebook card back.
- Tests:
  - 18 unit tests for the profile rules (ladder, payouts once per run, tier unlocks, prices, rank gates, collections, cosmetics, desk items, streaks, week keys, contracts).
  - 9 integration tests on the real engine: Compliance Rules, Pad perks, the unlocked cartridge pool, Endless into Year 2, Daily determinism (the ghost), Live sessions stopping at the edge and replaying after a sync, and the Contracts board.
  - E2E smoke tests for Daily (with the ghost, save and continue), Contracts (take, trade, get paid), Live (trade, sync, catch up), The Pad and the Career office (buy art, a home, a desk; tiers; Heat), the tutorial and Endless.
  - Screenshots reviewed. Fixes from that review: the chair now sits in front of the desk, the vehicle sits on a showroom plinth, and Ines's tip box moved clear of the order buttons.

### Phase 8: Balance
- **`npm run sim`** plays thousands of headless Career runs through the real engine (the same code the game runs, on the SIM market) with four bots, then writes `sim/REPORT.md`. It uses every CPU core and takes about 15 minutes.
  - *Disciplined Seller:* sells 20–30Δ credit spreads when IV rank is 30+ and leans with the trend. It closes at 50% of max profit or at its stop, holds long premium through earnings, and buys discipline, theta and execution cartridges. On the other desks it plays that desk's playbook the same careful way.
  - *Hold-to-Expiry:* the same entries, never manages them.
  - *Greedy:* maximum size, no stops.
  - *Random:* random structures, strikes and sizes.
- **Every target in section 17 is met** (see `sim/REPORT.md` for the full tables):
  - Disciplined Seller wins about 60% of runs, Hold-to-Expiry about 25%, Greedy under 1% and Random 0%.
  - Every desk is within 10 points of Verticals.
  - No cartridge lifts the win rate more than 15 points.
  - A full winning run takes about 37 minutes at an experienced pace. On your first runs, while you learn the builder, expect closer to 50.
- **What it took (the numbers moved; the rules didn't break):**
  - Targets now start at 30 / 50 / 80 points and grow ×1.3 a quarter. The plan's 150 / 250 / 400 at ×1.6 made even the careful bot fail by the second quarter. Round scores are large next to these targets. The real difficulty is not having a net-negative round: one bad stop-out or a crossed Max-Loss Line ends the run. That is exactly the "discipline beats luck" feel the plan wanted.
  - The lineup deals 4 cards (plan: 3) with 4 rerolls (plan: 2), so a patient player can find a setup worth trading. The Max-Loss Line is 15% (plan: 10%).
  - Losing trades count at 40% of their size on the meter, and more (×1.25) if you had no stop or declined it. The ledger and Stats always show the full real loss.
  - Closing at plan is worth +1 mult (plan: +0.5).
  - Stops now mean "exit when the loss reaches 2× the credit". The old "buy back at 2× credit" version kept stopping out on normal day-to-day noise.
  - The other desks got small built-in boosts so each is as winnable as Verticals:
    - Condor: +1 ticket, +1 card.
    - Volatility: +3 tickets, +2 cards, profit taking at +15%.
    - Calendar: +1 ticket, +1 card, profit taking at +15%.
    - Income and Calendar are dealt on cheaper-looking share prices.
- **Honest caveats** are written into the report:
  - These numbers come from the SIM market. Once you build real data, `npm run sim -- --db <path to game.db>` reruns everything on it.
  - Cartridges picked fewer than 30 times (mostly rares and legendaries the shop rarely shows) are listed but not judged, because with so few runs the uncertainty is bigger than the 15-point limit.
- **Checking what a cartridge really does.** The first report flagged Patience Pays: runs that bought it won 22 points more often. Weakening it changed nothing, down to the decimal. So I replayed the same 65 runs with the card owned but switched off, and they won just as often (one run in 65 changed). The card wasn't strong. The runs that happened to buy it were already doing well. The simulator now runs this switched-off replay for every card that looks strong and judges it on what the card itself adds. Patience Pays and Crush It stay exactly as the plan describes them.
- Tests: E2E expectations and unit tests now read targets, lineup size and the rest from `balance.ts` instead of hard-coded numbers, so future tuning can't silently break them.

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

- **The careful bot now wins about a third of runs, not 40–55% (1.6.1).** You found Career easy to finish; the simulator agreed that a decent build cleared regular Months at several times their targets. The bots are an average player, and you play well above them, so the base game now asks more of everyone (the bot's acceptable range moved to 28–45%), the bosses stay where you agreed, and **Risk Tiers** (each +10% targets) are where a strong player turns up the pressure, the way Balatro's stakes work.
- **Releases are published by GitHub itself (1.6.1).** This cloud session isn't allowed to create GitHub releases, so `.github/workflows/release.yml` builds the Windows and Mac games on GitHub's own machines whenever a version tag (like `v1.6.1`) is pushed, and publishes them with `RELEASE_NOTES.md`. The release page has the whole files, so nothing needs joining.
- **A covered call's risk is its stop (1.6.1).** Sizing a covered call by a 25%+ jump in the stock made it impossible on pricey stocks. Now it always carries an automatic stop, and the risk cap counts the loss at that stop plus 25% for a gap. Real markets can still gap past a stop (an earnings jump, say), and the game plays that out honestly: the stop fills at the next real price.

- **Bosses replace the old Review rules (1.6.0).** Each boss keeps its market (which charts are dealt, and The Fed's index card) but drops that market's old rule, so a boss round has exactly one twist, as you asked. Old saves mid-Review keep their old rule.
- **Chad's duel is a real second book, and it multiplies your score rather than deciding the Review (1.6.0).** His trades run on the same cards and the same real prices in a separate session, so his P/L is as real as yours. He retired at 34 on lottery tickets: out-of-the-money call spreads on his first two cards, one contract each, held to the end. The simulator showed that a careful player's round P/L is close to a coin flip in every boss market, so "beat Chad or the run ends" made him a 55% boss whoever he was. Instead, finishing ahead of him multiplies the round's score by 1.5 and trailing him cuts it to 0.75, and the target decides the Review as usual (about 8 in 10 for a careful player, like The Executor in the same market). Both numbers are in `balance.ts` (`duel`).
- **The Allocator's round gets a 4th ticket (1.6.0).** With 3 tickets, three different structures meant every ticket had to be a different trade, and the simulator's careful player beat him only 64% of the time. One extra ticket keeps the twist and makes the goal reachable.
- **The Rebalancer judges its own round against SPY (1.6.0).** Before, the full victory needed the whole year to beat SPY. Your answer was "beat SPY with a line", which needs a round you can see on the chart, so it's now the year-end round's trades against the same money in SPY over the same days.
- **No intraday clock pressure.** The game trades daily prices, so no boss stops you pausing (your answer); the Margin Clerk's twist became half risk instead.
- **Live mode is on hold as work in progress (1.6.0).** It works, but it's labeled WORK IN PROGRESS until it gets a proper goal and Schwab is tested on your PC. **Idea recorded for later:** a weekly leaderboard for Live (everyone plays the same real week; compare return vs SPY), which needs a server and accounts, so it's parked.

- **The tutorial hides parts of the screen (1.5.0).** The plan had Ines coach over the full desk. For someone new to options that's too much at once, so the tutorial switches regions off and lights them up lesson by lesson, and the game around it is unchanged: same market, same trades, same scoring. Two small locks keep the lessons in order: the clock waits until the first trade is placed, and the planned trade stays off the chart until the chart has been explained. Both lift with SKIP LESSONS.
- **The screen restarts itself if it freezes (1.5.0).** The freeze you saw couldn't be reproduced here, so besides the fixes there's a watchdog: the screen reports in every second, and after 12 seconds of silence the game reloads it. Runs save after every action, so a reload loses nothing. Chromium's own "not responding" signal takes about 30 seconds, which felt too long to sit through.

- **The forming candle's intraday route is a guess.** Daily data records open, high, low and close, not which extreme came first. Up days replay as dip-then-rally, down days as pop-then-drop. Every replay touches the real high and low and ends exactly on the real close, and the live P/L lands exactly on the settled P/L. Nothing about the trade's outcome depends on the replay.

- **Live mode on the SIM market.** Live is meant for the real recent market. Until you build real data there's nothing new to download, so on the SIM market CHECK FOR NEW DAYS moves a simulated "today" forward one week through the SIM history. Everything else works the same way, and the screen labels it plainly.
- **Live is a month, not a single day.** Your idea was a week or a month of recent data. A month (20 trading days) is long enough for a 30–45 DTE trade to play out, and because new market days keep arriving, the month slides forward instead of running out. Old Live saves from before 1.4.0 keep working the old way until you press NEW MONTH.
- **Schwab data lives in its own file, and DoltHub stays the reference.** Everything pulled from Schwab goes into `schwab.db` first, so rebuilding or syncing the game's database never loses it. Schwab serves only today's option chain (no history), so each pull after the close keeps that day's real chain, and a day without one is modeled and labeled MODEL. On DoltHub data, the Schwab days are added after DoltHub's last day; when DoltHub later publishes those days, a sync replaces the Schwab rows with DoltHub's, and the calendar never moves backwards. During market hours nothing from today is added: its candle isn't final yet.
- **A market built from Schwab alone models most option chains.** With no option history from Schwab, a day without a pulled chain gets a clearly labeled model: implied volatility from the stock's own realized volatility over the past 2 weeks to 6 months (only days on or before that day), lifted by a typical implied-over-realized premium (12% for stocks, 20% for SPY and DIA), with a put skew and bid/ask widths that widen when the VIX is up. For a few days after a real pulled chain, its real volatility surface is carried forward instead. These modeled chains are worked out when the game reads them rather than stored, so the build takes a minute or two and the file stays small. Schwab's market data has no earnings or dividend history, so that market has no earnings events or ex-dividend days, and only the 3-month T-bill rate (the only rate the game uses). Schwab's prices are split-adjusted; a pull that finds a split re-fetches that ticker's history and adjusts older pulled chains the same way.
- **Options expire by exception, with no pin coin flip.** At expiration an option in the money by a cent or more is exercised (assigned, for a short) and anything else expires worthless, which is how the options clearing house handles it. The old version flipped a coin when the stock closed within a hair of a short strike, which could assign an out-of-the-money covered call or put. When the stock sits right at a short strike on expiration day, a pin-risk warning still offers to close before the bell.
- **Income trades run against 500 assumed shares (1.5.0).** You asked for P/L and risk without the shares. Every stock is treated as if you own 500 shares that never enter the books: a covered call is just the call (up to 5 contracts), and a call or put that finishes in the money settles at its value at expiration, which is exactly what the option side of a real assignment costs you. Shares that would be called away or put to you are described in the trade's history but never counted. This replaced 1.4.2's version, where a covered call bought 100 real shares and sold them at expiration.
- **Targets: 200 / 220 / 180, ×1.12 a quarter, a write-up for one missed Month, and desk multipliers.** You asked for round 1 to take more than one trade on average. The simulator showed a typical winning Verticals trade scores about 220 in round 1, and three trades a round is normal, so 200 needs about two good trades. Raising targets alone made one unlucky round end most runs (the careful bot's win rate fell from 58% to 48%), so a first missed Month in a quarter became a write-up instead of the end. Reviews ask a little less than Month 1 because their rules (beat SPY, stay calm) are what make them hard; the simulator showed most runs ending at a Review. Desks score differently per trade (a condor collects two credits), so each desk has a target multiplier that keeps it about as winnable as Verticals.
- **The Pad is placed from your art, not drawn to a fixed grid (1.5.0).** Sheet 4's rooms come already furnished (a bed, a couch, shelves), so instead of the old empty-room layout, each room has its own spots for paintings and the watch case on its bare wall, and the desk, monitors, lamp, chair, plant and vehicle stand in the open floor at the bottom. Pieces are scaled to fit their spot, so a replacement picture a little off the listed size still lands in place. The code drawings remain as a fallback for anything without a picture (today: the duck, the lava lamp and the bell). Pieces with no picture on the sheet stopped being sold rather than mixing two art styles in one room.
- **Likely loss / gain uses realized volatility.** Weighting outcomes with the option's own implied volatility makes a fairly priced trade show about zero edge every time, which says nothing. Realized 20-day movement is what a seller actually bets against, so it's the default; implied volatility is the fallback when there's too little history.
- **The Pad's perks.** The plan's example perk, "−5 starting stress", would do nothing because runs already start at 0 stress. The Sky Villa (the Orbital Suite before 1.5.0) instead takes 5 stress off at every new quarter. The other perks are +$2 starting cash (Loft) and +1 reroll in each Month 1 (Penthouse). All are small and none touch the market.
- **Some cartridges start locked.** 12 of the 50 cartridges are in three packs that open by rank or for Bonus. That gives the ladder something to unlock without cutting content. The balance report is measured with all 50 in the pool, as a long-time player has them.
- **The Daily plays on default rules** (default capital, the default realism toggles) and rotates through all five desks. That way everyone, and Bradley's ghost, plays the same game that day. Only your first finish of the day counts; the next day brings a new seed.
- **Contracts are taken when you place the trade.** Leaving afterwards forfeits the contract, so a blind chart's outcome can't be peeked at and retried.
- **Endless adds an Annual Review every fourth quarter**, so each Endless year ends like the first one did.

- **Calls on trades closed early.** The plan resolves a call at the trade's expiration. If you close early, the game grades the call on the move so far, with the expected move scaled by the square root of the time that passed. That way closing a winner early never leaves the call hanging, and the same skill is measured either way.
- **Income trades and the risk cap.** A cash-secured put can in theory lose nearly all its collateral, which would never fit a 10% risk cap on a small account, so the cap measures a stress loss (a drop of three expected moves, at least 25%) while the full collateral must still fit in your equity. A covered call's risk is the mirror image: what the call would cost if the stock jumped three expected moves (at least 25%), shown as RISK IF IT JUMPS. It ties up no cash, because the assumed shares cover it.
- **Stops mean "the loss reaches 2× the credit".** Phase 2 first read "a stop at 2× credit" as buying the spread back at twice the credit. The balance simulator showed that version stopping out on ordinary daily noise. The stop now fires when the trade has lost twice what it collected, which is the common reading on trading desks. The stop choices in the builder (1×, 1.5×, 2×, 3×) use the same meaning.
- **Balance numbers differ from the plan** (targets, lineup, rerolls, Max-Loss Line, how losses fill the meter); see Phase 8 above for each change and why.

- **Modeled days use only the chain before them.** The plan says to interpolate between the nearest real chains. Using the chain *after* a missing day would leak the next day's volatility (an earnings crush, say) into the past, so modeled days carry forward the most recent real chain's volatility surface instead.
- **Compact database.** Option rows are stored as small integers (cents, thousandths, scaled Greeks) to keep `game.db` under the 3 GB target. Greeks are recomputed from each quote's own IV so every row uses the same units.

- **Built in a Linux cloud container, not on Windows.** Phase 0 asked to confirm native Windows. This session runs in a cloud Linux box, so everything is built and tested here, and the Windows installer is cross-built. Things that only a Windows machine can prove (the installer on a fresh profile) are listed in `PLAYTEST.md` for you to check.
- **Project moved to the repository root.** `CLAUDE.md` and `MASTER_PROMPT.md` now sit at the top of the repo so Claude Code picks them up automatically.
- **SQLite without a native module.** The plan named better-sqlite3. Electron 44 ships SQLite built in (`node:sqlite`), which needs no compiling for Windows and behaves the same in the game, the tests and the data scripts. Same database files, fewer ways for the install to break.
- **Practice runs.** A run can be flagged "practice" (a missed round doesn't end it, and since 1.5.0 doesn't write you up either). The tutorial uses it; the end-to-end test uses it so a whole year always plays out regardless of balance.
- **Rerolls redraw every card you haven't traded** (traded cards stay), rather than the whole lineup, so a reroll never throws away an open position.
- **Skipping is a sit-out, then the next round with no shop.** Round 3 turned the instant skip into 5 trading days with trading locked (the Tag pays at the end). There is still no shop after a sit-out, like skipping a blind in Balatro.
- **Rounds hold open for later trades.** A Career round now ends when nothing is open and either your tickets are used, no untraded card is left, the 10-day trading window has closed, or you press END ROUND. Before, it ended the moment nothing was open. The balance simulator's bots still place their trades up front and skip instantly, so their reports compare with earlier ones.
- **Conviction replaced separate sizing.** Your confidence (50–90%) picks the size: 20% of the risk cap at FEELER up to all of it at ALL IN, never less than one contract. The "call" is read from the trade itself (the structure and where the strikes sit against the price and the expected move).
- **Untraded cards load a fresh chain each day.** That's what lets a trade start on a later day. It only ever reads the current day, the same time gate as everything else.
- **Assignments add +5 stress** (not in the plan's table). The Assignment Artist cartridge says assignments give chips "instead of stress", so they needed a stress cost to replace; the Income desk and that cartridge remove it.
- **The Chop's rule** ("debit and directional wins score ×0.5") is read as *debit trades with a bull or bear lean*, so a bull put credit spread in a range isn't punished for being the right trade there.
- **Algo Execution** makes brackets execute on their own (no confirm step), since brackets already default on.
- **Crossing the Max-Loss Line liquidates** open positions at the natural price, the way a real risk desk would, so the ledger records what that costs.
- **Taxes** reduce equity by a 24% short-term estimate on each round's net gain; the trade ledger itself stays pre-tax so Stats compare like with like.
- **Duo Legendaries** get a 15% chance to show up once you own both parents (the plain 2% Legendary rate would make them almost unseeable).
- **`npm run verify` now also checks formatting** (Prettier), and the whole codebase was formatted once.

- **`.npmrc` sets `legacy-peer-deps`.** Some current packages declare over-strict version ranges for each other; this keeps `npm install` from refusing.

## Known issues

- **The Trade Builder's live data is untested against the real Schwab service** (this cloud box can't reach it). It uses the same read-only calls as PULL FROM SCHWAB plus the chain's `underlyingPrice` field for today's price; if the LIVE badge never shows during market hours, send `game.log`. Index options ($SPX and the like) aren't in the list yet; SPY, QQQ and IWM stand in.
- **Earnings dates in the Trade Builder** come only from the game's DoltHub data; Schwab's market data has none, so the 25 new tickers show no earnings date. Check it at your broker before holding through a report.

- **Straddle Stack sits right at the cartridge cap (1.6.1).** The final simulator run measured it adding 16.2 points of run win rate (the cap is 15); the two runs before measured 13.5 on the same picks, and the difference is one run out of 37, so it's noise at the edge rather than a change. If it feels like an auto-pick, its top bonus is one number in `cartridges.ts`.

- **A completed run is about 41 minutes** for an experienced player (the simulator's estimate, 59 on your first runs), a minute over your 20–40. Placing trades is most of it (about 30 seconds each, roughly 40 trades a year), and the bosses invite a few more. If runs feel long, the quickest lever is one fewer ticket in Month 2; tell me and it's one number.
- **Boss balance was measured by bots that don't read the screen.** The sealing bosses (Controller, Executor, Shell Company) are set by hand; tell me if one feels unfair. Boss targets are one line each in `balance.ts` (`bossTargets`).
- **Boss portraits and pillar icons are placeholders** (the market logos) until the art in `BOSS_ART_BRIEF.md` exists.

- **The freeze from your 1.4.2 notes wasn't reproduced.** Two likely causes are fixed and the screen now recovers by itself within about 12 seconds (see 1.5.0 above). If it happens again, `game.log` will show the last 40 things the screen did; send it and I can pin it down.
- **Balance was tuned on the SIM market.** Real data will behave a little differently (real volatility, real earnings). After you build real data, run `npm run sim -- --db <path to game.db>` and tell me if the report shows a target missed; the fix is usually one number in `balance.ts`.
- **Frame rate was measured in a cloud box without a graphics card** (60 fps while candles form at 4×, no stalls). Please check that fast-forward looks smooth on your PC (it's in `PLAYTEST.md`).
- **The Mac version was built and checked on Linux, not launched on a real Mac.** The apps are the right type for each chip, are signed, and hold the same game files the Linux and Windows tests run. Opening one on your Mac is the real test (item 27 in `PLAYTEST.md`).
- **"Make each day's reward meaningful" is read two ways.** I made waiting a day free (Next Day), made a skip cost real time (the sit-out), and gave every day a recap. If you meant something else, for example a small reward every day for good behavior, say so and I'll add it.
- **Schwab is untested against the real service.** The cloud session's network blocks api.schwabapi.com, so login, refresh, the pull into `schwab.db` and the build from it were tested against a stand-in built from Schwab's documented formats. Two guesses to confirm on your PC: that Schwab serves the VIX as `$VIX` and the 13-week T-bill as `$IRX` (if not, the build downloads the VIX from Cboe and prices options with a flat 3% rate, and says so in the log). Ticker symbols with a dot (like BRK.B) may need Schwab's own spelling; none are in the current lineup.
- **A market built from Schwab alone has no earnings events** (Schwab's market data has no earnings history), so the Volatility desk's earnings plays and earnings-themed Reviews rarely come up on it. The DoltHub build has the full earnings history.
- **Music needs a first click or key press to start.** That's a rule of the browser engine inside the app, not a choice.
- **The 1.0.0 Windows installer was built here and the same app package was tested on Linux.** Only a real Windows PC can prove the installer on a fresh profile, so that's item 1 in `PLAYTEST.md`. The exe isn't code-signed (a certificate costs money), so Windows shows a one-time "protected your PC" warning; `README_PLAY.md` explains the click-through.

- **Real market data has not been downloaded yet.** This cloud session's network blocks DoltHub, Cboe and federalreserve.gov, so `data/REPORT.md` currently describes the SIM market. On your PC, open the game's **Settings → Data → BUILD REAL DATA** to build the real database: roughly 16 GB of downloads and a few hours the first time. You can keep playing the SIM market meanwhile. `README_PLAY.md` has the details.
- **FOMC and CPI dates were compiled offline** (the official sites were unreachable), so they're marked unverified in the database. They match the published schedules to the best of my knowledge.
- The DoltHub table layouts were written from documentation and checked against a local imitation, not against the live repositories. The pipeline inspects the real column names when it runs and stops with a plain message if something doesn't match.

## Next

**Your 1.7.0 playtest** (items 65–73 in `PLAYTEST.md`): the Trade Builder first (ideally with Schwab connected during market hours, side by side with thinkorswim), then the boss fixes, the month menu and exit plan, and the tutorial's practice trade.

**Trade Builder v2 (building now, while you test):** an options tutorial inside the Trade Builder, and another 25 tickers.

**Boss art:** the 12 portraits and 12 pillar icons in `BOSS_ART_BRIEF.md` (same art pipeline as before).

**Still open from before:** the three missing Pad pictures (duck, lava lamp, bell), and building real market data then rerunning the balance check on it (`npm run sim -- --db <path to game.db>`).
