# Playtest checklist

Try each item, then give it a score from **1 (bad)** to **5 (great)** and a sentence on why. Short is fine ("confusing", "too easy", "loved the sound"). Send the filled-in list back to Claude Code, and anything that scores 1–2 gets fixed first.

The first three items can only be checked on your Windows PC. They matter most, because the cloud box that built the game couldn't prove them.

| # | Try this | What to look for | Score (1–5) | Notes |
|---|---|---|---|---|
| 1 | **Install** with `SpreadTradingGame-Setup-1.5.0.exe` (click through the "Windows protected your PC" box: More info → Run anyway). Also try the Portable exe. | Does it install and open? Desktop and Start-menu shortcuts? The title screen in under ~10 seconds? | | |
| 2 | **Offline:** turn Wi-Fi off and play a few minutes of Career. | Everything works with no internet (only data downloads need it). | | |
| 3 | **Smoothness:** start a Career round, place a trade, press Space and watch the fast-forward. | Candles slide in smoothly, with no stutter or freezing. (The cloud box measured about 55 fps without a graphics card.) | | |
| 4 | **Tutorial** (Career → TUTORIAL; rebuilt in 1.5.0, see item 40). | Did you understand the loop by the end? Is her mug on your desk in The Pad? | | |
| 5 | **Your first real run** on the Verticals desk. | Does it feel fair? Is 30–40 minutes about right? Were the targets too easy or too hard? | | |
| 6 | **Calling your shot** with keys `1`–`5` and `Shift+1`–`5`. | Quick and natural, or a chore? | | |
| 7 | **Building and placing** a bull put: expiration chips, delta and width, the price ladder on the chart, Alt+S. | Do the payoff, POP and max loss make sense before you click? | | |
| 8 | **Declining a stop** at a decision point (choose Hold when the stop hits). | Did the game make the cost clear (stress, the meter)? | | |
| 9 | **The tally and the shop:** receipts, mult pops, buying and reordering cartridges. | Satisfying? Did you understand why a cartridge scored? | | |
| 10 | **A Review** (every third round). | Did COMPLY-3000's rule change how you traded? | | |
| 11 | **The debrief** strip after a round: open a card. | Do the reveal, P/L attribution, grade and "alternates" teach you something? | | |
| 12 | **A drill** (Drills → 60-Second Blind Call, then one mini-game). | Fun in short bursts? Right difficulty? | | |
| 13 | **Stats → Export CSV,** then open the file in Excel. | Do the numbers look right? Does the CSV open cleanly? | | |
| 14 | **A second desk:** earn Bonus, unlock Income or Condor on the Career screen, and play it. | Does it feel different from Verticals and just as winnable? | | |
| 15 | **Endless:** win a year, then CONTINUE INTO ENDLESS. | Does Year 2 feel like a fair stretch? | | |
| 16 | **Daily:** play today's Daily and compare with Bradley's ghost. | Would you come back tomorrow for the streak? | | |
| 17 | **Contracts:** take a client request and fill it. | Is the live ✔/✘ checklist clear? Is the Bonus worth it? | | |
| 18 | **Live (rebuilt in 1.4.0):** START THE MONTH, trade, and play to the latest close. Then CHECK FOR NEW DAYS (on SIM it moves a week). | Is it clear how to trade? Does "beat the market this month" give you something to aim for? | | |
| 19 | **Real data:** Settings → Data → BUILD REAL DATA (a few hours, about 16 GB; see README_PLAY.md). | Did it finish? Does VIEW DATA REPORT look sensible? Does Career now deal real tickers (blind)? | | |
| 20 | **Look and sound:** music style and CRT style in Settings, The Pad, the title screen, reduced motion. | Does it feel like a retro-future desk? Any screen hard to read? | | |
| 21 | **New in 1.3.0: shaping a trade.** Use the sliders (Expires, Short Δ, Width, Conviction) and drag both strike handles on the chart. | Do the gauges, the green/red zones and the cushion bracket tell you enough while you move things? | | |
| 22 | **New: trade on a later day.** Press Space with no trade, read the recap's watchlist, then trade on day 2 or 3. | Does waiting feel like a real choice? Is the 10-day window about right? | | |
| 23 | **New: the sit-out skip** (K). Let the 5 days pass. | Worth it for the Tag and −10 stress? | | |
| 24 | **New: DESK/OS shop.** Read a few WHEN/GET cards and the BUILD.SYS window. | Do you understand a cartridge in a second? Can you see your combos building? | | |
| 25 | **New: option chain (Ctrl+5) and the roll dialog.** Click a bid to sell; open ROLL on a position. | Is the chain quick to use? Does the STAY vs ROLL chart make the choice clear? | | |
| 26 | **New: Developer mode** (Settings → Game). Take a note with a screenshot, then EXPORT .MD. | Is this useful for your notes? What else should the panel do? | | |
| 27 | **Mac:** install with `join-mac.sh` (see README_PLAY.md), then play a round. | Did it open? Do the keys (⌘ or Control, ⌥ Option) and the menu bar behave? Anything look off compared with Windows? | | |
| 28 | **New in 1.4.0: size and risk.** Move the Size slider on a credit spread. | Is it obvious that more contracts means more risk (the RISKING bar, LIKELY LOSS/GAIN)? | | |
| 29 | **New: the credit lands.** Sell a credit spread. | Does the big +$ CREDIT DEPOSITED and the BALANCE bump feel good? | | |
| 30 | **New: round goal card** (bottom of the lineup). Play a round. | Can you tell at a glance how far you are from winning, and what closing your open trades would do? | | |
| 31 | **New: expiration line and decisions.** Watch the dotted EXP line become solid after you trade. When a strike gets hit, press V (REVIEW CHART). | Can you judge the chart before choosing Close / Hold / Roll? Did candles ever go missing? | | |
| 32 | **New: greyed-out SELL.** Try to trade when you can't (no tickets, one trade per card). | Does the ⚠ message tell you what to fix? | | |
| 33 | **New: Schwab (read-only).** Settings → Data → Schwab: save keys, log in, CONNECT. | Did it connect? Any error text you didn't understand? | | |
| 34 | **New in 1.4.2: build from Schwab.** After connecting: step 4 **PULL FROM SCHWAB**, then step 5 **BUILD GAME DATA FROM SCHWAB** (after 4:15 pm New York time, to also get real option chains). Then play Live or a Career run. | Did the pull and build finish, and in how long? Does the line under step 4 show what `schwab.db` holds? Do the MODEL labels make sense? | | |
| 35 | **New: tougher round targets.** Play a Career run on Verticals. | Does round 1 now usually take two or more good trades? Is a missed Month (a write-up) a fair warning rather than the end? Too hard, too easy? | | |
| 36 | **New: covered calls and cash-secured puts.** Start an Income run (it asks for starting capital; try $50,000). Sell a covered call and let it expire below the strike; sell a put that expires above its strike. | Does SELL show the premium you collect? Does an out-of-the-money option expire worthless with the premium kept (no shares assigned)? | | |
| 37 | **New: strike lines.** Drag a strike line far past the chart's edge; try an iron condor. | Does the line stay pinned at the edge instead of vanishing? Can you drag both the put side and the call side of a condor? While dragging, are the labels on the right out of the way? | | |
| 38 | **New: your trades on the chart.** Open a trade and play a few days. | Can you see where the trade sits (the shaded box from entry to expiry, the SOLD tag) without it getting in the way? Does the expiration line keep up with the DTE slider? | | |
| 39 | **New: small fixes.** Career → CHALLENGE & OPTIONS (risk tiers); the shop with Ines talking. | Does the tier list read cleanly? Is Ines's box out of the way of the shop? | | |
| 40 | **New in 1.5.0: the tutorial, as a beginner would see it.** Career → TUTORIAL (START OVER if you've played it). Pretend you've never traded an option. Ideally, hand it to a friend who hasn't. | Does the desk start empty and light up one thing at a time? Is each lesson short enough to take in? Is anything said before it's shown, or shown without being explained? Does SKIP LESSONS turn everything on? | | |
| 41 | **New: open trades vs a planned trade on the chart.** Shape a trade on one card, then look at a card where a trade is open. | Bold solid "● YOUR" lines and an OPEN TRADE badge for a real trade, thin dashed PLAN lines and a "not placed yet" badge for a planned one. Can you tell them apart at a glance? | | |
| 42 | **New: which cards have trades.** Open trades on two cards and click around during the round. | Do the lineup cards' **● IN TRADE** banner (with live P/L) and **✓ CLOSED** banner make it obvious where your positions are? | | |
| 43 | **New: shop windows in plain words** (CARTRIDGES · powerups, YOUR BUILD · family bonuses, …) and **bigger messages** (the pop-ups in the middle of the screen). | Easier to read? Do the messages catch your eye now without getting in the way? | | |
| 44 | **New: covered calls and cash-secured puts against 500 assumed shares.** Start an Income run. Sell a covered call at delta .30, then at .15. Sell a cash-secured put. | Does the covered call show as bearish (a call above the price) and its chance of profit go **up** as the strike moves further away? Do P/L and equity count only the option, never the shares? Is "RISK IF IT JUMPS" clear? | | |
| 45 | **New: the screen recovers on its own.** Play normally; if the screen ever freezes again, wait 15 seconds. | Does it come back by itself with "The screen stopped responding and was restarted"? If so, send the `game.log` (Settings → OPEN LOG FOLDER): it now records the last 40 things the screen did before the freeze. | | |
| 46 | **New: The Pad with real art.** The Pad (title screen). Buy a desk, monitors, a chair, a plant, a lamp, a painting, a watch, a vehicle; put desk items on the desk. | Does everything sit in a sensible place in each of the four homes? Anything floating, overlapping or too small? | | |

**Anything else:** ideas, annoyances, things you'd pay for in a real game.
