#!/usr/bin/env python3
"""
run_trial_template.py -- reference driver for CLAUDE_CODE_TRIAL_PROMPT_v3 (Signal Scoring v3,
equity arm, all books in lockstep). Copy it to run_trial_<NN>.py, audit it against the prompt,
then:

  python3 run_trial_<NN>.py --config trial_config.json --prereg        # BEFORE bar one
  python3 run_trial_<NN>.py --config trial_config.json --run --zip     # full run + evaluation
  python3 run_trial_<NN>.py --config trial_config.json --run --sessions 30 --out smoke  # smoke only

Every rule is a value in trial_config.json. The config hash goes into prereg_<NN>.md and
CONFIG_REGISTRY.csv, so every configuration tried is counted (protocol §8.1).

Per session D, per ticker (decisions see bars through D-1 only; fills at D's open):
  1. score = signals.score_frame(visible_bars).iloc[-1]; setup -> bias
       FADE_GREED -1, FADE_FEAR +1, TREND_UP +1, TREND_DOWN -1, anything else 0 (no trade)
  2. look==True and bias != 0 -> range prediction for every arm (arm B's is flipped and marked
     control), traded or not:  half_width = k x close x sigma_median/sqrt(252) x sqrt(H)
  3. exits first: time stop (H sessions after entry), then setup flip against the signal side
  4. entry if look==True, bias != 0 and the book is flat. Arm A trades the bias, arm B the
     opposite. stop = max(2 ATR14, 4% of price), target 3 ATR14, size 1% risk capped at 25%.
  5. one ledger row per ticker x arm with every signals.py column, covariates, action, reason.
Then engine.resolve_session() resolves stops/targets/predictions on D's bar.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import io
import json
import math
import os
import zipfile

import numpy as np
import pandas as pd

import evaluate as ev
import signals
import simulator as sim
from engine import Engine, sigma_median
from market import MarketView

BIAS = {"FADE_GREED": -1, "FADE_FEAR": 1, "TREND_UP": 1, "TREND_DOWN": -1}
EVAL_SIGNALS = ["c_bb", "bb_bw_pr", "c_macd_line", "c_macd_hist", "c_rsi", "c_z5", "c_trend",
                "st_dir", "nss", "CONT", "EXH", "LIS", "views_z"]


def config_hash(cfg):
    core = {k: v for k, v in cfg.items() if k != "note"}
    return hashlib.sha256(json.dumps(core, sort_keys=True).encode()).hexdigest()[:16]


def register(folder, cfg, mode):
    path = os.path.join(folder, "CONFIG_REGISTRY.csv")
    h = config_hash(cfg)
    reg = pd.read_csv(path, dtype=str) if os.path.exists(path) else pd.DataFrame(
        columns=["config_hash", "trial", "first_seen_utc", "mode", "note"])
    if h not in set(reg.config_hash):
        reg.loc[len(reg)] = [h, cfg["trial"], dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                             mode, cfg.get("note", "")]
        reg.to_csv(path, index=False)
    return h, reg.config_hash.nunique()


def write_prereg(folder, cfg):
    h, n_reg = register(folder, cfg, "prereg")
    P = dict(signals.P, **cfg.get("signals_overrides", {}))
    news = [t for t in cfg["tickers"] if os.path.exists(os.path.join(folder, f"news_{t}.csv"))]
    opt = [f for f in ("optionlib.py", "PROTOCOL_v2_OPTIONS.md") if os.path.exists(os.path.join(folder, f))]
    nn = cfg["trial"]
    text = f"""# Pre-registration — Trial {nn}
Written before the first bar. Config hash **{h}** (CONFIG_REGISTRY.csv: {n_reg} configuration(s)
registered; plus {cfg['prior_config_count']} prior configuration(s) carried in for the Deflated Sharpe).

## Configuration
```json
{json.dumps(cfg, indent=1)}
```
signals.py parameters in force: `{json.dumps(P)}`

## Arms
- A: v3 rules. B: control, same entries, direction flipped (its predictions are marked control).
- C: random entry, matched count/side/notional/holding period, {cfg['random_seeds']} seeds (evaluate.py).
- Buy-and-hold only in sealed_benchmarks_{nn}.json.

## Fallbacks in force
- News: {'loaded for ' + ', '.join(news) if news else 'none loaded -> UNKNOWN_NEWS'}.
- Options arm: {'files present: ' + ', '.join(opt) if len(opt) == 2 else 'OFF (optionlib.py / PROTOCOL_v2_OPTIONS.md missing) -> equity arm only'}.
- Context (SPY, DIA, VIX) and attention (views_z): logged only, never used by a rule.

