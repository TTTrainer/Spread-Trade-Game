#!/usr/bin/env python3
"""
WALK-FORWARD TRADING SIMULATOR  v1.0
=====================================
A no-look-ahead, day-by-day trading simulation harness for single-ticker trials.

DESIGN CONTRACT (do not violate):
  * The agent NEVER touches the raw CSV. It only calls this CLI.
  * On decision day D the agent can see bars [0 .. D-1] (through PRIOR close).
    The OHLCV of day D is physically withheld until `advance` is called.
  * Orders placed on day D fill at day D's OPEN (plus slippage).
  * Stops/targets are resolved against day D's intraday range with
    conservative gap handling (gap through a stop fills at the open).
  * All state lives in state_<TICKER>.json so a trial can span sessions.

USAGE (typical loop):
    python3 simulator.py init    --ticker AAPL --start 2024-07-01 --capital 100000
    python3 simulator.py brief                       # <- what you may look at
    python3 simulator.py predict --low 210 --high 222 --horizon 10 --dir up --pdir 0.62
    python3 simulator.py trade   --action BUY --shares 100 --stop 205 --target 225 \
                                 --signals "sma10>sma20,rsi=58,st=up" --exit-date 2024-07-19
    python3 simulator.py advance                     # step 1 day, print resolutions
    python3 simulator.py advance --n 5               # step several quiet days
    python3 simulator.py report  --out trial_AAPL.json

Author: generated for the project's trial protocol. Python 3.9+, pandas + numpy only.
"""

import argparse, json, math, os, sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------------
DATA_DIRS = ["/mnt/project", "/mnt/user-data/uploads", "."]
STATE_DIR = os.environ.get("TRADESIM_STATE", ".")

DEFAULTS = dict(
    capital=100_000.0,
    slippage_bps=2.0,        # stock: half-spread + impact, large-cap liquid
    commission=0.0,          # per stock trade
    opt_commission=0.65,     # per option contract
    opt_spread_pct=0.03,     # 3% of mid, each way -- options spreads dominate costs
    risk_free=0.045,
    vrp_wedge=0.10,          # IV = realized_vol * (1 + wedge); see context doc §5
    max_position_pct=0.25,   # sanity guard, not a strategy rule
)

# --------------------------------------------------------------------------
# DATA LOADING
# --------------------------------------------------------------------------
def find_csv(ticker):
    for d in DATA_DIRS:
        p = os.path.join(d, f"{ticker.upper()}_2024_2026.csv")
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"No CSV for {ticker} in {DATA_DIRS}")


def load_bars(ticker):
    df = pd.read_csv(find_csv(ticker))
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    return df[["date", "open", "high", "low", "close", "volume", "adjusted_close"]]


# --------------------------------------------------------------------------
# INDICATORS  (all computed on the VISIBLE slice only)
# --------------------------------------------------------------------------
def sma(s, n):  return s.rolling(n).mean()
def ema(s, n):  return s.ewm(span=n, adjust=False).mean()


def rsi(s, n=14):
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def true_range(df):
    pc = df["close"].shift(1)
    return pd.concat([df["high"] - df["low"],
                      (df["high"] - pc).abs(),
                      (df["low"] - pc).abs()], axis=1).max(axis=1)


def atr(df, n=14):
    return true_range(df).ewm(alpha=1 / n, adjust=False).mean()


def macd(s, fast=12, slow=26, sig=9):
    line = ema(s, fast) - ema(s, slow)
    signal = ema(line, sig)
    return line, signal, line - signal


def bollinger(s, n=20, k=2.0):
    m, sd = sma(s, n), s.rolling(n).std(ddof=0)
    return m + k * sd, m, m - k * sd


def supertrend(df, period=10, mult=3.0):
    """Standard SuperTrend. Returns (direction series: +1 up / -1 down, line)."""
    a = atr(df, period)
    hl2 = (df["high"] + df["low"]) / 2
    ub, lb = hl2 + mult * a, hl2 - mult * a
    fub, flb = ub.copy(), lb.copy()
    for i in range(1, len(df)):
        fub.iloc[i] = ub.iloc[i] if (ub.iloc[i] < fub.iloc[i-1] or df["close"].iloc[i-1] > fub.iloc[i-1]) else fub.iloc[i-1]
        flb.iloc[i] = lb.iloc[i] if (lb.iloc[i] > flb.iloc[i-1] or df["close"].iloc[i-1] < flb.iloc[i-1]) else flb.iloc[i-1]
    dirn = pd.Series(1, index=df.index)
    for i in range(1, len(df)):
        prev = dirn.iloc[i-1]
        if prev == 1 and df["close"].iloc[i] < flb.iloc[i]:
            dirn.iloc[i] = -1
        elif prev == -1 and df["close"].iloc[i] > fub.iloc[i]:
            dirn.iloc[i] = 1
        else:
            dirn.iloc[i] = prev
    line = np.where(dirn == 1, flb, fub)
    return dirn, pd.Series(line, index=df.index)


