# Spread Trading Game 1.8.0

A single-player roguelite about trading options spreads on real historical market data, now with a Trade Builder for today's market. Paper trading only; not financial advice.

## What's new in 1.8.0 (the Trade Builder's second version)

- **LEARN OPTIONS** (the amber button in the Trade Builder): a 13-lesson course on the chart you have open, from a single call to credit spreads and iron condors, then managing the trade and the events that move it. Each lesson sets up its trade for you and asks one question (explained, right or wrong) or one thing to try: move the strike and watch POP, drag DATE to expiration to see time decay, slide IV down to see vega, land a bull put at about 80% POP. Progress is saved.
- **Another 25 tickers** (75 in the Trade Builder): EEM, KRE, XBI, USO, FXI, LLY, V, MA, JNJ, PFE, MRNA, KO, PEP, MCD, NKE, SBUX, T, VZ, CSCO, QCOM, CVX, DAL, CCL, DKNG, RDDT.
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

- **Windows:** `SpreadTradingGame-Setup-1.8.0.exe` (installer) or `SpreadTradingGame-Portable-1.8.0.exe` (no install).
- **Mac:** `SpreadTradingGame-mac-arm64-1.8.0.zip` (Apple chip) or `SpreadTradingGame-mac-x64-1.8.0.zip` (Intel). Unzip and drag **Spread Trading Game** into Applications.

The builds aren't signed with a paid certificate. On Windows, choose More info → Run anyway; on a Mac, if it says it "can't verify" the app, open System Settings → Privacy & Security and click Open Anyway. You only do this once.

It runs offline and starts on a built-in simulated market (labeled SIM). Real market data is built on your own computer; see `README_PLAY.md`.

Credits: options data from DoltHub's post-no-preference datasets (CC BY-SA 4.0); charts by TradingView Lightweight Charts.
