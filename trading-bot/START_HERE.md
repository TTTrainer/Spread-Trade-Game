# START HERE — Options Signal Bot

Everything Claude Code needs is in this one folder. Open Claude Code here and paste the block
from `CLAUDE_CODE_TRIAL_PROMPT_v3.md` (use trial number 03).

## What's in the folder

| Need | Files | Status |
|---|---|---|
| Prices, trade universe | `<TICKER>_2024_2026.csv` for AAPL GOOGL AMZN MSFT NVDA META TSLA JPM BA COST NFLX AMD CRM COIN GME | ✅ 647 daily bars each, 2024-01-02 → 2026-07-31, same calendar, all checks passed (`DATA_MANIFEST.md`) |
| Market context (not traded) | `SPY_`, `DIA_`, `VIX_2024_2026.csv` | ✅ Not used by any signal yet |
| Attention | `attention_<TICKER>.csv` (Wikipedia pageviews) | ✅ Logged only; not a signal yet |
| Simulator | `simulator.py` | ✅ Day by day, hides the future, fills at next open, scores ranges |
| Simulator framework | `market.py`, `engine.py`, `run_trial_template.py`, `trial_config.json` | ✅ All 15 books in lockstep, same fill rules as `simulator.py`, every rule in one config file. See `FRAMEWORK.md` |
| Evaluation and reports | `evaluate.py`, `leak_audit.py`, `charts.py` | ✅ Phase 3 metrics in code, leak check for write-ups, candlestick and equity charts |
| Framework tests | `test_framework.py` | ✅ `python3 test_framework.py` (synthetic data only) |
| Signal scores | `signals.py` | ✅ One number per signal; `--selftest` proves no look-ahead |
| Rules | `MASTER_LOG.md`, `TRADING_TRIAL_PROTOCOL.md`, `SIGNAL_SCORING_v3.md` | ✅ |
| Trial prompt | `CLAUDE_CODE_TRIAL_PROMPT_v3.md` | ✅ |
| News builder | `build_news.py` | Ready for GDELT data later |
| Data record | `DATA_MANIFEST.md` | Sources, checks, SHA-256 per file |

## Not included yet (the trial runs without them)

| Item | Effect now | To add later |
|---|---|---|
| News (`news_<TICKER>.csv`) | News is "unknown" | Get GDELT data → run `build_news.py` → drop files here. No code change. |
| Real option prices | Stock trades only | Run `extract_chains.py` on the PC with the Dolt databases (steps at the top of the file). It writes `chains_<TICKER>.parquet` + `earnings_calendar.csv` into this folder. |
| Spread-game files (`optionlib.py`, `PROTOCOL_v2_OPTIONS.md`), Trial 02 MASTER_LOG | Options arm stays off even with chains: its rules (RER gate, strikes, exits) were in `PROTOCOL_v2_OPTIONS.md` | Not found on this PC; they lived in chats. Rewrite the options protocol in the claude.ai project before an options trial. |

## Setup (once per PC)
`pip install -r requirements.txt`, then `python3 test_framework.py` should print `ALL TESTS PASSED`.

## After a trial
Upload `trial_<NN>_results.zip` to the claude.ai project. Don't share results with the next trial's
Claude Code session except through `MASTER_LOG.md`.
