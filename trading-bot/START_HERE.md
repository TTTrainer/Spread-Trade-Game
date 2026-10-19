# START HERE — what Claude Code needs, and what this folder has

To run a trial, Claude Code needs four things: **price data**, **a simulator**, **the rules**, and
**the trial prompt**. This folder has all four for a stock-trading (equity) trial. The options-spread
part and news data are optional add-ons, listed at the bottom.

## What's in the folder

| Need | File(s) | Status |
|---|---|---|
| **Price data** | `AAPL/GOOGL/AMZN/MSFT/NVDA_2024_2026.csv` | ✅ 647 daily bars each, 2024-01-02 → 2026-07-31, includes `adjusted_close`. No other data source needed. |
| **Simulator** | `simulator.py` (v1.0) | ✅ Day-by-day, hides future bars, fills at next open, scores range predictions. |
| **Signal scoring** | `signals.py` | ✅ One number per signal (Bollinger, MACD, RSI, etc.). Self-test proves no look-ahead. |
| **Rules** | `docs/MASTER_LOG.md`, `docs/TRADING_TRIAL_PROTOCOL.md`, `docs/SIGNAL_SCORING_v3.md` | ✅ |
| **Trial prompt** | `CLAUDE_CODE_TRIAL_PROMPT_v3.md` | ✅ Paste into Claude Code, opened in this folder. |
| News builder | `build_news.py` | ✅ Converts GDELT news counts into `news_<TICKER>.csv` once the raw data exists. |
| Export prompt | `EXPORT_SIMULATOR_PROMPT.md` | For your *other* Claude Code project (see below). |
| Project settings text | `docs/PROJECT_INSTRUCTIONS.md` | Paste into claude.ai Project settings → Instructions. |

## Answers to the questions Claude Code asked

1. **The 5 CSVs** — included. Don't use DoltHub.
2. **The simulator** — `simulator.py` is included; don't build a fresh one. It handles stock trades.
   The spread-trading version (`optionlib.py`, `PROTOCOL_v2_OPTIONS.md`, option-chain data) lives in
   your other Claude Code project. Until you export it, trials run **stocks only**.
3. **Protocol docs** — `MASTER_LOG.md` and `TRADING_TRIAL_PROTOCOL.md` are included.
   `PROTOCOL_v2_OPTIONS.md` is not (same reason as above). **This is not Trial 01**: the master
   log already records Trial 01.
4. **`sigma_median`** — defined in MASTER_LOG §2 and spelled out in the trial prompt:
   the median of (a) Yang-Zhang 20-day vol, (b) EWMA vol with λ = 0.94, and
   (c) ATR(14) ÷ close × √252 ÷ 1.20. All annualised, all from the simulator's `brief`.

## Still missing (optional — the trial runs without them)

| Item | Effect if missing | How to get it |
|---|---|---|
| Spread-game files (`optionlib.py`, `PROTOCOL_v2_OPTIONS.md`, chain data) | No options arm | Run `EXPORT_SIMULATOR_PROMPT.md` in the other project, add its zip contents to this folder |
| Latest `MASTER_LOG.md` | This copy only reflects Trial 01; Trial 02 updates may be in the other project | Same export brings the latest copy; replace `docs/MASTER_LOG.md` |
| `news_<TICKER>.csv` | News counts as unknown | Collect GDELT data in claude.ai, then run `build_news.py` |
| Added tickers: META, TSLA, JPM, BA, COST, NFLX, AMD, CRM, COIN, GME (+ SPY, DIA, VIX as context) | Universe stays at the 5 tech names | Paste `DATA_FETCH_PROMPT.md` into Claude Code on your PC; upload the zip it makes |

**In the game repo:** this folder is `trading-bot/`. The price CSVs are not committed (the repo
never commits data). Unzip the package's CSVs into `trading-bot/` before a trial.

## Steps
1. Unzip this folder. Open Claude Code in it.
2. Paste the block from `CLAUDE_CODE_TRIAL_PROMPT_v3.md`, with `<NN>` set to the next trial number.
3. When it finishes, upload `trial_<NN>_results.zip` back to the claude.ai project.
