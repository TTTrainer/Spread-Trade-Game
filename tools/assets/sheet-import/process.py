"""Cut the sheet into game art: remove each icon's tile background, trim, and scale to its slot size."""
import sys
from collections import deque
from PIL import Image
import importlib

# Which sheet's layout to use: sheet 1 lives in tiles.py + mapping.py, later sheets in sheetN.py.
SPEC = sys.argv[3] if len(sys.argv) > 3 else 'sheet1'
SLOT_SIZES, SLOT_MODES = {}, {}
if SPEC == 'sheet1':
    from tiles import SECTIONS
    from mapping import MAP
else:
    _m = importlib.import_module(SPEC)
    SECTIONS, MAP = _m.SECTIONS, _m.MAP
    # Later sheets may size each slot on its own (The Pad's pieces differ in shape).
    SLOT_SIZES = getattr(_m, 'SIZES', {})
    SLOT_MODES = getattr(_m, 'MODES', {})

OUT = sys.argv[1]
SIZE = {'cartridge': (64, 64), 'memo': (64, 64), 'voucher': (64, 64), 'analyst': (64, 64), 'tag': (64, 64),
        'page': (64, 64), 'client': (64, 64), 'review': (96, 96), 'desk': (256, 96), 'family': (32, 32),
        'achievement': (32, 32), 'cardback': (48, 128)}
# Icons lose their tile background; portraits, scenes and card backs keep theirs.
CUTOUT = {'cartridge', 'memo', 'voucher', 'tag', 'page', 'client', 'family', 'achievement'}

sheet = Image.open(sys.argv[2] if len(sys.argv) > 2 else 'assets/source/sheet-1.webp').convert('RGB')


def cutout(tile: Image.Image) -> Image.Image:
    w, h = tile.size
    px = tile.load()
    ring = [px[x, y] for x in range(w) for y in (0, 1, h - 2, h - 1)] + [px[x, y] for y in range(h) for x in (0, 1, w - 2, w - 1)]
    bg = tuple(sorted(c[i] for c in ring)[len(ring) // 2] for i in range(3))

    def is_bg(c):
        d = sum((c[i] - bg[i]) ** 2 for i in range(3)) ** 0.5
        return d < 34 and max(c) < 80

    seen = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[x][y] or not is_bg(px[x, y]):
            continue
        seen[x][y] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = tile.convert('RGBA')
    op = out.load()
    for x in range(w):
        for y in range(h):
            if seen[x][y]:
                op[x, y] = (0, 0, 0, 0)
    # Drop specks: opaque pixels with no opaque neighbours.
    for x in range(1, w - 1):
        for y in range(1, h - 1):
            if op[x, y][3] and sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if op[x + dx, y + dy][3]) == 0:
                op[x, y] = (0, 0, 0, 0)
    return out


def fit(img: Image.Image, size, margin=0.06) -> Image.Image:
    """Trim to the content, pad to the slot's aspect with a small margin, and scale."""
    bbox = img.getchannel('A').getbbox() or (0, 0, *img.size)
    img = img.crop(bbox)
    tw, th = size
    w, h = img.size
    scale = min(tw * (1 - 2 * margin) / w, th * (1 - 2 * margin) / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    img = img.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.alpha_composite(img, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def stand(img: Image.Image, size, margin=0.04) -> Image.Image:
    """Trim to the content and scale it to fit, standing on the bottom edge (a Pad piece sits on
    the floor or the desk), centered left to right."""
    bbox = img.getchannel('A').getbbox() or (0, 0, *img.size)
    img = img.crop(bbox)
    tw, th = size
    w, h = img.size
    scale = min(tw * (1 - 2 * margin) / w, th * (1 - margin) / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    img = img.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.alpha_composite(img, ((tw - nw) // 2, th - nh))
    return canvas


def cover(img: Image.Image, size) -> Image.Image:
    """Center-crop a scene to the slot's aspect, then scale."""
    tw, th = size
    w, h = img.size
    if w / h > tw / th:
        nw = round(h * tw / th)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w * th / tw)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return img.resize(size, Image.LANCZOS).convert('RGBA')


def frame_inner(x0, y0, x1, y1):
    """Find the tile's own frame lines near each edge and return the box just inside them."""
    px = sheet.load()

    def col_hit(x):
        n = sum(1 for y in range(y0 + 6, y1 - 6) if max(px[x, y]) > 90)
        return n / max(1, (y1 - y0 - 12)) > 0.55

    def row_hit(y):
        n = sum(1 for x in range(x0 + 6, x1 - 6) if max(px[x, y]) > 90)
        return n / max(1, (x1 - x0 - 12)) > 0.55

    l = next((x + 1 for x in range(x0 + 9, x0 - 1, -1) if col_hit(x)), x0 + 4)
    r = next((x for x in range(x1 - 9, x1 + 1) if col_hit(x)), x1 - 4)
    t = next((y + 1 for y in range(y0 + 9, y0 - 1, -1) if row_hit(y)), y0 + 4)
    b = next((y for y in range(y1 - 9, y1 + 1) if row_hit(y)), y1 - 4)
    return l, t, r, b


written = []
for cat, slots in MAP.items():
    boxes = SECTIONS[cat]
    for sid, idx in slots.items():
        x, y, w, h = boxes[idx]
        if cat == 'cardback':
            tile = sheet.crop((x + 1, y + 1, x + w - 1, y + h - 1))
        else:
            l, t, r, b = frame_inner(x - 3, y - 3, x + w + 3, y + h + 3)
            tile = sheet.crop((l + 2, t + 2, r - 2, b - 2))
        size = SLOT_SIZES.get(sid, SIZE.get(cat))
        mode = SLOT_MODES.get(sid)
        if mode == 'stand':
            img = stand(cutout(tile), size)
        elif mode == 'cover':
            img = cover(tile, size)
        elif cat in CUTOUT:
            img = fit(cutout(tile), size)
        else:
            img = cover(tile, size)
        name = f'{cat}-{sid}.png'
        img.save(f'{OUT}/{name}', optimize=True)
        written.append(name)
print(len(written), 'files written')
