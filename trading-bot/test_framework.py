#!/usr/bin/env python3
"""
test_framework.py -- checks for market.py, engine.py, evaluate.py, leak_audit.py, charts.py and
run_trial_template.py. Uses SYNTHETIC random-walk data only, so running it never shows anyone a
real outcome.   Run:  python3 test_framework.py
"""
import json
import os
import shutil
import tempfile

import numpy as np
import pandas as pd

import evaluate as ev
import leak_audit
import run_trial_template as rt
from engine import Engine
from market import LookAheadError, MarketView


def synth(n=260, seed=0, start="2024-01-02"):
    rng = np.random.default_rng(seed)
    c = 100 * np.exp(np.cumsum(rng.normal(0.0003, 0.02, n)))
    o = c * np.exp(rng.normal(0, 0.006, n))
    hi = np.maximum(o, c) * (1 + np.abs(rng.normal(0, 0.006, n)))
    lo = np.minimum(o, c) * (1 - np.abs(rng.normal(0, 0.006, n)))
    return pd.DataFrame({"date": pd.bdate_range(start, periods=n).strftime("%Y-%m-%d"), "open": o, "high": hi,
                         "low": lo, "close": c, "volume": rng.integers(1_000_000, 3_000_000, n),
                         "adjusted_close": c * np.linspace(0.98, 1.0, n)})


def write_universe(folder, tickers, n=260, perturb_from=None):
    os.makedirs(folder, exist_ok=True)
    for k, t in enumerate(tickers + ["SPY"]):
        df = synth(n, seed=k)
        if perturb_from is not None:
            df.loc[perturb_from:, ["open", "high", "low", "close", "adjusted_close"]] *= 1.3
        df.to_csv(os.path.join(folder, f"{t}_2024_2026.csv"), index=False)
    v = synth(n, seed=99)[["date", "open", "high", "low", "close"]]
    v.to_csv(os.path.join(folder, "VIX_2024_2026.csv"), index=False)
    a = pd.DataFrame({"date": v.date, "views": 1000, "views_z": np.random.default_rng(5).normal(0, 1, n)})
    a.to_csv(os.path.join(folder, f"attention_{tickers[0]}.csv"), index=False)


def test_view_gating(d):
    v = MarketView(d, ["AAA", "BBB"], ["SPY", "VIX"], start_index=10)
    assert v.visible("AAA").date.max() < v.date and len(v.visible("AAA")) == 10
    assert v.context("VIX").date.max() < v.date and v.attention("AAA").date.max() < v.date
    assert v.session_date(5) > v.date            # calendar may look ahead
    try:
        v.full_bars("AAA")
        raise AssertionError("full_bars must raise before the end")
    except LookAheadError:
        pass
    bad = os.path.join(d, "bad")
    os.makedirs(bad, exist_ok=True)
    synth(260).to_csv(os.path.join(bad, "AAA_2024_2026.csv"), index=False)
    synth(259).to_csv(os.path.join(bad, "BBB_2024_2026.csv"), index=False)
    try:
        MarketView(bad, ["AAA", "BBB"])
        raise AssertionError("calendar mismatch must raise")
    except ValueError:
        pass
    print("PASS view gating")


def test_fill_rules(d):
    f = os.path.join(d, "fills")
    os.makedirs(f, exist_ok=True)
    bars = pd.DataFrame({"date": pd.bdate_range("2024-01-02", periods=4).strftime("%Y-%m-%d"),
                         "open": [100, 100, 90, 100], "high": [101, 101, 92, 112], "low": [99, 99, 88, 94],
                         "close": [100, 100, 91, 100], "volume": 1000, "adjusted_close": [100, 100, 91, 100]})
    bars.to_csv(os.path.join(f, "ZZZ_2024_2026.csv"), index=False)
    v = MarketView(f, ["ZZZ"], start_index=1)
    e = Engine(v, ["A", "B"])
    e.open("ZZZ", "A", "long", 10, stop=95, target=110)         # day 1 open fill
    e.open("ZZZ", "B", "long", 10, stop=95, target=110)
    assert abs(e.book("ZZZ", "A").position["entry"] - 100 * 1.0002) < 1e-9
    e.resolve_session(); v.advance()                               # day 1: nothing touched
    e.resolve_session()                                            # day 2 gaps to 90 < stop
    t = e.book("ZZZ", "A").closed[0]
    assert t["exit_reason"] == "stop" and t["exit"] == 90, t        # gap fills at the open, not 95
    v.advance()
    e.open("ZZZ", "A", "long", 10, stop=95, target=110)
    e.resolve_session()                                            # day 3 touches both: stop wins
    assert e.book("ZZZ", "A").closed[-1]["exit_reason"] == "stop"
    print("PASS fill rules (gap through stop fills at open; stop beats target)")


