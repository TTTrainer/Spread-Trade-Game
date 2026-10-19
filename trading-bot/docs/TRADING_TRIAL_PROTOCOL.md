# TRADING TRIAL PROTOCOL — v1.0
### Context document for all trial bots in this project. Read this first, every trial.

---

## 0. WHAT THIS PROJECT IS

A walk-forward, single-ticker, no-look-ahead trading experiment on daily (1-day candlestick) OHLCV
data for **AAPL, MSFT, GOOGL, AMZN, NVDA**, covering **2024-01-02 → 2026-07-31 (647 bars)**.

Two strategy families are in scope:
- **A. Swing trading** on the equity (long and short, multi-day to multi-week holds).
- **B. Longer-term option income** — selling cash-secured puts (CSP) and covered calls (CC), i.e. the wheel.

Every trial produces: trades, **predicted price ranges** (scored), and **insights** that are merged
into `MASTER_LOG.md`. The point is not to get rich in the sim. The point is to build a
**progressively better, empirically-defensible decision procedure**.

---

## 1. THE SIMULATOR

`simulator.py` is the only legal way to touch price data. **Never open the CSVs directly.**
The simulator physically withholds the decision day's OHLC until you call `advance`.

### 1.1 Setup
```bash
mkdir -p ~/trial && cd ~/trial
cp /mnt/project/simulator.py .          # or wherever it lives
python3 simulator.py init --ticker AAPL --start 2024-07-01 --capital 100000
```
`--start` must leave warmup bars. **Use `--start 2024-10-17` or later if you need SMA200**
(the dataset begins 2024-01-02, so 200 bars land on 2024-10-17). For trials that don't need
SMA200, `2024-07-01` gives 124 warmup bars and 522 tradeable days.

### 1.2 The daily loop
```bash
python3 simulator.py brief                 # everything you are allowed to know
python3 simulator.py chart --bars 60       # ASCII candlesticks of visible window
# ... reason ...
python3 simulator.py predict --low 205 --high 222 --horizon 10 --dir up --pdir 0.62 \
        --signals "sma10>sma20,ST=up,RSI61" --rationale "..."
python3 simulator.py trade --action BUY --shares 200 --stop 203.5 --target 228 \
        --exit-price 226 --exit-date 2024-07-16 --signals "..." --thesis "..."
python3 simulator.py option --type CSP --delta 0.25 --dte 30 --contracts 1 --signals "..."
python3 simulator.py insight --kind rule-tweak --text "..." --confidence medium
python3 simulator.py advance                # step 1 day; prints stops/targets/expiries/scores
python3 simulator.py advance --n 5          # skip quiet days in bulk
python3 simulator.py report --out trial_AAPL_01.json
```

### 1.3 Command reference

| Command | Purpose | Key flags |
|---|---|---|
| `init` | Start a trial, write `state_<TICKER>.json` | `--ticker --start --capital --trial-id` |
| `brief` | Decision packet: indicators as of **prior close**, last 10 bars, account, open predictions, carried insights, suggested option strikes | — |
| `chart` | ASCII candlesticks + SMA20, visible window only | `--bars --rows` |
| `predict` | Log a range forecast, auto-scored later | `--low --high --horizon --conf --dir --pdir --signals --rationale` |
| `trade` | BUY / SELL / SHORT / COVER, fills at **decision-day open + slippage** | `--shares --stop --target --exit-price --exit-date --signals --thesis --id` |
| `option` | Sell a CSP or CC; strike by `--delta` or explicit `--strike` | `--type --delta --strike --dte --contracts --iv` |
| `news` | Record a dated headline; **rejects any date after the prior close** | `--date --headline --sentiment --source --note` |
| `insight` | Append to the trial's running insight log | `--kind --text --confidence` |
| `advance` | Resolve one (or `--n`) bars: stops, targets, expiry, assignment, prediction scoring | `--n` |
| `report` | Full metrics + trade/prediction detail | `--out file.json` |

### 1.4 Fill and cost model (what the sim assumes)
- Market orders fill at the **decision day's open**, ± 2 bps slippage.
- Stops/targets check the intraday range. **Gaps through a level fill at the open**, not the level.
  If both stop and target are touched in one bar, the **stop wins** (conservative).
