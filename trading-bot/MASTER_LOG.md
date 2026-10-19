# MASTER LOG — Cumulative Strategy Knowledge

**Status:** 1 trial completed (Trial 01, AAPL, swing equity).
**Rule version in force:** v1.0. **v1.1 is proposed but NOT adopted** — see §1.
**Resource accounting:** see `USAGE_LOG.md` (created by Trial 01).

> Every trial amends this file. **Never delete an entry** — supersede it with a dated note.
> **Never write a price, date, or event that would leak the future to a bot simulating an earlier
> period.** Conditional rules only. See protocol §7.2.

---

## 0. READ THIS FIRST — the one-paragraph state of the project

v1.0 has been run once, on one ticker, unmodified, and **it lost money and was beaten badly by
buy-and-hold** (profit factor 0.88, Sharpe −0.23, 26 trades). That is a useful result. The
forecasting layer is in better shape than the trading layer: trend-following direction labels beat
a coin flip, and interval calibration is close to nominal once `k` is raised above the normal
quantile. The most valuable output of Trial 01 is not a strategy but **six named failure modes and
one measured, uncomfortable finding: hand-reasoned agent judgement scored worse than the mechanical
rule it was supervising.** Trial 02 should change **one** rule (R1), run mechanically, and see if
profit factor clears 1.0.

---

## 1. RULE VERSION HISTORY

| Version | Set by trial | Change | Rationale |
|---|---|---|---|
| v1.0 | — | Baseline: SuperTrend + SMA10/20 + volume ≥ 1.0× + RSI filter; 2×ATR stop, 3×ATR target; fear/greed veto at ±4 | Initial, from project literature (confluence over single indicators) |
| v1.1 **(PROPOSED, NOT ADOPTED)** | 01 | R1 vol-regime gate · R2 signal exit · R3 k = 1.50 with **inverse** regime scaling · R4 relaxed volume filter · R5 time stop · R6 realized-risk reporting · R7 mechanical execution | Trial 01 §8. **Adopt one at a time** — R1 first — or attribution is lost. |

---

## 2. CALIBRATION CONSTANTS

`half_width = k × close × (σ/√252) × √H`, where **σ = median(YZ_20d, EWMA_ann, ATR14_pct×√252/1.20)**.
Using the median rather than YZ alone is a Trial 01 addition: on days when the estimators diverge,
YZ is usually the stale outlier, because its 20-day window absorbs a regime break slowly in both
directions.

| Ticker | Vol regime | Horizon | k | Empirical coverage | Set by |
|---|---|---|---|---|---|
| ~~ALL~~ | ~~any~~ | ~~any~~ | ~~1.28~~ | ~~untested~~ | ~~—~~ *(superseded by Trial 01)* |
| ALL | any | 10–13 | **1.50** (default) | 68 % at 1.28 → 86–88 % at 1.45–1.65 | 01 |
| AAPL | low vol (σ < 0.22) | 10–13 | **raise above default** | 47.1 % at the k actually used (n = 17) | 01 |
| AAPL | high vol (σ ≥ 0.22) | 10–13 | **lower toward default** | 82.0 % (n = 50) | 01 |

**Standing hypothesis — CONFIRMED (provisionally, n = 76).** The honest k exceeds 1.28. Solving
for the multiplier each forecast needed: **80th percentile = 1.58**, median 0.61, 90th = 2.18.

**NEW STANDING FINDING — and it is counterintuitive, so read the mechanism.** Intervals
**under-cover in CALM regimes and are well calibrated in VOLATILE ones.** Volatility mean-reverts,
so a trailing estimator is biased **low at a vol trough** and **high at a vol peak**. Estimator
error is therefore correlated with the regime, and scaling k *with* trailing vol amplifies the
error instead of correcting it. **Scale k inversely to trailing vol, or better, shrink the vol
estimate toward its own long-run mean before computing width.**