def yang_zhang_vol(df, n=20, periods=252):
    """Yang-Zhang (2000) drift-independent OHLC volatility. Annualized."""
    if len(df) < n + 2:
        return np.nan
    d = df.tail(n + 1).copy()
    o, h, l, c = d["open"], d["high"], d["low"], d["close"]
    pc = c.shift(1)
    ro = np.log(o / pc)                       # overnight
    rc = np.log(c / o)                        # open-to-close
    rs = (np.log(h / c) * np.log(h / o) + np.log(l / c) * np.log(l / o))  # Rogers-Satchell
    ro, rc, rs = ro.dropna(), rc.dropna(), rs.dropna()
    N = len(ro)
    if N < 5:
        return np.nan
    vo = ro.var(ddof=1)
    vc = rc.var(ddof=1)
    vrs = rs.mean()
    k = 0.34 / (1.34 + (N + 1) / (N - 1))
    return float(np.sqrt(max(vo + k * vc + (1 - k) * vrs, 1e-12) * periods))


def ewma_vol(df, lam=0.94, periods=252):
    r = np.log(df["close"] / df["close"].shift(1)).dropna()
    if len(r) < 20:
        return np.nan
    w = (1 - lam) * lam ** np.arange(len(r))[::-1]
    w /= w.sum()
    return float(np.sqrt(np.sum(w * r.values ** 2) * periods))


def build_indicators(vis):
    """vis = visible bars (through prior close). Returns dict of latest values."""
    c = vis["close"]
    st_dir, st_line = supertrend(vis)
    ml, msig, mhist = macd(c)
    bu, bm, bl = bollinger(c)
    a14 = atr(vis, 14)
    last = -1

    def g(x):
        try:
            v = float(x.iloc[last]) if hasattr(x, "iloc") else float(x)
            return None if (v != v) else round(v, 4)
        except Exception:
            return None

    px = float(c.iloc[last])
    hi52 = float(vis["high"].tail(252).max())
    lo52 = float(vis["low"].tail(252).min())
    vol20 = float(vis["volume"].tail(20).mean())

    yz = yang_zhang_vol(vis, 20)
    return {
        "date_of_last_close": vis["date"].iloc[last].strftime("%Y-%m-%d"),
        "close": round(px, 2),
        "open": round(float(vis["open"].iloc[last]), 2),
        "high": round(float(vis["high"].iloc[last]), 2),
        "low": round(float(vis["low"].iloc[last]), 2),
        "volume": int(vis["volume"].iloc[last]),
        "ret_1d_pct": round(float(c.pct_change().iloc[last] * 100), 2),
        "ret_5d_pct": round(float((px / c.iloc[-6] - 1) * 100), 2) if len(c) > 6 else None,
        "ret_20d_pct": round(float((px / c.iloc[-21] - 1) * 100), 2) if len(c) > 21 else None,
        "sma10": g(sma(c, 10)), "sma20": g(sma(c, 20)),
        "sma50": g(sma(c, 50)), "sma200": g(sma(c, 200)),
        "ema9": g(ema(c, 9)), "ema21": g(ema(c, 21)),
        "sma10_gt_sma20": (g(sma(c, 10)) or 0) > (g(sma(c, 20)) or 0),
        "px_vs_sma50_pct": round((px / g(sma(c, 50)) - 1) * 100, 2) if g(sma(c, 50)) else None,
        "rsi14": g(rsi(c, 14)),
        "macd": g(ml), "macd_signal": g(msig), "macd_hist": g(mhist),
        "bb_upper": g(bu), "bb_mid": g(bm), "bb_lower": g(bl),
        "bb_pctB": round((px - g(bl)) / (g(bu) - g(bl)), 3) if g(bu) and g(bl) and g(bu) != g(bl) else None,
        "atr14": g(a14),
        "atr14_pct": round(g(a14) / px * 100, 2) if g(a14) else None,
        "supertrend_dir": int(st_dir.iloc[last]),
        "supertrend_line": g(st_line),
        "vol_ratio_20d": round(float(vis["volume"].iloc[last]) / vol20, 2) if vol20 else None,
        "high_20d": round(float(vis["high"].tail(20).max()), 2),
        "low_20d": round(float(vis["low"].tail(20).min()), 2),
        "high_52w": round(hi52, 2), "low_52w": round(lo52, 2),
        "pct_from_52w_high": round((px / hi52 - 1) * 100, 2),
        "yang_zhang_vol_20d_ann": round(yz, 4) if yz == yz else None,
        "ewma_vol_ann": round(ewma_vol(vis), 4),
        "gap_pct": round(float((vis["open"].iloc[last] / c.iloc[-2] - 1) * 100), 2) if len(c) > 2 else None,
        "bars_visible": len(vis),
    }


# --------------------------------------------------------------------------
# OPTION PRICING  (synthetic; see context doc §5 for the caveat)
# --------------------------------------------------------------------------
def _nd(x):  # standard normal CDF
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_price(S, K, T, r, sigma, kind="put"):
    if T <= 0 or sigma <= 0:
        return max(0.0, (K - S) if kind == "put" else (S - K))
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    if kind == "call":
        return S * _nd(d1) - K * math.exp(-r * T) * _nd(d2)
    return K * math.exp(-r * T) * _nd(-d2) - S * _nd(-d1)


