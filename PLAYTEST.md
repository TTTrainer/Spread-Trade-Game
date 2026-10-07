# Playtest checklist

What changed since 1.6 (1.7.0, 1.8.0 and 1.8.1). The earlier checks are done and gone.

**The quickest way is in the game.** Turn on Settings → Game → **Developer mode**, press the **DEV** button (or Ctrl+Shift+D) and open **TEST CHECKLIST**. It lists the same checks as below, and for each one:

1. **▶ SET UP** takes you straight to the spot: the Trade Builder at the right lesson or ticker, a run with the boss or the rules it needs, the tutorial from the start, or Settings › Data. (A run check replaces the run you're in.)
2. Try it, then tick **✔ WORKS** or **✘ PROBLEM** and type a note.
3. When you're done, press **⤓ SAVE AS FILE**. It writes `test-checklist-<version>.md` with every result and note, plus your playtest notes from the DEV panel, and that's the file to send back. Your ticks are kept between sessions, so you can do a few at a time.

### Trade Builder

| # | Check | Since | What to look for |
|---|---|---|---|
| 1 | **Today's data and the freshness badge** | 1.7.0 | With Schwab connected the badge says ● LIVE in market hours, ✔ CURRENT after the close; otherwise ⚠ OUT OF DATE with how many trading days old. The ticker name sits top-left on the chart. |
| 2 | **Build any strategy** | 1.7.0 | Try a bull put, iron condor, iron fly, calendar and straddle; change a leg under LEGS (TRADE tab). Do credit, max loss, breakevens and POP match thinkorswim's Analyze tab? |
| 3 | **The full-size payoff** | 1.7.0 | Hover across prices; slide DATE and IV. Can you read breakevens, max profit and loss, today vs expiration and the expected move at a glance? What's missing? |
| 4 | **Studies on and off** | 1.7.0 | Toggle BB, EM, 2σ, S/R, SMA, EMA, Keltner, RSI, MACD, ATR and volume in the tray. Are these the studies you use? |
| 5 | **COPY ORDER** | 1.7.0 | Press COPY ORDER (Alt+C) and paste it into a note: does it read like thinkorswim's order line, every leg right? Nothing is ever sent. |
| 6 | **The ticker list: 50 in all** | 1.8.1 | ALL lists the game's 25, the 25 added for the builder (QQQ to SHOP) and the four index options. 1.8.0's second 25 (EEM to RDDT) are gone. |
| 7 | **Index options** | 1.8.1 | With Schwab connected, SPX (and XSP, NDX, RUT) load like any ticker, marked CASH-SETTLED. Do strikes and credits match thinkorswim's SPX weeklies? Without Schwab it says so plainly. |
| 8 | **The paper month** | 1.7.0 | The old Live month, now Trade Builder › PAPER MONTH: it starts 20 trading days back and plays to the latest close. |
| 9 | **PULL FROM SCHWAB** | 1.7.0 | Run PULL FROM SCHWAB: it saves two years for the builder's tickers and the latest close's chains. Then open a few in the Trade Builder. Any that fail? |
| 10 | **Game data built from Schwab** | 1.8.1 | Only if you use it: BUILD GAME DATA FROM SCHWAB, then start a Career run. The lineups deal only the game's 25 tickers (no QQQ, SOFI or SPX). |

### Learn Options

| # | Check | Since | What to look for |
|---|---|---|---|
| 11 | **The course from the top** | 1.8.0 | Go through the 13 lessons as if teaching a friend. Short and clear? Does each trade it sets up (call, put, short put, bull put, condor) show what the text says? |
| 12 | **A lesson with a question** | 1.8.0 | NEXT waits for your answer, and the explanation teaches whether you were right or wrong. Are the questions fair? |
| 13 | **The hands-on lessons** | 1.8.0 | Move the strike, then (next lessons) drag DATE to expiration and slide IV down. The ✓ comes the moment it's done. Does delta, theta and vega click, or is it busywork? |
| 14 | **Pick the strike like a pro** | 1.8.0 | EM and S/R are on. Move the short strike until POP reads 75–85%: is it past the expected move and a floor the chart respects? |

### Bosses

| # | Check | Since | What to look for |
|---|---|---|---|
| 15 | **The Collector's interest notice** | 1.7.0 | Leave a losing trade at or past a strike you sold through a close: an INTEREST NOTICE takes 5% of its risk off your score each day. Costly enough to make you close it? |
| 16 | **Margin Clerk: the width cap** | 1.7.0 | The Width slider stops at the widest spread whose one contract fits your risk cap. |
| 17 | **Tax Man: the first week** | 1.7.0 | A win closed within its first 5 trading days scores 25% less; the trade card counts the days down. |
| 18 | **Underwriter trophy: 5%** | 1.7.0 | The Review is cleared for you: the bounty pays, and the trophy screen shows the Underwriter's trophy at 5%. A prize worth having? |
| 19 | **Shell Company trophy: $2 off rerolls** | 1.7.0 | The Review is cleared for you: the trophy takes $2 off every reroll, and the shop prices show it. |
| 20 | **Rebalancer: the bigger race chart** | 1.7.0 | The YOU vs SPY race on the chart is bigger and easy to read while you trade. |
| 21 | **Early Retiree: the bigger duel** | 1.7.0 | The YOU vs CHAD race and Chad's trades are bigger and easy to follow. |

### Month menu

| # | Check | Since | What to look for |
|---|---|---|---|
| 22 | **Emblems and the deal-in** | 1.7.0 | Each round has an emblem and a name, dealt in like cards. Flashier, and still quick? |
| 23 | **The exit plan, shown** | 1.7.0 | Slide Take profit and Stop: the sample spread under YOUR BUILD shows what the plan does. After a few closes, the scorecard shows how your exits went. |
| 24 | **How each trade closed** | 1.7.0 | Close one at its target, take a planned stop, close one by hand: each payout is stamped TARGET BANKED, STOP TAKEN · saved $X or CLOSED BY HAND. Different enough? |

### Tutorial

| # | Check | Since | What to look for |
|---|---|---|---|
| 25 | **The practice trade** | 1.7.0 | Ines explains a strike, marks a floor or ceiling on the chart and builds a practice trade past it. Is the position spelled out, does the POP bar aim at 80%, and is REROLL where she points? |

### Trading

| # | Check | Since | What to look for |
|---|---|---|---|
| 26 | **Controls follow the rules** | 1.7.0 | Thin Books, Best Execution Audit and Attendance Policy are on: the size slider stops at 10, there's no market order, and no SIT OUT. |
| 27 | **Cashing out with market orders off** | 1.7.0 | Open two trades. When one hits its target, CASH OUT, then close the other: both go through and nothing gets stuck. |
| 28 | **One day recap at a time** | 1.8.1 | Open a trade and play several days quickly: yesterday's recap leaves before today's arrives, never two stacked. |

**Anything else:** ideas, annoyances, things you'd pay for in a real game. Add them as playtest notes in the DEV panel (with a screenshot if it helps) and they go into the same file.
