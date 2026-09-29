# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** All phases (0–11) are done, plus playtest rounds 1–4, a Mac version and the read-only Schwab connection. Version 1.4.0. Next: your playtest of round 4 (Live's month, Schwab on your PC) and the last 27 pictures (achievement badges, `ASSETS_NEEDED.md`).

## How to run (on your PC)

- **Play:** see `README_PLAY.md`. Install with `SpreadTradingGame-Setup-1.3.0.exe`, or run `SpreadTradingGame-Portable-1.3.0.exe` directly.
- **Play on a Mac:** see "On a Mac" in `README_PLAY.md` (Apple chip or Intel; `join-mac.sh` puts the game in Applications).
- **Rebuild the installer:** `npm run build:win` writes both files to `release/`. `npm run build:mac` builds the two Mac versions.
- **From source:** install Node.js LTS once (`winget install OpenJS.NodeJS.LTS`), then in this folder `npm install` and `npm run dev`.

## Done

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

- **The forming candle's intraday route is a guess.** Daily data records open, high, low and close, not which extreme came first. Up days replay as dip-then-rally, down days as pop-then-drop. Every replay touches the real high and low and ends exactly on the real close, and the live P/L lands exactly on the settled P/L. Nothing about the trade's outcome depends on the replay.

- **Live mode on the SIM market.** Live is meant for the real recent market. Until you build real data there's nothing new to download, so on the SIM market CHECK FOR NEW DAYS moves a simulated "today" forward one week through the SIM history. Everything else works the same way, and the screen labels it plainly.
- **Live is a month, not a single day.** Your idea was a week or a month of recent data. A month (20 trading days) is long enough for a 30–45 DTE trade to play out, and because new market days keep arriving, the month slides forward instead of running out. Old Live saves from before 1.4.0 keep working the old way until you press NEW MONTH.
- **Schwab fills the gap, DoltHub stays the reference.** Schwab serves only today's option chain (no history), so the top-up takes a real chain for the latest close and models the days between, labeled MODEL. When DoltHub later publishes those days, a sync replaces the Schwab rows with DoltHub's, and the calendar never moves backwards. During market hours nothing from today is added: its candle isn't final yet.
- **Likely loss / gain uses realized volatility.** Weighting outcomes with the option's own implied volatility makes a fairly priced trade show about zero edge every time, which says nothing. Realized 20-day movement is what a seller actually bets against, so it's the default; implied volatility is the fallback when there's too little history.
- **The Pad's perks.** The plan's example perk, "−5 starting stress", would do nothing because runs already start at 0 stress. The Orbital Suite instead takes 5 stress off at every new quarter. The other perks are +$2 starting cash (Loft) and +1 reroll in each Month 1 (Penthouse). All are small and none touch the market.
- **Some cartridges start locked.** 12 of the 50 cartridges are in three packs that open by rank or for Bonus. That gives the ladder something to unlock without cutting content. The balance report is measured with all 50 in the pool, as a long-time player has them.
- **The Daily plays on default rules** (default capital, the default realism toggles) and rotates through all five desks. That way everyone, and Bradley's ghost, plays the same game that day. Only your first finish of the day counts; the next day brings a new seed.
- **Contracts are taken when you place the trade.** Leaving afterwards forfeits the contract, so a blind chart's outcome can't be peeked at and retried.
- **Endless adds an Annual Review every fourth quarter**, so each Endless year ends like the first one did.

- **Calls on trades closed early.** The plan resolves a call at the trade's expiration. If you close early, the game grades the call on the move so far, with the expected move scaled by the square root of the time that passed. That way closing a winner early never leaves the call hanging, and the same skill is measured either way.
- **Income trades and the risk cap.** A cash-secured put or covered call can in theory lose nearly all its collateral, which would never fit a 10% risk cap on a small account. For those two, the cap measures a stress loss (a drop of three expected moves, at least 25%) while the full collateral must still fit in your equity.
- **Stops mean "the loss reaches 2× the credit".** Phase 2 first read "a stop at 2× credit" as buying the spread back at twice the credit. The balance simulator showed that version stopping out on ordinary daily noise. The stop now fires when the trade has lost twice what it collected, which is the common reading on trading desks. The stop choices in the builder (1×, 1.5×, 2×, 3×) use the same meaning.
- **Balance numbers differ from the plan** (targets, lineup, rerolls, Max-Loss Line, how losses fill the meter); see Phase 8 above for each change and why.

