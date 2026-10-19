# Simulator framework — how the pieces fit

`simulator.py` (CLI, one ticker, JSON state) and `signals.py` stay the reference. The framework
runs all books in memory, in lockstep, and imports their math and fill rules instead of copying
them, so both paths follow the same rules.

| File | Job | Reads the future? |
|---|---|---|
| `market.py` | `MarketView`: loads every CSV, enforces one shared calendar, and only shows rows dated **before** the decision day. `full_bars()` raises until the run ends. | Never during a run |
| `engine.py` | `Engine` + `Book` per ticker × arm: fills at the decision day's open ± 2 bps, stops/targets on that day's bar (gap fills at open, stop beats target), range predictions scored at the close with the simulator's Winkler/Brier. `sigma_median()` per MASTER_LOG §2. | Only the decision day's bar, after orders are placed |
| `run_trial_template.py` | Reference driver for `CLAUDE_CODE_TRIAL_PROMPT_v3.md`. Copy to `run_trial_<NN>.py`, audit, run. | No (evaluation runs after the last session) |
| `trial_config.json` | Every rule as a value: universe, arms, sizing, stops, horizons, k, pdir, `signals_overrides`. Its hash identifies the configuration. | — |
| `evaluate.py` | Phase 3: IC (non-overlapping, Spearman), edge vs base rate, quintiles, look vs not (H4), setups, forecasts split by arm/control, portfolio, Deflated Sharpe, random-entry arm C. | Yes, after the run only |
| `leak_audit.py` | Rejects lines with dates, window years, prices, ticker + outcome verb, named events. | — |
| `charts.py` | Candles (pass `view.visible(t)`), trade post-mortems and equity by arm. Up = hollow, down = filled. | Post-mortems only (sealed) |
| `extract_chains.py` | Real option chains + earnings dates from the local Dolt clones → parquet. | — |
| `test_framework.py` | Gating, fill rules, the driver's no-look-ahead test (later bars changed → earlier decisions identical), evaluation, leak audit, charts. Synthetic data only. | — |

## Trial workflow
```bash
pip install -r requirements.txt
python3 test_framework.py                       # ALL TESTS PASSED
cp run_trial_template.py run_trial_03.py        # audit it against the prompt
python3 run_trial_03.py --prereg                # writes prereg_03.md + registers the config hash
python3 run_trial_03.py --run --sessions 20 --out smoke   # optional smoke run (not valid results)
python3 run_trial_03.py --run --zip             # full run (~10 min) + evaluation + trial_03_results.zip
python3 leak_audit.py --since MASTER_LOG.before.md MASTER_LOG.md
```
Outputs in `trial_<NN>_out/`: `ledger.csv` (one row per session × ticker × arm, with the reason
for every no-action), `trades.csv`, `predictions.csv`, `equity.csv`, `trial_<NN>.json` (all
Phase 3 metrics and an H1–H5 table), `sealed_benchmarks_<NN>.json`, `charts/`. Everything in it
holds realized results: **sealed**, never shown to a later trial bot except through MASTER_LOG.

## Changing one rule per trial
Edit one value in `trial_config.json` (or one `signals_overrides` key, e.g. `{"exh_th": 0.8}`),
set `trial`, run `--prereg`. A new hash is appended to `CONFIG_REGISTRY.csv`. The Deflated
Sharpe uses `registered configs + prior_config_count` as its trial count (`prior_config_count` = 2
covers Trial 01 and the unrecorded Trial 02; raise it if more were tried).

## Choices the prompt left open (decided here; change in code and count it if you disagree)
- Signals run on dividend-adjusted bars (as `signals.py --selftest` does); fills, stops and ATR use
  the CSV's split-adjusted prices (as `simulator.py` does).
- Range center = prior close. Expected exit date = the time-stop date (H sessions after entry).
- Predictions are made for FADE/TREND looks only (SQUEEZE has no direction). Arm B's
  predictions are flipped and marked `control` so they never enter the headline scores.
- Exit order each session: time stop, then setup flip against the signal side; a flat book may
  re-enter the same session if `look` is still True.
- Arm C has no stops: it matches each arm-A trade's ticker, side, notional and holding period.
- Deflated Sharpe approximates cross-trial Sharpe variance with the estimator's sampling variance.

## Known limits
- `adjusted_close` is back-adjusted to the download date (tiny future information in levels).
- No options arm until `PROTOCOL_v2_OPTIONS.md` is rewritten; chains can be extracted now.
- News is UNKNOWN_NEWS until `news_<TICKER>.csv` exists; attention (`views_z`) is logged only.
