#!/usr/bin/env python3
"""
signals.py -- SIGNAL SCORING v3. One number per signal, point-in-time, scale-free.

Contract:
  * score_frame(df) row t uses ONLY bars 0..t (causal). Row t is the "as of close t" packet;
    a trade decided from it fills at open t+1. test_no_lookahead() proves this.
  * Every component is either signed in [-1, +1] (0 = neutral) or a 0-100 percentile.
  * Thresholds below are PRE-REGISTERED GUESSES. Change one per trial and count it (protocol §8.1).
  * No forward returns are computed here. Outcome scoring belongs to the simulator.

Usage:
  python3 signals.py AAPL_2024_2026.csv [--news news_AAPL.csv] [--out scan_AAPL.csv]
  python3 signals.py --selftest AAPL_2024_2026.csv

Optional news file (point-in-time, one row per session, published BEFORE that session's close):
  date,n_articles,sentiment      # sentiment = relevance-weighted mean in [-1, 1] from a vendor feed
"""
import argparse, sys
import numpy as np
import pandas as pd

# ---- pre-registered parameters (v3.0) -------------------------------------------------
P = dict(
    bb_n=20, bb_k=2.0, rsi_n=14, atr_n=14, macd=(12, 26, 9), sma_trend=50,
    st_period=10, st_mult=3.0, z_win=5, vol_win=20, norm_win=126, pr_min=60,
    squeeze_pr=10,            # bandwidth percentile <= 10 -> squeeze
    exh_th=0.75,              # |EXH| >= this -> fear/greed extreme
    cont_th=0.60,             # |CONT| >= this -> trend setup
    event_retz=2.0, event_vz=1.5,   # event day: |1d return| >= 2 sigma AND volume z >= 1.5
    news_sent_min=0.15,       # |sentiment| needed to call a day "news-backed"
    look_pr=85,               # LIS in its own trailing top 15% (126d) -> look into it
)

clip = lambda x: x.clip(-1.0, 1.0)


def _rms_norm(x, w, mp):
    """Sign-preserving normalisation: x / (2 * trailing RMS). 0 stays neutral."""
    rms = np.sqrt((x ** 2).rolling(w, min_periods=mp).mean())
    return clip(x / (2 * rms.replace(0, np.nan)))


def _pct_rank(x, w, mp):
    """Trailing percentile (0-100) of today's value within the last w values, today included."""
    return x.rolling(w, min_periods=mp).apply(lambda a: 100.0 * (a <= a[-1]).mean(), raw=True)


