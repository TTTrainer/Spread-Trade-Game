# Progress

Plain-language status for Jacob. Newest phase at the top of "Done".

## Where we are

**Current phase:** Phase 1 (market data) is next.

## How to run (on your PC)

1. Install Node.js LTS (one time): `winget install OpenJS.NodeJS.LTS`
2. In this folder: `npm install`
3. `npm run dev` opens the game.

## Done

### Phase 0: Setup
- Electron + Vite + React + TypeScript (strict), ESLint, Prettier, Vitest and Playwright (Electron) are set up.
- `npm run verify` (typecheck, lint, unit tests) passes. `npm run test:e2e` opens the real app and screenshots it.
- The default Electron menu is removed, so Alt-key hotkeys will reach the game.
- A retro title screen: synth-grid horizon, pixel fonts (DotGothic16, VT323, bundled locally under the Open Font License), CRT scanlines.
- The seeded random-number generator every system will use (so runs replay exactly).

## Decisions and deviations (why things differ from the plan)

- **Built in a Linux cloud container, not on Windows.** Phase 0 asked to confirm native Windows. This session runs in a cloud Linux box, so everything is built and tested here, and the Windows installer is cross-built. Things that only a Windows machine can prove (the installer on a fresh profile) are listed in `PLAYTEST.md` for you to check.
- **Project moved to the repository root.** `CLAUDE.md` and `MASTER_PROMPT.md` now sit at the top of the repo so Claude Code picks them up automatically.
- **SQLite without a native module.** The plan named better-sqlite3. Electron 44 ships SQLite built in (`node:sqlite`), which needs no compiling for Windows and behaves the same in the game, the tests and the data scripts. Same database files, fewer ways for the install to break.
- **`.npmrc` sets `legacy-peer-deps`.** Some current packages declare over-strict version ranges for each other; this keeps `npm install` from refusing.

## Known issues

- None yet.

## Next

Phase 1: the market data pipeline and the time-gated `MarketView`.
