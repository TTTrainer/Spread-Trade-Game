# Claude Code prompt — next trial, Signal Scoring v3 (15 tickers)
Open Claude Code in the `Options Signal Bot` folder, set `<NN>` (use 03: a Trial 02 was run in a
chat but its results never reached MASTER_LOG), and paste the block.

```
Run Trial <NN>: Signal Scoring v3. $100,000 per ticker book. Daily bars. Mechanical execution only.
Everything you need is in this folder (flat layout, no subfolders).

UNIVERSE (this trial's one rule change vs Trial 01: universe expanded from 5 to 15)
  Trade:   AAPL GOOGL AMZN MSFT NVDA  (core 5, report as their own subgroup)
           META TSLA JPM BA COST NFLX AMD CRM COIN GME  (added)
  Context: SPY DIA VIX. Do NOT use them in any signal this trial.

READ FIRST, IN ORDER: START_HERE.md, MASTER_LOG.md, TRADING_TRIAL_PROTOCOL.md,
SIGNAL_SCORING_v3.md, DATA_MANIFEST.md. SIGNAL_SCORING_v3 wins on signals/setups; the protocol
wins on fills/sizing. Never open a price CSV yourself; only simulator.py and signals.py read them.

IF SOMETHING IS MISSING, DO NOT STOP TO ASK. Use these fallbacks and state them in prereg:
  - PROTOCOL_v2_OPTIONS.md / optionlib.py / option-chain data missing -> EQUITY ARM ONLY.
    Never use simulator.py's synthetic Black-Scholes `option` command for results.
  - news_<TICKER>.csv missing -> news = UNKNOWN_NEWS. Never web-search or LLM-score news.
  - USAGE_LOG.md missing -> create it.
  - Do not use web search or fetch any live/current market data during the trial.

ATTENTION DATA (logged covariate only, not a signal this trial)
  attention_<TICKER>.csv: date, views, views_z (Wikipedia pageviews; views_z = log views vs the
  prior 20 sessions). Row D is usable for the decision that fills at the open after D, exactly like
  signals.py rows. Log views_z in the ledger. It must not change any entry, exit or size.

DEFINITIONS (use exactly)
  sigma_median (annualised, decimal) = median of three, all from simulator `brief`:
    1. yang_zhang_vol_20d_ann   2. ewma_vol_ann   3. (atr14 / close) * sqrt(252) / 1.20
  half_width = 1.50 * close * (sigma_median / sqrt(252)) * sqrt(H)      (MASTER_LOG §2)
  Promotion rule: SIGNAL_SCORING §4 "same sign on >= 4 of 5 tickers" becomes
  "same sign on >= 80% of tickers" (12 of 15). Counts as part of this trial's configuration.

PHASE 0 — PREFLIGHT (report a pass/fail table, then continue)
  1. python3 signals.py --selftest <TICKER>_2024_2026.csv passes for all 15 trade tickers.
  2. Every trade CSV and attention CSV has 647 rows on the same dates as AAPL_2024_2026.csv.
  3. Simulator smoke test: init -> brief -> advance --n 5 -> report on one ticker; delete its state.
  4. pip install -r requirements.txt; python3 test_framework.py prints ALL TESTS PASSED.
  5. Set "trial" in trial_config.json, then python3 run_trial_<NN>.py --prereg writes
     prereg_<NN>.md BEFORE the first bar (config hash, universe, thresholds, arms, fallbacks,
     H1-H5 with refutation lines). Review and edit it before running.

PHASE 1 — DRIVER: copy run_trial_template.py to run_trial_<NN>.py and AUDIT it against every
  bullet below (it is built on market.py / engine.py, which import simulator.py's fill and
  scoring rules; see FRAMEWORK.md). Fix any mismatch in code and log it. Do not rebuild it.
  - Advance all 15 books in lockstep by date.
  - Each session per ticker: score = signals.score_frame(visible_bars).iloc[-1]
    (visible = through the prior close). Fills at the decision day's open.
  - Trade only when look == True. One open position per ticker per arm.
      FADE_GREED -> short   FADE_FEAR -> long   TREND_UP -> long   TREND_DOWN -> short
      SQUEEZE_WATCH, NONE, WARMUP -> no trade
  - Prediction on every look == True session, traded or not:
      H = 5 for FADE_*, 10 for TREND_*; 80% interval from half_width
      pdir = 0.50 + 0.15 * min(|driving score|, 1)   (EXH for FADE, CONT for TREND)
      expected exit price = interval edge in trade direction; expected exit date = H sessions
  - Exits: stop = max(2*ATR14, 4% of price); target 3*ATR14; time stop at H;
    close on setup flip to the opposite side.
  - Size: 1% equity risk to stop, capped at 25% of equity (enforce in driver).
  - Arms on identical sessions: A = v3 rules; B = control, direction flipped;
    C = random entry with matched count/side/hold (1,000 seeds -> p-value).
    Buy-and-hold only in sealed_benchmarks_<NN>.json, never in MASTER_LOG.
  - ledger.csv: one row per session x ticker x arm, every signals.py column, views_z, setup,
    look, action or reason for no action. No silent skips.

PHASE 2 — RUN end to end: python3 run_trial_<NN>.py --run --zip (about 10 minutes).
  No rule changes mid-run. Fix bugs, log them, restart from bar one.

PHASE 3 — EVALUATE (code, not judgment). Report everything for ALL 15 and for the CORE 5.
  The run writes all of this to trial_<NN>_out/trial_<NN>.json via evaluate.py (groups ALL,
  CORE, ADDED; hypotheses table H1-H5). Read it from there; do not recompute by hand.
  - Each of c_bb, bb_bw_pr, c_macd_line, c_macd_hist, c_rsi, c_z5, c_trend, st_dir, CONT, EXH,
    LIS, views_z: Spearman IC vs forward 5/10/20-session log return (non-overlapping), edge vs
    each ticker's own up-rate, quintile table, n.
  - Each setup: n, hit rate vs base rate, mean R-multiple, profit factor, by arm.
  - Forecasts: coverage vs 80%, mean Winkler %, Brier vs 0.25, exit-date error by exit reason.
  - Portfolio: net P/L, profit factor, Sharpe, max DD, A vs B vs C; Deflated Sharpe.
  - H1 EXH has negative IC at H=5. H2 CONT has positive IC at H=10.
    H3 Arm A beats B and C on P/L per unit of risk. H4 look==True sessions have larger
    |forward return| than look==False. H5 the core-5 result has the same sign as the added-10.

PHASE 4 — WRITE BACK
  - trial_<NN>.md (protocol §7.1), trial_<NN>.json, ledger.csv, prereg_<NN>.md.
  - Amend MASTER_LOG.md: add §11 SIGNAL SCORE TABLE (signal, H, n, IC, t, edge, verdict).
    Promote nothing below n = 200. Supersede, never delete.
  - Leak audit: reject any lesson with a date, price, ticker-tied outcome or named event.
    Copy MASTER_LOG.md to MASTER_LOG.before.md before editing, then run
    python3 leak_audit.py --since MASTER_LOG.before.md MASTER_LOG.md and python3 leak_audit.py
    trial_<NN>.md. Both must PASS. Delete MASTER_LOG.before.md afterwards.
  - Charts: trial_<NN>_out/charts/ (equity by arm, post-mortems of the best/worst arm-A trades)
    show what led predictions astray. They contain outcomes: keep them in the results zip only.
  - Zip all outputs as trial_<NN>_results.zip: python3 run_trial_<NN>.py --zip (after writing
    trial_<NN>.md; it does not re-run the trial). Upload it back to the claude.ai project.

Chat output: preflight table, then a final summary of at most 10 lines.
```
