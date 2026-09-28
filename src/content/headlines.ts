/**
 * Headline templates, written once at build time and filled from real event data at runtime,
 * so the game never pays for an API. Everything goes through a HeadlineProvider so a live
 * writer can replace this library later.
 *
 * Blind mode uses the codename and the satirical library. Open mode (real companies by name)
 * uses the plain-facts lines only. Headlines never quote dollar prices (blind prices are
 * rescaled); moves are percentages, which rescaling does not change.
 */

import type { Rng } from '../engine/rng';

export type HeadlineKind =
  | 'earnings'
  | 'gap'
  | 'exdiv'
  | 'fomc'
  | 'cpi'
  | 'vix'
  // Price-action news for the pre-trade brief (no scheduled event behind them).
  | 'high'
  | 'low'
  | 'volume'
  | 'streak'
  | 'cross';
export type Magnitude =
  | 'inside'
  | 'beyond'
  | 'blowout'
  | 'big'
  | 'huge'
  | 'regular'
  | 'rich'
  | 'calm'
  | 'move'
  | 'shock'
  | 'spike'
  | 'panic'
  | 'new'
  | 'surge'
  | 'run'
  | 'golden'
  | 'death';
export type Direction = 'up' | 'down' | 'none';

export interface HeadlineEvent {
  kind: HeadlineKind;
  magnitude: Magnitude;
  direction: Direction;
  /**
   * Placeholder values: sym, move, absmove, implied, ratio, gap, yield, event, vix, vixchg,
   * volx (volume multiple), days (streak length), side (above/below, facts only).
   */
  vars: Record<string, string>;
}

export interface HeadlineProvider {
  headline(e: HeadlineEvent, rng: Rng, mode: 'blind' | 'open'): string;
}

type Key = `${HeadlineKind}:${Magnitude}:${Direction}`;