def bs_delta(S, K, T, r, sigma, kind="put"):
    if T <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    return _nd(d1) if kind == "call" else _nd(d1) - 1


def strike_for_delta(S, target_delta, T, r, sigma, kind="put"):
    """Bisection for the strike matching |target_delta|."""
    lo, hi = S * 0.5, S * 1.6
    for _ in range(60):
        mid = (lo + hi) / 2
        d = abs(bs_delta(S, mid, T, r, sigma, kind))
        if kind == "put":
            if d > target_delta: hi = mid
            else: lo = mid
        else:
            if d > target_delta: lo = mid
            else: hi = mid
    return round((lo + hi) / 2, 0)


# --------------------------------------------------------------------------
# SCORING  (see context doc §2)
# --------------------------------------------------------------------------
def winkler_score(low, high, y, alpha=0.20):
    """Interval score. LOWER IS BETTER. Penalizes width AND misses."""
    s = (high - low)
    if y < low:
        s += (2 / alpha) * (low - y)
    elif y > high:
        s += (2 / alpha) * (y - high)
    return s


def normalized_winkler(low, high, y, ref_price, alpha=0.20):
    """Winkler expressed as % of the reference price -> comparable across tickers."""
    return 100.0 * winkler_score(low, high, y, alpha) / ref_price


def brier(p, outcome):
    return (p - (1.0 if outcome else 0.0)) ** 2


# --------------------------------------------------------------------------
# STATE
# --------------------------------------------------------------------------
def state_path(ticker):
    return os.path.join(STATE_DIR, f"state_{ticker.upper()}.json")


def load_state(ticker=None):
    if ticker is None:
        cands = [f for f in os.listdir(STATE_DIR) if f.startswith("state_") and f.endswith(".json")]
        if len(cands) != 1:
            sys.exit(f"Specify --ticker (found {len(cands)} state files)")
        ticker = cands[0][6:-5]
    p = state_path(ticker)
    if not os.path.exists(p):
        sys.exit(f"No state for {ticker}. Run `init` first.")
    with open(p) as f:
        return json.load(f)


def save_state(st):
    with open(state_path(st["ticker"]), "w") as f:
        json.dump(st, f, indent=1)


# --------------------------------------------------------------------------
# COMMANDS
# --------------------------------------------------------------------------
def cmd_init(a):
    df = load_bars(a.ticker)
    dates = df["date"].dt.strftime("%Y-%m-%d").tolist()
    if a.start not in dates:
        later = [d for d in dates if d >= a.start]
        if not later:
            sys.exit("start date beyond dataset")
        a.start = later[0]
    cursor = dates.index(a.start)
    if cursor < 200:
        print(f"[warn] only {cursor} warmup bars before start; sma200 will be null "
              f"until {dates[200]}")
    st = dict(
        ticker=a.ticker.upper(), trial_id=a.trial_id or f"{a.ticker.upper()}-{datetime.now(timezone.utc):%Y%m%dT%H%M}",
        created_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        cursor=cursor, start_date=a.start, last_date=dates[-1], n_bars=len(dates),
        cfg={**DEFAULTS, "capital": a.capital, "risk_free": a.risk_free},
        cash=a.capital, equity_curve=[], positions=[], option_positions=[],
        closed_trades=[], predictions=[], insights=[], news=[], log=[],
        blocked_peeks=0,
    )
    save_state(st)
    print(json.dumps({
        "ok": True, "ticker": st["ticker"], "trial_id": st["trial_id"],
        "decision_day": dates[cursor], "visible_bars": cursor,
        "final_bar_in_dataset": dates[-1],
        "note": "You may see bars strictly BEFORE decision_day. Call `brief` next."
    }, indent=1))


def _visible(st, df):
    return df.iloc[: st["cursor"]]


def _mark(st, px):
    eq = st["cash"]
    for p in st["positions"]:
        eq += p["shares"] * px if p["side"] == "long" else -p["shares"] * px
    for o in st["option_positions"]:
        eq += 0  # premium already in cash; collateral tracked separately
    return eq


def cmd_brief(a):
    st = load_state(a.ticker)
    df = load_bars(st["ticker"])
    vis = _visible(st, df)
    dec_date = df["date"].iloc[st["cursor"]].strftime("%Y-%m-%d")
    ind = build_indicators(vis)

    # unresolved predictions still in flight
    open_preds = [p for p in st["predictions"] if p["status"] == "open"]
    news_seen = [n for n in st["news"] if n["date"] <= ind["date_of_last_close"]]

    out = {
        "DECISION_DAY": dec_date,
        "RULE": "All figures below are as of the prior close. Day-of OHLC is withheld.",
        "day_index": st["cursor"], "days_remaining": st["n_bars"] - st["cursor"] - 1,
        "indicators": ind,
        "recent_bars_last10": vis.tail(10).assign(
            date=vis.tail(10)["date"].dt.strftime("%Y-%m-%d")).round(2).to_dict("records"),
        "account": {
            "cash": round(st["cash"], 2),
            "equity_at_last_close": round(_mark(st, ind["close"]), 2),
            "open_positions": st["positions"],
            "open_options": st["option_positions"],
        },
        "open_predictions": open_preds,
        "insights_carried": st["insights"][-25:],
        "news_on_file_through_prior_close": news_seen[-15:],
        "suggested_option_strikes": _suggest_strikes(ind, st),
    }
    print(json.dumps(out, indent=1, default=str))


