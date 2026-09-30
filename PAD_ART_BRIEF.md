# The Pad: art brief for an image AI

The Pad is your apartment between runs. Today it's drawn from plain rectangles in code, which is why it looks flat. The game now takes real pictures for every piece of it: **53 PNGs** in total (4 rooms and 49 pieces of furniture and collectibles). Anything not made yet keeps the code drawing, so they can arrive in any order.

This file is for you to hand to another AI (or an artist). The **prompts** are near the bottom; the **list** with exact file names and sizes is at the end.

## How it fits together

The scene is a single front-on view of one room, like a diorama or a side-view game: we look straight at the back wall, the floor runs along the bottom, and every object is seen from the front at eye level. The game layers the pieces:

1. the **room** (walls, window, floor, nothing else),
2. **framed paintings** on the right part of the wall,
3. **lighting** (a lamp or a glow over the top of the wall),
4. a **plant** on the floor at the right,
5. the **desk**, the **monitors** on it and small **desk items**,
6. the **chair** in front of the desk (seen from behind),
7. a **watch display case** at the left and a **vehicle** on a showroom plinth at the bottom left.

Every room picture is 640 × 360. Pieces are placed at fixed points on that canvas:

| Piece | Where it goes (pixels on the 640 × 360 room) |
|---|---|
| Floor line | 264 px from the top. Everything stands on or above it. |
| Window | The left third of the wall (x 0–260). |
| Framed paintings | Plain wall in the right two-thirds (x 270–640, y 24–150). Keep that wall area empty and quiet in every room. |
| Desk | Top-left corner at (260, 216), 288 × 80. Keep the middle of the room (x 250–560, y 120–300) plain: the desk, monitors and chair sit there. |
| Monitors | Their bottom edge sits on the desk top, centered at (396, 220). |
| Chair | Bottom-center at (396, 304), in front of the desk. |
| Plant | Bottom-center at (582, 264), on the floor at the right. |
| Desk lamp | Bottom-center at (472, 220), on the desk. |
| Watches | Inside a display case the game draws at the left (x 32–148, y 200–284), 24 × 24 each. |
| Vehicle | Bottom-center at (118, 330), on a plinth the game draws. |

## What makes it look good (rules for every picture)

- **Pixel art, crisp.** Hard pixels, no blur, no soft brushes, no anti-aliased edges, no photographic texture. Gradients are made with **dithering** (checkered two-tone pixels), never smooth blends.
- **Exact size.** Each file's size is in the list. The game draws them 1:1, so a wrong size looks wrong. If the AI can't hit exact sizes, it can make a **sheet** instead (see below) and Claude Code cuts it.
- **One camera.** Straight-on front view at eye level, for every room and every object. No three-quarter views, no fisheye, no tilted perspective. Chairs are seen **from behind**, because you sit facing the desk.
- **One light.** Night scene. The main light comes from the **monitors (cool cyan)** and the **lamp or ceiling light (warm amber)**; the window adds a blue-violet city glow from the left. Shade every object the same way: lit side toward the desk, dark side away.
- **Shading ramps.** Each material gets 3–4 shades (dark, mid, light, highlight) plus a **1-pixel darker outline** on objects. Rooms use lower contrast than objects so the furniture pops.
- **Limited palette.** Deep indigo and near-black for walls and shadows, with neon accents. Stick to these (and darker or lighter steps of them):
  - near-black `#07051a`, indigo `#0e0a2b`, `#171042`, `#221a5c`, line violet `#3b2f86`
  - text white `#ece9ff`, dim lavender `#a49de0`
  - neon cyan `#3ef2ff`, magenta `#ff3ea5`, amber `#ffbf3e`, violet `#9d6bff`, up-green `#4dff9a`, down-red `#ff4f6d`
  - warm wood `#6a4020`/`#4a2c16`, brick `#7a3a2a`/`#5a2a20`, brass `#e8c15a`