export const TEMPLATES: Partial<Record<Key, string[]>> = {
  // ---------------- earnings: move inside the implied move ----------------
  'earnings:inside:up': [
    '{sym} beats by a rounding error; stock up {absmove}, inside the {implied} the options priced.',
    '{sym} reports. Nothing breaks. Up {absmove}. Straddle buyers quietly update their LinkedIn.',
    '{sym} guides "cautiously constructive," climbs {absmove}. Implied was {implied}. Premium sellers exhale.',
    'Analysts call {sym} print "fine." Market agrees: {move}. Volatility collapses on schedule.',
    '{sym} earnings land inside the lines: {move} against {implied}. IV crush proceeds as ordered.',
    '{sym} CFO says "disciplined" nine times. Shares {move}. The options market yawns audibly.',
    'Modest beat at {sym}; stock up {absmove}. The expected move was {implied}. Everyone was right, which is suspicious.',
    '{sym} delivers exactly what was priced: {move}. Somewhere a vol trader sighs into a protein shake.',
  ],
  'earnings:inside:down': [
    '{sym} misses by a whisker, slips {absmove}; options had braced for {implied}.',
    '{sym} reports, stock dips {absmove}. Implied was {implied}. The crush is the story.',
    '{sym} "sees headwinds," falls {absmove}. The headwinds were priced. So was the fall.',
    'Soft quarter at {sym}; shares {move}, well inside the {implied} straddle.',
    '{sym} trims guidance politely. Market trims {absmove} politely back.',
    '{sym} earnings: a small miss, a smaller drop ({move}). Implied volatility leaves the building.',
    '{sym} disappoints in a way that was fully expected. Down {absmove} versus {implied} priced.',
    '{sym} call features the phrase "normalizing demand." Stock normalizes {move}.',
  ],
  // ---------------- earnings: beyond the implied move ----------------
  'earnings:beyond:up': [
    '{sym} beats and raises; stock jumps {absmove}, {ratio} the move options priced.',
    '{sym} rips {absmove} after earnings, outrunning a {implied} implied move.',
    'Short sellers discover {sym} can go up. Shares {move}, {ratio} the implied.',
    '{sym} surprises to the upside; call writers surprised to the downside. Up {absmove}.',
    '{sym} guidance "raised with conviction." Stock follows at {move}. Implied was only {implied}.',
    '{sym} quarter crushes estimates, stock crushes the straddle: {move} on a {implied} setup.',
    'Upside surprise at {sym}: {move}. Anyone short the call wing is now in a meeting.',
    '{sym} beats, and the market pays {ratio} the expected move for it. {move}.',
  ],
  'earnings:beyond:down': [
    '{sym} misses; shares slide {absmove}, {ratio} the move options priced.',
    '{sym} falls {absmove} after earnings, through a {implied} implied move.',
    '{sym} guides lower. Stock guides lower faster: {move}.',
    'Put sellers at {sym} learn about the left tail again. Down {absmove} vs {implied} implied.',
    '{sym} "sees a transitional year." Market sees {move}.',
    '{sym} earnings disappoint beyond the priced range: {move}, about {ratio} the expected move.',
    'Heavy selling in {sym} after the print: {move}. The straddle was {implied}.',
    '{sym} CEO blames "macro." Macro declines comment. Stock {move}.',
  ],
  // ---------------- earnings: blowout (more than twice the implied) ----------------
  'earnings:blowout:up': [
    '{sym} EXPLODES {absmove} ON EARNINGS. Options priced {implied}. Nobody priced this.',
    '{sym} doubles the dream: up {absmove}, {ratio} the implied move. Call sellers in stunned silence.',
    'Historic print at {sym}: {move}. Risk desks across the city refresh the page twice.',
    '{sym} beats by a margin that requires a new chart axis. {move}.',
    '{sym} short interest meets gravity in reverse: {move} on earnings.',
    '{sym} rockets {absmove} after the bell. The expected move was {implied}. Expectations have been adjusted.',
    'Somebody at {sym} found money under the couch. A lot of it. Shares {move}.',
    '{sym} pulls a {ratio} expected-move day. Compliance asks if this is allowed. It is.',
  ],
  'earnings:blowout:down': [
    '{sym} COLLAPSES {absmove} ON EARNINGS. Options priced {implied}. Reality priced more.',
    '{sym} guidance cut sends shares {move}, {ratio} the implied move. Premium sellers file into HR.',
    'Carnage at {sym}: {move} after results. The put wing was not wide enough.',
    '{sym} earnings call ends early. Stock does not: {move}.',
    '{sym} "reassesses the roadmap." Market reassesses {sym}: {move}.',
    '{sym} gaps into a different zip code: {move} versus a {implied} straddle.',
    'Worst post-earnings day in memory for {sym}: {move}. Stop orders were a suggestion.',
    '{sym} misses everything, including the implied move by {ratio}. Down {absmove}.',
  ],
  // ---------------- unscheduled gaps ----------------
  'gap:big:up': [
    '{sym} gaps up {gap} ATR with no scheduled news. Rumors of a rumor.',
    '{sym} opens sharply higher ({gap} ATR). The company "does not comment on market activity."',
    "Unexplained bid in {sym}: open gaps {gap} ATR above yesterday's close.",
    '{sym} jumps at the open on no filing anyone can find. Up {absmove} on the day.',
    'Someone wanted {sym} this morning. Very much. {gap}-ATR gap up.',
    '{sym} gaps higher on "strategic interest." Bankers decline to specify whose.',
    'Short covering hits {sym} at the bell: a {gap} ATR gap up, {move} on the day.',
    '{sym} opens {gap} ATR up. A blogger takes credit. Nobody checks.',
  ],
  'gap:big:down': [
    '{sym} gaps down {gap} ATR with no scheduled news. The phones are ringing.',
    '{sym} opens sharply lower ({gap} ATR) on reports nobody can source.',
    'Overnight selling in {sym}: a {gap}-ATR gap down and {move} by the close.',
    '{sym} falls through its short strikes before coffee. Gap: {gap} ATR.',
    '{sym} gaps lower after "a regulatory inquiry of undisclosed scope." {move}.',
    'A large seller finds {sym} at the open. Down {gap} ATR in one print.',
    '{sym} opens {gap} ATR down. Stops trigger at prices that were not on the screen.',
    '{sym} slides at the bell on a downgrade from a firm that downgrades everything.',
  ],
  'gap:huge:up': [
    '{sym} GAPS {gap} ATR HIGHER. Takeover chatter, confirmed by nobody, priced by everybody.',
    'Monster open in {sym}: {gap} ATR up, {move} on the day. Short calls reach for the fire exit.',
    '{sym} opens in a different decade: {gap}-ATR gap. The company is "aware of the move."',
    '{sym} gaps {gap} ATR. Market makers widen spreads and call it risk management.',
    'Shock bid in {sym}: {move}. The gap ({gap} ATR) jumped every stop on the way.',
    '{sym} rips at the open on "transformational news." Transformation: {move}.',
    'No one saw {sym} coming. {gap} ATR gap up. Everyone saw it afterward.',
    '{sym} opens {gap} ATR higher and never looks back. {move}.',
  ],
  'gap:huge:down': [
    '{sym} GAPS {gap} ATR LOWER. Stop orders fill at prices that hurt to read.',
    'Air pocket in {sym}: {gap} ATR gap down, {move} by the close.',
    '{sym} opens {gap} ATR down on a filing written entirely in the passive voice.',
    '{sym} implodes at the bell. Short puts discover what "gap risk" was for.',
    'Emergency call at {sym}. Emergency move in {sym}: {move}.',
    '{sym} gaps through every support line drawn in the last year. {gap} ATR.',
    '{sym} opens {gap} ATR lower. The Max-Loss Line would like a word with several traders.',
    "Nothing traded in {sym} between yesterday's close and today's open. Everything changed anyway: {move}.",
  ],
  // ---------------- ex-dividend ----------------
  'exdiv:regular:none': [
    '{sym} goes ex-dividend today ({yield} per share of price). Short calls in the money, check your mail.',
    'Dividend day at {sym}: {yield} leaves the share price, as accounting intends.',
    '{sym} trades ex-dividend. Early assignment risk for anyone short an in-the-money call.',
    '{sym} pays {yield}. The stock opens lighter by roughly that much. Physics.',
    'Ex-date for {sym}: holders of record collect {yield}; short call holders collect lessons.',
    '{sym} ex-dividend. Arbitrageurs exercise calls with the enthusiasm of a tax form.',
    '{sym} drops its dividend ({yield}) from the price this morning, on schedule.',
    'Reminder from COMPLY-3000: {sym} is ex-dividend today. Reminders are free. Assignments are not.',
  ],
  'exdiv:rich:none': [
    '{sym} goes ex a fat {yield} dividend. Every in-the-money short call is now a candidate.',
    'Big dividend day at {sym} ({yield}). Early exercise desks work overtime.',
    '{sym} ex-dividend at {yield}: the kind of payout that gets short calls assigned before lunch.',
    '{sym} hands out {yield} today. Short call writers hand out their shares.',
    'Rich ex-date at {sym}: {yield}. Assignment notices printing.',
    '{sym} dividend of {yield} comes off the price. Covered-call writers collect, naked optimism does not.',
    '{sym} ex-dividend: {yield}. Somewhere a covered call gets called away a day early.',
    "Income investors celebrate {sym}'s {yield} ex-date. Options traders check their assignment tab.",
  ],
  // ---------------- FOMC ----------------
  'fomc:calm:up': [
    'Fed holds the line; {sym} drifts {move}. The dot plot was the most exciting part.',
    'FOMC day passes without incident. {sym} {move}. Implied volatility deflates.',
    'Chair says "data dependent" four times. {sym} depends on nothing, closes {move}.',
    'Fed decision priced to perfection; {sym} ticks {move}.',
    '{sym} shrugs through the Fed: {move}. Event premium evaporates.',
    'Rates unchanged, tone unchanged, {sym} barely changed ({move}).',
    'FOMC statement edits two adjectives. {sym} edits two cents higher in spirit: {move}.',
    'The Fed speaks; {sym} nods and rises {absmove}.',
  ],
  'fomc:calm:down': [
    'Fed holds; {sym} eases {move}. Nobody learned anything, which is the point.',
    'FOMC day ends quietly. {sym} {move}. The straddle sellers go home early.',
    '{sym} dips {absmove} as the Fed signals patience with its patience.',
    'Uneventful Fed. {sym} {move}. The press conference ran long; the move did not.',
    'Fed stays put; {sym} slips {absmove} out of habit.',
    '{sym} finishes Fed day {move}. Event vol, as usual, overpriced.',
    'The Fed repeats itself; {sym} repeats yesterday, roughly: {move}.',
    'Rate decision as expected. {sym} as expected: {move}.',
  ],
  'fomc:move:up': [
    'Dovish tilt from the Fed lifts {sym} {absmove}.',
    'Fed signals cuts "when appropriate." Market decides appropriate is now: {sym} {move}.',
    '{sym} rallies {absmove} as the Fed statement softens by one word.',
    'Risk-on after the FOMC: {sym} up {absmove}.',
    'Chair smiles at the podium; {sym} gains {absmove}. Correlation is not causation, but it is profitable.',
    '{sym} {move} on Fed day as rate-cut odds reprice.',
    'FOMC relief rally carries {sym} {move}.',
    'Fed says "progress on inflation." {sym} makes progress too: {move}.',
  ],
  'fomc:move:down': [
    'Hawkish Fed knocks {sym} down {absmove}.',
    'FOMC pushes back on cuts; {sym} pushes lower, {move}.',
    '{sym} sells off {absmove} as the dot plot drifts higher.',
    'Fed warns inflation is "sticky." So is the selling in {sym}: {move}.',
    'Rate hopes deflate; {sym} deflates {absmove}.',
    'The press conference goes badly for {sym}: {move}.',
    'Risk-off after the Fed: {sym} {move}.',
    'FOMC day turns sour; {sym} closes {move}.',
  ],
  'fomc:shock:up': [
    'SURPRISE FROM THE FED. {sym} surges {absmove} as markets reprice the whole curve.',
    'Emergency optimism: Fed shocks dovish, {sym} {move}.',
    'Fed pivot nobody priced: {sym} jumps {absmove}. Short calls hold a moment of silence.',
    'FOMC day turns into a melt-up. {sym} {move}.',
    '{sym} rips {absmove} on the Fed. Traders who sold the event premium sell their cars.',
    'Rates shock sends {sym} {move}. The implied move was a polite fiction.',
    'Fed surprises; {sym} rallies harder than its own fundamentals approve: {move}.',
    'Historic Fed-day rally in {sym}: {move}.',
  ],
  'fomc:shock:down': [
    'FED SHOCKER. {sym} plunges {absmove} as the market reprices everything at once.',
    'Hawkish surprise: {sym} {move}. Put sellers check whether the line still exists.',
    'Fed day turns into a rout; {sym} {move}.',
    '{sym} craters {absmove} after the FOMC. The dot plot became a dot cliff.',
    'Rates shock hits {sym}: {move}. Stops fill at the natural, then some.',
    'The Chair says one word nobody expected. {sym}: {move}.',
    'FOMC surprise sends {sym} {move}. Volatility wakes up angry.',
    'Worst Fed day in a while for {sym}: {move}.',
  ],
  // ---------------- CPI ----------------
  'cpi:calm:up': [
    'CPI in line; {sym} edges {move}. Economists congratulate the spreadsheet.',
    'Inflation print as expected. {sym} {move}.',
    'Quiet CPI morning, quiet {sym}: {move}.',
    '{sym} ticks up {absmove} on a CPI nobody will remember.',
    'Core inflation steady; {sym} steady-ish, {move}.',
    'CPI matches consensus to the decimal. {sym} matches its average day: {move}.',
    '{sym} {move} as CPI lands inside the forecast range.',
    'Inflation report fails to excite. {sym} rises {absmove} anyway.',
  ],
  'cpi:calm:down': [
    'CPI in line; {sym} slips {move}.',
    'Inflation data land on target. {sym} drifts {absmove} lower.',
    'Uneventful CPI, uneventful {sym}: {move}.',
    '{sym} eases {absmove} on CPI day. The print was boring by design.',
    'CPI steady; {sym} dips {move}.',
    'Consensus CPI; {sym} consensus move: {move}.',
    'The inflation print changes nothing. {sym}: {move}.',
    '{sym} {move} after a CPI report written by a metronome.',
  ],
  'cpi:move:up': [
    'Cooler CPI lifts {sym} {absmove}.',
    'Inflation eases more than expected; {sym} gains {absmove}.',
    '{sym} rallies {absmove} as CPI undershoots.',
    'Soft CPI, strong {sym}: {move}.',
    'Rate-cut hopes revive on CPI; {sym} {move}.',
    'Prices rise slower than feared; {sym} rises faster: {move}.',
    'CPI relief: {sym} up {absmove}.',
    '{sym} {move} as the inflation print surprises on the good side.',
  ],
  'cpi:move:down': [
    'Hot CPI hits {sym}: {move}.',
    'Inflation runs warm; {sym} runs cold, {absmove} lower.',
    '{sym} drops {absmove} as CPI overshoots.',
    'Sticky inflation, slippery {sym}: {move}.',
    'Rate-cut hopes fade on CPI; {sym} fades {absmove}.',
    'CPI surprise to the upside sends {sym} {move}.',
    'Prices rise; {sym} does not. {move}.',
    '{sym} {move} after an inflation print the Fed will not enjoy.',
  ],
  'cpi:shock:up': [
    'CPI SHOCK (THE GOOD KIND): {sym} soars {absmove}.',
    'Inflation collapses on paper; {sym} rockets {move}.',
    'Blowout soft CPI sends {sym} up {absmove}. Short calls panic in a well-lit room.',
    '{sym} surges {absmove} on the friendliest inflation print in memory.',
    'CPI surprise ignites {sym}: {move}.',
    'Rates reprice lower in minutes; {sym} reprices higher: {move}.',
    'CPI day melt-up: {sym} {move}.',
    '{sym} {move}. The CPI release was so soft it was almost apologetic.',
  ],
  'cpi:shock:down': [
    'CPI SHOCK: inflation runs hot, {sym} plunges {absmove}.',
    'Scorching CPI knocks {sym} {move}. The implied move was optimistic.',
    '{sym} tumbles {absmove} as the inflation print blows through forecasts.',
    'Hot CPI, cold sweat: {sym} {move}.',
    'Rates spike on CPI; {sym} slides {absmove}.',
    'CPI surprise sends {sym} {move}. Put sellers reach for the roll button.',
    'Inflation print from the wrong decade; {sym} {move}.',
    '{sym} {move} after CPI. The Fed is expected to "have views."',
  ],
  // ---------------- VIX ----------------
  'vix:spike:up': [
    'Fear gauge jumps {vixchg} to {vix}. Premium gets expensive; so does being wrong.',
    'VIX spikes to {vix} ({vixchg}). Risk desks tighten lines; compliance tightens ties.',
    'Volatility returns from vacation: VIX {vix}, up {vixchg}.',
    'VIX pops {vixchg}. Put buyers feel briefly vindicated.',
    'Market nerves fray: VIX {vix}. Spreads widen out of sympathy.',
    'Fear index at {vix} after a {vixchg} week. Credit sellers ask for more credit.',
    'VIX climbs to {vix}. Implied volatility on {sym} follows it upstairs.',
    'Vol spike: VIX {vix} ({vixchg}). Edge Rank tables everywhere get interesting.',
  ],
  'vix:panic:up': [
    'PANIC: VIX {vix}. Everything correlates to one.',
    'VIX explodes to {vix} ({vixchg}). The Max-Loss Line is suddenly a popular topic.',
    'Fear index {vix}. Bid/ask spreads widen to "call us."',
    'Full panic, VIX {vix}: premium is rich, and so is the chance of deserving it.',
    'VIX at {vix}. Traders rediscover the meaning of "defined risk."',
    'Market in freefall mode; VIX {vix}. COMPLY-3000 recommends breathing, a regulated activity.',
    'VIX {vix} ({vixchg}). Every short put is now a character-building exercise.',
    'The fear gauge prints {vix}. Somewhere, a volatility fund buys a yacht.',
  ],
  // ---------------- price action (brief only) ----------------
  'high:new:up': [
    '{sym} closes at a 52-week high. Everyone who sold last month is "taking a break from screens."',
    'New 52-week high for {sym} ({move} on the day). Momentum desks pretend they were early.',
    '{sym} prints its best close in a year. Chart watchers redraw the same line, higher.',
    '{sym} at a one-year high. Short sellers describe the valuation using a lot of words.',
    'Fresh 52-week high in {sym}. Call buyers upgrade their headphones.',
    '{sym} breaks out to a yearly high on {move}. The resistance line resigns.',
    '{sym} tops its 52-week range. The research note calls it "constructive," which means up.',
    'Year high for {sym}. Retail forums rename it a "generational buy," as they do.',
  ],
  'low:new:down': [
    '{sym} closes at a 52-week low. The bull case moves to a smaller conference room.',
    'New 52-week low for {sym} ({move}). Dip buyers check whether it is still a dip.',
    '{sym} sinks to its worst close in a year. Support levels file for relocation.',
    '{sym} at a one-year low. The CEO buys a symbolic amount of stock, symbolically.',
    'Fresh 52-week low in {sym}. Put sellers who sold "just below support" reread the fine print.',
    '{sym} breaks down to a yearly low on {move}. The chart now needs a lower floor.',
    '{sym} slides under its 52-week range. Analysts start saying "value," quietly.',
    'Year low for {sym}. Every bottom-caller in the building has now called it twice.',
  ],
  'volume:surge:up': [
    'Heavy buying in {sym}: {volx} normal volume, shares {move}.',
    '{sym} trades {volx} its usual volume and closes {move}. Someone knows something, or thinks so.',
    'Big blocks cross in {sym}: volume {volx} average, stock {move}. The tape gets interesting.',
    '{sym} {move} on {volx} volume. Institutions arrive, fashionably unannounced.',
    'Volume spike in {sym} ({volx} normal) with a {move} close. Rumor mill fully staffed.',
    '{sym} sees {volx} normal turnover on a green day. Market makers stop yawning.',
    'Accumulation day for {sym}: {move}, on volume {volx} its average.',
    '{sym} lifts {absmove} on heavy volume ({volx}). The chat rooms claim credit in advance.',
  ],
  'volume:surge:down': [
    'Heavy selling in {sym}: {volx} normal volume, shares {move}.',
    '{sym} trades {volx} its usual volume and closes {move}. Somebody large wanted out.',
    'Big blocks hit {sym}: volume {volx} average, stock {move}. The bid gets shy.',
    '{sym} {move} on {volx} volume. A fund "rebalances," which is a nice word for it.',
    'Volume spike in {sym} ({volx} normal) with a {move} close. The exits get crowded.',
    '{sym} sees {volx} normal turnover on a red day. Support gets tested by professionals.',
    'Distribution day for {sym}: {move}, on volume {volx} its average.',
    '{sym} drops {absmove} on heavy volume ({volx}). Nobody on the call will say who sold.',
  ],
  'streak:run:up': [
    '{sym} rises {days} sessions straight, {move} over the run. Trees, sky, etc.',
    '{days} green days in a row for {sym} ({move}). Overbought is now a personality trait.',
    '{sym} extends its win streak to {days} days, {move} in total. Short sellers take up yoga.',
    'Up {days} days running: {sym} gains {absmove}. The pullback is "any day now."',
    '{sym} closes higher again: {days} straight sessions. Momentum funds stop asking why.',
    '{sym} on a {days}-day heater: {move}. Call sellers start using the word "unusual."',
    'Relentless bid in {sym}: {days} up closes, {move}. Nobody wants to be the one who sold.',
    '{sym} rallies {days} days in a row. COMPLY-3000 notes that trees do not grow to the sky. Usually.',
  ],
  'streak:run:down': [
    '{sym} falls {days} sessions straight, {move} over the run. The bottom remains theoretical.',
    '{days} red days in a row for {sym} ({move}). Oversold is now a lifestyle.',
    '{sym} extends its losing streak to {days} days, {move} in total. Dip buyers need more dips.',
    'Down {days} days running: {sym} loses {absmove}. The bounce is "any day now."',
    '{sym} closes lower again: {days} straight sessions. The bull case goes to voicemail.',
    '{sym} on a {days}-day slide: {move}. Put sellers start using the word "unusual."',
    'Relentless offer in {sym}: {days} down closes, {move}. Nobody wants to catch this knife.',
    '{sym} drops {days} days in a row. COMPLY-3000 recommends reviewing your stop. Please.',
  ],
  'cross:golden:up': [
    'Golden cross on {sym}: the 50-day average climbs over the 200-day. Chart people become unbearable.',
    '{sym} 50-day moves above its 200-day. Technicians call it bullish; everyone else calls it a line.',
    'Golden cross in {sym}. Trend followers pile in, as the name of their strategy requires.',
    '{sym} flashes a golden cross. The newsletter subject line writes itself in capitals.',
    'Long-term trend turns up for {sym}: 50-day over 200-day. Backtests everywhere nod.',
    '{sym} completes a golden cross. Somebody frames the chart.',
    'The averages cross upward on {sym}. Lagging by design, bullish by tradition.',
    '{sym} golden cross confirmed. Momentum desks upgrade their mood, not their models.',
  ],
  'cross:death:down': [
    'Death cross on {sym}: the 50-day average sinks under the 200-day. The name does the marketing.',
    '{sym} 50-day slips below its 200-day. Technicians call it bearish; the stock was already down.',
    'Death cross in {sym}. Trend followers head for the exit, as their strategy requires.',
    '{sym} flashes a death cross. The newsletter subject line arrives in red.',
    'Long-term trend turns down for {sym}: 50-day under 200-day. Backtests everywhere frown.',
    '{sym} completes a death cross. Dip buyers pretend not to have seen it.',
    'The averages cross downward on {sym}. Lagging by design, ominous by tradition.',
    '{sym} death cross confirmed. Bulls call it "just a moving average," loudly.',
  ],
};