**Objective conflict to resolve:** coverage-honest k ≈ 1.58, Winkler-optimal k ≈ 1.45. The
protocol asks for both without ranking them. **Recommendation: coverage is primary, Winkler is
the tiebreak.**

---

## 3. SIGNAL PERFORMANCE TABLE

Promote to "confirmed" only at **n ≥ 20** *and* after surviving protocol §8. Everything below is
**provisional**.

| Signal / combination | n | Dir. hit rate | Mean Winkler % | Mean trade P&L | Verdict | Trial |
|---|---|---|---|---|---|---|
| Trend label (SuperTrend + SMA10/20), mechanical | 40 | **62.5 %** (Brier 0.2377) | 22.5 | — | **provisional — beats coin flip** | 01 |
| Contrarian label (deliberate control arm) | 40 | 37.5 % (Brier 0.2772) | 22.5 | — | control, performs as designed | 01 |
| **Agent discretionary direction call** | 9 | **22.2 %** (Brier 0.2798) | 19.1 | — | **provisional — worse than the control** | 01 |
| v1.0 entry, LONG | 14 | — | — | **+1,659 net**, 50 % win | provisional | 01 |
| v1.0 entry, SHORT | 12 | — | — | **−3,674 net**, 33 % win | provisional, **heavily confounded** | 01 |
| v1.0 entry, calm regime (σ < 0.22), mechanical | 4 | — | — | +1,069 net, 50 % win | **too few to read** | 01 |
| v1.0 entry, high-vol regime (σ ≥ 0.22), mechanical | 13 | — | — | **−5,227 net**, 31 % win | provisional | 01 |

---

## 4. CONFIRMED FAILURE MODES

| # | Failure mode | Trigger condition | Mitigation | Trial |
|---|---|---|---|---|
| FM1 | **No exit rule exists.** Position drifts past thesis invalidation because neither bracket is touched | SuperTrend flips or 10/20 recrosses against an open position | R2: close on signal flip regardless of bracket | 01 |
| FM2 | **The 1 % risk budget is not a bound.** Stops fill at the open when price gaps through | Any overnight gap beyond the stop | Report realized risk vs plan (R6); do not build Kelly/vol-targeting on the nominal 1 % | 01 |
| FM3 | **Risk budget and position cap fight, in the wrong direction.** Cap binds in calm vol (realized risk ~0.77 %), risk rule binds in high vol (full 1 %) | ATR% low → 2×ATR stop tight → share count hits the 25 % cap | Widen the stop floor in calm regimes, e.g. `max(2×ATR14, 4 % of price)` | 01 |
| FM4 | **The volume filter is the binding constraint and may select for late entries** | Steady advance with no news shock: current volume sits at/below its own 20-day average by construction | R4: `vol_ratio ≥ 1.0 OR price at a 20-day extreme` | 01 |
| FM5 | **Pooled exit-date error is meaningless — traverse time is bimodal** | Always | Score exit timing per exit-reason bucket; log a fast-path date (≈0.4× ATR traverse) and a give-up date (1.0×) | 01 |
| FM6 | **Realized payoff falls short of the nominal bracket ratio.** Stops fill at or beyond the level; targets fill at it | 2×ATR/3×ATR bracket | A nominal 1.5:1 needs a higher hit rate than 1.5:1 implies; size the bracket off realized, not nominal, payoff | 01 |
| FM7 | **A vol estimator's error is correlated with the regime it is measuring** | Vol trough or vol peak | Shrink σ toward its long-run mean; scale k inversely to trailing vol | 01 |

### 4.1 SUPERSEDED HYPOTHESES — recorded so they are not rediscovered

