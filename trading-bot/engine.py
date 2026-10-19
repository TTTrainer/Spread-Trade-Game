#!/usr/bin/env python3
"""
engine.py -- in-memory trading books for lockstep trials on a MarketView.

Fill and scoring rules are simulator.py's, imported rather than copied, so a trial run through
this engine and a run through the simulator CLI follow the same rules:
  * Orders placed on decision day D fill at D's open +/- slippage (simulator DEFAULTS, 2 bps).
  * Stops/targets resolve against D's bar. A gap through a level fills at the open; if both are
    touched in one bar, the stop wins. A position opened at D's open is exposed to D's bar.
  * Predictions resolve at the close of resolve_index (= decision index + horizon - 1) and are
    scored with simulator.normalized_winkler and simulator.brier.
  * One open position per book (ticker x arm). Commission per simulator DEFAULTS.

Per session the driver calls, in order: close()/open()/predict() for any book, then
resolve_session() once, then view.advance(). finish() closes leftovers at the last close.
"""
import math

import numpy as np

import simulator as sim


class Book:
    def __init__(self, ticker, arm, capital):
        self.ticker, self.arm = ticker, arm
        self.capital = self.cash = float(capital)
        self.position = None
        self.closed, self.predictions, self.equity_curve = [], [], []

    def equity_at(self, px):
        if self.position is None:
            return self.cash
        p = self.position
        return self.cash + (p["shares"] * px if p["side"] == "long" else -p["shares"] * px)

    def last_equity(self):
        return self.equity_curve[-1]["equity"] if self.equity_curve else self.capital


