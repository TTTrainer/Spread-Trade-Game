# Data manifest

Prices: Yahoo Finance v8 chart API (same data yfinance returns with auto_adjust=False), fetched 2026-10-19T14:31:41.221Z via Claude in Chrome.
VIX: Cboe VIX_History.csv (downloaded 2026-10-19), filtered to the 647 stock sessions (Cboe also lists market holidays).
Window 2024-01-02 to 2026-07-31, 647 sessions, calendar identical to AAPL_2024_2026.csv.
Columns: date,open,high,low,close,volume,adjusted_close. close = split-adjusted only; adjusted_close = split + dividend adjusted.
adjusted_close is back-adjusted as of the download date, so it can differ slightly from older files (AAPL: up to 0.09%; O/H/L/C/volume identical).

## Checks (all passed)
647 rows, calendar match, no NaN, volume > 0, high/low bound open/close, adjusted ratio in (0.5, 1] and non-decreasing, signals.py no-lookahead self-test, simulator smoke test (NFLX).
Split inside window: NFLX (adjusted correctly). No others.

## Roles
Trade universe (added): META TSLA JPM BA COST NFLX AMD CRM COIN GME
Context only, not traded: SPY DIA VIX (VIX file has no volume/adjusted_close; the simulator cannot load it). Use only through the prior close, and only once a trial pre-registers a market-level signal.
Original 5 (AAPL GOOGL AMZN MSFT NVDA) unchanged; report them as their own subgroup.

## Files
- AMD_2024_2026.csv  rows=-1  sha256=cb9bfbf1a1e9ab215377b487994c53126b7964daf29770916d507e6ceb113998
- BA_2024_2026.csv  rows=-1  sha256=fb0135ffc40fec0fb8ecda6daf51f139c923e20d3177b580cc81b2e79b6dca89
- COIN_2024_2026.csv  rows=-1  sha256=8f9dbb3fcff7b6ac65c2e33da11a1c6bcb80d8462cad73a6c4efedda9f5cd686
- COST_2024_2026.csv  rows=-1  sha256=c472e706ff7143ebc1ab5abdb95995ad7b79ae24fd511c249160c3e2d0e9d567
- CRM_2024_2026.csv  rows=-1  sha256=b9206870db167f1d45bd3fbd1c684530768c0a83f01da2478697cac1f7a0ff19
- DIA_2024_2026.csv  rows=-1  sha256=2572a4caea961dd50f5e69c34950e864bba9020fa2f89987280c5074b4e1b3ac
- GME_2024_2026.csv  rows=-1  sha256=ee1121d163b5ab10d0c999be571751140c54dd85ce21a389a1aa6e61e327ad57
- JPM_2024_2026.csv  rows=-1  sha256=e7d7573b706b7a1b599df6d924920118a82626985cf046a5eaa5daffe9c2ff73
- META_2024_2026.csv  rows=-1  sha256=8fdadf7dfc5e241367fd70022c692e904f281fd0af52cd078b57843cf565daf0
- NFLX_2024_2026.csv  rows=-1  sha256=d1eb1661ab6d5f2cb1298c490b45343f31c66027c4cc00108d465b75a408d75a
- SPY_2024_2026.csv  rows=-1  sha256=8e1f8266e529e83084e409d47ad5570b723081ca99fbdb77c39959075afa2d83
- TSLA_2024_2026.csv  rows=-1  sha256=e5fcb58ec32f1c44e2f9730c4fe62b75c6558e6f13c2767182330ae490bd29cc
- VIX_2024_2026.csv  rows=-1  sha256=76e27e5c28cd800becaba45adb6adbe786e2b8fadd4bc3d3b6915200563c3132

## Bot files from DATA_FETCH_PROMPT part B (searched Claude Projects, SpreadTradingGameData, Downloads)
- MASTER_LOG.md newer than Trial 01: NOT FOUND
- USAGE_LOG.md, trial_02*, prereg_02*: NOT FOUND
- PROTOCOL_v2_OPTIONS.md, optionlib.py, td_ingest.py, scan.py, run_trial*.py: NOT FOUND
- Option-chain data: FOUND as Dolt databases at C:\Users\jacob\SpreadTradingGameData\dolt (options ~3.5 GB, stocks ~0.7 GB, earnings ~0.5 GB, rates). Not extracted.
- News: GDELT pull too slow (rate-limited); replaced for now by Wikipedia pageviews (attention only, no tone).

## Attention files
attention_<TICKER>.csv: Wikimedia REST pageviews API, en.wikipedia, user agents, daily UTC, fetched 2026-10-19.
UTC day D is mapped to the first trading session on or after D (weekend/holiday days summed into the next session).
Row D is complete at 19:00-20:00 ET on D, so it is usable for the decision that fills at the open of D+1.
views_z = (log1p(views) - mean of prior 20 sessions) / sd of prior 20 sessions (causal; first ~15 sessions blank).
Articles: AAPL Apple_Inc. | GOOGL Alphabet_Inc. | AMZN Amazon_(company) | MSFT Microsoft | NVDA Nvidia | META Meta_Platforms | TSLA Tesla,_Inc. | JPM JPMorgan_Chase | BA Boeing | COST Costco | NFLX Netflix | AMD AMD | CRM Salesforce | COIN Coinbase | GME GameStop

- attention_AAPL.csv  sha256=e4c81ddddac816432dec5752984d5e78de7e92a30a906b7b3013ce9beebfcf8f
- attention_AMD.csv  sha256=03d2b34cc1f63ead5434b750c77dc52ad5250b3c0df479d601483f3ce64506a1
- attention_AMZN.csv  sha256=20e10384021454c033a220c9fb7625d1e8a15d41793ee19834b9f15f9bdfbeaa
- attention_BA.csv  sha256=c8c05ed97a4a5743319e282cd965f0ec43fbc412bf78c90fb2d7cc7003f3470a
- attention_COIN.csv  sha256=8fc43884c43945467c6b17bc122ca9baf0e8dab6660ad141eeea07556992ced2
- attention_COST.csv  sha256=059695184fd9dff1a7784b0c401f65e62e7baa5d93dd98c7340f8329066a2dce
- attention_CRM.csv  sha256=205b30c0707f2887a554b5e57dc3e79cf9e868b853905f231e18d3bcff835607
- attention_GME.csv  sha256=2b47f0d5897275a3c072d66c30ce345165b8a8c7bbd8e531c71b617f51fc39d0
- attention_GOOGL.csv  sha256=8f6293195b3827d94f9e46a4ab46569b2b3ec1c778fa2e1e1b62d14be6e36691
- attention_JPM.csv  sha256=7f9d29d33e7160c9cae0635c710aad5e18a2ee4acc96087bac11bd22fd24b65e
- attention_META.csv  sha256=63df216178f8f509000e6c27d61a8035b349f8487ba0757e2dfb318ddc118238
- attention_MSFT.csv  sha256=13859f9f3932eafe6a6c4da2088a7d958c0adb5d571fab65d04a85e1e1eb0034
- attention_NFLX.csv  sha256=918aee412d4911c9c1d992e0233ccabab52abbc9a3f66aba75dd5ed37dd1c050
- attention_NVDA.csv  sha256=b4d98c8baa61484075e2ff20aa1f7a5868462e3e6c2b0ea7e82ab4356574d196
- attention_TSLA.csv  sha256=c9358e50c24801704181730c84a04ffd48685c70e893996726218bdc7d1799d4
