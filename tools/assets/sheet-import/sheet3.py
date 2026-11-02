# The third sheet (assets/source/sheet-3.webp): all 47 achievement badges, labeled with their slot names.
# Frame edges (left, right) per row, measured from the sheet's blue tile borders.
_ROWS = [
    (59, 186, [(26, 158), (171, 314), (325, 465), (478, 616), (628, 765), (778, 914), (926, 1069), (1082, 1222), (1234, 1369), (1381, 1512)],
     ['first_blood', 'fifty_club', 'crush_ten', 'stop_taker', 'century', 'called_it', 'calibrated', 'edge_lord', 'good_process', 'clean_ten']),
    (248, 377, [(26, 158), (171, 313), (325, 465), (478, 616), (628, 765), (777, 913), (925, 1069), (1082, 1221), (1233, 1368), (1380, 1512)],
     ['sandbox_scholar', 'first_victory', 'alpha_hunter', 'survivor', 'desk_verticals', 'desk_income', 'desk_condor', 'desk_volatility', 'desk_calendar', 'every_desk']),
    (440, 567, [(25, 159), (171, 313), (325, 462), (475, 615), (627, 765), (777, 912), (924, 1069), (1082, 1220), (1232, 1367), (1379, 1512)],
     ['tier_four', 'tier_eight', 'zen', 'no_override', 'burnout', 'patient', 'reviewer', 'gauntlet', 'big_mult', 'big_score']),
    (630, 758, [(26, 158), (171, 314), (326, 459), (471, 645), (657, 788), (801, 932), (945, 1082), (1094, 1225), (1237, 1366), (1378, 1512)],
     ['career_points', 'full_rack', 'duo', 'research_team', 'ladder', 'pin_master', 'the_wheel', 'parachute', 'client_list', 'drill_ten']),
    (820, 946, [(26, 160), (172, 325), (337, 495), (507, 642), (654, 798), (810, 978), (990, 1142)],
     ['streak_ten', 'greeks_ace', 'endless_two', 'daily_five', 'live_trader', 'pad_upgrade', 'tutorial']),
]
_boxes = []
_names = {}
for y0, y1, cols, names in _ROWS:
    for (l, r), n in zip(cols, names):
        _names[n] = len(_boxes)
        _boxes.append((l, y0, r - l, y1 - y0))
SECTIONS = {'achievement': _boxes}
MAP = {'achievement': _names}
