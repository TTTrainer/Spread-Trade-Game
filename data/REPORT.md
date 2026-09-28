# Market data report

Generated 2026-09-28T05:22:21.197Z from `/root/.config/SpreadTradingGame/data/game.db`.

- **Dataset:** SIM (synthetic, fictional companies) (built 2026-09-28T05:22:07.359Z)
- **Range:** 2018-01-02 to 2026-09-25
- **Benchmark:** MKTX; context: MKTX, INDX
- **Database size:** 0.20 GB (target under 3 GB)
- SIM market: fictional companies and invented prices. Build real data in Settings > Data.
- Chains materialized from 2025-07-18

## Row counts

| Table | Rows |
|---|---|
| symbols | 18 |
| bars | 39,510 |
| chains | 3,324,538 |
| chain_days | 5,400 |
| vol | 39,510 |
| earnings | 560 |
| dividends | 385 |
| splits | 1 |
| rates | 2,195 |
| vix | 2,195 |
| macro_events | 157 |
| fundamentals | 560 |
| windows | 4,500 |

## Tickers

| Symbol | Name | Sector | Why | Bars | First chain | Chain days | % modeled | Bar gaps | Liquidity (spread/mid) | Median IV |
|---|---|---|---|---|---|---|---|---|---|---|
| AVNR | Avionaire Aerospace | Industrials | Aerospace with headline risk | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 1.9% | 34% |
| BNKR | Bunker Bancorp | Financials | Money-center bank | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 2.7% | 28% |
| CRYP | Cryptic Exchange | Financials | Crypto broker: high IV | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 6.0% | 77% |
| DSKT | Desktop Dynamics | Technology | SaaS with big post-earnings moves | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 1.1% | 40% |
| FRTL | Freightline Logistics | Industrials | Cyclical industrial | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 3.0% | 29% |
| GRDN | Gridiron Energy | Energy | Oil major, dividend | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 3.6% | 36% |
| HLXR | Helix Robotics | Technology | Mega-cap tech, tight markets | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 0.9% | 27% |
| INDX | Thirty Industrials Trust | Index ETF | SIM market context (stands in for DIA) | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 2.3% | 13% |
| LUXE | Luxe Warehouse Club | Consumer Staples | Steady mega-cap retailer | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 1.4% | 24% |
| MEMX | MemeStonk Arcade | Retail | Meme stock: wild IV, wide markets | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 6.8% | 87% |
| MKTX | Broad Market Trust | Index ETF | SIM benchmark (stands in for SPY) | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 1.4% | 15% |
| NMBC | Nimbus Cloud Systems | Technology | Mega-cap software | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 1.9% | 25% |
| ORGR | Orbital Grocers | Consumer Staples | Low-vol dividend payer | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 2.5% | 18% |
| PLSM | Plasma Motors | Autos | High-IV mega-cap EV maker | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 1.1% | 63% |
| PXLD | Pixeldust Games | Communication | Game publisher | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 2.6% | 40% |
| QSLC | Quanta Silicon | Semiconductors | High-beta chip name | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 2.0% | 48% |
| SOLX | Solace Therapeutics | Healthcare | Biotech: big binary earnings | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 4.0% | 52% |
| STRM | Streamline Media | Communication | Streaming giant: big earnings gaps | 2018-01-02 to 2026-09-25 | 2025-07-18 | 300 | 0.0 | 0 | 0.6% | 38% |

## Windows

4500 dealable windows; 4500 from the last three years (dealt 75% of the time).

| Review filter | Windows |
|---|---|
| Earnings inside window | 3186 |
| FOMC inside window | 4500 |
| Ex-dividend inside window | 2200 |
| ADX < 18 (chop) | 1122 |
| ADX > 30 (trend) | 1401 |
| VIX > 25 | 846 |
| IVR < 15 | 2028 |
| Gap > 2 ATR | 625 |
| Widest spread decile | 250 |

## Macro calendar

157 FOMC and CPI dates. 157 are unverified: they were compiled offline because federalreserve.gov and bls.gov were unreachable from the build machine.

## Validation

All checks passed.
