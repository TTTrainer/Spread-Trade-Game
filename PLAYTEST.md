# Playtest checklist

What changed since 1.6 (1.7.0 through 1.8.3). The earlier checks are done and gone.

**The quickest way is in the game.** Turn on Settings → Game → **Developer mode**, press the **DEV** button (or Ctrl+Shift+D) and open **TEST CHECKLIST**. It lists the same checks as below, and for each one:

1. **▶ SET UP** takes you straight to the spot: the Trade Builder at the right lesson or ticker, a run with the boss or the rules it needs, the tutorial from the start, or Settings › Data. (A run check replaces the run you're in.)
2. Try it, then tick **✔ WORKS** or **✘ PROBLEM** and type a note.
3. When you're done, press **⤓ SAVE AS FILE**. It writes `test-checklist-<version>.md` with every result and note, plus your playtest notes from the DEV panel, and that's the file to send back. Your ticks are kept between sessions, so you can do a few at a time.

### Cartridges and payout

| # | Check | Since | What to look for |
|---|---|---|---|
| 1 | **The shop as objects** | 1.8.3 | Take the spoils and look at the shop: cartridges, a clipped memo, a coupon, a game manual and an ID badge, text underneath, no boxes. Does buying feel better? |
| 2 | **Spoils you put off keep flashing** | 1.8.3 | Press DECIDE LATER on the spoils: ★ NEW CARTRIDGE · CHOOSE flashes in the taskbar until you take one. With 5 slots full, SELL flashes to make room. |
| 3 | **The Joker Row** | 1.8.2 | Your cartridges along the top as game cartridges, colored by rarity. Build a trade: the ones a win would fire glow and say what they add. |
| 4 | **Register, coin, jackpot** | 1.8.2 | Cash out a winner: the receipt prints into CHIPS × MULT, the coin hits each cartridge, the jackpot slams in. Is your eye always in the right place? |
| 5 | **Whole numbers** | 1.8.2 | Chips, points and targets are 10× bigger and whole (2,000 to clear Month 1). Does the jackpot math add up on screen? |
| 6 | **Income desk first** | 1.8.3 | Career lists Income first and picks it by default (Verticals is free too). It remembers the desk you last played. |

### Trading

| # | Check | Since | What to look for |
|---|---|---|---|
| 7 | **Keycap buttons that flash when it matters** | 1.8.3 | SELL, PLAY, NEXT ROUND and BUY are chunky keys that press down (hotkeys too). The one that matters flashes: SELL before your first trade, PLAY once one is placed. |
| 8 | **Top bar icons and alarms** | 1.8.3 | Cash, tickets and stress have beveled icons. Stress at 75 or more, and a target slipping out of reach, pulse red. |
| 9 | **The payoff opens in the TRADE column** | 1.8.3 | Build a trade and press PAYOFF: the full graph and its numbers open in the TRADE column and the chart stays. During a LEARN lesson it opens over the chart. |
| 10 | **Controls follow the rules** | 1.7.0 | Thin Books, Best Execution Audit and Attendance Policy are on: the size slider stops at 10, there's no market order, and no SIT OUT. |
| 11 | **Cashing out with market orders off** | 1.7.0 | Open two trades. When one hits its target, CASH OUT, then close the other: both go through and nothing gets stuck. |
| 12 | **One day recap at a time** | 1.8.1 | Open a trade and play several days quickly: yesterday's recap leaves before today's arrives, never two stacked. |

### Trade Builder

| # | Check | Since | What to look for |
|---|---|---|---|
| 13 | **Today's data and the freshness badge** | 1.7.0 | With Schwab connected the badge says ● LIVE in market hours, ✔ CURRENT after the close; otherwise ⚠ OUT OF DATE with how many trading days old. The ticker name sits top-left on the chart. |
| 14 | **Build any strategy** | 1.7.0 | Try a bull put, iron condor, iron fly, calendar and straddle; change a leg under LEGS (TRADE tab). Do credit, max loss, breakevens and POP match thinkorswim's Analyze tab? |
| 15 | **The full-size payoff** | 1.7.0 | Hover across prices; slide DATE and IV. Can you read breakevens, max profit and loss, today vs expiration and the expected move at a glance? What's missing? |
| 16 | **Studies on and off** | 1.7.0 | Toggle BB, EM, 2σ, S/R, SMA, EMA, Keltner, RSI, MACD, ATR and volume in the tray. Are these the studies you use? |
| 17 | **COPY ORDER** | 1.7.0 | Press COPY ORDER (Alt+C) and paste it into a note: does it read like thinkorswim's order line, every leg right? Nothing is ever sent. |
| 18 | **The ticker list: 50 in all** | 1.8.1 | ALL lists the game's 25, the 25 added for the builder (QQQ to SHOP) and the four index options. 1.8.0's second 25 (EEM to RDDT) are gone. |
| 19 | **Index options** | 1.8.1 | With Schwab connected, SPX (and XSP, NDX, RUT) load like any ticker, marked CASH-SETTLED. Do strikes and credits match thinkorswim's SPX weeklies? Without Schwab it says so plainly. |
| 20 | **The paper month** | 1.7.0 | The old Live month, now Trade Builder › PAPER MONTH: it starts 20 trading days back and plays to the latest close. |
| 21 | **PULL FROM SCHWAB** | 1.7.0 | Run PULL FROM SCHWAB: it saves two years for the builder's tickers and the latest close's chains. Then open a few in the Trade Builder. Any that fail? |
| 22 | **Game data built from Schwab** | 1.8.1 | Only if you use it: BUILD GAME DATA FROM SCHWAB, then start a Career run. The lineups deal only the game's 25 tickers (no QQQ, SOFI or SPX). |

### Learn Options

| # | Check | Since | What to look for |
|---|---|---|---|
| 23 | **Get paid to wait (the replay)** | 1.8.3 | Drag your line under the floor, SELL, then PLAY the month: a coin for every day no candle touches the line. Fun, or homework? Try another month too. |
| 24 | **The same trade as a picture** | 1.8.3 | Today's put on the P/L chart, and one question on where it starts losing. Does the picture click after the replay? |
| 25 | **Pick a safer line** | 1.8.3 | EM and S/R are on. Move the short strike until POP reads 75–85%: is it past the expected move and under a floor? |
| 26 | **The covered call replay** | 1.8.3 | The same game upside down: your call line over the ceiling, and the month plays out. Clear why it is safe when you own the shares? |
| 27 | **Your first trade, coached** | 1.8.3 | Build a put on today's chart: each checklist step ticks as you do it, then PLAY tests the setup on last month. Does the badge feel earned? |
| 28 | **More lessons** | 1.8.3 | After the vertical: delta, time decay, IV, the expected move, condors, managing and events. The call and put buying lessons are gone. |

### Bosses

| # | Check | Since | What to look for |
|---|---|---|---|
| 29 | **The Collector's interest notice** | 1.7.0 | Leave a losing trade at or past a strike you sold through a close: an INTEREST NOTICE takes 5% of its risk off your score each day. Costly enough to make you close it? |
| 30 | **Margin Clerk: the width cap** | 1.7.0 | The Width slider stops at the widest spread whose one contract fits your risk cap. |
| 31 | **Tax Man: the first week** | 1.7.0 | A win closed within its first 5 trading days scores 25% less; the trade card counts the days down. |
| 32 | **Underwriter trophy: 5%** | 1.7.0 | The Review is cleared for you: the bounty pays, and the trophy screen shows the Underwriter's trophy at 5%. A prize worth having? |
| 33 | **Shell Company trophy: $2 off rerolls** | 1.7.0 | The Review is cleared for you: the trophy takes $2 off every reroll, and the shop prices show it. |
| 34 | **Rebalancer: the bigger race chart** | 1.7.0 | The YOU vs SPY race on the chart is bigger and easy to read while you trade. |
| 35 | **Early Retiree: the bigger duel** | 1.7.0 | The YOU vs CHAD race and Chad's trades are bigger and easy to follow. |

### Month menu

| # | Check | Since | What to look for |
|---|---|---|---|
| 36 | **Emblems and the deal-in** | 1.7.0 | Each round has an emblem and a name, dealt in like cards. Flashier, and still quick? |
| 37 | **The exit plan, shown** | 1.7.0 | Slide Take profit and Stop: the sample spread under YOUR BUILD shows what the plan does. After a few closes, the scorecard shows how your exits went. |
| 38 | **How each trade closed** | 1.7.0 | Close one at its target, take a planned stop, close one by hand: each payout is stamped TARGET BANKED, STOP TAKEN · saved $X or CLOSED BY HAND. Different enough? |

### Tutorial

| # | Check | Since | What to look for |
|---|---|---|---|
| 39 | **Ines teaches a cash-secured put** | 1.8.3 | The tutorial runs on the Income desk: Ines marks a floor and sells a put under it, then you sell your own. Is it clear what happens if it ends under the strike? |

**Anything else:** ideas, annoyances, things you'd pay for in a real game. Add them as playtest notes in the DEV panel (with a screenshot if it helps) and they go into the same file.