- Stock commission $0; option commission $0.65/contract; **option fills at mid − 3%** (you sell the bid).
- CSP ties up `strike × 100 × contracts` in cash. CC requires 100 shares/contract already long.
- Options expire at `dte × 252/365` trading days out; European-style settlement at the close,
  assignment if ITM. **No early exercise, no dividend-driven early call assignment.**

### 1.5 Option premium is SYNTHETIC — read this
There is no historical option data in this project. The simulator prices options with
**Black-Scholes using Yang-Zhang 20-day realized volatility × (1 + 10% VRP wedge)**.
Consequences you must state in every options trial:
- **No volatility smile/skew.** OTM puts are systematically *underpriced* vs reality, so your
  simulated CSP premium is conservative-to-wrong in a way that varies with moneyness.
- **No earnings vol run-up or post-earnings crush.** Selling premium into earnings looks
  artificially unattractive here.
- **No term-structure.** 30 DTE and 45 DTE use the same flat IV.
- This is the project's **single largest data gap**. See §8 and §9 for how to close it.

---

## 2. THE TRIAL PROTOCOL (non-negotiable)

1. **One ticker per trial, one trial per prompt/session.** Never carry price knowledge of a later
   date into an earlier decision, and never use one ticker's future to trade another.
2. **You may only look at what `brief` shows you.** No CSV reads, no `tail`, no pandas on the raw file.
3. **News must be dated ≤ the prior close.** If you web-search, restrict to items published on or
   before that date and log them via `simulator.py news`. The command rejects future dates.
   Be honest: if you cannot verify a publication date, don't use the item.
4. **Every trade needs, recorded at entry:** the signals used, direction, a stop, a target, an
   **expected exit price** and **expected exit date**. The report scores your exit-timing error.
5. **Every trade decision needs a range prediction** logged first (`predict`), so the forecast is
   scored independently of whether you traded it.
6. **Insights go in as you go**, not retroactively. They are the deliverable.
7. **At the end**, run `report --out`, then write the trial doc and merge into `MASTER_LOG.md`.
8. **Trial docs must not leak the future.** Write "when RSI > 70 with declining volume, my 10-day
   upper bound was too low" — NOT "AAPL rallies to $260 in November." See §7.

---

## 3. PREDETERMINED SIGNAL SET

Do not invent new indicators mid-trial. If you want one, log it as a `gap` insight and add it to
the master doc for the *next* trial. `brief` computes all of these on the visible slice only.

**Trend:** SMA 10/20/50/200, EMA 9/21, `sma10_gt_sma20`, `px_vs_sma50_pct`,
SuperTrend(10, 3.0) direction and line.
**Momentum:** RSI(14), MACD(12,26,9) line/signal/histogram, 1d/5d/20d returns.
**Volatility / range:** ATR(14) and ATR%, Bollinger(20, 2) upper/mid/lower and %B,
**Yang-Zhang 20-day annualized vol** (the primary width estimator), EWMA(λ=0.94) vol.
**Structure:** 20-day high/low, 52-week high/low, % from 52-week high, overnight gap %.
**Participation:** volume, 20-day volume ratio.

### 3.1 Baseline entry rules (v1 — beat these or explain why not)
- **Long swing:** `supertrend_dir == +1` **AND** `sma10 > sma20` **AND** `vol_ratio_20d ≥ 1.0`
  **AND** `rsi14 < 70`. Stop at `close − 2 × ATR14`. Target at `close + 3 × ATR14`.
- **Short swing:** mirror image (`supertrend_dir == −1`, `sma10 < sma20`, `rsi14 > 30`).
- **Confluence requirement:** the swing-signal literature is consistent that no single indicator
  works alone; require **at least 3 of {trend, momentum, volume, structure}** to agree.
- **No-trade default.** Most days are no-trade days. Sitting out is a valid, recorded decision.

### 3.2 Fear/greed sustainability filter (Rule 1)
Before any entry, score the setup on this rubric and **veto entries in the direction of the crowd
when the score is extreme**:

| Signal | Greed (+1 each) | Fear (−1 each) |
|---|---|---|
| RSI(14) | > 70 | < 30 |
| Bollinger %B | > 1.0 | < 0.0 |
| Distance from SMA50 | > +10% | < −10% |
| Volume ratio | > 2.0 on an up day | > 2.0 on a down day |
| 5-day return | > +8% | < −8% |
| News tone (logged items) | uniformly bullish | uniformly bearish |