## Hypotheses (edit the refutation lines before bar one if needed)
- H1 EXH has negative IC at H=5. Refuted if pooled IC >= 0, or |t| < {cfg['eval']['t_min']} at n >= {cfg['eval']['min_n']}.
- H2 CONT has positive IC at H=10. Refuted if pooled IC <= 0, or |t| < {cfg['eval']['t_min']} at n >= {cfg['eval']['min_n']}.
- H3 Arm A beats B and C on P/L per unit of risk. Refuted if A <= B, or random-entry p >= 0.05.
- H4 look==True sessions have larger |forward return| than look==False. Refuted if mean |fwd 10| is not larger.
- H5 The core-5 result has the same sign as the added-10. Refuted if the signs of arm A net P/L,
  EXH IC(5) or CONT IC(10) differ between the subgroups.
"""
    path = os.path.join(folder, f"prereg_{nn}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def run(cfg, folder, out, max_sessions=None, charts=8):
    os.makedirs(out, exist_ok=True)
    h, n_reg = register(folder, cfg, "smoke" if max_sessions else "run")
    P = dict(signals.P, **cfg.get("signals_overrides", {}))
    view = MarketView(folder, cfg["tickers"], cfg["context"], start_index=cfg["first_decision_index"])
    eng = Engine(view, cfg["arms"], cfg["capital_per_book"])
    k, conf = cfg["interval_k"], cfg["interval_conf"]
    ledger, sessions = [], 0

    while not view.done and (max_sessions is None or sessions < max_sessions):
        date, i = str(view.date.date()), view.cursor
        for t in cfg["tickers"]:
            vis = view.visible(t, adjusted=True)
            news = view.news(t)
            row = signals.score_frame(vis, news, P).iloc[-1]
            att = view.attention(t)
            cov = {}
            if "views_z" in cfg["log_covariates"]:
                v = att.views_z.iloc[-1] if att is not None and len(att) else np.nan
                cov["views_z"] = None if v != v else float(v)
            setup, look = row.setup, bool(row.look)
            bias = BIAS.get(setup, 0)
            fam = setup.split("_")[0] if bias else None
            H = cfg["horizon"].get(fam) if fam else None
            ind = sigma = hw = None
            if look and bias:
                ind = sim.build_indicators(view.visible(t))
                sigma = sigma_median(ind)
                if sigma:
                    hw = k * ind["close"] * sigma / math.sqrt(252) * math.sqrt(H)
            driving = (row.EXH if fam == "FADE" else row.CONT) if fam else None

            for arm in cfg["arms"]:
                side_dir = (bias if arm == "A" else -bias) if bias else 0
                if hw:
                    ref = ind["close"]
                    eng.predict(t, arm, ref - hw, ref + hw, H, "up" if side_dir > 0 else "down",
                                cfg["pdir_base"] + cfg["pdir_slope"] * min(abs(driving), 1.0),
                                conf=conf, control=(arm != "A"), signals=setup,
                                meta=dict(setup=setup, driving=float(driving), sigma_median=sigma))
                actions, reasons = [], []
                b = eng.book(t, arm)
                p = b.position
                if p is not None:
                    if p["time_stop_index"] is not None and i >= p["time_stop_index"]:
                        eng.close(t, arm, "time")
                        actions.append("CLOSE_TIME")
                    elif cfg["exit_on_flip"] and bias == -p["signal_dir"]:
                        eng.close(t, arm, "flip")
                        actions.append("CLOSE_FLIP")
                if b.position is not None:
                    reasons.append("position open")
                elif setup == "WARMUP":
                    reasons.append("warmup")
                elif not look:
                    reasons.append("look=False")
                elif not bias:
                    reasons.append(f"setup={setup}: no trade by rule")
                elif not ind or not ind.get("atr14") or not hw:
                    reasons.append("no ATR/sigma")
                else:
                    ref, atr = ind["close"], ind["atr14"]
                    stop_dist = max(cfg["stop_atr"] * atr, cfg["stop_floor_pct"] * ref)
                    shares = Engine.size_shares(b.last_equity(), ref, stop_dist, cfg["risk_pct"], cfg["cap_pct"])
                    if shares < 1:
                        reasons.append("size=0")
                    else:
                        side = "long" if side_dir > 0 else "short"
                        eng.open(t, arm, side, shares, stop=ref - side_dir * stop_dist,
                                 target=ref + side_dir * cfg["target_atr"] * atr, time_stop_index=i + H,
                                 signal_dir=bias, expected_exit_price=ref + side_dir * hw,
                                 expected_exit_date=str(view.session_date(H).date()),
                                 meta=dict(setup=setup, horizon=H, driving=float(driving), LIS=float(row.LIS)))
                        actions.append("OPEN_LONG" if side == "long" else "OPEN_SHORT")
                ledger.append(dict(date=date, ticker=t, arm=arm,
                                   **{c: row[c] for c in row.index if c != "date"}, **cov,
                                   bias=bias, sigma_median=sigma, action="+".join(actions) or "NONE",
                                   reason="; ".join(reasons),
                                   position_after=b.position["side"] if b.position else ""))
        eng.resolve_session()
        view.advance()
        sessions += 1

    full = view.done
    if full:
        eng.finish()
    nn = cfg["trial"]
    led, trades = pd.DataFrame(ledger), pd.DataFrame(eng.trades())
    preds, equity = pd.DataFrame(eng.predictions()), pd.DataFrame(eng.equity_rows())
    for name, df in (("ledger", led), ("trades", trades), ("predictions", preds), ("equity", equity)):
        df.to_csv(os.path.join(out, f"{name}.csv"), index=False)
    summary = dict(trial=nn, config_hash=h, full_run=full, sessions=sessions, ledger_rows=len(led),
                   expected_ledger_rows=sessions * len(cfg["tickers"]) * len(cfg["arms"]))
    if not full:
        summary["note"] = "partial (smoke) run: no evaluation; results are not valid"
        _dump(summary, os.path.join(out, f"trial_{nn}.json"))
        return summary

    bars = {t: view.full_bars(t) for t in cfg["tickers"]}
    panel = ev.forward_panel(led, bars, cfg["eval"]["horizons"])
    e = cfg["eval"]
    groups = {"ALL": cfg["tickers"], "CORE": cfg["core"],
              "ADDED": [t for t in cfg["tickers"] if t not in cfg["core"]]}
    res = dict(summary, signals={}, quintiles={}, look_vs_not={}, portfolio={}, dsr={})
    for g, tick in groups.items():
        if not tick:
            continue
        tab, quint = ev.signal_table(panel[panel.ticker.isin(tick)], EVAL_SIGNALS, e["horizons"],
                                     min_n=e["min_n"], sign_share=e["sign_share"], t_min=e["t_min"])
        res["signals"][g], res["quintiles"][g] = tab.to_dict("records"), quint
        res["look_vs_not"][g] = [ev.look_vs_not(panel[panel.ticker.isin(tick)], H) for H in (5, 10)]
        port = ev.portfolio(equity, trades, cfg["capital_per_book"], tick)
        n_trials = n_reg + cfg["prior_config_count"]
        res["dsr"][g] = {a: ev.deflated_sharpe(v.pop("daily_returns"), n_trials) for a, v in port.items()}
        res["portfolio"][g] = port
    res["setups"] = ev.setup_table(trades, bars).to_dict("records") if len(trades) else []
    fc, exit_err = ev.forecast_table(preds, trades) if len(preds) else (pd.DataFrame(), {})
    res["forecasts"], res["exit_date_error_by_reason"] = fc.to_dict("records"), exit_err
    ta = trades[trades.arm == "A"] if len(trades) else trades
    first = int(ta.entry_index.min()) if len(ta) else cfg["first_decision_index"]
    res["random_entry_C"] = ev.random_entry_pvalue(ta, bars, first, cfg["random_seeds"])
    res["hypotheses"] = _hypotheses(res)
    res["skip_audit"] = dict(rows=len(led), expected=summary["expected_ledger_rows"],
                             reasons=led.reason.replace("", "(acted)").value_counts().to_dict())
    _dump(res, os.path.join(out, f"trial_{nn}.json"))
    _dump(ev.buy_and_hold(bars, first), os.path.join(out, f"sealed_benchmarks_{nn}.json"))
    if charts:
        _charts(out, equity, trades, preds, bars, charts)
    return res


def _sig(res, g, s, H):
    for r in res["signals"].get(g, []):
        if r["signal"] == s and r["H"] == H and r["target"] == "ret":
            return r
    return {}


def _hypotheses(res):
    h1, h2 = _sig(res, "ALL", "EXH", 5), _sig(res, "ALL", "CONT", 10)
    pa, pb = res["portfolio"]["ALL"].get("A", {}), res["portfolio"]["ALL"].get("B", {})
    lv = next((x for x in res["look_vs_not"]["ALL"] if x["H"] == 10), {})
    signs = {}
    for name, fn in (("armA_net_pnl", lambda g: res["portfolio"].get(g, {}).get("A", {}).get("total_return_pct")),
                     ("EXH_IC5", lambda g: _sig(res, g, "EXH", 5).get("IC")),
                     ("CONT_IC10", lambda g: _sig(res, g, "CONT", 10).get("IC"))):
        a, b = fn("CORE"), fn("ADDED")
        signs[name] = None if a is None or b is None else bool(np.sign(a) == np.sign(b))
    return {
        "H1_EXH_negative_IC5": dict(IC=h1.get("IC"), t=h1.get("t"), n=h1.get("n"), verdict=h1.get("verdict")),
        "H2_CONT_positive_IC10": dict(IC=h2.get("IC"), t=h2.get("t"), n=h2.get("n"), verdict=h2.get("verdict")),
        "H3_A_beats_B_and_C": dict(A_pnl_per_risk=pa.get("pnl_per_unit_risk"), B_pnl_per_risk=pb.get("pnl_per_unit_risk"),
                                   random_p=res["random_entry_C"].get("p_value")),
        "H4_look_larger_abs_fwd10": dict(look=lv.get("mean_abs_look"), not_look=lv.get("mean_abs_not"), t=lv.get("welch_t")),
        "H5_core_vs_added_same_sign": signs,
    }


def _charts(out, equity, trades, preds, bars, n):
    try:
        import charts
    except ImportError:
        print("charts skipped: pip install matplotlib")
        return
    d = os.path.join(out, "charts")
    os.makedirs(d, exist_ok=True)
    curves = {a: g.groupby("date").equity.sum().sort_index() for a, g in equity.groupby("arm")}
    charts.equity_curves(curves, os.path.join(d, "equity_by_arm.png"))
    ta = trades[trades.arm == "A"].sort_values("pnl") if len(trades) else trades
    pick = pd.concat([ta.head(n // 2), ta.tail(n // 2)]).drop_duplicates("id") if len(ta) else ta
    for r in pick.to_dict("records"):
        pr = preds[(preds.ticker == r["ticker"]) & (preds.arm == "A") & (preds.made_index == r["entry_index"])]
        charts.trade_postmortem(bars[r["ticker"]], r, os.path.join(d, f"trade_{r['id']}.png"),
                                pred=pr.iloc[0].to_dict() if len(pr) else None)


def _dump(obj, path):
    def conv(o):
        if isinstance(o, (np.generic,)):
            return o.item()
        if isinstance(o, np.ndarray):
            return o.tolist()
        return str(o)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, default=conv)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="trial_config.json")
    ap.add_argument("--folder", default=".")
    ap.add_argument("--out")
    ap.add_argument("--prereg", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--sessions", type=int, help="smoke run: stop after N sessions (no evaluation)")
    ap.add_argument("--charts", type=int, default=8, help="post-mortem charts for N arm-A trades (0 = none)")
    ap.add_argument("--zip", action="store_true")
    a = ap.parse_args()
    cfg = json.load(open(a.config, encoding="utf-8"))
    nn = cfg["trial"]
    if a.prereg:
        print("wrote", write_prereg(a.folder, cfg), "config", config_hash(cfg))
    out = a.out or os.path.join(a.folder, f"trial_{nn}_out")
    if a.run:
        if not a.sessions and not os.path.exists(os.path.join(a.folder, f"prereg_{nn}.md")):
            raise SystemExit(f"prereg_{nn}.md missing: run --prereg before bar one")
        with contextlib.redirect_stdout(io.StringIO()):
            res = run(cfg, a.folder, out, a.sessions, a.charts)
        print(json.dumps({k: res[k] for k in ("trial", "config_hash", "full_run", "sessions", "ledger_rows",
                                              "expected_ledger_rows")}, indent=1))
        if not res["full_run"]:
            return
    if a.zip:   # also usable alone, to re-zip after writing trial_<NN>.md
        if not os.path.exists(os.path.join(out, f"trial_{nn}.json")):
            raise SystemExit(f"nothing to zip: {out} has no trial_{nn}.json")
        zp = os.path.join(a.folder, f"trial_{nn}_results.zip")
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(out):
                for f in files:
                    z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), a.folder))
            for f in (f"prereg_{nn}.md", f"trial_{nn}.md", "MASTER_LOG.md", "USAGE_LOG.md", "CONFIG_REGISTRY.csv"):
                if os.path.exists(os.path.join(a.folder, f)):
                    z.write(os.path.join(a.folder, f), f)
        print("zip:", zp)


if __name__ == "__main__":
    main()
