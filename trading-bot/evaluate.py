#!/usr/bin/env python3
"""
evaluate.py -- Phase 3 metrics, in code (SIGNAL_SCORING_v3 §4, trial prompt Phase 3).

Runs only after a trial has finished: it reads realized future returns. Nothing here may be
imported into a decision path.

Conventions:
  * A ledger row on decision day D holds scores as of close D-1. Its forward return at horizon H
    is ln(close[D+H-1] / open[D]) -- what a fill at D's open earns over H sessions.
  * Non-overlapping samples: per ticker, every H-th decision row from the first scored row.
  * Spearman IC = Pearson correlation of ranks (no scipy needed).
  * Deflated Sharpe uses the estimator's own sampling variance in place of the cross-trial
    variance of Sharpe ratios (unknown here). That approximation is labelled in the output.
"""
import math
from statistics import NormalDist

import numpy as np
import pandas as pd

from market import log_return_forward

_N = NormalDist()


def _spearman(x, y):
    x, y = pd.Series(x).rank().values, pd.Series(y).rank().values
    if len(x) < 3 or np.std(x) == 0 or np.std(y) == 0:
        return np.nan
    return float(np.corrcoef(x, y)[0, 1])


def _t_of_corr(r, n):
    if r != r or n < 3 or abs(r) >= 1:
        return np.nan
    return r * math.sqrt((n - 2) / (1 - r * r))


def forward_panel(ledger, bars_by_ticker, horizons=(5, 10, 20)):
    """One row per (date, ticker) decision with fwd_<H> columns. Uses arm A rows (scores are
    identical across arms)."""
    base = ledger[ledger.arm == ledger.arm.iloc[0]].copy()
    base["date"] = pd.to_datetime(base["date"])
    out = []
    for t, g in base.groupby("ticker"):
        bars = bars_by_ticker[t]
        pos = pd.Series(np.arange(len(bars)), index=pd.DatetimeIndex(bars.date))
        g = g.copy()
        g["didx"] = pos.reindex(g.date).values
        for H in horizons:
            g[f"fwd_{H}"] = log_return_forward(bars, H)[g.didx.astype(int)]
        out.append(g)
    return pd.concat(out, ignore_index=True)


def signal_table(panel, signals, horizons=(5, 10, 20), magnitude=("LIS", "bb_bw_pr"),
                 min_n=200, sign_share=0.80, t_min=3.0, cost=0.0004):
    """IC, edge vs base rate, quintiles and a verdict for each signal x horizon.
    Signed signals are tested against fwd; `magnitude` signals also against |fwd| (H4-style)."""
    rows, quint = [], {}
    for s in signals:
        if s not in panel.columns:
            continue
        for H in horizons:
            f = f"fwd_{H}"
            for target in (("ret", "abs") if s in magnitude else ("ret",)):
                samp = []
                for t, g in panel.groupby("ticker"):
                    g = g[g[s].notna() & g[f].notna()].sort_values("didx")
                    if g.empty:
                        continue
                    g = g[(g.didx - g.didx.iloc[0]) % H == 0]
                    samp.append(g.assign(_y=g[f].abs() if target == "abs" else g[f]))
                if not samp:
                    continue
                d = pd.concat(samp)
                n = len(d)
                ic = _spearman(d[s], d._y)
                per = {t: _spearman(g[s], g._y) for t, g in d.groupby("ticker") if len(g) >= 10}
                same = [np.sign(v) == np.sign(ic) for v in per.values() if v == v]
                share = float(np.mean(same)) if same else np.nan
                edge = np.nan
                if target == "ret":
                    sg = np.sign(d[s].values)
                    m = sg != 0
                    hit = (sg[m] * d._y.values[m]) > cost
                    up = d.groupby("ticker")._y.transform(lambda y: (y > cost).mean()).values[m]
                    dn = d.groupby("ticker")._y.transform(lambda y: (-y > cost).mean()).values[m]
                    edge = float(np.mean(hit - np.where(sg[m] > 0, up, dn))) if m.any() else np.nan
                try:
                    q = pd.qcut(d[s], 5, labels=False, duplicates="drop")
                    qm = d.groupby(q)._y.mean()
                    quint[f"{s}|H{H}|{target}"] = [round(float(v), 5) for v in qm.values]
                    mono = "up" if (np.diff(qm.values) > 0).all() else "down" if (np.diff(qm.values) < 0).all() else "no"
                except ValueError:
                    mono = "n/a"
                tstat = _t_of_corr(ic, n)
                if n < min_n:
                    verdict = f"n<{min_n}: not promotable"
                elif abs(tstat) >= t_min and share >= sign_share:
                    verdict = f"passes IC gate ({'+' if ic > 0 else '-'})"
                else:
                    verdict = "fails IC gate"
                rows.append(dict(signal=s, H=H, target=target, n=n, IC=round(ic, 4) if ic == ic else None,
                                 t=round(tstat, 2) if tstat == tstat else None,
                                 sign_share=round(share, 2) if share == share else None,
                                 edge_vs_base=round(edge, 4) if edge == edge else None,
                                 monotone=mono, verdict=verdict))
    return pd.DataFrame(rows), quint