**Score ≥ +4 → do not initiate new longs** (unsustainable greed; consider CC or a short setup).
**Score ≤ −4 → do not initiate new shorts** (unsustainable fear; this is prime CSP territory).
Score between −3 and +3 → normal rules apply.
This is the *contrarian-at-extremes* finding from the sentiment literature (§9.6): sentiment
predicts reversal at extremes, not in the middle of the distribution.

---

## 4. RANGE PREDICTIONS AND HOW THEY ARE SCORED

Every prediction is a **closed interval on the close price, H trading days ahead**, with a stated
confidence and a directional probability.

The simulator scores it with the **Winkler / interval score** (Gneiting & Raftery 2007), expressed
as a percentage of the reference price. **Lower is better:**

```
IS = (high − low) + (2/α)·(low − y)·1{y<low} + (2/α)·(y − high)·1{y>high}
     where α = 1 − confidence,  y = realized close
winkler_pct = 100 × IS / reference_close
```

The first term punishes lazy wide intervals; the last two punish misses in proportion to how far
outside you were. **You cannot game this by widening or narrowing alone.** Direction is separately
scored with the **Brier score** (0.25 = coin flip; below 0.25 is skill).

### 4.1 How to set the width (the empirically defensible way)
Use the Yang-Zhang vol from `brief`, not intuition:
```
daily_sigma = yang_zhang_vol_20d_ann / sqrt(252)
half_width  = k × close × daily_sigma × sqrt(horizon_days)
```
Start with **k = 1.28 for an 80% interval** (normal quantile). Then **calibrate**: the report gives
`empirical_coverage` vs `nominal_coverage`. If coverage < nominal, raise k; if coverage > nominal,
lower k. Log the calibrated k as an insight. Daily equity returns are fat-tailed, so expect the
honest k to land **above** 1.28 — that finding is itself a result worth recording.

### 4.2 Target metrics to beat (set in trial 1, tightened thereafter)
- `empirical_coverage` within **±0.05** of nominal.
- `mean_winkler_pct` lower than the naive baseline (a ±1.28σ√H random-walk interval with no signal).
- `mean_brier` **< 0.25**.
- Record all three in the master doc so later trials can see whether the procedure is improving.

---

## 5. OPTION-SELLING RULES (CSP / CC)

**Priors, not proven optima.** Retail consensus is 0.20–0.30 delta and 30–45 DTE; treat these as
starting points to be tested, not as truth.

- **CSP:** sell only when the fear/greed score ≤ −2 (elevated fear = richer premium, and you want
  to own the stock at the strike). Strike at 0.20–0.30 delta. Be genuinely willing to be assigned.
- **CC:** sell only against shares you already hold, and only when the fear/greed score ≥ +2
  (greed = you're capping upside you don't expect to get). Strike at 0.20–0.30 delta, above your
  cost basis.
- **Never sell a CC below your cost basis** — the called-away loss is realized and permanent.
- **Roll rule (record it, then test it):** close/roll at 50% of max profit or at 21 DTE,
  whichever comes first. The simulator does not auto-roll; you must act.
- **Attribution requirement:** at the end of an options trial, decompose P&L into
  **(a) underlying move** and **(b) premium collected**. The best public wheel backtests find the
  underlying dominates (>90% of return in one SPY study). If your trial shows the same, say so —
  the wheel is then a levered-long-plus-carry strategy, not independent alpha.
- **Expect negative skew.** Short puts win often and lose big. Report the worst single trade, not
  just the win rate.

---

## 6. POSITION SIZING AND RISK

- **Risk per trade ≤ 1.0% of equity**, defined by the stop distance:
  `shares = floor(0.01 × equity / (entry − stop))`.
- **Volatility targeting:** scale size inversely to Yang-Zhang vol so each position carries
  comparable risk across regimes and tickers.
- **Sizing ceiling: half-Kelly.** Full Kelly produces routine 50%+ drawdowns; half-Kelly retains
  most of the growth rate with far less pain, and buffers the fact that your edge estimate is noisy.
- **Max 25% of equity in one position** (simulator guard).
- **Stops are contested empirically** — they help in trending/momentum regimes and hurt in
  mean-reverting ones. Do not assume. Log stop-outs separately and check whether the trade would
  have recovered; report that as a regime observation.

---

## 7. OUTPUTS: TRIAL DOC AND MASTER LOG

