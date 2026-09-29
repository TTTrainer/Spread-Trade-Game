# Importing an art sheet

`assets/source/sheet-1.webp` and `sheet-2.webp` are the sheets of game art so far. These scripts cut them into the files in `assets/art/`:

- `tiles.py` + `mapping.py` (sheet 1), `sheet2.py` (sheet 2): where each tile sits on the sheet
  (x, y, width, height) per section, and which tile becomes which slot.
- `process.py`: finds each tile's frame, removes the icon background (icons only; portraits, bosses,
  desks and card backs keep theirs), trims, and scales to the slot size.

Run from the repository root (needs Python 3 with Pillow):

```
cd tools/assets/sheet-import && python3 process.py ../../../assets/art ../../../assets/source/sheet-1.webp
python3 process.py ../../../assets/art ../../../assets/source/sheet-2.webp sheet2
```

Then `npm run assets:list` to refresh `ASSETS_NEEDED.md`.