def _suggest_strikes(ind, st):
    S = ind["close"]
    sig = ind["yang_zhang_vol_20d_ann"] or ind["ewma_vol_ann"] or 0.30
    iv = sig * (1 + st["cfg"]["vrp_wedge"])
    r = st["cfg"]["risk_free"]
    out = {}
    for dte in (30, 45):
        T = dte / 365
        out[f"{dte}dte"] = {
            "assumed_IV": round(iv, 4),
            "csp_30delta_strike": strike_for_delta(S, 0.30, T, r, iv, "put"),
            "csp_20delta_strike": strike_for_delta(S, 0.20, T, r, iv, "put"),
            "cc_30delta_strike": strike_for_delta(S, 0.30, T, r, iv, "call"),
            "cc_20delta_strike": strike_for_delta(S, 0.20, T, r, iv, "call"),
        }
    return out


def cmd_predict(a):
    st = load_state(a.ticker)
    df = load_bars(st["ticker"])
    dec_date = df["date"].iloc[st["cursor"]].strftime("%Y-%m-%d")
    ref = float(df["close"].iloc[st["cursor"] - 1])
    tgt_idx = min(st["cursor"] + a.horizon - 1, st["n_bars"] - 1)
    p = dict(
        id=f"P{len(st['predictions'])+1:03d}", made_on=dec_date, ref_close=round(ref, 2),
        low=a.low, high=a.high, conf=a.conf, horizon=a.horizon,
        resolve_index=tgt_idx, resolve_date=df["date"].iloc[tgt_idx].strftime("%Y-%m-%d"),
        direction=a.dir, p_direction=a.pdir, rationale=a.rationale, signals=a.signals,
        status="open",
    )
    st["predictions"].append(p)
    save_state(st)
    print(json.dumps({"ok": True, "prediction": p,
                      "width_pct_of_price": round((a.high - a.low) / ref * 100, 2)}, indent=1))


def cmd_trade(a):
    st = load_state(a.ticker); df = load_bars(st["ticker"]); cfg = st["cfg"]
    i = st["cursor"]
    fill_open = float(df["open"].iloc[i])
    slip = fill_open * cfg["slippage_bps"] / 10000
    act = a.action.upper()
    dec_date = df["date"].iloc[i].strftime("%Y-%m-%d")

    if act in ("BUY", "SHORT"):
        px = fill_open + slip if act == "BUY" else fill_open - slip
        cost = px * a.shares
        if act == "BUY" and cost + cfg["commission"] > st["cash"]:
            sys.exit(f"Insufficient cash: need {cost:,.2f}, have {st['cash']:,.2f}")
        st["cash"] -= (cost if act == "BUY" else -cost) + cfg["commission"]
        pos = dict(id=f"T{len(st['closed_trades'])+len(st['positions'])+1:03d}",
                   side="long" if act == "BUY" else "short", shares=a.shares,
                   entry=round(px, 4), entry_date=dec_date, stop=a.stop, target=a.target,
                   expected_exit_price=a.exit_price, expected_exit_date=a.exit_date,
                   signals=a.signals, thesis=a.thesis)
        st["positions"].append(pos)
        save_state(st)
        print(json.dumps({"ok": True, "filled": pos, "cash": round(st["cash"], 2)}, indent=1))

    elif act in ("SELL", "COVER"):
        match = [p for p in st["positions"] if (a.id is None or p["id"] == a.id)]
        if not match:
            sys.exit("No matching open position")
        pos = match[0]
        px = fill_open - slip if pos["side"] == "long" else fill_open + slip
        _close_position(st, pos, px, dec_date, "manual")
        save_state(st)
        print(json.dumps({"ok": True, "closed": st["closed_trades"][-1],
                          "cash": round(st["cash"], 2)}, indent=1))
    else:
        sys.exit("action must be BUY|SELL|SHORT|COVER")