### 7.1 Trial doc (one per trial): `trial_<TICKER>_<NN>.md`
```markdown
# Trial <NN> — <TICKER> — <start> to <end>
## 1. Configuration used  (rule version, k, deltas, DTE, sizing)
## 2. Headline metrics     (paste report: performance / trades / forecasting blocks)
## 3. Calibration          (coverage vs nominal, calibrated k, Brier)
## 4. What worked          (signal → outcome, with counts, not anecdotes)
## 5. What failed and why  (failure MODES, not price levels)
## 6. Exit-timing analysis (exit_date_mae_days, exit_price_mae_pct — what made me early/late?)
## 7. Proposed rule changes for the next trial  (explicit, testable)
## 8. Methodological gaps observed
```

### 7.2 Leak discipline — the hard part
A trial doc is read by a bot that will trade an **earlier** date on another ticker. So:

| ❌ Never write | ✅ Write instead |
|---|---|
| "NVDA gapped down 15% on 2025-01-27" | "A single-session gap larger than 4× ATR broke my stop model; gaps need separate handling" |
| "The Aug 2024 selloff…" | "In a high-vol regime (YZ vol > 0.40), my 10-day intervals under-covered by 18pts" |
| "Tech rallied into year-end" | "Trend-following entries had a higher hit rate when SMA50 slope was positive for 15+ sessions" |
| Any specific future price, date, or event | The *conditional rule* the episode taught you |

**Test:** could a reader use this sentence to know what a price does on a date they haven't
simulated yet? If yes, rewrite it.

### 7.3 Master log
The first trial **creates** `MASTER_LOG.md`; every later trial **amends** it. Sections:
`Rule Version History` · `Calibration Constants` (k by ticker and vol regime) ·
`Signal Performance Table` (signal, n, hit rate, mean Winkler) · `Confirmed Failure Modes` ·
`Open Questions` · `Methodological Gaps`. Never delete an entry — supersede it with a dated note.

---

## 8. STATISTICAL DISCIPLINE (the part that makes this science, not curve-fitting)

You are running 5 tickers × 2 strategy families × many parameter choices. That is **dozens of
implicit trials**, and the finance literature is unambiguous that this manufactures false discoveries.

1. **Count your trials.** Log every configuration attempted, including abandoned ones. Undercounting
   is how backtest overfitting happens.
2. **Raise the bar.** Harvey–Liu–Zhu argue a new factor needs **t > 3.0**, not 2.0, given data mining.
   Apply the same to any claimed edge here.
3. **Deflate the Sharpe.** Before writing "this works" in the master doc, apply the
   **Deflated Sharpe Ratio** (adjusts for number of trials, skew, kurtosis, sample length).
   A raw Sharpe from 500 days and 20 configs is close to meaningless.
4. **Always report the benchmark.** The report includes `buy_hold_return_pct` and
   `excess_vs_buy_hold_pct` for the same window. In a 2024–2026 mega-cap tech sample, buy-and-hold
   is a brutally strong benchmark. Beating it is the bar.
5. **Prefer simple.** In volatility forecasting, EWMA/random-walk is famously hard to beat; in
   trading rules, most fail after data-snooping correction. Adopt complexity only when it beats
   the simple baseline **on the interval score, out of sample**.
6. **Purge and embargo** if you ever fit parameters: exclude training observations whose outcome
   window overlaps the test window, plus an embargo equal to your max holding period.

### Known methodological gaps in this project (state these in every report)
| Gap | Impact | Fix |
|---|---|---|
| Synthetic option premia (no skew, no earnings IV) | Options P&L is directionally indicative only | Buy real chains (§9.5) |
| Sample is 5 correlated mega-cap tech names, 2.5 yrs, one regime-ish | Findings may not generalize | Add non-tech / a bear sample |
| News is manually logged, not systematic | Sentiment layer is subjective and sparse | Point-in-time news API (§9.6) |
| No dividends or corporate actions modeled | Small drag on CC and long holds | Use `adjusted_close` for return calcs |
| European-style expiry, no early assignment | Overstates CC returns near ex-div | Note it; a binomial model would fix |
| No multiple-testing correction implemented in code | False-discovery risk | Add DSR/PBO calc (§9.1) |
| Agent-in-the-loop judgment is not reproducible | Two runs of "the same" strategy differ | Log every decision's inputs verbatim |

---

## 9. RESEARCH LIBRARY

Links may move; search the title if a URL 404s.

