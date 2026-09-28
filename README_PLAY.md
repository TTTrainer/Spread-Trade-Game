# Spread Trading Game: how to play

A paper-trading roguelite about options spreads. Nothing in it touches a real brokerage account, and nothing in it is financial advice.

## 1. Install it (about 2 minutes)

If you received the game in pieces (`...exe.part1` to `part4` plus a `Join-Portable.bat` or `Join-Setup.bat`), put all five files in one folder and double-click the `Join-…bat` file first. The pieces exist only because of an upload size limit. The script glues them back into the `.exe` and checks it's byte-for-byte the file that was built. If Windows asks about running the .bat file, choose More info → Run anyway.

Then you have two ways to run the game. Use either one.

- **`SpreadTradingGame-Setup-1.2.0.exe`** is a normal installer. Double-click it, choose a folder (or keep the default), and it adds a desktop and Start-menu shortcut. To remove it later, use Windows' "Add or remove programs".
- **`SpreadTradingGame-Portable-1.2.0.exe`** runs straight away with nothing to install. Put it anywhere, for example your Desktop or a USB stick, and double-click it.

**Windows will probably warn you** with a blue box: "Windows protected your PC". That happens because the game isn't signed with a paid code-signing certificate, not because anything is wrong. Click **More info**, then **Run anyway**. You only need to do this once.

The game runs offline. It only uses the internet when you ask it to download or update market data (see below).

## 2. First launch: play right away

The game opens on the title screen with a synth-grid horizon. Use the mouse, or the arrow keys and Enter.

It starts on the **SIM market**: 18 invented companies (Helix Robotics, MemeStonk Arcade and friends) with realistic price and option histories. Everything works on it, so you can play immediately. Anything from the SIM market is labeled **SIM**.

Good first steps:

1. **Career → TUTORIAL.** Ines walks you through three practice rounds. Nothing counts, and you get her mug for your desk.
2. **Career → START RUN** on the Verticals desk. That's a real run: a fiscal year of 12 rounds, about 30–40 minutes once you know the controls.
3. **Drills** for quick 60-second chart reads when you only have a few minutes.

Music starts after your first click or key press; Windows' browser engine requires that. Volume, music style, screen shake, CRT scanlines and the colorblind palette are all in **Settings**.

## 3. Real market data (optional, a few hours once)

The real options history comes free from DoltHub (public data, CC BY-SA 4.0). To use it:

1. Open **Settings → Data**.
2. Click **BUILD REAL DATA**.

What to expect:

- **Downloads:** about **16 GB**. The game fetches the Dolt tool itself if you don't have it.
- **Disk space:** about **40 GB free**. If you have less, the game asks before it starts. The finished game database is under 3 GB; the rest is the raw download, which stays so updates are quick.
- **Time:** a few hours the first time, mostly downloading. Keep playing the SIM market meanwhile; the game switches over when it's done.
- **Where it goes:** raw downloads in `C:\Users\<you>\SpreadTradingGameData\`, and the game database in the save folder (below).

When it finishes, **VIEW DATA REPORT** lists the tickers, the dates covered and how much was modeled. Days the free data skipped are filled in and labeled **MODEL**.

## 4. Keeping data current and playing Live

- **Settings → Data → SYNC LATEST DAYS** pulls the newest trading days, usually a few minutes.
- The **Live** mode has its own **⟳ SYNC DATA** button that does the same thing and then catches your open paper trades up to the newest close.

Live uses this week's real market with real names. Your positions carry over between sessions and score when they expire. On the SIM market there's nothing new to download, so Live's Sync moves a simulated calendar forward one week instead, and the screen says so.

## 5. Where your saves live

Everything is saved automatically after every action. There is no undo, by design.

- **Save folder:** `C:\Users\<you>\AppData\Roaming\SpreadTradingGame\`
  - `user.db` holds your runs, trades, stats, achievements, profile, Bonus and The Pad.
  - `data\game.db` is the market database (once you've built real data).
  - `logs\game.log` is the log file for bug reports.
- **Settings → Data** has **OPEN SAVE FOLDER** and **OPEN LOG FOLDER** buttons, so you never have to hunt for them.
- Uninstalling the game does **not** delete your saves or the downloaded data. To start completely fresh, delete the save folder.

## 6. Reporting a bug (to Claude Code)

1. In the game: **Settings → Data → OPEN LOG FOLDER**.
2. Copy the file **`game.log`** (or its last 50 lines).
3. Tell Claude Code, in plain words:
   - what you were doing (for example: "Career run, Condor desk, Q2 Review, I pressed Space and the chart froze");
   - what you expected to happen, and what happened instead;
   - if it's about a run, the **seed**. It's shown on the Career screen next to "Run in progress". The seed deals the same cards again, and your save file holds every action, so the run can be replayed step by step.
4. A screenshot helps. **Windows key + Shift + S** takes one.

## 7. Handy keys

| Key | What it does |
|---|---|
| `1`–`5` | Call your shot: down big, down, flat, up, up big |
| `Shift+1`–`5` | Confidence 50% to 90% |
| `Alt+S` / `Alt+B` | Sell (credit) / Buy (debit) |
| `Space` | Start or pause the fast-forward |
| `R` / `K` | Reroll the lineup / skip the round (Career) |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Positions / Builder / Analyze |
| `Ctrl+8` | Help and glossary |
| `Ctrl+H` | Back to the title screen |

Every key can be remapped in **Settings → Hotkeys**, and there's a button to reset them to thinkorswim's defaults.
