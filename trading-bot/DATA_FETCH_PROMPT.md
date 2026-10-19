# Prompt for another Claude: fetch price data and collect the missing bot files
Paste the block into **Claude Code on your PC**, opened in your **other trading project** (the one
with the spread-trading simulator, `optionlib.py`, trial docs). It needs normal internet and `pip`;
claude.ai chats often can't install packages or reach Yahoo, so use Claude Code.
It makes one file, `for_trading_bot.zip`. Upload that zip to the trading-bot chat.

## Why these tickers (chosen before looking at any 2024–2026 prices)
Picked from the game's ticker list (MASTER_PROMPT §13.4) and the game's SIM stand-ins. The picks are
based on sector, volatility type and role in the game, **not on how the stocks did in 2024–2026**.
Choosing tickers by their outcomes would be look-ahead. The goal is to fix the bot's biggest
known limits: 5 correlated tech names and too few samples to reach n = 200.

| Ticker | Role in the game (SIM stand-in) | What it adds to the bot |
|---|---|---|
| META | Mag 7; the game keeps all 7 | Completes the game's core set |
| TSLA | Mag 7, high-IV EV maker (Plasma Motors) | High-vol regime samples |
| JPM | Money-center bank (Bunker Bancorp) | Financials, rate-driven, low tech correlation |
| BA | Aerospace with headline risk (Avionaire) | News shocks to test NEWS_MOVE vs NO_NEWS_MOVE |
| COST | Steady mega-cap retailer (Luxe Warehouse Club) | Calm-regime samples (MASTER_LOG FM7) |
| NFLX | Streaming, big earnings gaps (Streamline Media) | Earnings-gap events |
| AMD | High-beta chip name (Quanta Silicon) | Higher beta than the core set |
| CRM | SaaS, big post-earnings moves (Desktop Dynamics) | Software, earnings reactions |
| COIN | Crypto broker, high IV (Cryptic Exchange) | Very high vol, non-tech driver |
| GME | Meme stock (MemeStonk Arcade) | Extreme fear/greed tails for the FADE setups |
| SPY, DIA | Benchmark and market context (Broad Market Trust, Thirty Industrials) | Context only, not traded |
| VIX | The game's Macro Desk panel | Market-level fear gauge (SIGNAL_SCORING §5 limit) |
| *Optional:* XOM, KO, UPS, EA | SIM-only types: oil major, dividend staple, logistics, game publisher | Energy/staples/industrial diversity |

