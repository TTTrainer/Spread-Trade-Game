# Spread Trading Game 1.8.2

A single-player roguelite about trading options spreads on real historical market data, now with a Trade Builder for today's market. Paper trading only; not financial advice.

## What's new in 1.8.2

- **The Joker Row:** your cartridges now sit along the top of the trading screen as game cartridges, in the order they fire, the shell colored by rarity (grey common, cyan uncommon, pink rare, gold legendary) with the cartridge's picture on the label, its name and what it adds. While you build a trade, the cartridges a win would set off glow and say what they'd add (+150 chips, +1 mult, ×2). The same cartridges appear in the shop, on YOUR DESK and in a desk's starting kit.
- **A new payout when a trade closes**, in three steps your eye can follow:
  1. **The register** prints the trade's receipt: the profit, the structure, your call, discipline and the rest. Each line's number flies off the receipt into a big **CHIPS × MULT** scoreboard.
  2. **A gold coin** runs along your cartridges in order. Each one it hits freezes for a beat, flashes and slams, pops what it added and why, and sends it to the scoreboard; the combo counter, the pitch and the shake build with every hit. Cartridges that don't apply let the coin pass, grey out and say what they need.
  3. **The jackpot:** chips × mult (× any score multiplier) lines up in the middle, the total slams in with the jackpot sound, then flies into your round score. Clearing the target sets it on fire.
  A loss prints on the register only (losses are never multiplied). Click, Space or Enter still skips; Settings › Game › payout speed still has FAST and OFF.
- **Whole numbers:** chips and points are shown ten times bigger, so every number is whole: "107 × 3.25 = 348" instead of "10.7 × 3.25 = 35". Targets, cartridge text and everything else that quotes points scale the same way, so nothing about the balance changes. The chips and mult on screen now multiply exactly to the total you're given.
- **Sounds:** chiptune chips and mult, a slam for each cartridge, a flat thunk for a miss, a receipt printer, and a new jackpot.

**Not in this release yet (next):** the Income desk first in Career, Ines's tutorial on a cash-secured put, and the reworked LEARN OPTIONS course (cash-secured puts and covered calls first).

**Known issue (unchanged):** rarely, when many trades close on the same day, the chart library logs an error ("reading 'time'"); the game keeps going.

## New in 1.8.1

- **50 tickers in all, as you meant:** the game's 25 plus the 25 added in 1.7.0. 1.8.0's second 25 (EEM through RDDT) are gone from the Trade Builder and from PULL FROM SCHWAB, so a pull is shorter. Anything already saved for them on your PC is left alone and never used.
- **Index options in the Trade Builder:** SPX, XSP (a tenth of SPX, sized for small accounts), NDX and RUT, in their own group under ALL. Type `SPX` or `$SPX`. They load live from Schwab like any ticker (PULL FROM SCHWAB saves them too), and the order ticket marks them **CASH-SETTLED**: European style, no early assignment, no shares at expiration. Their chains are huge, so the builder asks Schwab for the strikes nearest the money and narrows the request if Schwab turns it down. Where SPX lists two contracts on the same strike and day (the AM-settled monthly and the PM-settled weekly), the builder keeps the PM one.
- **Fix:** BUILD GAME DATA FROM SCHWAB had started sweeping the Trade Builder's extra tickers into the game's own market (since 1.7.0). Career lineups deal only the game's tickers again. If you built game data from Schwab since 1.7.0, build it once more.
- **A new test checklist** (Settings › Game › Developer mode, then DEV › TEST CHECKLIST): only what changed since 1.6, each check tagged with its release. **▶ SET UP** takes you straight to the spot (the Trade Builder at a ticker or a LEARN OPTIONS lesson, a run with the boss or rules it needs, the tutorial from the start, Settings › Data), and **SAVE AS FILE** writes one file with every result, note and playtest note, stamped with the version.
- **Fixes:** a LEARN OPTIONS task done in its first instant now shows its ✓; when days run fast, yesterday's recap leaves before today's arrives (two no longer stack); odd contracts (adjusted after a split, minis) no longer slip into a Schwab chain; the ticker list no longer has the chart's tabs drawn over it.