class Engine:
    def __init__(self, view, arms=("A",), capital=100_000.0):
        self.view = view
        self.slip = sim.DEFAULTS["slippage_bps"] / 10_000
        self.commission = sim.DEFAULTS["commission"]
        self.books = {(t, a): Book(t, a, capital) for t in view.tickers for a in arms}
        self._seq = 0
        self._last_close = {}

    def book(self, ticker, arm):
        return self.books[(ticker, arm)]

    # ---- sizing -------------------------------------------------------------------------
    @staticmethod
    def size_shares(equity, ref_px, stop_dist, risk_pct=0.01, cap_pct=0.25):
        """1% equity risk to the stop, capped at 25% of equity in notional (protocol §6)."""
        if stop_dist <= 0 or ref_px <= 0:
            return 0
        return int(math.floor(min(risk_pct * equity / stop_dist, cap_pct * equity / ref_px)))

    # ---- orders (fill at the decision day's open) ----------------------------------------
    def open(self, ticker, arm, side, shares, stop, target, time_stop_index=None,
             signal_dir=None, expected_exit_price=None, expected_exit_date=None, meta=None):
        b = self.book(ticker, arm)
        if b.position is not None:
            raise RuntimeError(f"{ticker}/{arm}: one open position per book")
        if side not in ("long", "short") or shares < 1:
            raise ValueError("side must be long|short and shares >= 1")
        bar = self.view._bar(ticker)
        px = bar["open"] * (1 + self.slip) if side == "long" else bar["open"] * (1 - self.slip)
        if side == "long" and px * shares + self.commission > b.cash:
            raise RuntimeError(f"{ticker}/{arm}: insufficient cash")
        b.cash += (-px * shares if side == "long" else px * shares) - self.commission
        self._seq += 1
        b.position = dict(
            id=f"T{self._seq:05d}", ticker=ticker, arm=arm, side=side, shares=int(shares),
            entry=px, entry_date=str(bar["date"].date()), entry_index=self.view.cursor,
            stop=stop, target=target, risk_per_share=abs(px - stop) if stop else None,
            time_stop_index=time_stop_index,
            signal_dir=signal_dir if signal_dir is not None else (1 if side == "long" else -1),
            expected_exit_price=expected_exit_price, expected_exit_date=expected_exit_date,
            **(meta or {}))
        return b.position

    def close(self, ticker, arm, reason):
        b = self.book(ticker, arm)
        if b.position is None:
            raise RuntimeError(f"{ticker}/{arm}: no open position")
        bar = self.view._bar(ticker)
        side = b.position["side"]
        px = bar["open"] * (1 - self.slip) if side == "long" else bar["open"] * (1 + self.slip)
        return self._close(b, px, str(bar["date"].date()), reason)

    def _close(self, b, px, date, reason):
        p = b.position
        if p["side"] == "long":
            pnl = (px - p["entry"]) * p["shares"]
            b.cash += px * p["shares"]
        else:
            pnl = (p["entry"] - px) * p["shares"]
            b.cash -= px * p["shares"]
        b.cash -= self.commission
        t = dict(p)
        t.update(exit=px, exit_date=date, exit_index=self.view.cursor, exit_reason=reason,
                 pnl=pnl - self.commission, pnl_pct=pnl / (p["entry"] * p["shares"]) * 100,
                 held_sessions=self.view.cursor - p["entry_index"])
        if p.get("risk_per_share"):
            t["R"] = t["pnl"] / (p["risk_per_share"] * p["shares"])
        if p.get("expected_exit_date"):
            t["exit_date_error_days"] = sim._bizdiff(p["expected_exit_date"], date)
        if p.get("expected_exit_price"):
            t["exit_price_error_pct"] = (px / p["expected_exit_price"] - 1) * 100
        b.closed.append(t)
        b.position = None
        return t

    # ---- range predictions ------------------------------------------------------------------
    def predict(self, ticker, arm, low, high, horizon, direction, pdir, conf=0.80,
                control=False, signals="", meta=None):
        b = self.book(ticker, arm)
        vis = self.view.visible(ticker)
        i = self.view.cursor
        ridx = min(i + horizon - 1, self.view.n - 1)
        p = dict(id=f"{ticker}-{arm}-P{len(b.predictions) + 1:04d}", ticker=ticker, arm=arm,
                 control=bool(control), made_on=str(self.view.date.date()), made_index=i,
                 ref_close=float(vis.close.iloc[-1]), low=low, high=high, conf=conf,
                 horizon=horizon, resolve_index=ridx,
                 resolve_date=str(self.view.calendar[ridx].date()), direction=direction,
                 p_direction=pdir, signals=signals, status="open", **(meta or {}))
        b.predictions.append(p)
        return p

    # ---- resolve the decision day's bar ------------------------------------------------------
    def resolve_session(self):
        i = self.view.cursor
        for (t, _), b in self.books.items():
            bar = self.view._bar(t)
            d, o, h, l, c = str(bar["date"].date()), bar["open"], bar["high"], bar["low"], bar["close"]
            p = b.position
            if p is not None:
                if p["side"] == "long":
                    if p["stop"] and l <= p["stop"]:
                        self._close(b, min(o, p["stop"]), d, "stop")
                    elif p["target"] and h >= p["target"]:
                        self._close(b, max(o, p["target"]), d, "target")
                else:
                    if p["stop"] and h >= p["stop"]:
                        self._close(b, max(o, p["stop"]), d, "stop")
                    elif p["target"] and l <= p["target"]:
                        self._close(b, min(o, p["target"]), d, "target")
            for pr in b.predictions:
                if pr["status"] == "open" and i >= pr["resolve_index"]:
                    up = c > pr["ref_close"]
                    right = (pr["direction"] == "up") == up
                    pr.update(status="scored", realized_close=c, realized_date=d,
                              inside_interval=bool(pr["low"] <= c <= pr["high"]),
                              winkler_pct=sim.normalized_winkler(pr["low"], pr["high"], c,
                                                                 pr["ref_close"], 1 - pr["conf"]),
                              width_pct=(pr["high"] - pr["low"]) / pr["ref_close"] * 100,
                              direction_correct=bool(right), brier=sim.brier(pr["p_direction"], right),
                              realized_move_pct=(c / pr["ref_close"] - 1) * 100)
            b.equity_curve.append(dict(date=d, equity=b.equity_at(c)))
            self._last_close[t] = (d, c)

    def finish(self):
        """After the last resolve_session: close leftovers at the last close."""
        for (t, _), b in self.books.items():
            if b.position is not None:
                d, c = self._last_close[t]
                self._close(b, c, d, "end_of_data")

    # ---- outputs ------------------------------------------------------------------------
    def trades(self):
        return [t for b in self.books.values() for t in b.closed]

    def predictions(self):
        return [p for b in self.books.values() for p in b.predictions]

    def equity_rows(self):
        return [dict(ticker=b.ticker, arm=b.arm, **e) for b in self.books.values() for e in b.equity_curve]


def sigma_median(ind):
    """MASTER_LOG §2: median of Yang-Zhang 20d, EWMA(0.94) and ATR14/close*sqrt(252)/1.20, annualised,
    from simulator.build_indicators() on the visible bars."""
    vals = [ind.get("yang_zhang_vol_20d_ann"), ind.get("ewma_vol_ann")]
    if ind.get("atr14") and ind.get("close"):
        vals.append(ind["atr14"] / ind["close"] * math.sqrt(252) / 1.20)
    vals = [v for v in vals if v is not None and v == v]
    return float(np.median(vals)) if vals else None