def look_vs_not(panel, H=10):
    """H4: is |forward return| larger on look==True sessions?"""
    f = f"fwd_{H}"
    d = panel[panel[f].notna()]
    a, b = d[d.look.astype(bool)][f].abs(), d[~d.look.astype(bool)][f].abs()
    se = math.sqrt(a.var(ddof=1) / max(len(a), 1) + b.var(ddof=1) / max(len(b), 1)) if len(a) > 1 and len(b) > 1 else np.nan
    return dict(H=H, n_look=len(a), n_not=len(b), mean_abs_look=float(a.mean()), mean_abs_not=float(b.mean()),
                welch_t=float((a.mean() - b.mean()) / se) if se == se and se > 0 else None,
                note="overlapping samples; t is optimistic")


def _pf(p):
    w, l = p[p > 0].sum(), -p[p <= 0].sum()
    return float(w / l) if l > 0 else None


def setup_table(trades, bars_by_ticker):
    """Per setup x arm: n, hit rate, base rate (ticker up/down rate at the trade's horizon),
    mean R, profit factor, net P/L."""
    if trades.empty:
        return pd.DataFrame()
    rate = {}
    for t, bars in bars_by_ticker.items():
        for H in sorted(trades.horizon.dropna().unique()):
            r = log_return_forward(bars, int(H))
            r = r[~np.isnan(r)]
            rate[(t, int(H))] = ((r > 0).mean(), (r < 0).mean())
    rows = []
    for (setup, arm), g in trades.groupby(["setup", "arm"]):
        base = [rate[(r.ticker, int(r.horizon))][0 if r.side == "long" else 1] for r in g.itertuples()]
        rows.append(dict(setup=setup, arm=arm, n=len(g), hit_rate=round(float((g.pnl > 0).mean()), 3),
                         base_rate=round(float(np.mean(base)), 3),
                         mean_R=round(float(g.R.mean()), 3) if "R" in g else None,
                         profit_factor=_pf(g.pnl), net_pnl=round(float(g.pnl.sum()), 2)))
    return pd.DataFrame(rows)


def forecast_table(preds, trades=None):
    """Coverage vs nominal, Winkler, Brier, direction hit -- split by arm and control flag, so
    control predictions never contaminate the headline (MASTER_LOG §9). Exit-date error per
    exit reason (FM5)."""
    s = preds[preds.status == "scored"]
    rows = []
    for (arm, ctl), g in s.groupby(["arm", "control"]):
        rows.append(dict(arm=arm, control=bool(ctl), n=len(g), coverage=round(float(g.inside_interval.mean()), 3),
                         nominal=round(float(g.conf.mean()), 3),
                         gap=round(float(g.inside_interval.mean() - g.conf.mean()), 3),
                         mean_winkler_pct=round(float(g.winkler_pct.mean()), 3),
                         brier=round(float(g.brier.mean()), 4),
                         brier_vs_coinflip=round(float(g.brier.mean() - 0.25), 4),
                         direction_hit=round(float(g.direction_correct.mean()), 3)))
    exit_err = {}
    if trades is not None and not trades.empty and "exit_date_error_days" in trades:
        for (arm, reason), g in trades.groupby(["arm", "exit_reason"]):
            e = g.exit_date_error_days.dropna()
            exit_err[f"{arm}|{reason}"] = dict(n=len(e), mae_days=round(float(e.abs().mean()), 2) if len(e) else None,
                                               mean_signed_days=round(float(e.mean()), 2) if len(e) else None)
    return pd.DataFrame(rows), exit_err