/** Plain facts about real, named companies (open mode): no satire, no characterization. */
const FACTS: Record<HeadlineKind, string[]> = {
  earnings: ['{sym} reported earnings; shares moved {move} against an options-implied move of {implied}.'],
  gap: ['{sym} opened {gap} ATR {dir} from the prior close with no scheduled event; {move} on the day.'],
  exdiv: ['{sym} traded ex-dividend today (about {yield} of the share price).'],
  fomc: ['FOMC decision day. {sym} closed {move}.'],
  cpi: ['CPI release day. {sym} closed {move}.'],
  vix: ['VIX closed at {vix}, {vixchg} over five sessions.'],
  high: ['{sym} closed at a 52-week high ({move} on the day).'],
  low: ['{sym} closed at a 52-week low ({move} on the day).'],
  volume: ['{sym} traded about {volx} its 20-day average volume and closed {move}.'],
  streak: ['{sym} closed {dir} for {days} sessions in a row ({move} over the run).'],
  cross: ["{sym}'s 50-day average crossed {side} its 200-day average."],
};

function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

/** The built-in provider: seeded choice of a template, filled from the event's facts. */
export const templateHeadlines: HeadlineProvider = {
  headline(e, rng, mode) {
    const vars = { ...e.vars, dir: e.direction === 'up' ? 'higher' : e.direction === 'down' ? 'lower' : '' };
    if (mode === 'open') return fill(FACTS[e.kind][0], vars);
    const list = TEMPLATES[`${e.kind}:${e.magnitude}:${e.direction}` as Key];
    if (!list?.length) return fill(FACTS[e.kind][0], vars);
    return fill(rng.pick(list), vars);
  },
};

// ---------------- classification helpers ----------------

export const pctText = (x: number, sign = true): string =>
  `${sign && x > 0 ? '+' : sign && x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)}%`;

export function earningsMagnitude(movePct: number, impliedPct: number | null): Magnitude {
  const m = Math.abs(movePct);
  if (impliedPct && impliedPct > 0) {
    const r = m / impliedPct;
    return r <= 1 ? 'inside' : r <= 2 ? 'beyond' : 'blowout';
  }
  return m < 3 ? 'inside' : m < 8 ? 'beyond' : 'blowout';
}

export function macroMagnitude(dayMove: number): Magnitude {
  const m = Math.abs(dayMove);
  return m < 0.01 ? 'calm' : m < 0.03 ? 'move' : 'shock';
}

export const HEADLINE_KEYS = Object.keys(TEMPLATES) as Key[];
