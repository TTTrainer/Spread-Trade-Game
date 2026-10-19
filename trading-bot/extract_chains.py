#!/usr/bin/env python3
r"""
extract_chains.py -- pull real end-of-day option chains (and the earnings calendar) for the bot's
tickers from the local Dolt clones into per-ticker parquet files.

Run on the PC that has C:\Users\jacob\SpreadTradingGameData\dolt (options, stocks, earnings):
  1. pip install pymysql pandas pyarrow
  2. In a second terminal (leave it running):
       dolt sql-server --data-dir "C:\Users\jacob\SpreadTradingGameData\dolt" --port 3307
     It serves every clone in that folder as a database (options, stocks, earnings, rates).
  3. In this folder (next to the <TICKER>_2024_2026.csv files):
       python extract_chains.py --port 3307
Writes chains_<TICKER>.parquet, earnings_calendar.csv and CHAINS_REPORT.md. Prints coverage only,
never prices (later trial bots read this output).

Kept rows: sessions in the bot's calendar, 1-70 calendar days to expiry, strike within +/-30% of
spot, 0.02 <= |delta| <= 0.98.

Dolt strikes and spot are NOT split-adjusted. Each row carries spot_unadj (stocks.ohlcv close) and
split_factor = round(spot_unadj / csv_close), so a reader converts a strike to the split-adjusted
basis of <TICKER>_2024_2026.csv as strike / split_factor.

The earnings calendar holds report dates (scheduled events: may be shown ahead of time). Outcomes
(EPS, the price reaction) may only be used on or after the report date.
"""
import argparse
import os

import pandas as pd

DEFAULT = ("AAPL GOOGL AMZN MSFT NVDA META TSLA JPM BA COST NFLX AMD CRM COIN GME SPY DIA").split()
COLS = ["date", "act_symbol", "expiration", "strike", "call_put", "bid", "ask", "vol",
        "delta", "gamma", "theta", "vega", "rho"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=3307)
    ap.add_argument("--user", default="root")
    ap.add_argument("--password", default="")
    ap.add_argument("--tickers", default=",".join(DEFAULT))
    ap.add_argument("--max-dte", type=int, default=70)
    a = ap.parse_args()
    import pymysql

    tickers = [t.strip().upper() for t in a.tickers.split(",") if t.strip()]
    cal = pd.read_csv("AAPL_2024_2026.csv", parse_dates=["date"]).date
    first, last = cal.min().strftime("%Y-%m-%d"), cal.max().strftime("%Y-%m-%d")
    csv_close = {}
    for t in tickers:
        p = f"{t}_2024_2026.csv"
        if os.path.exists(p):
            csv_close[t] = pd.read_csv(p, parse_dates=["date"]).set_index("date").close

    con = pymysql.connect(host=a.host, port=a.port, user=a.user, password=a.password, database="options")
    q = lambda sql, args=None: pd.read_sql(sql, con, params=args)  # noqa: E731
    ph = ",".join(["%s"] * len(tickers))

    spot = q(f"SELECT `date`, act_symbol, `close` FROM stocks.ohlcv WHERE `date` BETWEEN %s AND %s "
             f"AND act_symbol IN ({ph})", [first, last, *tickers])
    spot["date"] = pd.to_datetime(spot["date"])
    spot["close"] = spot["close"].astype(float)
    spot = spot.set_index(["date", "act_symbol"])["close"]

    parts = {t: [] for t in tickers}
    for n, d in enumerate(cal, 1):
        ds = d.strftime("%Y-%m-%d")
        df = q(f"SELECT {', '.join('`' + c + '`' for c in COLS)} FROM option_chain WHERE `date` = %s "
               f"AND act_symbol IN ({ph}) AND expiration > `date` "
               f"AND expiration <= DATE_ADD(`date`, INTERVAL {a.max_dte} DAY)", [ds, *tickers])
        if not df.empty:
            for c in ("strike", "bid", "ask", "vol", "delta", "gamma", "theta", "vega", "rho"):
                df[c] = df[c].astype(float)
            df["date"] = pd.to_datetime(df["date"])
            df["expiration"] = pd.to_datetime(df["expiration"])
            for t, g in df.groupby("act_symbol"):
                s = spot.get((d, t))
                if s is None:
                    continue
                g = g[(g.strike.between(0.7 * s, 1.3 * s)) & (g.delta.abs().between(0.02, 0.98))].copy()
                g["spot_unadj"] = s
                c = csv_close.get(t)
                g["split_factor"] = round(s / float(c.loc[d])) if c is not None and d in c.index else None
                g["dte"] = (g.expiration - g.date).dt.days
                parts[t].append(g)
        if n % 50 == 0:
            print(f"{n}/{len(cal)} sessions read")

    lines = ["# Option-chain extract", f"Source: local Dolt clone post-no-preference/options; sessions {first} to "
             f"{last} ({len(cal)}). Filters: 1-{a.max_dte} DTE, strike within 30% of spot, 0.02 <= |delta| <= 0.98.",
             "Strikes/spot are unadjusted: split-adjusted strike = strike / split_factor.", "",
             "| Ticker | Sessions with chains | Coverage | Rows | Split factors seen |", "|---|---|---|---|---|"]
    for t in tickers:
        if not parts[t]:
            lines.append(f"| {t} | 0 | 0% | 0 | — |")
            continue
        df = pd.concat(parts[t]).rename(columns={"act_symbol": "ticker"})
        df.to_parquet(f"chains_{t}.parquet", index=False)
        days = df.date.nunique()
        sf = sorted(set(df.split_factor.dropna().astype(int)))
        lines.append(f"| {t} | {days} | {days / len(cal):.0%} | {len(df):,} | {sf} |")
        print(f"{t}: {days}/{len(cal)} sessions, {len(df):,} rows")

    ec = q(f"SELECT act_symbol AS ticker, `date`, `when` FROM earnings.earnings_calendar WHERE act_symbol IN ({ph}) "
           f"AND `date` BETWEEN DATE_SUB(%s, INTERVAL 90 DAY) AND DATE_ADD(%s, INTERVAL 90 DAY) ORDER BY act_symbol, `date`",
           [*tickers, first, last])
    ec.to_csv("earnings_calendar.csv", index=False)
    lines += ["", f"earnings_calendar.csv: {len(ec)} report dates (scheduled events; outcomes usable only on/after the date)."]
    with open("CHAINS_REPORT.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote CHAINS_REPORT.md")


if __name__ == "__main__":
    main()