### 9.1 Backtest overfitting & multiple testing — *highest-value free reading*
- Bailey & López de Prado, **The Deflated Sharpe Ratio** (2014) — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551
- Harvey & Liu, **Backtesting** (haircut Sharpe ratios) — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2345489
- Harvey, Liu & Zhu, **…and the Cross-Section of Expected Returns** (the t>3 argument) — https://www.nber.org/papers/w20592
- Bailey, Borwein, López de Prado & Zhu, **The Probability of Backtest Overfitting** — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253
- Sullivan, Timmermann & White, **Data-Snooping, Technical Trading Rule Performance, and the Bootstrap** (7,846 rules on the DJIA) — https://onlinelibrary.wiley.com/doi/10.1111/0022-1082.00163
- López de Prado, *Advances in Financial Machine Learning* (purging/embargo/CPCV; paid ~$60–75) — https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086

### 9.2 Scoring interval forecasts
- Gneiting & Raftery, **Strictly Proper Scoring Rules, Prediction, and Estimation** (2007) — https://www.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf
- Xu & Xie, **Conformal prediction interval for dynamic time-series (EnbPI)** — https://arxiv.org/abs/2010.09107
- Gibbs & Candès, **Adaptive Conformal Inference Under Distribution Shift** — https://arxiv.org/abs/2106.00170
- Xu & Xie, **Sequential Predictive Conformal Inference** — https://arxiv.org/abs/2212.03463

### 9.3 Volatility & range estimation
- Yang & Zhang (2000), **Drift-Independent Volatility Estimation from OHLC** (~14× the efficiency of close-to-close) — https://www.jstor.org/stable/10.1086/209650
- Corsi (2009), **A Simple Approximate Long-Memory Model of Realized Volatility (HAR-RV)** — https://academic.oup.com/jfec/article/7/2/174/856522
- Parkinson (1980) and Garman & Klass (1980) are the earlier range estimators the YZ paper builds on.

### 9.4 Option selling, VRP, and the honest caveats
- Bondarenko, **Historical Performance of Put-Writing Strategies** (CBOE, 2019; PUT index 1986–2018) — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3393940
- Bakshi & Kapadia (2003), **Delta-Hedged Gains and the Negative Market Volatility Risk Premium** — https://academic.oup.com/rfs/article/16/2/527/1581908
- Carr & Wu (2009), **Variance Risk Premiums** — https://academic.oup.com/rfs/article/22/3/1311/1581425
- Dew-Becker & Giglio (2025), **The Decline of the Variance Risk Premium** — option alphas have converged toward zero over the last ~15 years — https://www.chicagofed.org/publications/working-papers/2025/2025-17
- CBOE strategy-index dashboards (free history for BXM / PUT / BXMD) — https://www.cboe.com/us/indices/dashboard/bxm/ · https://www.cboe.com/us/indices/dashboard/put/
- Euan Sinclair, *Volatility Trading* — the one practitioner text that is statistically serious (paid).

**Flag:** CBOE index Sharpes are partly backfilled and gross of implementation drag, and the VRP has
decayed since ~2010. Do not extrapolate 1990s premia into a 2024–2026 sim.

### 9.5 Closing the options-data gap (do this if options become central)
- **Alpha Vantage `HISTORICAL_OPTIONS`** — free tier, full daily chains **with IV and greeks** — https://www.alphavantage.co/documentation/#historical-options
- **DoltHub options database** — free, SQL-queryable, greeks + IV from 2019 — https://www.dolthub.com/repositories/post-no-preference/options
- **ThetaData** — ~$40–80/mo, EOD + greeks, best cheap paid option — https://www.thetadata.net/
- **ORATS** — ~$99/mo delayed API with smoothed IV surfaces — https://orats.com/
- **Databento** — pay-as-you-go raw OPRA from 2023 (no precomputed greeks) — https://databento.com/
- **CBOE DataShop** — source-of-record, ~$400+/mo — https://datashop.cboe.com/