## New in 1.8.0 (the Trade Builder's second version)

- **LEARN OPTIONS** (the amber button in the Trade Builder): a 13-lesson course on the chart you have open, from a single call to credit spreads and iron condors, then managing the trade and the events that move it. Each lesson sets up its trade for you and asks one question (explained, right or wrong) or one thing to try: move the strike and watch POP, drag DATE to expiration to see time decay, slide IV down to see vega, land a bull put at about 80% POP. Progress is saved.
- Another 25 tickers (removed again in 1.8.1: you meant 50 in all).
- Single options are named and priced as themselves ("Long call", "Short put"), with thinkorswim's single-leg order line.
- The particle effects skip a frame they can't draw instead of raising an error on computers without a graphics card.

## New in 1.7.0

- **The Trade Builder** (replaces Live on the title screen). Open any ticker and build a real trade on today's market:
  - With Schwab connected (read-only market data), each ticker loads live: two years of daily prices and today's option chain. Without it, the newest saved data is used, and a badge says plainly how current it is (LIVE, CURRENT, or OUT OF DATE with how many trading days old).
  - **25 more tickers**, the next most heavily traded option markets (QQQ, IWM, TLT, GLD, SLV, XLF, SMH, XLE, UNH, MSTR, SOFI, INTC, BABA, F, BAC, MARA, RIVN, PYPL, WMT, XOM, C, SNAP, NIO, ARM, SHOP). PULL FROM SCHWAB now fetches two years of prices for each.
  - One-click **studies**: Bollinger Bands, the expected move and a new 2σ line, SMA 50/200, EMA 21, Keltner Channels, support and resistance, RSI, MACD, ATR, volume.
  - **Every strategy**, shaped with the sliders or edited leg by leg, sized in plain contracts.
  - **The payoff, full size**: at expiration, today and any day before, with an IV what-if, breakevens, max profit and loss, the expected move and where the price is likely to end, a hover readout, and the trade in plain words.
  - **COPY ORDER** copies the order as thinkorswim-style text. Nothing is ever sent to a broker.
  - The old Live month is still there: Trade Builder → PAPER MONTH.
- **Bosses:** the Collector now charges daily interest (5% of a trade's risk, in points) on a losing trade left at or past a strike you sold, on its own INTEREST NOTICE; the Margin Clerk's width slider stops at your cap; the Tax Man taxes wins closed in their first week; stronger trophies (the Underwriter's is 5%, the Shell Company's takes $2 off rerolls), a bigger bounty, and bigger race charts for the Rebalancer and the Early Retiree.
- **The month menu:** an emblem and a name for every round, dealt in like cards. The exit plan shows what it does on a sample spread as you move it, and how your closes have gone this run; every payout is stamped with how the trade closed.
- **The tutorial:** what a strike is, a practice trade built past a floor or ceiling Ines marks on the real chart, the position spelled out, and a live POP bar aiming for about 80%. REROLL and SIT OUT are always in view.
- **Smaller fixes:** the stock's name in the chart's top-left corner; controls follow the round's rules (contract limits, no SIT OUT under the Attendance Policy); cashing out with market orders off no longer gets stuck.

## Downloads

- **Windows:** `SpreadTradingGame-Setup-1.8.1.exe` (installer) or `SpreadTradingGame-Portable-1.8.1.exe` (no install).
- **Mac:** `SpreadTradingGame-mac-arm64-1.8.1.zip` (Apple chip) or `SpreadTradingGame-mac-x64-1.8.1.zip` (Intel). Unzip and drag **Spread Trading Game** into Applications.

The builds aren't signed with a paid certificate. On Windows, choose More info → Run anyway; on a Mac, if it says it "can't verify" the app, open System Settings → Privacy & Security and click Open Anyway. You only do this once.

It runs offline and starts on a built-in simulated market (labeled SIM). Real market data is built on your own computer; see `README_PLAY.md`.

Credits: options data from DoltHub's post-no-preference datasets (CC BY-SA 4.0); charts by TradingView Lightweight Charts.
