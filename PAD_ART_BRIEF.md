# The Pad: art status and brief

**Art sheet 4 is in (version 1.5).** The Pad is now drawn from real pictures: 4 furnished rooms, 5 desks, a laptop and 3 monitor setups, 5 chairs, 6 plants, 5 lamps, 8 paintings, 9 watches, 4 vehicles and 15 desk items. The sheet itself is `assets/source/sheet-4.webp`; `tools/assets/sheet-import/sheet4.py` says which tile became which file.

**Still drawn in code (3 pieces):** the Rubber Duck, Lava Lamp and Closing Bell desk items (`pad-item_duck.png`, `pad-item_lava.png`, `pad-item_bell.png`, 96 × 80 each). They show as small code drawings until pictures arrive.

**Retired in 1.5** (no picture on the new sheet): the paintings Iron Condor in Flight, Pinned at the Strike, Gap Down 4 A.M. and The Ledger, and the Submarine Yacht, Suborbital Jet and Orbital Yacht. They're no longer sold. Anyone who already bought one keeps it in their list.

## How the scene is put together

The room picture fills the whole scene (640 × 360). Everything else is a transparent PNG standing on its bottom edge, and the game places it and scales it to fit its spot, so a picture a little off the listed size still lands in the right place:

1. the **room** (already furnished: bed, couch, shelves, windows),
2. up to **four paintings** on each room's bare wall (the first one hangs over the room's own frame where it has one),
3. a **watch case** (a shadow box the game draws, with the watches in rows of three),
4. a **plant**: on the floor at the right, or the **hanging vine** at the top left,
5. the newest **vehicle** at the bottom left, on its turntable or a floor shadow,
6. the **desk** at the bottom center, the **lamp** at its left end (with a glow), the **laptop or monitors** in the middle and up to **six desk items** beside and in front of the screens,
7. the **chair** at the desk's right.

The spots are set in `src/ui/pad/scene.ts` (`ROOM_SPOTS` for each room's wall, and the desk layout just below it).

## Adding more pieces

Send a sheet the same way as sheet 4: each piece on its own tile with its file name printed under it, on a flat dark background. Claude Code cuts, cleans and resizes each one. For single files, the list with exact names and sizes is in `ASSETS_NEEDED.md` under "The Pad".

**Style** (so new pieces match sheet 4): pixel art at night, front-on at eye level, warm lamp light and cool monitor light, deep indigo and violet shadows with neon cyan, magenta and amber accents, a 1-pixel dark outline and 3–4 shade steps, no text or logos. Transparent backgrounds for everything except rooms.

**Prompt for the three missing desk items:**

> Pixel art for a retro-futurist trading game, night scene lit by a warm desk lamp and cool monitor glow, crisp pixels, 1-pixel dark outline, 3–4 shade steps, no text. Three small desk items on a flat dark background, each on its own tile with its name underneath, seen front-on: a yellow rubber duck (pad-item_duck), a purple lava lamp with pink blobs (pad-item_lava), a small brass service bell on a wooden base (pad-item_bell).