def _close_position(st, pos, px, date, reason):
    cfg = st["cfg"]
    if pos["side"] == "long":
        pnl = (px - pos["entry"]) * pos["shares"]
        st["cash"] += px * pos["shares"]
    else:
        pnl = (pos["entry"] - px) * pos["shares"]
        st["cash"] -= px * pos["shares"]  # buy back; proceeds were credited at entry
    st["cash"] -= cfg["commission"]
    held = pos.copy()
    held.update(exit=round(px, 4), exit_date=date, exit_reason=reason,
                pnl=round(pnl - cfg["commission"], 2),
                pnl_pct=round(pnl / (pos["entry"] * pos["shares"]) * 100, 2))
    if pos.get("expected_exit_date"):
        held["exit_date_error_days"] = _bizdiff(pos["expected_exit_date"], date)
    if pos.get("expected_exit_price"):
        held["exit_price_error_pct"] = round((px / pos["expected_exit_price"] - 1) * 100, 2)
    st["closed_trades"].append(held)
    st["positions"] = [p for p in st["positions"] if p["id"] != pos["id"]]


def _bizdiff(d1, d2):
    return int(np.busday_count(np.datetime64(d1), np.datetime64(d2)))


def cmd_option(a):
    st = load_state(a.ticker); df = load_bars(st["ticker"]); cfg = st["cfg"]
    i = st["cursor"]
    S = float(df["open"].iloc[i])
    vis = _visible(st, df)
    sig = yang_zhang_vol(vis, 20)
    if sig != sig:
        sig = ewma_vol(vis)
    iv = (a.iv if a.iv else sig * (1 + cfg["vrp_wedge"]))
    T = a.dte / 365
    kind = "put" if a.type.upper() == "CSP" else "call"
    K = a.strike if a.strike else strike_for_delta(S, a.delta, T, cfg["risk_free"], iv, kind)
    mid = bs_price(S, K, T, cfg["risk_free"], iv, kind)
    fill = mid * (1 - cfg["opt_spread_pct"])          # we SELL -> hit the bid
    prem = fill * 100 * a.contracts - cfg["opt_commission"] * a.contracts
    exp_idx = min(i + int(round(a.dte * 252 / 365)), st["n_bars"] - 1)

    if kind == "put":
        collateral = K * 100 * a.contracts
        if collateral > st["cash"]:
            sys.exit(f"CSP needs {collateral:,.0f} collateral, cash {st['cash']:,.0f}")
    else:
        need = 100 * a.contracts
        have = sum(p["shares"] for p in st["positions"] if p["side"] == "long")
        if have < need:
            sys.exit(f"Covered call needs {need} shares long, have {have}")
        collateral = 0.0

    st["cash"] += prem
    o = dict(id=f"O{len(st['option_positions'])+1:03d}", type=a.type.upper(), kind=kind,
             strike=K, contracts=a.contracts, dte=a.dte,
             opened=df["date"].iloc[i].strftime("%Y-%m-%d"),
             expiry_index=exp_idx, expiry=df["date"].iloc[exp_idx].strftime("%Y-%m-%d"),
             assumed_iv=round(iv, 4), spot_at_open=round(S, 2),
             delta_at_open=round(abs(bs_delta(S, K, T, cfg["risk_free"], iv, kind)), 3),
             premium=round(prem, 2), collateral=round(collateral, 2),
             signals=a.signals, thesis=a.thesis, status="open")
    st["option_positions"].append(o)
    save_state(st)
    print(json.dumps({"ok": True, "opened": o, "cash": round(st["cash"], 2),
                      "note": "Premium is SYNTHETIC (Black-Scholes on realized vol + VRP wedge). "
                              "No skew, no earnings vol crush. See context doc §5."}, indent=1))


def cmd_advance(a):
    st = load_state(a.ticker); df = load_bars(st["ticker"])
    events = []
    for _ in range(a.n):
        if st["cursor"] >= st["n_bars"]:
            events.append({"end_of_data": True}); break
        events.extend(_step(st, df))
    save_state(st)
    nxt = (df["date"].iloc[st["cursor"]].strftime("%Y-%m-%d")
           if st["cursor"] < st["n_bars"] else None)
    print(json.dumps({"events": events, "next_decision_day": nxt,
                      "cash": round(st["cash"], 2),
                      "equity": round(st["equity_curve"][-1]["equity"], 2) if st["equity_curve"] else None},
                     indent=1))


