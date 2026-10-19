# Claude Code prompt — next trial, Signal Scoring v3
Unzip `trading_bot_package.zip`, open Claude Code in that folder, fill `<NN>` (next trial number;
MASTER_LOG shows Trial 01 done), paste the block.

```
Run Trial <NN>: Signal Scoring v3. $100,000 per ticker book. Tickers: AAPL, GOOGL, AMZN, MSFT,
NVDA. Daily bars. Mechanical execution only. Everything you need is in this folder.

FILES IN THIS FOLDER (read START_HERE.md first)
  simulator.py, signals.py, build_news.py, <TICKER>_2024_2026.csv x5
  docs/MASTER_LOG.md, docs/TRADING_TRIAL_PROTOCOL.md, docs/SIGNAL_SCORING_v3.md
Read docs in that order. SIGNAL_SCORING_v3 wins on signals/setups; the protocol wins on fills/sizing.

IF SOMETHING IS MISSING, DO NOT STOP TO ASK. Use these fallbacks and state them in prereg:
  - PROTOCOL_v2_OPTIONS.md / optionlib.py / option-chain data missing -> EQUITY ARM ONLY.
    Never use simulator.py's synthetic Black-Scholes `option` command for results.
  - news_<TICKER>.csv missing -> news = UNKNOWN_NEWS. Never web-search or LLM-score news.
  - USAGE_LOG.md missing -> create it.

DEFINITIONS (use exactly)
  sigma_median (annualised, decimal) = median of three, all from simulator `brief` on the
  visible bars:
    1. yang_zhang_vol_20d_ann                     (Yang-Zhang, 20 sessions)
    2. ewma_vol_ann                               (EWMA lambda 0.94, all visible bars)
    3. (atr14 / close) * sqrt(252) / 1.20         (ATR(14) converted to annual sigma)
  half_width = 1.50 * close * (sigma_median / sqrt(252)) * sqrt(H)      (MASTER_LOG §2)

PHASE 0 — PREFLIGHT (report a pass/fail table, then continue)
  1. python3 signals.py --selftest <TICKER>_2024_2026.csv passes for all 5.
  2. Simulator smoke test: init -> brief -> advance --n 5 -> report on one ticker; then delete
     that state file.
  3. Write prereg_<NN>.md BEFORE the first bar: thresholds, arms, fallbacks used, H1-H4 below,
     each with the observation that would refute it.

PHASE 1 — BUILD run_trial_<NN>.py (one driver; never read the CSVs yourself)
  - Advance all 5 books in lockstep by date. Import simulator as a module, stdout suppressed.
  - Each session per ticker: score = signals.score_frame(visible_bars).iloc[-1]
    (visible = through the prior close). Fills at the decision day's open.
  - Trade only when look == True. One open position per ticker per arm.
      FADE_GREED -> short     FADE_FEAR -> long     TREND_UP -> long     TREND_DOWN -> short
      SQUEEZE_WATCH, NONE, WARMUP -> no trade
  - Prediction on every look == True session, traded or not:
      H = 5 for FADE_*, 10 for TREND_* ; 80% interval from half_width above
      pdir = 0.50 + 0.15 * min(|driving score|, 1)   (EXH for FADE, CONT for TREND)
      expected exit price = interval edge in trade direction; expected exit date = H sessions
  - Exits: stop = max(2*ATR14, 4% of price); target 3*ATR14; time stop at H;
    close on setup flip to the opposite side.
  - Size: 1% equity risk to stop, capped at 25% of equity (enforce in driver).
  - Arms on identical sessions: A = v3 rules; B = control, direction flipped;
    C = random entry with matched count/side/hold (1,000 seeds -> p-value).
    Buy-and-hold only in sealed_benchmarks_<NN>.json, never in MASTER_LOG.
  - ledger.csv: one row per session x ticker x arm, every signals.py column, setup, look,
    action or reason for no action. No silent skips.

PHASE 2 — RUN end to end. No rule changes mid-run. Fix bugs, log them, restart from bar one.

PHASE 3 — EVALUATE (code, not judgment)
  - Each of c_bb, bb_bw_pr, c_macd_line, c_macd_hist, c_rsi, c_z5, c_trend, st_dir, CONT, EXH,
    LIS: Spearman IC vs forward 5/10/20-session log return (non-overlapping), edge vs each
    ticker's own up-rate, quintile table, n.
  - Each setup: n, hit rate vs base rate, mean R-multiple, profit factor, by arm.
  - Forecasts: coverage vs 80%, mean Winkler %, Brier vs 0.25, exit-date error by exit reason.
  - Portfolio: net P/L, profit factor, Sharpe, max DD, A vs B vs C, Deflated Sharpe.
  - H1 EXH has negative IC at H=5. H2 CONT has positive IC at H=10.
    H3 Arm A beats B and C on P/L per unit of risk. H4 look==True sessions have larger
    |forward return| than look==False.

PHASE 4 — WRITE BACK
  - trial_<NN>.md (protocol §7.1), trial_<NN>.json, ledger.csv, prereg_<NN>.md.
  - Amend docs/MASTER_LOG.md: add §11 SIGNAL SCORE TABLE (signal, H, n, IC, t, edge, verdict).
    Promote nothing below n = 200. Supersede, never delete.
  - Leak audit: reject any lesson with a date, price, ticker-tied outcome or named event.
  - Zip all outputs as trial_<NN>_results.zip for upload back to the claude.ai project.

Chat output: preflight table, then a final summary of at most 10 lines.
```