| Hypothesis | Origin | Fate | Trial |
|---|---|---|---|
| Veto entries when `bb_pctB` is outside 0.05–0.95 ("extension veto") | 2 losing trades shared the structure | **REFUTED** by a pre-registered discriminating trade, then again by a marginal test. Threshold too fine to survive rounding. | 01 |
| Regime-conditional k: **raise** k in high vol, **lower** in calm | intuition, mid-trial | **REFUTED AND INVERTED.** Coverage was 47 % in calm vs 82 % in high vol. See §2. | 01 |
| 2×ATR stops are "noise stops" that are too tight | 2 stop-outs with signals still intact | **NOT SUPPORTED.** 3 of 3 stop-outs checked: target was never reached before the opposite signal fired. | 01 |
| Trend-following direction labels are inverted at H ≈ 10 | trend label ran 2-for-9 early | **REFUTED at full sample** (62.5 %, Brier 0.2377). Was small-sample noise. **The decision not to act on n = 9 was correct.** | 01 |

---

## 5. EXIT-TIMING LESSONS

| Pattern | Effect on `exit_date_mae_days` | Adjustment | Trial |
|---|---|---|---|
| Target exits arrive **fast** — ~⅓ to ½ of the ATR-traverse estimate | 6.8 d (best bucket) | Log a fast-path date at ≈0.4× the traverse estimate | 01 |
| Stop exits arrive on their own schedule, unrelated to the traverse model | 13.7 d | Score separately; do not pool | 01 |
| Signal/manual exits are the worst by far | 27.0 d | Fixed by R2 (an actual exit rule) | 01 |
| **Pooling all three** | 11.5 d — describes no real population | Always report per-bucket | 01 |
| A trade that has not worked by the give-up date **does not later work** | — | R5: test a time stop at the give-up date | 01 |

---

## 6. OPTION-SELLING LEDGER

| Config (delta / DTE / regime) | n | Win rate | Assignment rate | Premium share of P&L | Worst trade | Trial |
|---|---|---|---|---|---|---|
| *(empty — Trial 01 traded no options)* | | | | | | |

Reminder: if premium is a small share of P&L, the wheel is levered long exposure, not alpha.
Trial 01 note: with synthetic Black-Scholes premia and no skew, a CSP trial run today would
measure the pricing model as much as the strategy. **Close the options-data gap (protocol §9.5)
before spending a trial on the wheel.**

---

## 7. BENCHMARK SCOREBOARD

> **PROTOCOL CONFLICT — unresolved.** §8.4 requires reporting `buy_hold_return_pct`; §7.2 forbids
> leaking what price does in a window a later bot has not simulated. On correlated mega-cap tech
> names the benchmark return leaks across tickers too. **Trial 01 withholds the figure here and
> keeps it only in `trial_AAPL_01.json`.** The project must choose: either express the benchmark
> as a percentile of random-entry buy-and-hold windows, or keep all benchmark figures in a file
> that trial bots are not given.

| Trial | Ticker | Window | Strategy return % | Buy & hold % | Excess % | Sharpe | Max DD % | Coverage gap | Mean Brier |
|---|---|---|---|---|---|---|---|---|---|
| 01 | AAPL | 521 trading days | **−2.11** | *withheld* | *large and negative* | **−0.23** | **−7.0** | **−0.067** | **0.2377** (trend arm; headline 0.2631 is control-contaminated) |

---

## 8. OPEN QUESTIONS

1. ~~Does the fear/greed veto improve or degrade risk-adjusted return?~~ → **UNANSWERABLE AS
   SPECIFIED.** The rubric's news-tone row was unscored, and the ±4 threshold never once fired in
   521 sessions on five price rows. **Restated: is a ±4 composite threshold reachable at all on
   single-name price data, or does the rubric need per-row thresholds?** (01)
2. Is the honest `k` stable across regimes? → **NO, and it moves opposite to intuition.**
   Restated: does *shrinking σ toward its long-run mean* outperform *scaling k by regime*? (01)
3. Do 2×ATR stops help or hurt? → **For AAPL in this window, they helped: 3 of 3 stop-outs never
   reached target before the opposite signal.** Needs pooling across tickers and a down-window. (01)
4. In an options trial, what share of P&L is premium vs underlying drift? → untouched.
5. Does the volume filter justify the lost trades? → **It vetoed every long through one sustained
   advance.** Restated: do the trades it *permits* have a worse hit rate than the ones it vetoes? (01)
