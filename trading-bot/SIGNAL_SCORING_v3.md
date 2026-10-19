# SIGNAL SCORING v3.0 — one number per signal
**Layering:** MASTER_LOG → TRADING_TRIAL_PROTOCOL (v1) → PROTOCOL_v2_OPTIONS (spread game, if present) → **this doc**.
On conflict about *signals, scores or setups*, v3 wins. On fills, sizing, structures and exits, v2 wins.
**Code:** `signals.py` is the only implementation. It is causal (row t uses bars ≤ t; `--selftest`
proves it). Bots never compute an indicator by hand.

---

## 1. Purpose
Turn every signal into a **number the bot can rank, threshold and test**. A high number means
"look into this"; it is not a trade by itself. Every number is logged every session, traded or not,
so later trials can measure which numbers actually predicted anything.

**Two families, never averaged together** (trend and reversal cancel each other out):
- **CONT** (continuation): is a move being confirmed?
- **EXH** (exhaustion): is fear or greed extreme enough to be unsustainable? (project Rule 1)

All signed scores are in **[−1, +1]**, 0 = neutral, + = bullish/greedy. Percentiles are 0–100.

---

## 2. Signal → number

| Signal | Raw number (logged) | Score (−1..+1) | How to read it |
|---|---|---|---|
| **Bollinger position** | `bb_z = (C − SMA20)/SD20` (= 4·%B − 2) | `c_bb = clip(bb_z/2)` | ±1 = touching a band. Feeds EXH. |
| **Bollinger squeeze** | `bb_bw_pr` = 126d percentile of bandwidth `4·SD20/SMA20` | — | ≤ 10 = squeeze: a big move is likely, direction unknown. |
| **MACD trend** | `macd_line_atr = MACD(12,26)/ATR14` | `c_macd_line = clip(x / 2·RMS126(x))` | Sign = trend side; size relative to this stock's own history. |
| **MACD momentum** | `macd_hist_atr = (MACD − signal)/ATR14` | `c_macd_hist` (same normaliser) | Accelerating (+) or fading (−). |
| **MACD cross age** | `macd_cross_age` = ±bars since last signal cross | — | Small = fresh cross. Logged covariate only. |
| **RSI(14)** | `rsi` | `c_rsi = clip((RSI−50)/20)` | 70 → +1, 30 → −1. Feeds EXH. |
| **5-day reversal z** | `z5 = ln(C/C₋₅)/(σ20·√5)` | `c_z5 = clip(z5/2)` | ±2σ week = ±1. Strongest literature support (short-term reversal). |
| **Trend distance** | `dist50_atr = (C − SMA50)/ATR14` | `c_trend = clip(x/3)` | ±3 ATR from SMA50 = ±1. |
| **SuperTrend(10,3)** | `st_dir` ∈ {−1, +1} | used directly | Kept from v1 (best provisional label so far). |
| **Volume shock** | `vol_z` = z of log volume vs prior 20d | — | ≥ 1.5 = abnormal participation. |
| **Return shock** | `ret_z1 = 1d log return / prior σ20` | — | ≥ 2 = abnormal move. |
| **Gap** | `gap_atr = (O − C₋₁)/ATR14` | — | Logged covariate. |
| **Vol regime** | `rv_pr` = 252d percentile of σ20 | — | Sets range width context; not direction. |
| **News (numbers-backed)** | `news_n`, `news_sent` (vendor, −1..1), `news_z` | `nss` (below) | Only counts when price **and** volume confirm. |

### 2.1 News rule — "news must be backed by numbers"
```
confirm = clip(|ret_z1|/2)   if sign(ret_z1) == sign(news_sent) and vol_z ≥ 1.0,  else 0
nss     = news_sent × confirm
event day = |ret_z1| ≥ 2 and vol_z ≥ 1.5
  NEWS_MOVE     event + |news_sent| ≥ 0.15  → continuation bias (do NOT fade)
  NO_NEWS_MOVE  event + no qualifying news  → reversal bias (fade candidate)
  UNKNOWN_NEWS  no news feed loaded          → treat as unknown, never as "no news"
```
Basis: Chan (2003, *JFE*) — large moves **with** public news tend to drift; large moves **without**
news tend to reverse. Lopez-Lira & Tang: news drift lasts ~1–2 days and is fading. Swing use:
news sets the **side**, numbers decide whether it is real.

**News data rules:** point-in-time vendor feed only (e.g. Alpha Vantage `NEWS_SENTIMENT` with
`time_from/time_to`; free tier ~25 calls/day). Article must be published **before the close of
the scoring day**. Store first-seen timestamps. **No LLM-scored headlines on 2024–2026** — Claude's
training covers that window, so its "sentiment" can encode what happened next.

---

## 3. Composites and setups

```
CONT = mean(c_trend, c_macd_line, c_macd_hist, st_dir [, nss if news loaded])
EXH  = mean(c_bb, c_rsi, c_z5)                       # + = greed, − = fear
LIS  = 100 × max(|CONT|, |EXH|)                      # Look-Into Score, 0–100
look = LIS in its own trailing top 15% (126d) AND a setup fired   → ~12–14% of sessions
```

| Setup | Condition (pre-registered) | Bias | Spread (v2 §11.6) |
|---|---|---|---|
| `FADE_GREED` | EXH ≥ +0.75, nss < 0.25, not NEWS_MOVE | short | call credit spread at H |
| `FADE_FEAR` | EXH ≤ −0.75, nss > −0.25, not NEWS_MOVE | long | put credit spread at L |
| `TREND_UP` | \|EXH\| < 0.75, CONT ≥ +0.60 | long | debit call vertical to target, or put credit spread |
| `TREND_DOWN` | \|EXH\| < 0.75, CONT ≤ −0.60 | short | debit put vertical, or call credit spread |
| `SQUEEZE_WATCH` | bb_bw_pr ≤ 10, no other setup | none | long strangle only if RER ≥ 1.15 × RER_neutral |
| `NONE` / `WARMUP` | otherwise / < 60 bars | — | no trade, logged |

All spread trades still pass the v2 gates: RER gate, fear/greed v2 rubric veto, inverted-term
override, 1.5 % max loss per structure, 6 % aggregate, mechanical exit ladder.

---

## 4. How each number is tested (per trial, mechanical)
For every component and composite, against forward log return at H = 5, 10, 20 sessions:

| Metric | Definition | Promote only if |
|---|---|---|
| **IC** | Spearman(score at t, return t+1 → t+H), non-overlapping samples | IC > 0 with t ≥ 3 pooled, same sign on ≥ 4 of 5 tickers |
| **Edge vs base rate** | hit rate − ticker's own unconditional up-rate (same H) | > 0 after costs |
| **Monotonicity** | mean return by score quintile | rises across quintiles |
| **Control** | same rule, sign flipped | must lose to the real arm |

- **n ≥ 200** events before a signal is promoted (raised from 20 by Trial 02).
- Every threshold change = a new configuration; count it for the Deflated Sharpe Ratio.
- Thresholds above are **guesses, not tuned values**. The trial's job is to measure them.

## 5. Known limits
- 5 correlated mega-cap tech names, ~2.5 years, one broad regime. Low statistical power.
- No market-level fear gauge (VIX, breadth) in the data; EXH is single-stock only.
- `news_*` is empty until a point-in-time feed is built. Report `UNKNOWN_NEWS` honestly.
- First 59 sessions are warm-up (126d normaliser needs ≥ 60 bars).
