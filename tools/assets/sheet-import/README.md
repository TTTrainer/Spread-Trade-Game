# Importing an art sheet

`assets/source/sheet-1.webp` is the first sheet of game art. These scripts cut it into the files in `assets/art/`:

- `tiles.py`: where each tile sits on the sheet (x, y, width, height), per section.
- `mapping.py`: which tile becomes which slot (`cartridge-theta_engine.png` and so on).
- `process.py`: finds each tile's frame, removes the icon background (icons only; portraits, bosses,
  desks and card backs keep theirs), trims, and scales to the slot size.

Run from the repository root (needs Python 3 with Pillow):

```
cd tools/assets/sheet-import && python3 process.py ../../../assets/art ../../../assets/source/sheet-1.webp
```

Then `npm run assets:list` to refresh `ASSETS_NEEDED.md`.
