# Spread Trading Game 1.6.1

A single-player roguelite about trading options spreads on real historical market data. Paper trading only; not financial advice.

## What's new

- **The payout.** Closing a trade now plays its score out, Balatro style: the P/L lands as chips, every bonus fires in order with the CHIPS and MULT counters ticking, each cartridge jumps and shows what it added (the ones that did nothing stay dim), the pitch climbs with each step, and the total slams into your score. Clearing the round sets it on fire. Click, Space or Enter skips; Settings → "Payout when a trade closes" offers FULL, FAST or OFF.
- **Boss rewards on two screens.** The trophy first (a permanent buff, with exactly what it changed, before → after), then the pick of 3 free cartridges.
- **Covered calls on pricey stocks.** Covered calls now carry an automatic stop (1×, 1.5×, 2× or 3× the premium, picked on the ticket) that sizes their risk, so they fit on high-priced stocks. The stop fires without asking and can only be tightened.
- **Shop layout.** One layout at every screen size: nothing runs off the screen at 1536 wide (1920 at 125% scaling) or hides under the bottom bar at 1366.
- **Harder runs.** Regular Months ask more and grow faster, and less of a big round carries into the next, so a strong build can't coast; boss rounds stay about 9 in 10 (the year-end boss about 7 in 10) for a careful player. Every Risk Tier now also adds +10% to targets, so a strong player can climb into more pressure (Career → CHALLENGE & OPTIONS).
- **Bag Holder** gives +1 mult on winners (was +3): with tighter targets it had become the strongest cartridge by far.
- The month menu's pause switches now apply to the run you're playing.

## Downloads

- **Windows:** `SpreadTradingGame-Setup-1.6.1.exe` (installer) or `SpreadTradingGame-Portable-1.6.1.exe` (no install).
- **Mac:** `SpreadTradingGame-mac-arm64-1.6.1.zip` (Apple chip) or `SpreadTradingGame-mac-x64-1.6.1.zip` (Intel). Unzip and drag **Spread Trading Game** into Applications.

The builds aren't signed with a paid certificate. On Windows, choose More info → Run anyway; on a Mac, if it says it "can't verify" the app, open System Settings → Privacy & Security and click Open Anyway. You only do this once.

It runs offline and starts on a built-in simulated market (labeled SIM). Real market data is built on your own computer; see `README_PLAY.md`.

Credits: options data from DoltHub's post-no-preference datasets (CC BY-SA 4.0); charts by TradingView Lightweight Charts.