def _step(st, df):
    """Resolve one bar: stops/targets, option expiry, prediction scoring."""
    i = st["cursor"]; bar = df.iloc[i]; ev = []
    d = bar["date"].strftime("%Y-%m-%d")
    o, h, l, c = float(bar["open"]), float(bar["high"]), float(bar["low"]), float(bar["close"])

    # --- stops & targets (conservative: gaps fill at the open, stop before target)
    for pos in list(st["positions"]):
        if pos["side"] == "long":
            if pos.get("stop") and l <= pos["stop"]:
                px = min(o, pos["stop"]) if o <= pos["stop"] else pos["stop"]
                _close_position(st, pos, px, d, "stop"); ev.append({"stop_hit": pos["id"], "px": round(px, 2), "date": d}); continue
            if pos.get("target") and h >= pos["target"]:
                px = max(o, pos["target"]) if o >= pos["target"] else pos["target"]
                _close_position(st, pos, px, d, "target"); ev.append({"target_hit": pos["id"], "px": round(px, 2), "date": d})
        else:
            if pos.get("stop") and h >= pos["stop"]:
                px = max(o, pos["stop"]) if o >= pos["stop"] else pos["stop"]
                _close_position(st, pos, px, d, "stop"); ev.append({"stop_hit": pos["id"], "px": round(px, 2), "date": d}); continue
            if pos.get("target") and l <= pos["target"]:
                px = min(o, pos["target"]) if o <= pos["target"] else pos["target"]
                _close_position(st, pos, px, d, "target"); ev.append({"target_hit": pos["id"], "px": round(px, 2), "date": d})

    # --- option expiry / assignment
    for op in list(st["option_positions"]):
        if i >= op["expiry_index"]:
            itm = (c < op["strike"]) if op["kind"] == "put" else (c > op["strike"])
            if not itm:
                op["status"] = "expired_worthless"; op["closed"] = d; op["settle_pnl"] = 0.0
                ev.append({"option_expired": op["id"], "kept_premium": op["premium"], "date": d})
            else:
                if op["kind"] == "put":
                    sh = 100 * op["contracts"]
                    st["cash"] -= op["strike"] * sh
                    st["positions"].append(dict(
                        id=f"A{op['id']}", side="long", shares=sh, entry=op["strike"],
                        entry_date=d, stop=None, target=None,
                        signals="assigned_from_CSP " + op["id"], thesis="put assignment"))
                    op["status"] = "assigned_long_shares"
                    ev.append({"csp_assigned": op["id"], "shares": sh, "at": op["strike"], "date": d})
                else:
                    sh = 100 * op["contracts"]
                    longs = [p for p in st["positions"] if p["side"] == "long"]
                    rem = sh
                    for p in longs:
                        if rem <= 0: break
                        take = min(rem, p["shares"])
                        pnl = (op["strike"] - p["entry"]) * take
                        st["cash"] += op["strike"] * take
                        p["shares"] -= take; rem -= take
                        st["closed_trades"].append({**{k: v for k, v in p.items() if k != "shares"},
                                                    "shares": take, "exit": op["strike"], "exit_date": d,
                                                    "exit_reason": "called_away", "pnl": round(pnl, 2),
                                                    "pnl_pct": round(pnl / (p["entry"] * take) * 100, 2)})
                    st["positions"] = [p for p in st["positions"] if p["shares"] > 0]
                    op["status"] = "called_away"
                    ev.append({"cc_assigned": op["id"], "shares": sh - rem, "at": op["strike"], "date": d})
            op["closed"] = d
            st["option_positions"] = [x for x in st["option_positions"] if x["id"] != op["id"]]
            st.setdefault("closed_options", []).append(op)

    # --- prediction scoring
    for p in st["predictions"]:
        if p["status"] == "open" and i >= p["resolve_index"]:
            y = c
            ws = normalized_winkler(p["low"], p["high"], y, p["ref_close"], 1 - p["conf"])
            hit = p["low"] <= y <= p["high"]
            up = y > p["ref_close"]
            dir_right = (p["direction"] == "up") == up
            p.update(status="scored", realized_close=round(y, 2), realized_date=d,
                     inside_interval=bool(hit),
                     winkler_pct=round(ws, 3),
                     width_pct=round((p["high"] - p["low"]) / p["ref_close"] * 100, 2),
                     direction_correct=bool(dir_right),
                     brier=round(brier(p["p_direction"], dir_right), 4),
                     realized_move_pct=round((y / p["ref_close"] - 1) * 100, 2))
            ev.append({"prediction_scored": p["id"], "inside": hit,
                       "winkler_pct": p["winkler_pct"], "realized": p["realized_close"],
                       "dir_correct": dir_right})

    eq = _mark(st, c)
    st["equity_curve"].append({"date": d, "close": round(c, 2), "equity": round(eq, 2)})
    st["cursor"] += 1
    if not ev:
        ev.append({"quiet_day": d, "close": round(c, 2)})
    return ev


def cmd_insight(a):
    st = load_state(a.ticker); df = load_bars(st["ticker"])
    d = df["date"].iloc[min(st["cursor"], st["n_bars"] - 1)].strftime("%Y-%m-%d")
    rec = dict(n=len(st["insights"]) + 1, as_of=d, kind=a.kind, text=a.text,
               confidence=a.confidence)
    st["insights"].append(rec); save_state(st)
    print(json.dumps({"ok": True, "insight": rec, "total": len(st["insights"])}, indent=1))


def cmd_news(a):
    st = load_state(a.ticker)
    if a.date > df_last_visible_date(st):
        sys.exit(f"REJECTED: news dated {a.date} is not yet knowable "
                 f"(prior close is {df_last_visible_date(st)}). Look-ahead blocked.")
    st["news"].append(dict(date=a.date, headline=a.headline, source=a.source,
                           sentiment=a.sentiment, note=a.note))
    save_state(st)
    print(json.dumps({"ok": True, "stored": st["news"][-1]}, indent=1))


def df_last_visible_date(st):
    df = load_bars(st["ticker"])
    return df["date"].iloc[st["cursor"] - 1].strftime("%Y-%m-%d")