```
Two jobs for the Options Signal Bot: (A) fetch daily price files for 12 tickers plus VIX, and
(B) collect the bot files that live in this project. Put everything in one zip.
Validate format only. Do NOT describe, chart, summarize or comment on prices, returns or trends
in chat or in any file: later trial bots read these outputs, and any description of what a price
did is a look-ahead leak.

1. SETUP: in this project folder, run: mkdir export_for_bot ; cd export_for_bot
   then: pip install yfinance pandas tabulate

2. (A) PRICES. Inside export_for_bot, save and run this script as fetch_prices.py
   (add --optional only if Jacob asked for XOM KO UPS EA):

import sys, hashlib, datetime as dt, urllib.request, io, os
import pandas as pd, yfinance as yf
TRADE = ["META","TSLA","JPM","BA","COST","NFLX","AMD","CRM","COIN","GME"]
CONTEXT = ["SPY","DIA"]
OPTIONAL = ["XOM","KO","UPS","EA"]
START, LAST, END_EXCL = "2024-01-02", "2026-07-31", "2026-08-01"
TICKERS = CONTEXT + TRADE + (OPTIONAL if "--optional" in sys.argv else [])

def naive(idx):
    return idx.tz_localize(None) if getattr(idx, "tz", None) is not None else idx

def fetch(t):
    h = yf.Ticker(t).history(start=START, end=END_EXCL, interval="1d",
                             auto_adjust=False, actions=False)
    if h.empty: raise RuntimeError("no data returned")
    d = pd.DataFrame({"date": naive(h.index).strftime("%Y-%m-%d"),
        "open": h["Open"].values, "high": h["High"].values, "low": h["Low"].values,
        "close": h["Close"].values, "volume": h["Volume"].astype("int64").values,
        "adjusted_close": h["Adj Close"].values})
    return d[(d.date >= START) & (d.date <= LAST)].sort_values("date").reset_index(drop=True)

def checks(t, d, ref):
    r = d.adjusted_close / d.close
    sp = yf.Ticker(t).splits
    sp = sp[(naive(sp.index) >= START) & (naive(sp.index) <= LAST)] if len(sp) else sp
    ret = d.set_index("date").close.pct_change()
    split_ok = all(abs(ret.get(s.strftime("%Y-%m-%d"), 0) or 0) < 0.25 for s in naive(sp.index))
    tol = 1e-6
    return {"rows_647": len(d) == 647, "calendar_match": list(d.date) == ref,
        "no_nan": not d.isna().any().any(), "volume_pos": bool((d.volume > 0).all()),
        "ohlc_ok": bool(((d.high >= d[["open","close"]].max(axis=1) - tol) &
                         (d.low <= d[["open","close"]].min(axis=1) + tol)).all()),
        "adj_ratio_ok": bool(((r > 0.5) & (r <= 1 + tol)).all() and (r.diff().dropna() >= -1e-5).all()),
        "split_in_window": len(sp) > 0, "split_adjusted": split_ok}

now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
ref = list(pd.read_csv("AAPL_2024_2026.csv").date) if os.path.exists("AAPL_2024_2026.csv") else None
rows, files = [], []
for t in TICKERS:
    try:
        d = fetch(t)
        if ref is None: ref = list(d.date)            # first file (SPY) sets the calendar
        c = checks(t, d, ref)
        f = f"{t}_2024_2026.csv"; d.to_csv(f, index=False); files.append(f)
        rows.append({"file": f, "source": "yfinance auto_adjust=False", **c})
    except Exception as e:
        rows.append({"file": f"{t}_2024_2026.csv", "source": f"FAILED: {e}"})

try:   # VIX: context file only, simulator cannot load it (no volume / adjusted_close)
    raw = urllib.request.urlopen("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv", timeout=60).read()
    v = pd.read_csv(io.BytesIO(raw)); v.columns = [c.strip().lower() for c in v.columns]
    v["date"] = pd.to_datetime(v["date"]).dt.strftime("%Y-%m-%d")
    v = v[(v.date >= START) & (v.date <= LAST)][["date","open","high","low","close"]]
    v = v[v.date.isin(ref)]                           # Cboe also lists market holidays; keep stock sessions only
    v.to_csv("VIX_2024_2026.csv", index=False); files.append("VIX_2024_2026.csv")
    rows.append({"file": "VIX_2024_2026.csv", "source": "Cboe VIX_History.csv",
                 "rows_647": len(v) == 647, "calendar_match": list(v.date) == ref,
                 "no_nan": not v.isna().any().any()})
except Exception as e:
    rows.append({"file": "VIX_2024_2026.csv", "source": f"FAILED: {e}"})

tab = pd.DataFrame(rows)
with open("DATA_MANIFEST.md", "w") as m:
    m.write(f"# Data manifest\nDownloaded {now} (UTC). adjusted_close is back-adjusted as of this "
            "download date, so it can differ slightly from files downloaded on other days.\n"
            "Window 2024-01-02 to 2026-07-31. Columns: date,open,high,low,close,volume,adjusted_close "
            "(close = split-adjusted only; adjusted_close = split + dividend adjusted).\n\n")
    for f in files:
        m.write(f"- {f}  rows={sum(1 for _ in open(f)) - 1}  sha256={hashlib.sha256(open(f,'rb').read()).hexdigest()}\n")
    m.write("\n" + tab.to_markdown(index=False) + "\n")
print(tab.to_string(index=False))

3. If a ticker FAILS (Yahoo rate limit): wait 60 s and re-run the script once. Do not swap in a
   different data source without Jacob's OK; mixed sources give inconsistent adjustments.
   If any check is False, do not edit the data by hand. Report it.

4. (B) MISSING BOT FILES. Search this project folder first, then Jacob's user folder
   (C:\Users\<name>\, skipping AppData, node_modules, .git, venv folders) for the files below.
   Copy each one you find into export_for_bot\bot_files\. If there are several copies, take the
   newest by modified date and list the paths of the others. Never invent or rewrite a file;
   if it does not exist, write NOT FOUND.
     - MASTER_LOG.md          the NEWEST copy. It should record Trial 02 (the copy the bot has
                              only records Trial 01). Say which trials it records.
     - USAGE_LOG.md
     - trial_02*.md, prereg_02*.md   (write-ups only)
     - PROTOCOL_v2_OPTIONS.md
     - optionlib.py, td_ingest.py, scan.py, run_trial*.py, requirements.txt, tests for them
     - option-chain data: *.parquet files with option chains (put them in bot_files\chains\).
       If none exist, write NOT FOUND. Do not download chains (the free source is ~9 GB);
       Jacob decides that.
     - gdelt_raw.json or news_<TICKER>.csv, if they exist
   DO NOT copy results a trial bot must not see: ledger.csv, trial_*.json, state_*.json,
   sealed_benchmarks*, anything under sealed\. DO NOT copy secrets: .env files, API keys,
   ThetaData credentials, tokens. Grep the copied files for "key", "token", "password",
   "secret" and remove any file that contains a real credential.
   Add a section to DATA_MANIFEST.md: one line per file above (FOUND path + modified date +
   SHA-256, or NOT FOUND).

5. ZIP: zip the whole export_for_bot folder (except fetch_prices.py) as for_trading_bot.zip.
   If it is over 30 MB because of chain data, make for_trading_bot.zip without chains\ and one
   chains_<TICKER>.zip per ticker, and say so.

6. CHAT OUTPUT: the price pass/fail table, the FOUND / NOT FOUND list, and the zip names and
   sizes. Nothing else.
```

## How the files go into the simulation
1. Upload `for_trading_bot.zip` to the bot's Claude Code session, or unzip it into this
   `trading-bot/` folder next to `simulator.py` (the `bot_files/` docs go in `docs/`).
2. No code change is needed. `simulator.py` finds `<TICKER>_2024_2026.csv` in its own folder
   (`DATA_DIRS` includes `.`), and `signals.py` reads the same columns.
3. Before any trial uses a new file, the bot runs the preflight on it:
   `python3 signals.py --selftest <TICKER>_2024_2026.csv`, the calendar must match
   `AAPL_2024_2026.csv` session for session, and the simulator smoke test
   (init → brief → advance --n 5 → report) must pass.
4. Trial rules that come with it (record these in the trial's pre-registration):
   - Adding tickers changes the universe, so it is **that trial's one rule change**. Keep reporting
     the original 5 as their own subgroup so results stay comparable with earlier trials.
   - SIGNAL_SCORING §4 "same sign on ≥ 4 of 5 tickers" becomes "same sign on ≥ 80 % of tickers".
     That counts as a configuration change.
   - SPY, DIA and VIX are context only. No signal uses them until a trial pre-registers a
     market-level signal, and then only through the prior close.
