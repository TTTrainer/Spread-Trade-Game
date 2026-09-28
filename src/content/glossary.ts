/**
 * Hover explanations, Balatro-style: a title, one or two plain sentences on what it does in the
 * game, and (where it maps to real trading) a line on what it means at a real broker.
 */

export interface GlossaryEntry {
  title: string;
  body: string;
  real?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ---------- the round ----------
  meter: {
    title: 'Round meter',
    body: 'Points from trades that closed this round. Fill it to the target before the round ends. Winners add points, losers drain some.',
  },
  target: {
    title: 'Target',
    body: 'The points you need this round. Miss it and the run ends (unless something saves you).',
  },
  max_loss: {
    title: 'Max-Loss Line',
    body: 'How much you can lose this round, as a share of your equity. Cross it and the risk desk closes everything and the round fails. "Room" is what you have left.',
    real: 'Like a daily loss limit at a prop firm.',
  },
  stress: {
    title: 'Stress',
    body: 'Goes up when you lose, decline your own stop or enter a Review; down when you close at plan or skip. At 100 you burn out: one fewer ticket next round. Click it for the log.',
  },
  cash: {
    title: 'Shop cash',
    body: 'Game money for the shop. Earned by winning rounds, unused tickets and interest ($1 per $5 held). It is not your trading equity.',
  },
  tickets: {
    title: 'Tickets',
    body: 'How many trades you may open this round. Unused tickets pay $1 each at the shop.',
  },
  equity: {
    title: 'Equity',
    body: 'Your paper account: starting capital plus real P/L, marked to the latest close. Risk caps and targets scale with it.',
  },
  reroll: {
    title: 'Reroll the lineup (R)',
    body: "Deal new cards for every card you haven't traded. Limited per round.",
  },
  skip: {
    title: 'Skip the round (K)',
    body: 'Skip a Month round before trading: −10 stress and you get the Tag shown on the button. No shop after a skip. Reviews cannot be skipped.',
  },
  start_clock: {
    title: 'Start the clock (Space)',
    body: 'Fast-forward day by day. Once it runs, no new trades this round. It pauses only for the decisions that matter.',
  },
  step_day: { title: 'Step one day', body: 'Advance the clock by a single trading day.' },
  cartridge_rail: {
    title: 'Cartridges',
    body: 'Your powerups. They score left to right, so order matters: an adder before a multiplier is worth more. Drag with ◀ ▶ in the shop.',
  },
  families: {
    title: 'Families',
    body: 'Every cartridge belongs to one or two families. Two, three or four of a family unlock bonuses. Hover a family to see them.',
  },
  analysts: {
    title: 'Analysts',
    body: 'Information you hire in the shop: extra readouts on your cards and the analyst desk. They never change prices, only what you can see.',
  },
  memos: { title: 'Memos', body: 'One-use items (2 slots). Click one to play it.' },
  client: {
    title: 'Client request',
    body: 'Optional. Place one trade that meets every line to earn cash and reputation. The checklist updates as you build.',
  },
  // ---------- lineup cards ----------
  lineup_card: {
    title: 'Lineup card',
    body: 'One real stock at one real moment, disguised (codename, rescaled price, hidden date). You only see up to today.',
  },
  day_label: {
    title: 'Day',
    body: "Where you are in the card's window. Real dates stay hidden in Career until the debrief reveals them.",
  },
  ivr_chip: {
    title: 'IV rank',
    body: "Where today's implied volatility sits in its last year (0 = the lowest, 100 = the highest). High IV rank means options are expensive: good for selling premium.",
    real: 'thinkorswim shows this as IV Percentile/IV Rank.',
  },
  ern_chip: {
    title: 'Earnings ahead',
    body: 'Days until the company reports. Expect a gap and an IV crush after the report.',
  },
  sim_chip: {
    title: 'SIM market',
    body: 'An invented company with a realistic price history. Build real data in Settings > Data to trade real ones.',
  },
  model_chip: {
    title: 'Modeled day',
    body: 'The free data skipped this day, so its prices were modeled from the nearest real chain. Clearly labeled so you know.',
  },
  hist_chip: { title: 'History', body: 'How many trading days of chart you can see behind today.' },
  street_read: {
    title: 'Street read',
    body: "Where the crowd leans on this stock, from recent news, the trend and the market, using only what was known that day. It's the crowd's view, not a promise: fading it is a real strategy too.",
  },
  brief_tab: {
    title: 'Brief (news and the street read)',
    body: 'Everything the market knew that day in one screen: the lean, the backdrop, what is coming up and the last month of headlines. Shown first on a card until you make your call.',
  },
  trade_tab: {
    title: 'Trade',
    body: 'The payoff chart and the numbers of the spread you are building (or holding).',
  },
  brief_market: {
    title: 'Market backdrop',
    body: 'How the whole market (SPY) did over the last month and how scared it is (VIX). Most stocks swim with the tide.',
  },
  brief_tape: {
    title: 'The stock',
    body: 'Its own recent moves, where it sits against its 50- and 200-day averages, its RSI and its 52-week range.',
  },
  brief_upcoming: {
    title: 'Coming up',
    body: 'Scheduled events ahead: earnings, ex-dividend dates, Fed decisions and CPI. Dates are public; how they turn out is not.',
  },
  brief_news: {
    title: 'News',
    body: 'Headlines from the last 30 trading days: earnings reactions, gaps, heavy volume, streaks, new highs and lows, trend crosses and Fed or CPI days that moved it.',
  },
  // ---------- builder ----------
  call: {
    title: 'Call your shot (1–5)',
    body: 'Your forecast to expiration: down big, down, flat, up, up big. Required before every trade. Right calls add chips; calibration grades you over time.',
  },
  confidence: {
    title: 'Confidence (Shift+1–5)',
    body: 'How sure you are, 50–90%. Being right at high confidence scores more; being wrong at 80%+ adds stress. Honest numbers earn a good calibration grade.',
  },
  structure: {
    title: 'Structure',
    body: "The kind of spread. Your desk's playbook decides which you can trade. Alt+R flips it (bull put ↔ bear call).",
  },
  expiration: {
    title: 'Expiration',
    body: 'When the options expire. 30–45 days is the classic premium-selling window; weeklies are faster and swingier.',
  },
  delta: {
    title: 'Short strike delta',
    body: 'How far out your short strike sits. 0.30 ≈ a 30% chance of finishing in the money. Lower delta: safer, less credit.',
    real: 'The Delta column on the option chain.',
  },
  width: {
    title: 'Width',
    body: 'Distance between the short and long strikes. Wider collects more but risks more.',
  },
  contracts: { title: 'Contracts', body: 'How many spreads. Max loss scales with it.' },
  risk_cap: {
    title: 'Risk used / cap',
    body: 'Max loss of this trade as a share of equity, against the per-trade cap. Trades over the cap are refused.',
  },
  order_limit: {
    title: 'Limit order',
    body: 'Name your price between mid and natural. Closer to mid saves money but may not fill; the fill chance is shown live.',
    real: 'A limit order at the mid/natural on thinkorswim.',
  },
  order_market: {
    title: 'Market order',
    body: 'Fills right away at the natural price (the worse side of the bid/ask).',
  },
  mid: { title: 'Mid', body: 'Halfway between bid and ask: the fair price, but not guaranteed to fill.' },
  natural: { title: 'Natural', body: 'The price that fills now: you sell at the bid, buy at the ask.' },
  fill_chance: {
    title: 'Fill chance',
    body: 'The chance your limit fills today. Unfilled limits wait and may fill later if the market comes to you.',
  },
  brackets: {
    title: 'Brackets',
    body: 'Your plan, set at entry: take profit at a target, cut the loss at a stop. Closing at plan scores +1 mult and calms stress.',
    real: 'An OCO bracket order (profit target + stop).',
  },
  bracket_target: {
    title: 'Profit target',
    body: 'Closes automatically when the trade has made this share of its max profit. 50% is the classic credit-spread rule.',
  },
  bracket_stop: {
    title: 'Stop',
    body: 'When the loss reaches this many times the credit, the game asks you to take it. Taking it is +1 mult; declining costs stress and the loss counts more.',
  },
  earnings_ack: {
    title: 'Holding through earnings on purpose',
    body: "Tick this when earnings fall inside your trade and that's the plan. The game then won't stop you the night before.",
  },
  sell: {
    title: 'Sell (Alt+S)',
    body: 'Open a credit trade: you collect money now and profit if the stock stays on the right side.',
  },
  buy: {
    title: 'Buy (Alt+B)',
    body: 'Open a debit trade: you pay now and profit if the stock moves your way.',
  },
  auto_send: {
    title: 'Auto-send (Alt+A)',
    body: 'On: orders go straight out when you press Sell or Buy. Off: a confirm box shows the order first.',
  },
  // ---------- trade stats ----------
  credit: { title: 'Credit', body: 'Money you collect per spread (× contracts × 100 dollars).' },
  debit: { title: 'Debit', body: 'Money you pay per spread (× contracts × 100 dollars).' },
  max_profit: { title: 'Max profit', body: 'The most this trade can make, at expiration.' },
  max_loss_trade: {
    title: 'Max loss',
    body: 'The most this trade can lose. Defined risk: it can never lose more.',
  },
  breakeven: {
    title: 'Breakeven',
    body: 'The stock price at expiration where the trade makes exactly zero.',
  },
  pop: {
    title: 'POP (probability of profit)',
    body: 'The chance the trade makes at least a penny at expiration, from implied volatility.',
    real: "thinkorswim's Prob. of Profit.",
  },
  rr: {
    title: 'Reward : risk',
    body: 'Max profit against max loss. Credit spreads trade a small reward for a high win rate; the game checks it against a sensible rule for each structure.',
  },
  expected_move: {
    title: 'Expected move',
    body: 'How far the options market expects the stock to move by expiration (one standard move either way).',
    real: 'The Expected Move shown on thinkorswim, from the at-the-money straddle.',
  },
  iv_hv: {
    title: 'IV vs HV',
    body: 'Implied volatility (what options are pricing) against historical volatility (how much the stock actually moved lately). IV above HV means options are rich.',
  },
  edge_rank: {
    title: 'Edge Rank',
    body: 'How your price compares with every similar spread on the chain today. Top 25% multiplies your score ×1.25, top 10% ×1.5.',
  },
  score_preview: {
    title: 'Score preview',
    body: 'What this trade would score (chips × mult) if it hits max profit, with your cartridges applied in order.',
  },
  chips: { title: 'Chips', body: 'Base points from the P/L and the structure. Mult multiplies them.' },
  mult: {
    title: 'Mult',
    body: 'Multiplier on the chips, built up by your call, discipline, cartridges and Edge Rank.',
  },
  greeks: {
    title: 'What moves this trade',
    body: 'The Greeks in plain words: time decay (theta), direction (delta), volatility (vega) and how fast direction changes near your strike (gamma).',
  },
  payoff: {
    title: 'Payoff',
    body: 'P/L at expiration (solid) and today (dashed) across stock prices. Shaded: the expected move.',
    real: 'The Risk Profile on thinkorswim.',
  },
  pl_open: { title: 'Open P/L', body: "What the trade would make or lose if closed at today's mid." },
  pct_risk: { title: '% of risk', body: 'Open P/L as a share of the max loss.' },
  dte: { title: 'DTE', body: 'Days to expiration.' },
  open_price: {
    title: 'Open',
    body: 'The price you filled at, per spread: the credit you took in or the debit you paid.',
  },
  mark: {
    title: 'Mark',
    body: "What it would cost to close the spread at today's mid. For a credit spread you want this to shrink toward zero.",
  },
  pos_delta: {
    title: 'Delta (Δ)',
    body: 'How many dollars the position gains if the stock rises $1. Positive: you want it up. Negative: you want it down.',
  },
  pos_theta: {
    title: 'Theta (Θ/day)',
    body: 'Dollars the position makes (+) or loses (−) from one day passing, all else equal. Credit spreads earn it.',
  },
  pos_vega: {
    title: 'Vega',
    body: 'Dollars the position gains if implied volatility rises one point. Credit spreads lose when IV jumps and win from an IV crush.',
  },
  to_short: {
    title: 'Room to the short strike',
    body: 'How far the stock is from your short strike, in daily ranges (ATR) and in expected moves (EM). Under 1 EM is getting close.',
  },
  close_pos: {
    title: 'Close (Alt+F)',
    body: 'Buy it back now at the market. Taking a planned stop scores +1 mult.',
  },
  roll: {
    title: 'Roll',
    body: 'Close this spread and open the same one at a later date or other strikes, in one order. Shows the net credit or debit.',
    real: 'A roll order on thinkorswim.',
  },
  // ---------- run end / meta ----------
  calibration: {
    title: 'Calibration grade',
    body: 'How well your confidence matched your hit rate (Brier score). A: when you say 70%, you are right about 70% of the time.',
  },
  alpha: {
    title: 'Alpha vs SPY',
    body: 'Your P/L minus what the same money would have made in SPY over the same days.',
  },
  bonus: {
    title: 'Bonus',
    body: 'Money you keep between runs: unlock desks, cartridge packs, The Pad and cosmetics.',
  },
  xp: {
    title: 'Career XP',
    body: 'Every run pays XP, even failed ones. XP raises your rank, and ranks unlock things.',
  },
  heat: {
    title: 'Heat',
    body: 'Optional harder rules you switched on. Clearing a year with more Heat unlocks cosmetics.',
  },
  risk_tier: {
    title: 'Risk Tier',
    body: "Harder stakes, stacked like Balatro's. Clearing a year at your top tier unlocks the next.",
  },
  shop_reroll: {
    title: 'Reroll the shop (R)',
    body: 'New offers. Each reroll in the same shop costs $1 more.',
  },
  interest: { title: 'Interest', body: '$1 for every $5 of shop cash you hold, up to $5. Saving pays.' },
  review: {
    title: 'Review',
    body: 'The third round of each quarter: a boss with a special rule and a bigger target.',
  },
};