def portfolio(equity, trades, capital_per_book, tickers=None):
    """Per arm: summed equity across ticker books -> return, Sharpe, max DD, profit factor."""
    eq = equity if tickers is None else equity[equity.ticker.isin(tickers)]
    out = {}
    for arm, g in eq.groupby("arm"):
        curve = g.groupby("date").equity.sum().sort_index()
        books = g.ticker.nunique()
        cap = capital_per_book * books
        r = curve.pct_change().dropna().values
        dd = (curve / curve.cummax() - 1).min()
        tr = trades[(trades.arm == arm) & (trades.ticker.isin(g.ticker.unique()))]
        out[arm] = dict(books=books, final_equity=round(float(curve.iloc[-1]), 2),
                        total_return_pct=round(float((curve.iloc[-1] / cap - 1) * 100), 3),
                        sharpe_ann=round(float(r.mean() / r.std(ddof=1) * math.sqrt(252)), 3) if len(r) > 2 and r.std() > 0 else None,
                        max_dd_pct=round(float(dd * 100), 3), n_trades=len(tr),
                        profit_factor=_pf(tr.pnl) if len(tr) else None,
                        pnl_per_unit_risk=round(float(tr.pnl.sum() / (tr.risk_per_share * tr.shares).sum()), 4)
                        if len(tr) and "risk_per_share" in tr else None,
                        daily_returns=r)
    return out


def deflated_sharpe(returns, n_trials):
    """Bailey & Lopez de Prado (2014). Per-period SR; SR0 = expected max SR of n_trials zero-skill
    trials. APPROXIMATION: cross-trial SR variance replaced by the estimator's sampling variance."""
    r = np.asarray(returns, float)
    r = r[np.isfinite(r)]
    T = len(r)
    if T < 10 or r.std(ddof=1) == 0:
        return dict(dsr=None, note="too few returns")
    sr = r.mean() / r.std(ddof=1)
    z = (r - r.mean()) / r.std(ddof=0)
    g3, g4 = float((z ** 3).mean()), float((z ** 4).mean())
    var_sr = max((1 - g3 * sr + (g4 - 1) / 4 * sr * sr) / (T - 1), 1e-12)
    if n_trials > 1:
        gamma = 0.5772156649
        sr0 = math.sqrt(var_sr) * ((1 - gamma) * _N.inv_cdf(1 - 1 / n_trials)
                                   + gamma * _N.inv_cdf(1 - 1 / (n_trials * math.e)))
    else:
        sr0 = 0.0
    dsr = _N.cdf((sr - sr0) / math.sqrt(var_sr))
    return dict(dsr=round(dsr, 4), sr_per_period=round(sr, 5), sr0=round(sr0, 5), n_trials=n_trials, T=T,
                skew=round(g3, 3), kurtosis=round(g4, 3),
                note="DSR = P(true SR > SR0). Cross-trial SR variance approximated by sampling variance.")


def random_entry_pvalue(trades_a, bars_by_ticker, first_index, seeds=1000, slippage_bps=2.0, seed0=0):
    """Arm C: per seed, re-place every arm-A trade at a random session of the same ticker with the
    same side, notional and holding period (exit at the open after `held_sessions`; no stops).
    p = share of seeds whose total P/L >= arm A's (with +1 smoothing)."""
    if trades_a.empty:
        return dict(p_value=None, note="no arm A trades")
    slip = slippage_bps / 10_000
    actual = float(trades_a.pnl.sum())
    totals = np.zeros(seeds)
    rng = np.random.default_rng(seed0)
    for r in trades_a.itertuples():
        bars = bars_by_ticker[r.ticker]
        o, c = bars.open.values, bars.close.values
        n, h = len(bars), max(1, int(r.held_sessions))
        hi = n - 1 - h
        if hi <= first_index:
            continue
        e = rng.integers(first_index, hi + 1, seeds)
        sgn = 1 if r.side == "long" else -1
        px_in = o[e] * (1 + sgn * slip)
        px_out = o[e + h] * (1 - sgn * slip)
        notional = r.entry * r.shares
        totals += sgn * (px_out - px_in) * (notional / px_in)
    p = (1 + int((totals >= actual).sum())) / (1 + seeds)
    return dict(p_value=round(p, 4), actual_pnl=round(actual, 2), random_mean=round(float(totals.mean()), 2),
                random_p05=round(float(np.percentile(totals, 5)), 2),
                random_p95=round(float(np.percentile(totals, 95)), 2), seeds=seeds,
                note="matched count/side/notional/holding period; random arm has no stops")


def buy_and_hold(bars_by_ticker, first_index):
    """Sealed benchmark only -- never write these numbers into MASTER_LOG (protocol §7.2)."""
    return {t: round(float((b.close.iloc[-1] / b.open.iloc[first_index] - 1) * 100), 3)
            for t, b in bars_by_ticker.items()}
