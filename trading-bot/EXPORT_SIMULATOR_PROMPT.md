# Prompt for the other Claude Code project — export the simulator
Paste the block into Claude Code in the project that has the spread-trading simulator.

```
Package this project's trading simulator so it can be uploaded to another project.
Do not change any code. Read-only except for the export folder.

1. INVENTORY. List every file that the simulator and the spread/options trading framework
   need to run, at their CURRENT versions: simulator.py, optionlib.py, td_ingest.py, any
   driver/scan scripts (run_trial*.py, scan.py), tests, PROTOCOL_v2_OPTIONS.md,
   TRADING_TRIAL_PROTOCOL.md, MASTER_LOG.md, USAGE_LOG.md, requirements.
   If a file named above does not exist, say so. Do not invent it.

2. VERIFY. Run the existing tests and one short smoke run (init -> brief -> advance --n 5 ->
   report) on one ticker. Record the exact commands and pass/fail. Do not fix failures;
   list them.

3. BUILD export/ with this layout:
     export/code/        all .py files needed to run
     export/docs/        protocol docs, MASTER_LOG.md, USAGE_LOG.md
     export/data/        option-chain parquet files, if present
     export/sealed/      trial outputs that contain realized results (ledger.csv,
                         trial_*.json, state_*.json, sealed_benchmarks*). Future trial bots
                         must not read these.
     export/MANIFEST.md
   Exclude secrets: API keys, ThetaData credentials, .env files, tokens. Grep for them and
   confirm none are included. Exclude caches, venvs and __pycache__.

4. MANIFEST.md (keep it short):
   - one line per file: path, size, SHA-256, purpose
   - Python version and pip dependencies
   - how to run: the exact commands from step 2
   - test/smoke results, pass/fail
   - which commands exist in simulator.py (e.g. structure, --control, chain-backed brief)
     and which planned items are NOT built yet
   - data coverage: tickers, first/last date, row counts for each parquet
   - known bugs and open items

5. ZIP. Create export/simulator_export.zip. If any data file is too large to upload,
   split the parquet into one zip per ticker and say so. Report the final file names
   and sizes.
```

**After you get the zip:** upload it here. I'll check it against the manifest and the
no-look-ahead contract, then wire `signals.py` and the news data into it.
