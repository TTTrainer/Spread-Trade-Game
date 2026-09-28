# Which sheet tile (index within its section, left to right, top to bottom) becomes which slot.
MAP = {
    'cartridge': {
        'theta_engine': 0, 'fifty_percent_club': 1, 'weekend_warrior': 2, 'twenty_one_day_rule': 3,
        'credit_where_due': 4, 'ladder_up': 5, 'premium_printer': 6, 'dividend_radar': 7, 'iv_crusher': 8,
        'vol_arb': 9, 'long_gamma': 10, 'term_structure_tap': 11, 'crush_it': 12, 'earnings_sniper': 13,
        'earnings_whisper': 14, 'fed_watcher': 15, 'breakout_insurance': 16, 'bag_holder': 17,
        'patience_pays': 18, 'legging_pro': 19, 'iron_stomach': 20, 'meme_energy': 21, 'level_ii_feed': 22,
        'bonus_pool': 23, 'two_x_leverage': 24, 'smart_router': 25, 'roll_artist': 26,
        'compound_interest': 27, 'assignment_artist': 28, 'expense_account': 29, 'rsi_radar': 30,
        'straddle_stack': 31, 'contrarian': 32, 'stop_discipline': 33, 'gamma_scalper': 34,
        'right_sized': 35, 'the_wheel': 36, 'golden_parachute': 37, 'delta_neutral': 38, 'macd_cross': 39,
        'edge_hunter': 40, 'pin_master': 41,
    },
    'memo': {
        'analyst_loan': 0, 'time_skip': 1, 'roll_voucher': 2, 'reroll': 3, 'lens': 4, 'hedge': 5,
        'extra_ticket': 6, 'compliance_waiver': 7, 'vacation': 8, 'due_diligence': 9, 'double_down': 10,
    },
    'voucher': {
        'clearance': 0, 'margin_upgrade': 1, 'research_budget': 2, 'risk_committee': 3, 'seed_capital': 4,
        'dma': 5, 'second_monitor': 6, 'prime_broker': 7, 'terminal_pro': 8,
    },
    'analyst': {
        'risk_officer': 0, 'vol_surfer': 1, 'macro_desk': 2, 'chartist': 3, 'ghost': 4,
        'earnings_whisperer': 5, 'scout': 6, 'skew_doctor': 8, 'quant': 9,
    },
    'tag': {
        'cartridge': 0, 'investment': 1, 'calm': 2, 'playbook': 3, 'reroll': 4, 'double': 5,
        'discipline': 6, 'analyst': 7,
    },
    'page': {
        'covered_call': 0, 'bull_call': 1, 'iron_condor': 2, 'bear_call': 3, 'bear_put': 4,
        'bwb_condor': 5, 'long_strangle': 6, 'bull_put': 7, 'iron_fly': 8, 'calendar': 9,
        'long_straddle': 10, 'cash_secured_put': 11,
    },
    'review': {
        'annual_review': 0, 'earnings_gauntlet': 1, 'the_fed': 2, 'gap_risk': 3, 'vol_spike': 4,
        'trend_train': 5, 'the_chop': 6, 'dead_calm': 7, 'wide_markets': 8, 'assignment_week': 9,
    },
    'desk': {'calendar': 0, 'volatility': 1, 'condor': 2, 'income': 3, 'verticals': 4},
    'client': {
        'the_committee': 0, 'lesser_duchy': 1, 'dr_penny': 2, 'garage': 4, 'vol_bros': 5,
        'crypto_kyle': 6, 'stroud_trust': 7, 'temporal': 8, 'lemonade': 9, 'meridian': 10,
        'calm_harbor': 11, 'influencer': 13, 'treasury7': 14, 'marguerite': 15,
    },
    'family': {'EXEC': 0, 'VEGA': 1, 'EVENT': 2, 'ECON': 3, 'DISC': 4, 'DELTA': 5, 'CHAOS': 6, 'THETA': 7},
    'achievement': {
        'first_victory': 0, 'career_points': 1, 'edge_lord': 2, 'tier_eight': 3, 'big_score': 4,
        'called_it': 5, 'burnout': 6, 'first_blood': 7, 'tier_four': 8, 'endless_two': 9,
        'good_process': 10, 'live_trader': 11, 'calibrated': 12, 'duo': 13, 'tutorial': 14,
        'big_mult': 15, 'zen': 16, 'survivor': 17, 'alpha_hunter': 18, 'reviewer': 19,
    },
    'cardback': {'standard': 0, 'ines': 1, 'circuit': 2, 'tape': 3, 'hazard': 4, 'redacted': 5, 'gold': 6},
}
