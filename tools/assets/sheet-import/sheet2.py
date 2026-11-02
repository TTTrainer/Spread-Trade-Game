# The second sheet (assets/source/sheet-2.webp): each tile is labeled with its slot name.
SECTIONS = {
    'cartridge': [(x, 97, w, 196) for x, w in [(29, 174), (213, 176), (399, 176), (587, 173), (772, 173), (956, 177), (1143, 176), (1329, 175)]],
    'voucher': [(36, 426, 232, 178)],
    'page': [(39, 727, 223, 210), (275, 727, 210, 210)],
}
MAP = {
    'cartridge': {
        'trend_rider': 0, 'bollinger_bouncer': 1, 'diagonal_drift': 2, 'portfolio_margin': 3,
        'rivals_bet': 4, 'covered_and_chill': 5, 'wing_clipper': 6, 'double_time': 7,
    },
    'voucher': {'algo_execution': 0},
    'page': {'diagonal': 0, 'double_calendar': 1},
}