def _cfg(tickers):
    cfg = json.load(open("trial_config.json"))
    cfg.update(trial="99", tickers=tickers, core=tickers[:1], context=["SPY", "VIX"], random_seeds=200,
               prior_config_count=0)
    return cfg


def test_driver_no_lookahead(d):
    tick, k = ["AAA", "BBB"], 200
    a, b = os.path.join(d, "clean"), os.path.join(d, "perturbed")
    write_universe(a, tick)
    write_universe(b, tick, perturb_from=k)
    cfg = _cfg(tick)
    r1 = rt.run(cfg, a, os.path.join(a, "out"), charts=4)
    rt.run(cfg, b, os.path.join(b, "out"), charts=0)
    l1, l2 = (pd.read_csv(os.path.join(x, "out", "ledger.csv")) for x in (a, b))
    cut = synth(260).date.iloc[k]
    s1, s2 = l1[l1.date <= cut].reset_index(drop=True), l2[l2.date <= cut].reset_index(drop=True)
    pd.testing.assert_frame_equal(s1, s2)
    assert len(l1) == r1["expected_ledger_rows"], "one ledger row per session x ticker x arm"
    tr = pd.read_csv(os.path.join(a, "out", "trades.csv"))
    assert len(tr) > 0 and set(tr.arm) == {"A", "B"}, "synthetic run should trade in both arms"
    res = json.load(open(os.path.join(a, "out", "trial_99.json")))
    for key in ("signals", "portfolio", "dsr", "forecasts", "random_entry_C", "hypotheses", "skip_audit"):
        assert key in res, key
    print(f"PASS driver: decisions up to session {k} unchanged when later bars change; "
          f"{len(l1)} ledger rows, {len(tr)} trades, evaluation complete")
    return a


def test_evaluate():
    n = 600
    rng = np.random.default_rng(3)
    bars = synth(n, seed=7)
    fwd = np.log(bars.close.shift(-4) / bars.open).values           # fwd_5 for decision index D
    led = pd.DataFrame({"date": bars.date, "ticker": "AAA", "arm": "A", "look": rng.random(n) < 0.2,
                        "score": fwd + rng.normal(0, 1e-6, n)})
    panel = ev.forward_panel(led, {"AAA": bars}, (5,))
    tab, _ = ev.signal_table(panel.dropna(subset=["score"]), ["score"], (5,), min_n=50)
    assert tab.IC.iloc[0] > 0.99, tab
    dsr = ev.deflated_sharpe(rng.normal(0.001, 0.01, 500), n_trials=10)
    assert 0 <= dsr["dsr"] <= 1
    print("PASS evaluate (IC of a perfect score = 1; DSR in [0, 1])")


def test_leak_audit():
    bad = ["AAPL rallied to $260 on 2025-01-27.", "The Aug 2024 selloff hurt shorts.",
           "NVDA gapped down after DeepSeek."]
    good = ["When RSI > 70 with declining volume, the 10-day upper bound was too low.",
            "Stops at 2 ATR were hit before target in 3 of 3 cases.", "Transaction cost dropped the hit rate."]
    assert all(leak_audit.audit_text(s) for s in bad), [leak_audit.audit_text(s) for s in bad]
    assert not any(leak_audit.audit_text(s) for s in good), [leak_audit.audit_text(s) for s in good]
    print("PASS leak audit")


def test_charts(d, run_dir):
    try:
        import charts
    except ImportError:
        print("SKIP charts (pip install matplotlib)")
        return
    v = MarketView(run_dir, ["AAA"], start_index=150)
    p = charts.candles(v.visible("AAA"), os.path.join(d, "candles.png"), title="AAA visible bars",
                       interval=dict(low=90, high=110, horizon=5), levels=dict(entry=100, stop=95, target=106))
    assert os.path.getsize(p) > 10_000
    assert any(f.endswith(".png") for f in os.listdir(os.path.join(run_dir, "out", "charts")))
    print("PASS charts")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    os.chdir(here)
    tmp = tempfile.mkdtemp(prefix="bot_test_")
    try:
        base = os.path.join(tmp, "base")
        write_universe(base, ["AAA", "BBB"])
        test_view_gating(base)
        test_fill_rules(tmp)
        run_dir = test_driver_no_lookahead(tmp)
        test_evaluate()
        test_leak_audit()
        test_charts(tmp, run_dir)
        print("ALL TESTS PASSED")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
