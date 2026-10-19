#!/usr/bin/env python3
"""
charts.py -- 1-day candlestick and equity charts as PNG (matplotlib, Agg backend).

  candles(vis, path, ...)        bars the caller passes in -- pass MarketView.visible(t) during a
                                 run so a chart can never show the future.
  trade_postmortem(bars, trade, path)   AFTER a run: bars up to entry, then the realized path
                                 (shaded and labelled), entry/stop/target and the predicted range.
                                 Contains outcomes: save under the sealed output folder.
  equity_curves(curves, path)    one line per arm on one axis, direct-labelled.

Up/down never relies on color alone: up days are hollow bodies, down days are filled.
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.ticker  # noqa: E402,F401
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

SURFACE, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#e6e5e0"
UP, DOWN = "#2a78d6", "#e34948"            # diverging pair: blue = up, red = down
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]  # categorical slots 1-3 (arms A, B, C)
RANGE_FILL = "#cde2fb"


def _style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(MUTED)
    ax.tick_params(colors=INK2, labelsize=8)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def _draw_candles(ax, df, x0=0, alpha=1.0):
    for i, r in enumerate(df.itertuples()):
        x, up = x0 + i, r.close >= r.open
        col = UP if up else DOWN
        ax.vlines(x, r.low, r.high, color=col, linewidth=1, alpha=alpha)
        lo, hi = sorted((r.open, r.close))
        ax.add_patch(plt.Rectangle((x - 0.32, lo), 0.64, max(hi - lo, 1e-9), alpha=alpha,
                                   facecolor=SURFACE if up else col, edgecolor=col, linewidth=1))


def _date_ticks(ax, dates, every=None):
    n = len(dates)
    every = every or max(1, n // 6)
    idx = list(range(0, n, every))
    ax.set_xticks(idx)
    ax.set_xticklabels([pd.Timestamp(dates[i]).strftime("%Y-%m-%d") for i in idx], rotation=0)


def candles(vis, path, title="", last_n=120, sma=20, bollinger=True, interval=None, levels=None):
    """vis: DataFrame date,open,high,low,close,volume (already gated). interval: dict(low, high,
    horizon) drawn after the last bar. levels: dict(entry=, stop=, target=)."""
    df = vis.tail(last_n).reset_index(drop=True)
    full_c = vis.close
    fig, (ax, axv) = plt.subplots(2, 1, figsize=(11, 6.2), sharex=True, dpi=110,
                                  gridspec_kw=dict(height_ratios=[3.2, 1], hspace=0.06))
    fig.patch.set_facecolor(SURFACE)
    for a in (ax, axv):
        _style(a)
    _draw_candles(ax, df)
    if sma and len(full_c) >= sma:
        m = full_c.rolling(sma).mean().tail(last_n).values
        ax.plot(range(len(df)), m, color=INK2, linewidth=1.5, label=f"SMA{sma}")
        if bollinger:
            sd = full_c.rolling(sma).std(ddof=0).tail(last_n).values
            ax.plot(range(len(df)), m + 2 * sd, color=MUTED, linewidth=1, linestyle="--", label="Bollinger ±2σ")
            ax.plot(range(len(df)), m - 2 * sd, color=MUTED, linewidth=1, linestyle="--")
    right = len(df)
    if interval:
        h = int(interval.get("horizon", 5))
        ax.add_patch(plt.Rectangle((len(df) - 0.5, interval["low"]), h, interval["high"] - interval["low"],
                                   facecolor=RANGE_FILL, edgecolor=UP, linewidth=1, alpha=0.6))
        ax.text(len(df) - 0.3, interval["high"], f" predicted {int(interval.get('conf', 0.8) * 100)}% range",
                color=INK2, fontsize=8, va="bottom")
        right = len(df) + h
    for key, style in (("entry", dict(color=INK, linestyle="-")), ("stop", dict(color=DOWN, linestyle="--")),
                       ("target", dict(color=UP, linestyle="--"))):
        if levels and levels.get(key):
            ax.axhline(levels[key], linewidth=1.2, **style)
            ax.text(right, levels[key], f" {key}", color=INK2, fontsize=8, va="center")
    ax.set_xlim(-1, right + 3)
    vc = [SURFACE if c >= o else DOWN for o, c in zip(df.open, df.close)]
    axv.bar(range(len(df)), df.volume, color=vc, edgecolor=[UP if c >= o else DOWN for o, c in zip(df.open, df.close)],
            linewidth=0.6, width=0.7)
    axv.set_ylabel("volume", color=INK2, fontsize=8)
    axv.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(
        lambda v, _: f"{v / 1e6:.0f}M" if v >= 1e6 else f"{v / 1e3:.0f}K" if v >= 1e3 else f"{v:.0f}"))
    _date_ticks(axv, df.date)
    ax.set_title(title or "Daily candles (hollow = up day, filled = down day)", color=INK, fontsize=11, loc="left")
    ax.legend(loc="upper left", fontsize=8, frameon=False, labelcolor=INK2)
    fig.savefig(path, facecolor=SURFACE, bbox_inches="tight")
    plt.close(fig)
    return path


def trade_postmortem(bars, trade, path, pred=None, before=60, after=None):
    """Post-run only. bars: full history for the ticker; trade: an engine trade dict/row."""
    e, x = int(trade["entry_index"]), int(trade["exit_index"])
    after = after if after is not None else max(x - e + 5, 10)
    lo, hi = max(0, e - before), min(len(bars), x + 6, e + after)
    pre, post = bars.iloc[lo:e].reset_index(drop=True), bars.iloc[e:hi].reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(11, 5), dpi=110)
    fig.patch.set_facecolor(SURFACE)
    _style(ax)
    _draw_candles(ax, pre)
    _draw_candles(ax, post, x0=len(pre), alpha=0.55)
    ax.axvspan(len(pre) - 0.5, len(pre) + len(post) - 0.5, color=GRID, alpha=0.5, zorder=0)
    ax.text(len(pre) - 0.3, ax.get_ylim()[1], " after entry (realized)", color=INK2, fontsize=8, va="top")
    for key, style in (("entry", dict(color=INK, linestyle="-")), ("stop", dict(color=DOWN, linestyle="--")),
                       ("target", dict(color=UP, linestyle="--")), ("exit", dict(color=INK2, linestyle=":"))):
        v = trade.get(key)
        if v:
            ax.axhline(v, linewidth=1.1, **style)
            ax.text(len(pre) + len(post), v, f" {key}", color=INK2, fontsize=8, va="center")
    if pred is not None:
        ax.add_patch(plt.Rectangle((len(pre) - 0.5, pred["low"]), pred["horizon"], pred["high"] - pred["low"],
                                   facecolor=RANGE_FILL, edgecolor=UP, linewidth=1, alpha=0.35))
    _date_ticks(ax, pd.concat([pre.date, post.date]).values)
    pnl = trade.get("pnl", 0)
    ax.set_title(f"{trade['ticker']} {trade['arm']} {trade['side']} | {trade.get('setup', '')} | exit: "
                 f"{trade.get('exit_reason')} | P/L {'▲' if pnl > 0 else '▼'} {pnl:+,.0f}",
                 color=INK, fontsize=11, loc="left")
    fig.savefig(path, facecolor=SURFACE, bbox_inches="tight")
    plt.close(fig)
    return path


def equity_curves(curves, path, title="Equity by arm"):
    """curves: dict arm -> pd.Series(equity, index=date). One axis, direct labels + legend."""
    fig, ax = plt.subplots(figsize=(11, 4.8), dpi=110)
    fig.patch.set_facecolor(SURFACE)
    _style(ax)
    for i, (arm, s) in enumerate(curves.items()):
        col = SERIES[i % len(SERIES)]
        x = pd.to_datetime(s.index)
        ax.plot(x, s.values, color=col, linewidth=2, label=f"Arm {arm}")
        ax.text(x[-1], s.values[-1], f"  {arm}", color=INK2, fontsize=9, va="center")
    ax.set_title(title, color=INK, fontsize=11, loc="left")
    ax.legend(loc="upper left", fontsize=8, frameon=False, labelcolor=INK2)
    fig.savefig(path, facecolor=SURFACE, bbox_inches="tight")
    plt.close(fig)
    return path
