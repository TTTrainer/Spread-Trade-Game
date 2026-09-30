# Spread Trading Game: how to play

A paper-trading roguelite about options spreads. Nothing in it touches a real brokerage account, and nothing in it is financial advice.

## 1. Install it (about 2 minutes)

If you received the game in pieces (`...exe.part1` to `part4` plus a `Join-Portable.bat` or `Join-Setup.bat`), put all five files in one folder and double-click the `Join-…bat` file first. The pieces exist only because of an upload size limit. The script glues them back into the `.exe` and checks it's byte-for-byte the file that was built. If Windows asks about running the .bat file, choose More info → Run anyway.

Then you have two ways to run the game. Use either one.

- **`SpreadTradingGame-Setup-1.4.2.exe`** is a normal installer. Double-click it, choose a folder (or keep the default), and it adds a desktop and Start-menu shortcut. To remove it later, use Windows' "Add or remove programs".
- **`SpreadTradingGame-Portable-1.4.2.exe`** runs straight away with nothing to install. Put it anywhere, for example your Desktop or a USB stick, and double-click it.

**Windows will probably warn you** with a blue box: "Windows protected your PC". That happens because the game isn't signed with a paid code-signing certificate, not because anything is wrong. Click **More info**, then **Run anyway**. You only need to do this once.

### On a Mac

There are two Mac builds: **Apple chip** (M1 and later, the `arm64` files) and **Intel** (the `x64` files). If you're not sure, choose Apple menu → About This Mac: "Chip: Apple M…" means Apple chip.

1. Put the parts (`SpreadTradingGame-mac-arm64-1.4.2.zip.part0` to `part4`) and `join-mac.sh` in one folder, for example Downloads.
2. Open **Terminal** (press ⌘ Space, type Terminal, press Return).
3. Type `bash ` (with a space after it), drag `join-mac.sh` from Finder into the Terminal window, and press Return.

The script glues the parts back together, checks it's byte-for-byte the file that was built, moves **Spread Trading Game** into Applications and opens it. After that, open it from Applications or Launchpad like any app.

If macOS still says it "can't verify" the app, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. You only need to do this once. It happens because the game isn't signed with a paid Apple developer certificate, not because anything is wrong.

**Keys on a Mac:** where the game says **Ctrl**, use **Control** or **Command (⌘)**; both work. **Alt** is the **Option (⌥)** key, and the game shows ⌥ in its key hints. Command-Q quits, Command-H hides.

The game runs offline. It only uses the internet when you ask it to download or update market data (see below).

## 2. First launch: play right away

The game opens on the title screen with a synth-grid horizon. Use the mouse, or the arrow keys and Enter.

It starts on the **SIM market**: 18 invented companies (Helix Robotics, MemeStonk Arcade and friends) with realistic price and option histories. Everything works on it, so you can play immediately. Anything from the SIM market is labeled **SIM**.

Good first steps:

1. **Career → TUTORIAL.** Ines walks you through three practice rounds. Nothing counts, and you get her mug for your desk.
2. **Career → START RUN** on the Verticals desk. That's a real run: a fiscal year of 12 rounds, about 30–40 minutes once you know the controls.
3. **Drills** for quick 60-second chart reads when you only have a few minutes.

Music starts after your first click or key press; the browser engine inside the app requires that. Volume, music style, screen shake, CRT scanlines and the colorblind palette are all in **Settings**.

## 3. Real market data (optional, a few hours once)

**Quicker alternative:** with a Schwab developer app you can build a real market in minutes instead (see *Schwab* in section 4). It has real prices, but mostly modeled option chains and no earnings events; DoltHub has real option chains every day back to 2019 and the earnings history.

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
- **Live** plays the most recent month: you start 20 trading days back with a dealt lineup (the market plus a few stocks), trade like any desk, and press Space to play each day. At the latest close the clock waits. **⟳ CHECK FOR NEW DAYS** fetches newer days and the month plays on from there, so it never runs out. The aim: finish ahead of simply holding the market. **NEW MONTH** starts over (closed trades stay in Stats).
- On the SIM market there's nothing new to download, so CHECK FOR NEW DAYS moves a simulated calendar forward one week instead, and the screen says so.

### Schwab: real data in minutes, and Live up to today

Your own Schwab developer app can supply the game's market data instead of (or on top of) the big DoltHub download. The game only asks Schwab for **market data**: it never reads your account and never places a trade. Your App Secret and login stay on your computer, encrypted by Windows or macOS; they are never sent anywhere else or put in the game's files.

**Connect (once):**

1. On **developer.schwab.com**, open your app and note its **App Key**, **Secret** and **Callback URL** (for example `https://127.0.0.1`). The app needs the **Market Data** product.
2. In the game: **Settings → Data → Schwab**. Type the App Key, the Secret and the same Callback URL, then **SAVE KEYS**.
3. Click **LOG IN AT SCHWAB ↗**. Your browser opens Schwab's login. Log in and approve. Your browser then lands on your callback address, which usually shows "can't reach this page". That's expected: copy the **whole address** from the address bar (it contains `?code=`), paste it into the box and click **CONNECT** within about 30 seconds (the code expires quickly; if it fails, just log in again).

**Get the data:**

4. Click **⤓ PULL FROM SCHWAB**. The game saves daily prices for every ticker (since 2018 the first time, a few minutes; after that just the new days) into its own file, **`schwab.db`**. After the 4 pm close it also saves that day's **real option chains**. The line under the button shows what the file holds.
5. Click **▶ BUILD GAME DATA FROM SCHWAB**.
   - If you haven't built the DoltHub data, this makes the whole game market from `schwab.db` in a minute or two: real prices, real option chains on each close you pulled after, and **modeled chains** (labeled **MODEL**) on every other day, worked out from each stock's own recent movement. Schwab's market data has no earnings history, so this market has **no earnings events**; the DoltHub build has them.
   - If you already built the DoltHub data, this adds the days DoltHub hasn't published yet, so Live's month reaches today. DoltHub stays the reference: when it publishes those days, a sync replaces the Schwab rows.

After that, **SYNC LATEST DAYS** (or Live's **⟳ CHECK FOR NEW DAYS**) does steps 4 and 5 for you. Pull once a day after the close and the store collects a real option chain for every day, so more and more of your market is real rather than modeled.

Schwab asks you to log in again every 7 days (repeat step 3). **LOG OUT** forgets the login; **REMOVE KEYS** deletes the keys and login. `schwab.db` stays (it's only market data); delete it from the save folder's `data` folder if you want it gone too.

## 5. Where your saves live

Everything is saved automatically after every action. There is no undo, by design.

- **Save folder:** `C:\Users\<you>\AppData\Roaming\SpreadTradingGame\`
  - `user.db` holds your runs, trades, stats, achievements, profile, Bonus and The Pad.
  - `data\game.db` is the market database (once you've built real data).
  - `data\schwab.db` holds everything pulled from Schwab (once you've pulled).
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