6. Is short-side performance systematically worse? → **Suggestive (−3,674 vs +1,659) but severely
   confounded** by a strongly rising benchmark. **Do not answer from up-windows alone.** (01)
7. **NEW:** Does the volatility regime gate (R1) survive on another ticker, and does it work as an
   absolute level or only as a percentile of that ticker's own vol distribution? (01)
8. **NEW:** Agent discretion scored *worse* than the mechanical rule on direction (22 % vs 62 %).
   Is there any decision in this pipeline where agent judgement measurably beats a rule? If not,
   the agent's role is hypothesis formation and analysis only. (01)
9. **NEW:** Realized payoff fell short of the nominal 1.5:1 bracket. What bracket ratio is needed
   for a 42 % hit rate to break even after realistic fills? (01)

---

## 9. METHODOLOGICAL GAPS (carried forward)

- [ ] Synthetic Black-Scholes option premia — no skew, no earnings IV, no term structure.
- [ ] Universe is 5 correlated mega-cap tech names over ~2.5 years; limited regime diversity.
- [x] **News/sentiment: now understood to be structurally unavailable to an LLM agent, not merely
      sparse.** Web search returns present-day retrospectives; the agent's own memory of a
      historical window is post-hoc. **Trial 01 logged zero news items on purpose.** Needs a
      point-in-time API behind a wrapper the agent cannot see around. Until then, state in every
      trial that the fear/greed rubric ran on five rows, not six.
- [ ] No dividends or corporate actions modeled.
- [ ] European-style expiry; no early assignment / ex-dividend call risk.
- [ ] No multiple-testing correction (DSR / PBO) implemented in code.
- [x] **Agent judgement is not reproducible — and Trial 01 measured the cost.** Discretionary
      direction calls hit 22.2 % vs 62.5 % mechanical. **Mitigation adopted: mechanical execution
      by default (R7).**
- [ ] **NEW — the simulator cannot mark a prediction as a control arm.** 40 deliberately-inverted
      control intervals were folded into headline `mean_brier`, and their duplicated intervals
      double-counted in `empirical_coverage`. **Needs a `--control` flag on `predict`.**
- [ ] **NEW — §8.4 vs §7.2 benchmark-reporting conflict** (see §7 above).
- [ ] **NEW — no audit trail of skipped sessions.** Two execution defects silently advanced
      sessions with no decision, so Trial 01's trade count is a **lower bound**. Trial 01 now
      writes `skiplog.txt`; **make a reconciled skip audit a protocol requirement.**
- [ ] **NEW — SMA200 unavailable for the first ~60 decision days** at the recommended start.
      Needs a project-level decision, not a per-trial one.
- [ ] **NEW — verbose tool echoes are ~40 % of the context budget.** A `--quiet` mode on
      `trade`/`predict`/`insight` would cut it with zero information loss. See `USAGE_LOG.md`.

---

## 10. STANDING INSTRUCTIONS FOR THE NEXT TRIAL BOT

1. Read this file, then `USAGE_LOG.md`, then the protocol.
2. **Run v1.0 + R1 only.** One change. Everything else identical, so the delta is attributable.
3. **Build the compression layer first** (`scan.py`-equivalent) before the first decision, or the
   trial will not fit in one context window. See `USAGE_LOG.md` §2.2 for the 160× figure.
4. **Go mechanical from the first trade**, not halfway through. Pre-register hypotheses in prose;
   execute in code.
5. **Pre-register every hypothesis against a discriminating trade before the outcome.** Trial 01's
   most valuable content came from four such tests, two of which refuted my own proposals.
6. **Do not act on n < 20.** Trial 01 nearly inverted a signal on n = 9 that turned out to have
   real skill at n = 40. Log a control arm instead of changing the rule.
7. Append your resource numbers to `USAGE_LOG.md` §1 and add a detail block.