### 9.6 News, sentiment, and point-in-time integrity
- Tetlock (2007), **Giving Content to Investor Sentiment** — media pessimism → short-horizon pressure then reversion — https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.2007.01232.x
- Da, Engelberg & Gao (2011), **In Search of Attention** — search volume predicts ~2-week gains then reversal — https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.2011.01679.x
- Baker & Wurgler sentiment index and data — https://pages.stern.nyu.edu/~jwurgler/
- CNN Fear & Greed methodology (7 components) — https://www.cnn.com/markets/fear-and-greed
- AAII Sentiment Survey (contrarian at ±2 SD, 6–12 month horizon) — https://www.aaii.com/sentimentsurvey
- Data sources with usable timestamps: GDELT (https://www.gdeltproject.org/), Finnhub
  (https://finnhub.io/), EDGAR full-text search (https://www.sec.gov/edgar/search/).
- **Look-ahead traps:** outlets revise timestamps and content after publication; archives backfill;
  retracted stories disappear (survivorship). Always store the **first-seen** timestamp.

### 9.7 Sizing, stops, and costs
- Thorp, **The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market** — https://www.eecs.harvard.edu/cs286r/courses/fall12/papers/Thorpe_KellyCriterion2007.pdf
- Harvey et al., **The Impact of Volatility Targeting** — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3175538
- Kaminski & Lo, **When Do Stop-Loss Rules Stop Losses?** — https://www.sciencedirect.com/science/article/abs/pii/S1386418113000700
- Market impact for liquid large caps follows the **square-root law**; at retail size, cost is
  dominated by the spread, and for options by the (much wider) option spread.

### 9.8 Baseline technical-analysis evidence (already partly in project knowledge)
- Brock, Lakonishok & LeBaron (1992) — MA crossover rules, ~90 years of DJIA — https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1992.tb04681.x
- Lo, Mamaysky & Wang (2000) — kernel-regression chart-pattern evaluation — https://onlinelibrary.wiley.com/doi/10.1111/0022-1082.00265
- Gervais, Kaniel & Mingelgrin (2001) — the high-volume return premium.

### 9.9 Tooling worth installing
`arch` (GARCH **and** the SPA/Reality Check bootstrap) https://bashtage.github.io/arch/ ·
`scoringrules` https://github.com/frazane/scoringrules ·
`properscoring` https://github.com/properscoring/properscoring ·
`MAPIE` (conformal) https://github.com/scikit-learn-contrib/MAPIE ·
`skfolio` (CombinatorialPurgedCV) https://github.com/skfolio/skfolio ·
`quantstats` https://github.com/ranaroussi/quantstats ·
`QuantLib-Python` https://github.com/lballabio/QuantLib-SWIG ·
`py_vollib` https://github.com/vollib/py_vollib ·
`pandas-ta` https://github.com/twopirllc/pandas-ta ·
`vectorbt` https://github.com/polakowo/vectorbt

---

## 10. TRIAL PROMPT TEMPLATE

Paste this to start each trial. Fill the four blanks. This is the "how to update the instructions"
answer: keep the protocol in this doc and keep the prompt short, so the prompt never drifts from the
protocol.

```
Run Trial <NN> on <TICKER>, starting <START_DATE>, $100,000 capital,
strategy family: <swing | options | both>.

Follow TRADING_TRIAL_PROTOCOL.md exactly. Specifically:
- Use simulator.py only. Never read the CSVs.
- Start with: python3 simulator.py init --ticker <TICKER> --start <START_DATE> --capital 100000
- Each day: brief -> (chart if the setup is unclear) -> predict -> trade/option if warranted -> insight -> advance.
- Use --n on advance to skip days where brief shows no signal confluence, but log why.
- Apply the fear/greed veto (§3.2) before every entry.
- Size every range prediction from Yang-Zhang vol (§4.1), then recalibrate k mid-trial.
- Read MASTER_LOG.md first and apply its current rule version and calibration constants.
- At the end: report --out trial_<TICKER>_<NN>.json, write trial_<TICKER>_<NN>.md,
  then amend MASTER_LOG.md.
- Leak discipline (§7.2): no prices, dates, or events in the write-ups. Conditional rules only.
```

### Efficiency notes for the trial bot
- ~520 decision days is too many to narrate individually. **Budget: full analysis on days where
  `brief` shows ≥3 signal confluence or an open position needs management; `advance --n 3..5`
  otherwise, with a one-line reason logged.** Aim for 30–60 fully-reasoned decision days per trial.
- Call `chart` sparingly — only when the numeric indicators are ambiguous about structure.
- Batch `advance` through option holding periods, but stop and re-brief at 21 DTE for the roll check.
- The `report` JSON is the artifact. Don't hand-transcribe numbers into the trial doc; paste them.
