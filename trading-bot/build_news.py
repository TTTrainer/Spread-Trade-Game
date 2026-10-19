#!/usr/bin/env python3
"""
build_news.py -- GDELT DOC 2.0 daily timelines -> news_<TICKER>.csv for signals.py.

Input:  gdelt_raw.json  {"vol": {TICKER: <timelinevolraw json>}, "tone": {TICKER: <timelinetone json>}}
Output: news_<TICKER>.csv  columns: date,n_articles,tone_raw,sentiment

POINT-IN-TIME ALIGNMENT (the important part)
  GDELT bins are UTC calendar days. UTC day D ends at 19:00/20:00 ET on D, i.e. 3-4 hours after
  the 16:00 ET close and ~13 hours before the next open. The news row for session D is therefore
  fully published before the open of session D+1, which is when a trade decided from row D fills.
  Weekend/holiday UTC days roll forward into the next trading session (counts summed, tone
  count-weighted), because they are all published before that session's close.
  Residual mismatch: articles from 16:00-20:00 ET on D are in row D but could not move D's close.

SENTIMENT
  GDELT tone is a general-language score (roughly -10..+10), not a financial-sentiment model.
  It is centred and scaled CAUSALLY against the prior 60 sessions only:
     sentiment = clip( (tone - mean_prior60) / (2 * sd_prior60), -1, 1 )
  so 0 = this stock's normal tone; +-1 = 2 sd more positive/negative than usual.
"""
import json, sys
import numpy as np
import pandas as pd


def series(j):
    d = j["timeline"][0]["data"]
    return pd.Series({pd.Timestamp(x["date"][:8]): float(x["value"]) for x in d})


def build(raw, ticker, sessions):
    vol, tone = series(raw["vol"][ticker]), series(raw["tone"][ticker])
    cal = pd.DataFrame({"n": vol, "tone": tone}).sort_index()
    cal["n"] = cal["n"].fillna(0)
    # map each UTC day to the first trading session on or after it
    idx = np.searchsorted(sessions.values, cal.index.values, side="left")
    ok = idx < len(sessions)
    cal = cal[ok].assign(session=sessions.values[idx[ok]])
    cal["tw"] = cal["tone"].fillna(0) * cal["n"]
    g = cal.groupby("session").agg(n_articles=("n", "sum"), tw=("tw", "sum"))
    g["tone_raw"] = g.tw / g.n_articles.replace(0, np.nan)
    g = g.reindex(sessions, fill_value=0)
    g.loc[g.n_articles == 0, "tone_raw"] = np.nan
    prior = g.tone_raw.shift(1).rolling(60, min_periods=30)
    g["sentiment"] = ((g.tone_raw - prior.mean()) / (2 * prior.std())).clip(-1, 1)
    out = g.reset_index().rename(columns={"index": "date", "session": "date"})
    out["date"] = pd.to_datetime(out["date"]).dt.strftime("%Y-%m-%d")
    return out[["date", "n_articles", "tone_raw", "sentiment"]].round(4)


if __name__ == "__main__":
    raw = json.load(open(sys.argv[1]))
    csv_dir = sys.argv[2]                      # folder holding <TICKER>_2024_2026.csv files
    import glob, os
    for t in raw["vol"]:
        f = glob.glob(os.path.join(csv_dir, f"*{t}_2024_2026.csv"))[0]
        px = pd.read_csv(f, parse_dates=["date"])
        # extend the session calendar back with business days so warm-up news has a home
        sessions = pd.DatetimeIndex(sorted(set(px.date) | set(
            pd.bdate_range("2023-10-02", px.date.min() - pd.Timedelta(days=1)))))
        out = build(raw, t, sessions)
        out = out[out.date >= px.date.min().strftime("%Y-%m-%d")]
        out.to_csv(f"news_{t}.csv", index=False)
        print(t, len(out), "rows; sessions with 0 articles:", int((out.n_articles == 0).sum()))