def _atr(df, n):
    pc = df.close.shift(1)
    tr = pd.concat([df.high - df.low, (df.high - pc).abs(), (df.low - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def _supertrend_dir(df, period, mult):
    a = _atr(df, period).values
    hl2 = ((df.high + df.low) / 2).values
    c = df.close.values
    ub, lb = hl2 + mult * a, hl2 - mult * a
    fub, flb, d = ub.copy(), lb.copy(), np.ones(len(df))
    for i in range(1, len(df)):
        fub[i] = ub[i] if (ub[i] < fub[i - 1] or c[i - 1] > fub[i - 1]) else fub[i - 1]
        flb[i] = lb[i] if (lb[i] > flb[i - 1] or c[i - 1] < flb[i - 1]) else flb[i - 1]
        d[i] = -1 if (d[i - 1] == 1 and c[i] < flb[i]) else 1 if (d[i - 1] == -1 and c[i] > fub[i]) else d[i - 1]
    return pd.Series(d, index=df.index)


def load(path):
    df = pd.read_csv(path, parse_dates=["date"]).sort_values("date").reset_index(drop=True)
    f = df.adjusted_close / df.close                     # dividend adjustment; close is split-adjusted
    for c in ("open", "high", "low", "close"):
        df[c] = df[c] * f
    return df[["date", "open", "high", "low", "close", "volume"]]


def score_frame(df, news=None, p=P):
    c, out = df.close, pd.DataFrame({"date": df.date, "close": df.close})
    W, MP = p["norm_win"], p["pr_min"]
    lr = np.log(c / c.shift(1))
    sig = lr.rolling(p["vol_win"]).std()                 # daily sigma through t
    atr = _atr(df, p["atr_n"])

    # --- Bollinger ------------------------------------------------------------------
    m, sd = c.rolling(p["bb_n"]).mean(), c.rolling(p["bb_n"]).std(ddof=0)
    out["bb_z"] = (c - m) / sd                           # = 4*%B - 2 ; +/-2 = band touch
    out["bb_bw_pr"] = _pct_rank(2 * p["bb_k"] * sd / m, W, MP)   # bandwidth percentile, 0 = tightest
    out["c_bb"] = clip(out.bb_z / p["bb_k"])

    # --- MACD (normalised by ATR so it is comparable across tickers and price levels) ---
    f, s, g = p["macd"]
    line = c.ewm(span=f, adjust=False).mean() - c.ewm(span=s, adjust=False).mean()
    hist = line - line.ewm(span=g, adjust=False).mean()
    out["macd_line_atr"] = line / atr
    out["macd_hist_atr"] = hist / atr
    out["c_macd_line"] = _rms_norm(out.macd_line_atr, W, MP)
    out["c_macd_hist"] = _rms_norm(out.macd_hist_atr, W, MP)
    cross = np.sign(hist).diff().fillna(0) != 0
    grp = cross.cumsum()
    out["macd_cross_age"] = np.sign(hist) * (grp.groupby(grp).cumcount())  # +n bars since bull cross

    # --- RSI (Wilder) ------------------------------------------------------------------
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / p["rsi_n"], adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / p["rsi_n"], adjust=False).mean()
    out["rsi"] = 100 - 100 / (1 + up / dn.replace(0, np.nan))
    out["c_rsi"] = clip((out.rsi - 50) / 20)             # RSI 70 -> +1, 30 -> -1

    # --- Reversal z (5-day move in its own sigma units) ----------------------------------
    out["z5"] = np.log(c / c.shift(p["z_win"])) / (sig * np.sqrt(p["z_win"]))
    out["c_z5"] = clip(out.z5 / 2)

    # --- Trend --------------------------------------------------------------------------
    out["dist50_atr"] = (c - c.rolling(p["sma_trend"]).mean()) / atr
    out["c_trend"] = clip(out.dist50_atr / 3)
    out["st_dir"] = _supertrend_dir(df, p["st_period"], p["st_mult"])

    # --- Participation, shock, gap, vol regime --------------------------------------------
    lv = np.log(df.volume.replace(0, np.nan))
    out["vol_z"] = (lv - lv.shift(1).rolling(20).mean()) / lv.shift(1).rolling(20).std()
    out["ret_z1"] = lr / sig.shift(1)
    out["gap_atr"] = (df.open - c.shift(1)) / atr.shift(1)
    out["rv_pr"] = _pct_rank(sig, 252, MP)                 # realised-vol percentile, 0-100

    # --- News, backed by numbers ----------------------------------------------------------
    if news is not None:
        nz = news.set_index("date").reindex(df.date)
        n, sent = nz.n_articles.fillna(0).values, nz.sentiment.fillna(0).values
        out["news_n"], out["news_sent"] = n, sent
        nn = pd.Series(n, index=df.index)
        out["news_z"] = (nn - nn.shift(1).rolling(20).mean()) / nn.shift(1).rolling(20).std()
        agree = np.sign(out.ret_z1) == np.sign(out.news_sent)
        conf = clip(out.ret_z1.abs() / 2).where(agree & (out.vol_z >= 1.0), 0.0)
        out["nss"] = out.news_sent.clip(-1, 1) * conf    # news score only counts if price+volume confirm
        has_news = (out.news_sent.abs() >= p["news_sent_min"]) & (out.news_n >= 1)
    else:
        out["news_n"] = out["news_sent"] = out["news_z"] = out["nss"] = np.nan
        has_news = None

    # --- Composites ------------------------------------------------------------------------
    cont_parts = ["c_trend", "c_macd_line", "c_macd_hist"]
    out["CONT"] = (out[cont_parts].sum(axis=1, min_count=3) + out.st_dir
                   + out.nss.fillna(0)) / (len(cont_parts) + 1 + out.nss.notna())
    out["EXH"] = out[["c_bb", "c_rsi", "c_z5"]].mean(axis=1, skipna=False)   # + = greed
    out["LIS"] = 100 * out[["CONT", "EXH"]].abs().max(axis=1)

    event = (out.ret_z1.abs() >= p["event_retz"]) & (out.vol_z >= p["event_vz"])
    out["event"] = np.where(~event, "", "UNKNOWN_NEWS" if has_news is None
                            else np.where(has_news, "NEWS_MOVE", "NO_NEWS_MOVE"))

    def setup(r):
        if pd.isna(r.EXH) or pd.isna(r.CONT):
            return "WARMUP"
        news_with = r.nss if not pd.isna(r.nss) else 0.0
        if r.EXH >= p["exh_th"] and news_with < 0.25 and r.event != "NEWS_MOVE":
            return "FADE_GREED"          # short bias / call credit spread
        if r.EXH <= -p["exh_th"] and news_with > -0.25 and r.event != "NEWS_MOVE":
            return "FADE_FEAR"           # long bias / put credit spread
        if abs(r.EXH) < p["exh_th"] and r.CONT >= p["cont_th"]:
            return "TREND_UP"
        if abs(r.EXH) < p["exh_th"] and r.CONT <= -p["cont_th"]:
            return "TREND_DOWN"
        if r.bb_bw_pr <= p["squeeze_pr"]:
            return "SQUEEZE_WATCH"       # direction unknown; long range if RER gate agrees
        return "NONE"

    out["setup"] = out.apply(setup, axis=1)
    out["LIS_pr"] = _pct_rank(out.LIS, W, MP)          # self-calibrating: no full-window tuning
    out["look"] = (out.LIS_pr >= p["look_pr"]) & ~out.setup.isin(["NONE", "WARMUP"])
    num = out.select_dtypes("number").columns
    out[num] = out[num].round(4)
    return out


def test_no_lookahead(df, n_checks=25, seed=0):
    full = score_frame(df)
    rng = np.random.default_rng(seed)
    cols = [c for c in full.columns if c not in ("date",)]
    for t in rng.integers(150, len(df) - 1, n_checks):
        trunc = score_frame(df.iloc[: t + 1]).iloc[-1]
        for col in cols:
            a, b = full.iloc[t][col], trunc[col]
            same = (pd.isna(a) and pd.isna(b)) or a == b or (
                isinstance(a, float) and abs(a - b) < 1e-9)
            if not same:
                raise AssertionError(f"LOOK-AHEAD: {col} at row {t}: full={a} truncated={b}")
    return True


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("csv"); ap.add_argument("--news"); ap.add_argument("--out")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    df = load(a.csv)
    if a.selftest:
        test_no_lookahead(df); print("no-lookahead test PASSED"); sys.exit(0)
    news = pd.read_csv(a.news, parse_dates=["date"]) if a.news else None
    res = score_frame(df, news)
    if a.out:
        res.to_csv(a.out, index=False); print(f"wrote {a.out} ({len(res)} rows)")
    else:
        print(res.tail(1).T.to_string())
