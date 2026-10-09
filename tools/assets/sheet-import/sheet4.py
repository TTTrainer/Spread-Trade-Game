# The fourth sheet (assets/source/sheet-4.webp): The Pad, labeled by its own file names.
# Tile boxes (x, y, width, height) measured from the sheet's tile borders; process.py refines each
# edge to the tile's own frame line. Rooms keep their backgrounds (cropped to the scene's 16:9);
# everything else loses its tile background and sits on the bottom edge of its PNG, so the scene
# can stand it on the floor or the desk.


def _row(y0, y1, cols):
    return [(l, y0, r - l, y1 - y0) for l, r in cols]


_TILES = {
    'room': _row(40, 201, [(16, 385), (394, 765), (773, 1143), (1151, 1520)]),
    'desk': _row(272, 365, [(18, 184), (192, 356), (363, 528), (535, 699), (707, 872)]),
    'monitor': _row(272, 365, [(921, 1102), (1110, 1320), (1329, 1525)]),
    'chair': _row(445, 552, [(18, 105), (111, 198), (204, 291), (297, 384), (390, 475)]),
    'plant': _row(445, 552, [(502, 595), (602, 692), (699, 794), (802, 891), (897, 978), (986, 1067)]),
    'lamp': _row(445, 544, [(1095, 1181), (1187, 1274), (1281, 1365), (1372, 1438), (1444, 1518)]),
    'painting': _row(631, 743, [(18, 155), (161, 290), (298, 417), (424, 551), (558, 684), (691, 823),
                                (829, 962), (971, 1130)]),
    'watch': _row(632, 685, [(1153, 1221), (1230, 1294), (1304, 1369), (1377, 1443), (1451, 1517)])
    + _row(708, 761, [(1153, 1221), (1230, 1294), (1304, 1369), (1377, 1443)]),
    'vehicle': _row(829, 963, [(18, 207), (216, 397), (407, 588), (598, 780)]),
    'item': _row(828, 885, [(817, 908), (914, 1002), (1008, 1096), (1102, 1184), (1188, 1268), (1275, 1365),
                            (1372, 1516)])
    + _row(912, 977, [(817, 903), (912, 983), (990, 1068), (1075, 1153), (1160, 1246), (1253, 1330),
                      (1340, 1433), (1440, 1516)]),
}

_NAMES = {
    'room': ['room_studio', 'room_loft', 'room_penthouse', 'room_orbital'],
    'desk': ['desk_0', 'desk_1', 'desk_2', 'desk_3', 'desk_4'],
    'monitor': ['monitors_1', 'monitors_2', 'monitors_3'],
    'chair': ['chair_0', 'chair_2', 'chair_1', 'chair_3', 'chair_4'],
    'plant': ['plant_1', 'plant_2', 'plant_3', 'plant_4', 'plant_5', 'plant_6'],
    'lamp': ['light_0', 'light_1', 'light_2', 'light_3', 'light_4'],
    'painting': ['art_candle5', 'art_bull', 'art_bear', 'art_vix', 'art_theta', 'art_tape', 'art_smile',
                 'art_greeks'],
    'watch': ['w_gold', 'w_diver', 'w_chrono', 'w_emerald', 'w_skeleton', 'w_moon', 'w_orbital', 'w_tourbillon',
              'w_digital'],
    'vehicle': ['v_roadster', 'v_suv', 'v_skysedan', 'v_hoverbike'],
    'item': ['item_laptop', 'item_notebook', 'item_pens', 'item_mug', 'item_water', 'item_sticky',
             'item_headphones', 'item_controller', 'item_cube', 'item_trophy', 'item_books', 'item_bonsai',
             'item_phone', 'item_photo', 'item_coins'],
}

# PNG size per category (about twice the sheet's own resolution). Content is bottom-centered.
_SIZE = {
    'room': (640, 360), 'desk': (320, 112), 'monitor': (400, 160), 'chair': (128, 160), 'plant': (128, 160),
    'lamp': (112, 150), 'painting': (240, 180), 'watch': (64, 64), 'vehicle': (360, 250), 'item': (96, 80),
}

SECTIONS = {'pad': []}
MAP = {'pad': {}}
SIZES = {}
MODES = {}
for cat, boxes in _TILES.items():
    for box, name in zip(boxes, _NAMES[cat]):
        MAP['pad'][name] = len(SECTIONS['pad'])
        SECTIONS['pad'].append(box)
        SIZES[name] = _SIZE[cat]
        MODES[name] = 'cover' if cat == 'room' else 'stand'