def cmd_report(a):
    st = load_state(a.ticker)
    ct = st["closed_trades"]; preds = [p for p in st["predictions"] if p["status"] == "scored"]
    eq = [e["equity"] for e in st["equity_curve"]]
    cap = st["cfg"]["capital"]

    perf = {}
    if eq:
        rets = np.diff(eq) / np.array(eq[:-1])
        rets = rets[np.isfinite(rets)]
        peak = np.maximum.accumulate(eq)
        dd = (np.array(eq) - peak) / peak
        n = len(eq)
        perf = dict(
            final_equity=round(eq[-1], 2),
            total_return_pct=round((eq[-1] / cap - 1) * 100, 2),
            ann_return_pct=round(((eq[-1] / cap) ** (252 / max(n, 1)) - 1) * 100, 2),
            ann_vol_pct=round(float(rets.std(ddof=1) * np.sqrt(252) * 100), 2) if len(rets) > 2 else None,
            sharpe=round(float(rets.mean() / rets.std(ddof=1) * np.sqrt(252)), 3) if len(rets) > 2 and rets.std() > 0 else None,
            max_drawdown_pct=round(float(dd.min() * 100), 2),
            trading_days=n,
        )
        # buy & hold benchmark over the same window
        c0, c1 = st["equity_curve"][0]["close"], st["equity_curve"][-1]["close"]
        perf["buy_hold_return_pct"] = round((c1 / c0 - 1) * 100, 2)
        perf["excess_vs_buy_hold_pct"] = round(perf["total_return_pct"] - perf["buy_hold_return_pct"], 2)

    wins = [t for t in ct if t["pnl"] > 0]
    trade_stats = dict(
        n_trades=len(ct),
        win_rate_pct=round(100 * len(wins) / len(ct), 1) if ct else None,
        avg_win=round(np.mean([t["pnl"] for t in wins]), 2) if wins else None,
        avg_loss=round(np.mean([t["pnl"] for t in ct if t["pnl"] <= 0]), 2) if len(wins) < len(ct) else None,
        profit_factor=round(sum(t["pnl"] for t in wins) / abs(sum(t["pnl"] for t in ct if t["pnl"] <= 0)), 2)
        if any(t["pnl"] <= 0 for t in ct) and wins else None,
        exit_date_mae_days=round(float(np.mean([abs(t["exit_date_error_days"]) for t in ct
                                                if "exit_date_error_days" in t])), 1)
        if any("exit_date_error_days" in t for t in ct) else None,
        exit_price_mae_pct=round(float(np.mean([abs(t["exit_price_error_pct"]) for t in ct
                                                if "exit_price_error_pct" in t])), 2)
        if any("exit_price_error_pct" in t for t in ct) else None,
        by_exit_reason={r: sum(1 for t in ct if t["exit_reason"] == r)
                        for r in set(t["exit_reason"] for t in ct)} if ct else {},
    )

    fc = {}
    if preds:
        cover = np.mean([p["inside_interval"] for p in preds])
        nominal = np.mean([p["conf"] for p in preds])
        fc = dict(
            n_predictions=len(preds),
            empirical_coverage=round(float(cover), 3),
            nominal_coverage=round(float(nominal), 3),
            calibration_gap=round(float(cover - nominal), 3),
            mean_winkler_pct=round(float(np.mean([p["winkler_pct"] for p in preds])), 3),
            median_winkler_pct=round(float(np.median([p["winkler_pct"] for p in preds])), 3),
            mean_interval_width_pct=round(float(np.mean([p["width_pct"] for p in preds])), 2),
            direction_hit_rate=round(float(np.mean([p["direction_correct"] for p in preds])), 3),
            mean_brier=round(float(np.mean([p["brier"] for p in preds])), 4),
            brier_vs_coinflip=round(float(np.mean([p["brier"] for p in preds]) - 0.25), 4),
            verdict=("intervals TOO NARROW" if cover < nominal - 0.10 else
                     "intervals TOO WIDE" if cover > nominal + 0.10 else "well calibrated"),
        )

    rep = dict(trial_id=st["trial_id"], ticker=st["ticker"],
               window=[st["start_date"], st["equity_curve"][-1]["date"] if st["equity_curve"] else st["start_date"]],
               config=st["cfg"], performance=perf, trades=trade_stats, forecasting=fc,
               closed_trades=ct, scored_predictions=preds,
               closed_options=st.get("closed_options", []),
               insights=st["insights"], equity_curve=st["equity_curve"])
    txt = json.dumps(rep, indent=1, default=str)
    if a.out:
        with open(a.out, "w") as f:
            f.write(txt)
        print(json.dumps({"ok": True, "written": a.out, "summary": {
            "performance": perf, "trades": trade_stats, "forecasting": fc}}, indent=1))
    else:
        print(txt)