- **Modeled days use only the chain before them.** The plan says to interpolate between the nearest real chains. Using the chain *after* a missing day would leak the next day's volatility (an earnings crush, say) into the past, so modeled days carry forward the most recent real chain's volatility surface instead.
- **Compact database.** Option rows are stored as small integers (cents, thousandths, scaled Greeks) to keep `game.db` under the 3 GB target. Greeks are recomputed from each quote's own IV so every row uses the same units.

- **Built in a Linux cloud container, not on Windows.** Phase 0 asked to confirm native Windows. This session runs in a cloud Linux box, so everything is built and tested here, and the Windows installer is cross-built. Things that only a Windows machine can prove (the installer on a fresh profile) are listed in `PLAYTEST.md` for you to check.
- **Project moved to the repository root.** `CLAUDE.md` and `MASTER_PROMPT.md` now sit at the top of the repo so Claude Code picks them up automatically.
- **SQLite without a native module.** The plan named better-sqlite3. Electron 44 ships SQLite built in (`node:sqlite`), which needs no compiling for Windows and behaves the same in the game, the tests and the data scripts. Same database files, fewer ways for the install to break.
- **Practice runs.** A run can be flagged "practice" (a missed round doesn't end it). The tutorial will use it; the end-to-end test uses it so a whole year always plays out regardless of balance.
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

- **Balance was tuned on the SIM market.** Real data will behave a little differently (real volatility, real earnings). After you build real data, run `npm run sim -- --db <path to game.db>` and tell me if the report shows a target missed; the fix is usually one number in `balance.ts`.
- **Frame rate was measured in a cloud box without a graphics card** (60 fps while candles form at 4×, no stalls). Please check that fast-forward looks smooth on your PC (it's in `PLAYTEST.md`).
- **The Mac version was built and checked on Linux, not launched on a real Mac.** The apps are the right type for each chip, are signed, and hold the same game files the Linux and Windows tests run. Opening one on your Mac is the real test (item 27 in `PLAYTEST.md`).
- **"Make each day's reward meaningful" is read two ways.** I made waiting a day free (Next Day), made a skip cost real time (the sit-out), and gave every day a recap. If you meant something else, for example a small reward every day for good behavior, say so and I'll add it.
- **Schwab is untested against the real service.** The cloud session's network blocks api.schwabapi.com, so login, refresh, candles and chains were tested against a stand-in built from Schwab's documented formats. Ticker symbols with a dot (like BRK.B) may need Schwab's own spelling; none are in the current lineup.
- **Music needs a first click or key press to start.** That's a rule of the browser engine inside the app, not a choice.
- **The 1.0.0 Windows installer was built here and the same app package was tested on Linux.** Only a real Windows PC can prove the installer on a fresh profile, so that's item 1 in `PLAYTEST.md`. The exe isn't code-signed (a certificate costs money), so Windows shows a one-time "protected your PC" warning; `README_PLAY.md` explains the click-through.

- **Real market data has not been downloaded yet.** This cloud session's network blocks DoltHub, Cboe and federalreserve.gov, so `data/REPORT.md` currently describes the SIM market. On your PC, open the game's **Settings → Data → BUILD REAL DATA** to build the real database: roughly 16 GB of downloads and a few hours the first time. You can keep playing the SIM market meanwhile. `README_PLAY.md` has the details.
- **FOMC and CPI dates were compiled offline** (the official sites were unreachable), so they're marked unverified in the database. They match the published schedules to the best of my knowledge.
- The DoltHub table layouts were written from documentation and checked against a local imitation, not against the live repositories. The pipeline inspects the real column names when it runs and stops with a plain message if something doesn't match.

## Next

**Your round 4 playtest** with the 1.4.0 exe (items 28–33 in `PLAYTEST.md`): the Size slider and RISKING bar, the credit payout, the round goal card, the expiration line, REVIEW CHART at a decision, the greyed-out SELL messages, and Live's month.

**Schwab on your PC.** This cloud session can't reach Schwab, so the connection was tested against a stand-in that answers the way Schwab's documentation describes (login, token refresh, candles and chains). The first real test is yours: Settings → Data → Schwab (steps in `README_PLAY.md`). If anything fails, the message on screen plus `game.log` (OPEN LOG FOLDER) is all I need; the log never contains your keys.

The last 27 pictures (the achievement badges; see `ASSETS_NEEDED.md`) whenever you like. After that, build real market data on your PC (Settings → Data) and rerun the balance check on it (`npm run sim -- --db <path to game.db>`; Claude Code can do this for you).