- **Transparent backgrounds** for every piece except the 4 rooms. No drop shadows baked into the transparent area, no frames around the tile.
- **No text, logos or brand names** anywhere (screens show abstract candlestick charts, not words). Everything original: no real products, no art traced from other games.
- **Readable at a glance.** Strong silhouettes; small pieces (watches, desk items) need big, simple shapes and 2–3 colors.

## How to deliver

Either works:

1. **Separate PNGs** named exactly as in the list. Upload them into `assets/art/` on GitHub (the steps are at the top of `ASSETS_NEEDED.md`).
2. **Sheets**, like the achievement sheet you sent: several pieces on one image, each on its own tile with its **file name printed under it**, on a flat dark background. Send the sheet to Claude Code in chat and it cuts, cleans and resizes each piece. Keep each group on its own sheet (rooms on one, chairs and plants on another, and so on).

## Prompts to paste into an image AI

Paste the **style block** first, then one of the sheet prompts.

**Style block (use every time):**

> Pixel art for a retro-futurist trading game, 1980s Japanese PC look with a near-future edge. Crisp hard pixels, no blur, no anti-aliasing, dithering instead of gradients. Night scene lit by cool cyan monitor light and warm amber lamp light, blue-violet city glow from the left. Limited palette: near-black and deep indigo (#07051a, #0e0a2b, #171042, #221a5c), lavender (#a49de0), neon cyan (#3ef2ff), magenta (#ff3ea5), amber (#ffbf3e), violet (#9d6bff), with warm wood and brass accents. Every object is seen straight-on from the front at eye level, like a side-view diorama, with a 1-pixel dark outline and 3–4 shade steps. No text, no logos, no brand names, original designs only.

**Sheet 1: rooms (4 pictures, 640 × 360 each).**

> Four empty rooms, each a full 640 × 360 image, same front-on camera: we face the back wall, the floor runs along the bottom quarter (floor line 264 px from the top). Put the window in the left third only. Keep the right two-thirds of the wall plain (framed paintings will hang there) and keep the middle of the room empty (a desk will stand there). No furniture at all. (1) A cramped studio: one small window onto a distant city, peeling wallpaper, a radiator, bare floorboards. (2) An industrial loft: exposed brick, a huge steel-framed window onto a lit skyline, wide plank floor. (3) A penthouse: floor-to-ceiling glass onto a neon skyline far below, polished dark floor, clean lines. (4) An orbital suite in space: curved metal hull, a large round viewport onto Earth and stars, metal floor panels with cyan light strips. Label each tile underneath: pad-room_studio, pad-room_loft, pad-room_penthouse, pad-room_orbital.

**Sheet 2: desk, monitors and lights (10 pictures, transparent backgrounds).**

> Front view, transparent background, each on its own tile with its name underneath. A long dark trading desk, thin top and two slim legs, faint cyan edge light (pad-desk, 288 × 80). Five desk setups that stand on that desk, each 224 × 96 with the bottom edge where it touches the desk: one open laptop (pad-monitors_0), two monitors (pad-monitors_1), three monitors in a slight arc (pad-monitors_2), four monitors two-over-two (pad-monitors_3), a six-screen wall of two rows of three (pad-monitors_4); every screen shows an abstract glowing candlestick chart, a small keyboard in front. Lights: a ceiling fluorescent tube, lit (pad-light_0, 128 × 16); a bent-arm desk lamp with a warm amber glow (pad-light_1, 48 × 48); a thin magenta neon tube with a soft glow below it (pad-light_2, 640 × 24); semi-transparent aurora ribbons in green, cyan, violet and pink (pad-light_3, 640 × 96).

**Sheet 3: chairs, plants and desk items (13 pictures, transparent backgrounds).**

> Front view, transparent background, names underneath. Four chairs seen from behind, 80 × 128 each: a grey folding chair (pad-chair_0), a black mesh office chair on a five-star base (pad-chair_1), a red-and-black racing chair with a tall winged back (pad-chair_2), a tufted oxblood leather throne with gold studs (pad-chair_3). Three plants standing on the floor, 80 × 160 each: a succulent in a small terracotta pot (pad-plant_1), a lush fern (pad-plant_2), a tall indoor fig tree in a concrete planter (pad-plant_3). Six small desk items, 24 × 28 each: a white coffee mug with a red stripe (pad-item_mug), a yellow rubber duck (pad-item_duck), a tiny bonsai in a dish (pad-item_bonsai), a purple lava lamp with pink blobs (pad-item_lava), a small brass bell on a wooden base (pad-item_bell), a small gold trophy cup (pad-item_trophy).

**Sheet 4: collectibles (26 pictures, transparent backgrounds).**

> Front view, transparent background, names underneath. Twelve small framed paintings in gold frames, 44 × 36 each, frame included, each an abstract trading joke: a single green candle on raw canvas (pad-art_candle5); a bear portrait in red (pad-art_bear); a sunset of time decay (pad-art_theta); an iron condor bird in flight (pad-art_condor); a spiking volatility line (pad-art_vix); a smiling curve (pad-art_smile); five Greek letters as figures (pad-art_greeks); a pin through a line at a strike (pad-art_pin); endless ticker tape (pad-art_tape); a gap down at night (pad-art_gap); a resting bull (pad-art_bull); an open ledger book (pad-art_ledger). Eight wristwatches lying face up, 24 × 24 each: a calculator watch (pad-w_digital), a dive watch (pad-w_diver), a chronograph (pad-w_chrono), a gold dress watch (pad-w_gold), a skeleton dial (pad-w_skeleton), a moonphase (pad-w_moon), a tourbillon (pad-w_tourbillon), a futuristic orbital time standard (pad-w_orbital). Six vehicles in side view, 144 × 64 each, bottom edge on the ground: a hover-bike (pad-v_hoverbike), an electric roadster (pad-v_roadster), a flying sky sedan (pad-v_skysedan), a submarine yacht (pad-v_subyacht), a suborbital jet (pad-v_jet), an orbital yacht (pad-v_orbital).

**If a result looks off,** tell the AI exactly what to fix: "flatter front-on view", "crisper pixels, no blur", "use only the palette", "darker room so the furniture stands out", "transparent background". Small pieces often come out too detailed: ask for "bigger, simpler shapes, 3 colors".

## The full list (53 pictures)

### Rooms

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-room_studio.png` | 640 × 360 | The whole Studio room with no furniture: walls, window, floor. The floor line sits 264 px down. | a cramped studio at night: one small window with a distant city, peeling wallpaper, a radiator, bare floorboards |
| `pad-room_loft.png` | 640 × 360 | The whole Loft room with no furniture: walls, window, floor. The floor line sits 264 px down. | an industrial loft at night: exposed brick, a huge steel-framed window onto a lit skyline, wide plank floor |
| `pad-room_penthouse.png` | 640 × 360 | The whole Penthouse room with no furniture: walls, window, floor. The floor line sits 264 px down. | a penthouse at night: floor-to-ceiling glass over a neon skyline far below, polished dark floor, clean lines |
| `pad-room_orbital.png` | 640 × 360 | The whole Orbital Suite room with no furniture: walls, window, floor. The floor line sits 264 px down. | an orbital suite: a curved hull with a huge round viewport onto Earth and stars, metal floor panels with cyan light strips |

### Desk and monitors

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-desk.png` | 288 × 80 | The trading desk seen from the front: a long top and two legs, nothing on it. | a long dark desk with a thin top and two slim legs, a faint cyan edge light |
| `pad-monitors_0.png` | 224 × 96 | One laptop standing on the desk, keyboard in front (bottom edge sits on the desk top). | a thin laptop, open, a candlestick chart on screen |
| `pad-monitors_1.png` | 224 × 96 | Two monitors standing on the desk, keyboard in front (bottom edge sits on the desk top). | two monitors side by side on stands, charts on both |
| `pad-monitors_2.png` | 224 × 96 | Three monitors standing on the desk, keyboard in front (bottom edge sits on the desk top). | three monitors in a slight arc, charts and an option chain |
| `pad-monitors_3.png` | 224 × 96 | Four monitors standing on the desk, keyboard in front (bottom edge sits on the desk top). | four monitors, two over two, charts glowing |
| `pad-monitors_4.png` | 224 × 96 | Six-monitor wall standing on the desk, keyboard in front (bottom edge sits on the desk top). | a six-screen wall, two rows of three, the trading-floor look |

### Chairs

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-chair_0.png` | 80 × 128 | Folding chair, seen from behind, in front of the desk. | a grey metal folding chair, seen from behind |
| `pad-chair_1.png` | 80 × 128 | Mesh office chair, seen from behind, in front of the desk. | a black mesh office chair on a five-star base, seen from behind |
| `pad-chair_2.png` | 80 × 128 | Racing chair, seen from behind, in front of the desk. | a red-and-black racing chair with a tall winged back, seen from behind |
| `pad-chair_3.png` | 80 × 128 | Leather throne, seen from behind, in front of the desk. | a tufted oxblood leather throne with gold studs, seen from behind |

### Plants

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-plant_1.png` | 80 × 160 | Succulent standing on the floor at the right. | a succulent in a small terracotta pot |
| `pad-plant_2.png` | 80 × 160 | Fern standing on the floor at the right. | a lush fern in a clay pot |
| `pad-plant_3.png` | 80 × 160 | Indoor tree standing on the floor at the right. | a tall indoor fig tree in a concrete planter |

### Lighting

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-light_0.png` | 128 × 16 | A ceiling fluorescent tube, lit (it hangs from the top edge). | a buzzing white fluorescent tube in a metal holder |
| `pad-light_1.png` | 48 × 48 | An architect desk lamp standing on the desk, lit. | a bent-arm desk lamp with a warm amber glow |
| `pad-light_2.png` | 640 × 24 | A magenta neon strip across the top of the wall, with its glow (transparent elsewhere). | a thin hot-pink neon tube with a soft glow bleeding down |
| `pad-light_3.png` | 640 × 96 | Aurora light bands across the ceiling (mostly transparent, soft colored ribbons). | green, cyan, violet and pink aurora ribbons, semi-transparent |

### Wall art (framed paintings)

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-art_candle5.png` | 44 × 36 | A framed painting for the wall: "Candle No. 5" (A single green candle on raw canvas.) Include the frame. | a small framed painting in a gold frame: A single green candle on raw canvas |
| `pad-art_bear.png` | 44 × 36 | A framed painting for the wall: "Portrait of a Bear Market" (Oil on regret.) Include the frame. | a small framed painting in a gold frame: Oil on regret |
| `pad-art_theta.png` | 44 × 36 | A framed painting for the wall: "Theta at Dusk" (Time decay, beautifully lit.) Include the frame. | a small framed painting in a gold frame: Time decay, beautifully lit |
| `pad-art_condor.png` | 44 × 36 | A framed painting for the wall: "Iron Condor in Flight" (Four wings, zero directional opinion.) Include the frame. | a small framed painting in a gold frame: Four wings, zero directional opinion |
| `pad-art_vix.png` | 44 × 36 | A framed painting for the wall: "VIX Spike (Study)" (A single jagged line. Collectors weep.) Include the frame. | a small framed painting in a gold frame: A single jagged line. Collectors weep |
| `pad-art_smile.png` | 44 × 36 | A framed painting for the wall: "The Volatility Smile" (It is not smiling at you.) Include the frame. | a small framed painting in a gold frame: It is not smiling at you |
| `pad-art_greeks.png` | 44 × 36 | A framed painting for the wall: "Five Greeks" (Delta, gamma, theta, vega, rho. Rho is in the corner, ignored.) Include the frame. | a small framed painting in a gold frame: Delta, gamma, theta, vega, rho. Rho is in the corner, ignored |
| `pad-art_pin.png` | 44 × 36 | A framed painting for the wall: "Pinned at the Strike" (Tense, minimalist, expires Friday.) Include the frame. | a small framed painting in a gold frame: Tense, minimalist, expires Friday |
| `pad-art_tape.png` | 44 × 36 | A framed painting for the wall: "Endless Tape" (Ticker symbols scrolling into infinity.) Include the frame. | a small framed painting in a gold frame: Ticker symbols scrolling into infinity |
| `pad-art_gap.png` | 44 × 36 | A framed painting for the wall: "Gap Down, 4 A.M." (Earnings night, as remembered.) Include the frame. | a small framed painting in a gold frame: Earnings night, as remembered |
| `pad-art_bull.png` | 44 × 36 | A framed painting for the wall: "Bull, Resting" (For once.) Include the frame. | a small framed painting in a gold frame: For once |
| `pad-art_ledger.png` | 44 × 36 | A framed painting for the wall: "The Ledger" (Every trade, in gold leaf. Even that one.) Include the frame. | a small framed painting in a gold frame: Every trade, in gold leaf. Even that one |

### Watches (display case)

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-w_digital.png` | 24 × 24 | A wristwatch, face up, for the display case: Calculator Watch. | a calculator watch lying face up |
| `pad-w_diver.png` | 24 × 24 | A wristwatch, face up, for the display case: Deep Diver. | a deep diver lying face up |
| `pad-w_chrono.png` | 24 × 24 | A wristwatch, face up, for the display case: Chronograph. | a chronograph lying face up |
| `pad-w_gold.png` | 24 × 24 | A wristwatch, face up, for the display case: Gold Dress Watch. | a gold dress watch lying face up |
| `pad-w_skeleton.png` | 24 × 24 | A wristwatch, face up, for the display case: Skeleton Dial. | a skeleton dial lying face up |
| `pad-w_moon.png` | 24 × 24 | A wristwatch, face up, for the display case: Moonphase. | a moonphase lying face up |
| `pad-w_tourbillon.png` | 24 × 24 | A wristwatch, face up, for the display case: Tourbillon. | a tourbillon lying face up |
| `pad-w_orbital.png` | 24 × 24 | A wristwatch, face up, for the display case: Orbital Time Standard. | a orbital time standard lying face up |

### Vehicles (showroom plinth)

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-v_hoverbike.png` | 144 × 64 | Hover-Bike, side view, parked on the showroom plinth (bottom edge touches it). | a sleek hover-bike in side view, retro-futurist |
| `pad-v_roadster.png` | 144 × 64 | Electric Roadster, side view, parked on the showroom plinth (bottom edge touches it). | a sleek electric roadster in side view, retro-futurist |
| `pad-v_skysedan.png` | 144 × 64 | Sky Sedan, side view, parked on the showroom plinth (bottom edge touches it). | a sleek sky sedan in side view, retro-futurist |
| `pad-v_subyacht.png` | 144 × 64 | Submarine Yacht, side view, parked on the showroom plinth (bottom edge touches it). | a sleek submarine yacht in side view, retro-futurist |
| `pad-v_jet.png` | 144 × 64 | Suborbital Jet, side view, parked on the showroom plinth (bottom edge touches it). | a sleek suborbital jet in side view, retro-futurist |
| `pad-v_orbital.png` | 144 × 64 | Orbital Yacht, side view, parked on the showroom plinth (bottom edge touches it). | a sleek orbital yacht in side view, retro-futurist |

### Desk items

| File | Size (px) | What it is | Idea |
|---|---|---|---|
| `pad-item_mug.png` | 24 × 28 | Ines's Mug, standing on the desk. | a white coffee mug with a red stripe |
| `pad-item_duck.png` | 24 × 28 | Rubber Duck, standing on the desk. | a yellow rubber duck |
| `pad-item_bonsai.png` | 24 × 28 | Bonsai, standing on the desk. | a tiny bonsai tree in a dish |
| `pad-item_lava.png` | 24 × 28 | Lava Lamp, standing on the desk. | a purple lava lamp with pink blobs |
| `pad-item_bell.png` | 24 × 28 | Closing Bell, standing on the desk. | a small brass bell on a wooden base |
| `pad-item_trophy.png` | 24 × 28 | Tier 8 Trophy, standing on the desk. | a small gold trophy cup |