def cmd_chart(a):
    """ASCII candlestick-ish chart of the VISIBLE window only."""
    st = load_state(a.ticker); df = load_bars(st["ticker"])
    vis = _visible(st, df).tail(a.bars)
    hi, lo = vis["high"].max(), vis["low"].min()
    rows, width = a.rows, len(vis)
    print(f"{st['ticker']}  last {width} bars through {vis['date'].iloc[-1]:%Y-%m-%d}"
          f"   hi={hi:.2f} lo={lo:.2f}")
    c = vis["close"]
    s20 = sma(_visible(st, df)["close"], 20).tail(a.bars)
    grid = [[" "] * width for _ in range(rows)]

    def y(v):
        return int(round((hi - v) / (hi - lo) * (rows - 1)))
    for j in range(width):
        o_, h_, l_, c_ = vis["open"].iloc[j], vis["high"].iloc[j], vis["low"].iloc[j], vis["close"].iloc[j]
        for r in range(y(h_), y(l_) + 1):
            grid[r][j] = "|"
        b0, b1 = sorted((y(o_), y(c_)))
        ch = "#" if c_ >= o_ else "="
        for r in range(b0, b1 + 1):
            grid[r][j] = ch
        if not np.isnan(s20.iloc[j]):
            r = y(s20.iloc[j])
            if 0 <= r < rows and grid[r][j] == " ":
                grid[r][j] = "."
    for r, row in enumerate(grid):
        v = hi - (hi - lo) * r / (rows - 1)
        print(f"{v:9.2f} " + "".join(row))
    print(" " * 10 + f"{vis['date'].iloc[0]:%m/%d}" + " " * max(0, width - 11) + f"{vis['date'].iloc[-1]:%m/%d}")
    print("legend: # up candle  = down candle  | wick  . sma20")


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Walk-forward trading simulator")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init"); p.add_argument("--ticker", required=True)
    p.add_argument("--start", default="2024-07-01"); p.add_argument("--capital", type=float, default=100000)
    p.add_argument("--risk-free", dest="risk_free", type=float, default=0.045)
    p.add_argument("--trial-id", dest="trial_id"); p.set_defaults(f=cmd_init)

    p = sub.add_parser("brief"); p.add_argument("--ticker"); p.set_defaults(f=cmd_brief)

    p = sub.add_parser("predict"); p.add_argument("--ticker")
    p.add_argument("--low", type=float, required=True); p.add_argument("--high", type=float, required=True)
    p.add_argument("--horizon", type=int, default=10); p.add_argument("--conf", type=float, default=0.80)
    p.add_argument("--dir", choices=["up", "down"], required=True)
    p.add_argument("--pdir", type=float, default=0.55, help="P(direction is correct), 0-1")
    p.add_argument("--signals", default=""); p.add_argument("--rationale", default="")
    p.set_defaults(f=cmd_predict)

    p = sub.add_parser("trade"); p.add_argument("--ticker")
    p.add_argument("--action", required=True); p.add_argument("--shares", type=int, default=0)
    p.add_argument("--stop", type=float); p.add_argument("--target", type=float)
    p.add_argument("--exit-price", dest="exit_price", type=float)
    p.add_argument("--exit-date", dest="exit_date"); p.add_argument("--id")
    p.add_argument("--signals", default=""); p.add_argument("--thesis", default="")
    p.set_defaults(f=cmd_trade)

    p = sub.add_parser("option"); p.add_argument("--ticker")
    p.add_argument("--type", required=True, choices=["CSP", "CC", "csp", "cc"])
    p.add_argument("--strike", type=float); p.add_argument("--delta", type=float, default=0.30)
    p.add_argument("--dte", type=int, default=30); p.add_argument("--contracts", type=int, default=1)
    p.add_argument("--iv", type=float); p.add_argument("--signals", default="")
    p.add_argument("--thesis", default=""); p.set_defaults(f=cmd_option)

    p = sub.add_parser("advance"); p.add_argument("--ticker"); p.add_argument("--n", type=int, default=1)
    p.set_defaults(f=cmd_advance)

    p = sub.add_parser("insight"); p.add_argument("--ticker")
    p.add_argument("--text", required=True)
    p.add_argument("--kind", default="observation",
                   choices=["observation", "rule-tweak", "failure-mode", "regime", "gap"])
    p.add_argument("--confidence", default="medium", choices=["low", "medium", "high"])
    p.set_defaults(f=cmd_insight)

    p = sub.add_parser("news"); p.add_argument("--ticker"); p.add_argument("--date", required=True)
    p.add_argument("--headline", required=True); p.add_argument("--source", default="")
    p.add_argument("--sentiment", default="neutral", choices=["bullish", "bearish", "neutral"])
    p.add_argument("--note", default=""); p.set_defaults(f=cmd_news)

    p = sub.add_parser("report"); p.add_argument("--ticker"); p.add_argument("--out")
    p.set_defaults(f=cmd_report)

    p = sub.add_parser("chart"); p.add_argument("--ticker"); p.add_argument("--bars", type=int, default=60)
    p.add_argument("--rows", type=int, default=22); p.set_defaults(f=cmd_chart)

    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
