#!/usr/bin/env python3
"""
market.py -- time-gated, multi-ticker market view for lockstep trials.

Contract (tested in test_framework.py):
  * The decision day is `view.date` (index `view.cursor`). Callers only ever see rows dated
    BEFORE it, i.e. through the prior close. The decision day's bar is released only to
    engine.py for fills and stop/target resolution (`_bar`).
  * The session calendar (dates, not prices) is scheduled information, so `session_date(k)`
    may look ahead, e.g. to label an expected exit date.
  * `full_bars()` (needed for evaluation) raises until the run has passed the last session.
  * Every ticker, context and attention file must share one calendar, or loading fails.

Files read from `folder` (same names simulator.py and signals.py use):
  <TICKER>_2024_2026.csv   date,open,high,low,close,volume,adjusted_close
  VIX_2024_2026.csv        date,open,high,low,close         (context only)
  attention_<TICKER>.csv   date,views,views_z                (optional)
  news_<TICKER>.csv        date,n_articles,sentiment         (optional; absent -> UNKNOWN_NEWS)
"""
import os

import numpy as np
import pandas as pd

PRICE_COLS = ["date", "open", "high", "low", "close", "volume", "adjusted_close"]


class LookAheadError(RuntimeError):
    pass


def _read(path, cols):
    df = pd.read_csv(path, parse_dates=["date"]).sort_values("date").reset_index(drop=True)
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{path}: missing columns {missing}")
    return df[cols]


class MarketView:
    def __init__(self, folder=".", tickers=(), context=(), start_index=1,
                 attention=True, news=True):
        if not tickers:
            raise ValueError("need at least one ticker")
        self.folder, self.tickers, self.context_names = folder, list(tickers), list(context)
        self._bars = {t: _read(self._path(f"{t}_2024_2026.csv"), PRICE_COLS) for t in self.tickers}
        self.calendar = pd.DatetimeIndex(self._bars[self.tickers[0]].date)
        for t, df in self._bars.items():
            self._check_calendar(df.date, f"{t}_2024_2026.csv")

        self._context = {}
        for name in self.context_names:
            cols = ["date", "open", "high", "low", "close"] if name == "VIX" else PRICE_COLS
            df = _read(self._path(f"{name}_2024_2026.csv"), cols)
            self._check_calendar(df.date, f"{name}_2024_2026.csv")
            self._context[name] = df

        self._attention, self._news = {}, {}
        for t in self.tickers:
            p = self._path(f"attention_{t}.csv")
            if attention and os.path.exists(p):
                df = _read(p, ["date", "views", "views_z"])
                self._check_calendar(df.date, f"attention_{t}.csv")
                self._attention[t] = df
            p = self._path(f"news_{t}.csv")
            if news and os.path.exists(p):
                # news rows are per session but may be sparse; align to the calendar, no news = 0
                df = _read(p, ["date", "n_articles", "sentiment"])
                self._news[t] = (df.set_index("date").reindex(self.calendar)
                                 .rename_axis("date").reset_index())

        self.n = len(self.calendar)
        self.cursor = int(start_index)

    def _path(self, name):
        return os.path.join(self.folder, name)

    def _check_calendar(self, dates, name):
        if len(dates) != len(self.calendar) or not (pd.DatetimeIndex(dates) == self.calendar).all():
            raise ValueError(f"{name}: session calendar differs from {self.tickers[0]}_2024_2026.csv")

    # ---- clock ------------------------------------------------------------------------
    @property
    def done(self):
        return self.cursor >= self.n

    @property
    def date(self):
        if self.done:
            raise LookAheadError("run is finished; there is no decision day")
        return self.calendar[self.cursor]

    def session_date(self, offset):
        """Calendar date `offset` sessions after the decision day (clamped to the last session)."""
        return self.calendar[min(self.cursor + offset, self.n - 1)]

    def advance(self):
        self.cursor += 1

    # ---- what a decision may see (everything strictly before the decision day) ------------
    def visible(self, ticker, adjusted=False):
        """Bars through the prior close. adjusted=True returns signals.load()-style bars
        (OHLC scaled by adjusted_close/close) for signals.score_frame."""
        df = self._bars[ticker].iloc[: self.cursor].copy()
        if not adjusted:
            return df
        f = df.adjusted_close / df.close
        for c in ("open", "high", "low", "close"):
            df[c] = df[c] * f
        return df[["date", "open", "high", "low", "close", "volume"]]

    def context(self, name):
        return self._context[name].iloc[: self.cursor].copy()

    def attention(self, ticker):
        df = self._attention.get(ticker)
        return None if df is None else df.iloc[: self.cursor].copy()

    def news(self, ticker):
        df = self._news.get(ticker)
        return None if df is None else df.iloc[: self.cursor].copy()

    def has_news(self, ticker):
        return ticker in self._news

    # ---- engine only ------------------------------------------------------------------
    def _bar(self, ticker):
        if self.done:
            raise LookAheadError("no bar after the last session")
        r = self._bars[ticker].iloc[self.cursor]
        return dict(date=r.date, open=float(r.open), high=float(r.high),
                    low=float(r.low), close=float(r.close))

    # ---- evaluation only (after the run) -------------------------------------------------
    def full_bars(self, ticker):
        if not self.done:
            raise LookAheadError("full history is available only after the last session")
        return self._bars[ticker].copy()


def log_return_forward(bars, H):
    """For each decision index D: ln(close[D+H-1] / open[D]) -- the H-session return a fill at
    D's open earns. NaN where the window runs past the data. Evaluation only."""
    o, c = bars.open.values, bars.close.values
    out = np.full(len(bars), np.nan)
    end = np.arange(len(bars)) + H - 1
    ok = end < len(bars)
    out[ok] = np.log(c[end[ok]] / o[ok])
    return out
