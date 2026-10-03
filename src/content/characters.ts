/**
 * The cast (all fictional) and their lines, as data. Lines are picked by situation with the
 * run's seeded RNG. Tone: dark, dry, grounded satire. {name}-style placeholders are filled by
 * the caller (target, desk, stress, review, points).
 */

import type { Rng } from '../engine/rng';

export type CharacterId = 'kessler' | 'ines' | 'bradley' | 'comply';
export type Expression = 'neutral' | 'happy' | 'angry' | 'worried';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  bio: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  kessler: {
    id: 'kessler',
    name: 'Director Kessler',
    role: 'Head of Desk',
    bio: 'Sets targets, runs the Reviews, and speaks fluent corporate doublespeak. Has never been wrong in a meeting.',
  },
  ines: {
    id: 'ines',
    name: 'Ines Ortiz',
    role: 'Mentor, ex-market-maker',
    bio: 'Made markets through three crashes and a flash crash. Has seen every blowup and remembers the names.',
  },
  bradley: {
    id: 'bradley',
    name: 'Bradley Stroud IV',
    role: 'Rival',
    bio: 'Trust-fund momentum trader. Believes stops are for people without a family office.',
  },
  comply: {
    id: 'comply',
    name: 'COMPLY-3000',
    role: 'AI compliance officer',
    bio: 'Announces rules, Review modifiers and regrets. Cannot be bribed. Has been asked.',
  },
};

export type Trigger =
  | 'run_start'
  | 'round_start'
  | 'review_intro'
  | 'big_win'
  | 'big_loss'
  | 'decline_stop'
  | 'closed_at_plan'
  | 'skip'
  | 'high_stress'
  | 'burnout'
  | 'target_met'
  | 'target_missed'
  | 'victory'
  | 'survived'
  | 'defeat'
  | 'breach'
  | 'shop'
  | 'endless'
  | 'rival'
  | 'parachute'
  // Coworker tips: when you're struggling, or meeting something for the first time.
  | 'tip_struggling'
  | 'tip_earnings'
  | 'tip_stop'
  | 'tip_roll'
  | 'tip_first_win'
  | 'tip_window'
  | 'tip_wait';

export interface Line {
  who: CharacterId;
  mood: Expression;
  text: string;
}

const L = (who: CharacterId, mood: Expression, text: string): Line => ({ who, mood, text });

export const LINES: Record<Trigger, Line[]> = {
  run_start: [
    L(
      'kessler',
      'neutral',
      'Welcome to the fiscal year. Targets are aggressive, which is how we say achievable.',
    ),
    L(
      'kessler',
      'neutral',
      'The {desk} desk is yours. Your predecessor is pursuing other opportunities. Outside the building.',
    ),
    L(
      'kessler',
      'happy',
      'We believe in you. Legal asked me to clarify that belief is not a contractual obligation.',
    ),
    L(
      'kessler',
      'neutral',
      'Four quarters. Three rounds each. One Max-Loss Line. Please do not make me learn your name.',
    ),
    L(
      'kessler',
      'neutral',
      "Your first target is {target} points. It was chosen by a committee, so it's nobody's fault.",
    ),
    L('kessler', 'neutral', 'Remember: we are a family here. A family with a quarterly performance review.'),
    L(
      'ines',
      'neutral',
      "Kid. Size small, sell where it's rich, and take your stops. That's the whole speech.",
    ),
    L(
      'ines',
      'happy',
      'First day on a new desk. Everyone has a plan until the open. Write yours down anyway.',
    ),
    L('ines', 'neutral', "The market doesn't know your name, your target, or your rent. Trade like it."),
    L(
      'bradley',
      'happy',
      "Oh, you're the new {desk} guy. Cute. I'm up forty percent this year. Don't check.",
    ),
    L(
      'bradley',
      'neutral',
      'Credit spreads? My grandfather sold premium. Then he bought an island. Then he sold the island.',
    ),
    L('comply', 'neutral', 'NEW RUN LOGGED. ALL TRADES ARE PAPER. ALL CONSEQUENCES ARE EDUCATIONAL.'),
  ],
  round_start: [
    L('kessler', 'neutral', 'New month, new target: {target}. I have already told my boss you will hit it.'),
    L('kessler', 'neutral', 'Three names on the board. Pick well. Or pick quickly. Ideally both.'),
    L(
      'kessler',
      'neutral',
      'Target is {target}. Think of it less as a number and more as a destiny with a deadline.',
    ),
    L(
      'ines',
      'neutral',
      'Read the chart before the chain. The chain tells you the price. The chart tells you why.',
    ),
    L(
      'ines',
      'neutral',
      'If none of these setups look good, skipping is a trade too. The cheapest one there is.',
    ),
    L(
      'ines',
      'neutral',
      'Where is IV rank? High, you sell. Low, you think twice. Nowhere near either, you size down.',
    ),
    L('ines', 'neutral', 'Short strike outside the expected move. Not on it. Outside it.'),
    L(
      'comply',
      'neutral',
      'ROUND OPEN. TICKETS ISSUED: {tickets}. PLEASE USE THEM RESPONSIBLY OR NOT AT ALL.',
    ),
  ],
  review_intro: [
    L('kessler', 'neutral', "It's Review time. Nothing personal. Everything measured."),
    L(
      'kessler',
      'angry',
      'The board has concerns. The board always has concerns. Please give them different ones.',
    ),
    L(
      'kessler',
      'neutral',
      'This quarter we are "leaning into volatility." I did not choose the phrase. I did print it.',
    ),
    L(
      'kessler',
      'neutral',
      "Hit {target} and we'll talk about your future. Miss it and we'll talk about your past.",
    ),
    L('kessler', 'happy', 'Reviews build character. So do layoffs. We prefer Reviews.'),
    L('ines', 'worried', 'Reviews change the rules, not the math. Read the rule twice. Then read the chain.'),
    L('ines', 'neutral', "COMPLY's rule is the whole game this round. Everything else is noise."),
    L(
      'bradley',
      'happy',
      "Review week! I'm going to crush it. Dad's friend is on the board, so I'm going to crush it.",
    ),
    L('comply', 'neutral', 'REVIEW PROTOCOL ENGAGED. ALL EXCUSES WILL BE TIMESTAMPED.'),
    L('comply', 'neutral', 'THIS REVIEW CANNOT BE SKIPPED. THIS SENTENCE CANNOT BE APPEALED.'),
  ],
  big_win: [
    L(
      'ines',
      'happy',
      "Good trade. Now tell me why it worked. If you can't, it was luck wearing a nice suit.",
    ),
    L('ines', 'happy', "That's how it's done. Sell rich premium, let time pay you, leave before it stops."),
    L('ines', 'happy', 'Nice. Bank the lesson, not just the money. The money leaves. The lesson stays.'),
    L(
      'ines',
      'neutral',
      "Don't double your size because of one good close. That's how good weeks become bad years.",
    ),
    L('ines', 'happy', "You took your target. You would be amazed how many people can't."),
    L('ines', 'neutral', 'Winning feels like skill. Check the debrief before you believe it.'),
    L(
      'bradley',
      'angry',
      "Beginner's luck. Statistically you're due for a disaster. I did the statistics myself.",
    ),
    L('bradley', 'neutral', '+{points}? Cute. I made that on a coin flip this morning. Different coin.'),
    L('bradley', 'angry', "Okay, that was decent. Don't tell anyone I said decent."),
    L('bradley', 'happy', 'Sure, you won. But did you win with style? I won in a Lamborghini. Leased.'),
    L('bradley', 'neutral', 'Nice fill. My guy gets me better fills. My guy is a dolphin.'),
    L('bradley', 'angry', "Whatever. The market was going up anyway. It always goes up when I'm not in it."),
    L('kessler', 'happy', 'Excellent. I will mention this in my own performance review.'),
    L('kessler', 'happy', 'That is exactly the kind of result I will describe as "a team effort."'),
    L('kessler', 'happy', "Outstanding. I've forwarded the P/L to people who will never read it."),
    L('comply', 'happy', 'PROFIT DETECTED. NO VIOLATIONS DETECTED. THIS IS RARER THAN IT SHOULD BE.'),
  ],
  big_loss: [
    L('ines', 'worried', 'It happens. The question is whether the loss was the plan or the surprise.'),
    L(
      'ines',
      'worried',
      'Look at the attribution. Direction, time or vol. One of them did this. Find out which.',
    ),
    L('ines', 'neutral', 'Losses are tuition. Just make sure you are enrolled in the right class.'),
    L(
      'ines',
      'worried',
      'A defined-risk loss is still a loss, but it is a loss you already agreed to. Good.',
    ),
    L('ines', 'neutral', "Don't revenge trade. The market has no idea you're angry, and it would not care."),
    L('ines', 'worried', 'That one hurt. Size is the only lever you fully control. Pull it.'),
    L('ines', 'neutral', "Bad outcome isn't bad decision. Check the grade before you beat yourself up."),
    L(
      'ines',
      'worried',
      'You held through earnings on purpose, right? Tell me you checked that box on purpose.',
    ),
    L('bradley', 'happy', "Oof. Want my guy's number? He's also a dolphin, but a disciplined one."),
    L('bradley', 'happy', 'Ha! The market does that to me too. Then I call Dad and it stops.'),
    L('bradley', 'happy', "Maybe try buying calls? It's like selling puts but with more feelings."),
    L('bradley', 'neutral', "Don't worry. Losing money builds character. I've heard. From people."),
    L('kessler', 'angry', 'I see a number with a minus in front of it. I dislike the minus.'),
    L('kessler', 'angry', 'We are going to call this a "learning quarter" if it happens again.'),
  ],
  decline_stop: [
    L(
      'ines',
      'angry',
      'You set that stop yourself. On a calm day. With a clear head. Why are you arguing with that person?',
    ),
    L('ines', 'angry', "Holding past your stop isn't conviction. It's a hope with a spreadsheet."),
    L(
      'ines',
      'worried',
      "I've watched a lot of people blow up. None of them planned to. All of them declined a stop first.",
    ),
    L('ines', 'angry', 'The stop was the plan. Now there is no plan. There is only the market.'),
    L('ines', 'worried', 'If you would not open this trade today, why are you keeping it?'),
    L('ines', 'angry', "Kid. That's the one habit that ends careers. Don't make it a habit."),
    L('ines', 'worried', '"It\'ll come back" is the most expensive sentence in finance.'),
    L('ines', 'angry', "You didn't hold a spread. You held a grudge."),
    L(
      'ines',
      'worried',
      'Losers get bigger when you ignore them. Winners get smaller when you ignore them. Guess which you just did.',
    ),
    L('comply', 'angry', 'STOP DECLINED. STRESS ADJUSTED. THIS IS NOT A PUNISHMENT. IT IS A MEASUREMENT.'),
    L('comply', 'angry', "OVERRIDE LOGGED. YOUR FUTURE SELF HAS BEEN CC'D."),
    L(
      'bradley',
      'happy',
      'Declined your stop? Legend. Stops are for people who can afford to be wrong. Wait.',
    ),
  ],
  closed_at_plan: [
    L('ines', 'happy', 'Closed at plan. Boring. Beautiful. Do it a thousand more times.'),
    L('ines', 'happy', 'That is what discipline looks like: nothing exciting happened, on purpose.'),
    L('ines', 'happy', 'Took the stop. Clean. The next trade gets a clear head instead of a grudge.'),
    L('ines', 'happy', 'Fifty percent of max profit, done, out. You just got paid to leave early.'),
    L('ines', 'neutral', 'Planned exits are the only part of a trade you fully control. You controlled it.'),
    L('comply', 'happy', 'EXIT MATCHES PLAN. COMPLIANCE SATISFACTION INCREASED BY ONE UNIT.'),
    L('kessler', 'happy', 'Process over outcome. I read that on a mug. It was my mug.'),
    L(
      'bradley',
      'angry',
      "Took profits already? Scared money doesn't make money. It does keep money, apparently.",
    ),
  ],
  skip: [
    L('kessler', 'angry', 'You are skipping? Bold. The target does not skip. The target waits.'),
    L('kessler', 'neutral', 'Skipping is permitted. Permitted is not the same as admired.'),
    L('kessler', 'neutral', "Fine. Sit this one out. I'll tell the board it was a strategic pause."),
    L('ines', 'happy', 'Good. No setup, no trade. Most traders never learn that one.'),
    L('ines', 'happy', "Sitting out bad setups is a skill. It just doesn't come with a screenshot."),
    L('ines', 'neutral', 'The best trade some months is the one you do not make.'),
    L('bradley', 'happy', 'Skipping? I never skip. I also never read the lineup. Same thing.'),
    L('comply', 'neutral', 'ROUND SKIPPED. TAG ISSUED. INACTIVITY HAS BEEN RECLASSIFIED AS PRUDENCE.'),
    L('comply', 'neutral', 'SKIP ACKNOWLEDGED. STRESS REDUCED. THE SYSTEM APPROVES OF NAPS.'),
  ],
  high_stress: [
    L('ines', 'worried', 'Your stress is at {stress}. Tired traders make big trades. Make small ones.'),
    L('ines', 'worried', 'Take a breath. Take a stop. Take a Vacation Day if you have one.'),
    L(
      'ines',
      'worried',
      "You're running hot. That's when people stop reading the chain and start reading their feelings.",
    ),
    L('ines', 'neutral', 'Stress is a gauge, not a grade. It tells you to slow down, not to speed up.'),
    L('ines', 'worried', "Skip a round if you need it. It's not weakness. It's maintenance."),
    L(
      'kessler',
      'neutral',
      'HR reminds you that stress is a normal part of excellence. HR is also stressed.',
    ),
    L('comply', 'worried', 'STRESS LEVEL {stress}. BURNOUT PROTOCOL AT 100. THIS IS A COURTESY NOTICE.'),
    L('bradley', 'happy', "You look stressed. I don't get stressed. I get massages. Different thing."),
  ],
  burnout: [
    L(
      'ines',
      'worried',
      'Burnout. It happens to everyone good enough to care. Next round: fewer tickets, clearer head.',
    ),
    L('ines', 'worried', 'Go home. Sleep. The market will still be there being unreasonable tomorrow.'),
    L('ines', 'neutral', "One of your analysts isn't answering. Honestly, can you blame them?"),
    L(
      'ines',
      'worried',
      'The fix is boring: smaller size, planned exits, fewer trades. Boring is survivable.',
    ),
    L(
      'kessler',
      'angry',
      'We are "rightsizing your bandwidth" for a round. That is a sentence I was trained to say.',
    ),
    L('kessler', 'neutral', 'Take a moment. Not too long a moment. Moments are billable.'),
    L('comply', 'worried', 'BURNOUT REGISTERED. TICKET ALLOCATION REDUCED. WELLNESS PAMPHLET QUEUED.'),
    L('bradley', 'happy', 'Burnout? Just get a second yacht. Works for me.'),
  ],
  target_met: [
    L('kessler', 'happy', 'Target met. I will pretend I was never worried.'),
    L('kessler', 'happy', 'Good. Next month is harder. That is not a threat, it is a spreadsheet.'),
    L('kessler', 'happy', 'The numbers are acceptable. In this building, acceptable is a compliment.'),
    L(
      'ines',
      'happy',
      'Round banked. Spend the cash on tools that make you better, not ones that make you louder.',
    ),
    L('ines', 'neutral', "Target's met. Now check the debrief for the trade you'd least like to repeat."),
    L('comply', 'happy', 'TARGET MET. PAYOUT AUTHORIZED. SMILING IS PERMITTED BUT NOT REQUIRED.'),
  ],
  target_missed: [
    L('kessler', 'angry', 'That is below target. I have run out of synonyms for "below."'),
    L('kessler', 'angry', 'We had a number. You had a different number. Only one of us gets to keep ours.'),
    L('ines', 'worried', 'Missed it. Read the debrief before you read the job listings.'),
    L(
      'ines',
      'worried',
      "Sometimes the market doesn't hand you the setup. That's what the skip button is for.",
    ),
    L('comply', 'angry', 'TARGET NOT MET. OUTCOME FILED UNDER "OUTCOMES."'),
  ],
  victory: [
    L(
      'kessler',
      'happy',
      'A full year, target to target, and better than the index. You may now call me by my first name. Once.',
    ),
    L('kessler', 'happy', 'Victory. The board is thrilled. The board has asked for 20% more next year.'),
    L('kessler', 'happy', 'You beat SPY. We will be printing that on something. Probably a mug.'),
    L(
      'kessler',
      'happy',
      'Congratulations. Your bonus has been approved by a committee that will now meet about your bonus.',
    ),
    L('ines', 'happy', "You did it the right way. Small, patient, planned. That's rarer than winning."),
    L(
      'ines',
      'happy',
      'Take the win. Then go look at your worst trade of the year. That one is your teacher.',
    ),
    L(
      'bradley',
      'angry',
      "Beat the index? Lucky index. I'm going to beat it harder next year. With leverage.",
    ),
    L('bradley', 'worried', 'Okay, fine. You won. Please do not tell my father.'),
    L('comply', 'happy', 'ANNUAL PERFORMANCE: EXCEEDS. ALPHA: POSITIVE. HUMANS: TEMPORARILY TOLERABLE.'),
  ],
  survived: [
    L('kessler', 'neutral', 'You hit every target. The board asks why you did not simply buy SPY.'),
    L(
      'kessler',
      'neutral',
      'Surviving is good. Beating an index fund with no salary would have been better.',
    ),
    L('kessler', 'angry', 'Congratulations on your year. An ETF did the same thing and never took a lunch.'),
    L('ines', 'neutral', "You survived. Now learn why the benchmark still won. That's next year's edge."),
    L(
      'bradley',
      'happy',
      'You matched SPY? I also matched SPY. I just used ten times the leverage to do it.',
    ),
    L('comply', 'neutral', 'ALPHA: NOT POSITIVE. EMPLOYMENT: CONTINUED. BOTH FACTS ARE ON FILE.'),
  ],
  defeat: [
    L(
      'kessler',
      'angry',
      "We're going to have to let you go. It's not you. It's the numbers. The numbers were you.",
    ),
    L('kessler', 'neutral', 'Please return your badge, your monitor and your optimism to the front desk.'),
    L('kessler', 'angry', 'The run is over. Your access card now opens the lobby. Only the lobby.'),
    L('kessler', 'neutral', 'We wish you luck in your future endeavors, which we will not be tracking.'),
    L('kessler', 'angry', "I'd say it was a pleasure, but Legal says I can't say things that aren't true."),
    L(
      'ines',
      'worried',
      'Everyone blows up once. The good ones come back with smaller size and better stops.',
    ),
    L('ines', 'neutral', "Take the lesson and leave the shame. The lesson compounds. The shame doesn't."),
    L('ines', 'worried', 'Look at your last three trades. The pattern is in there. It always is.'),
    L('bradley', 'happy', "Oof. Tough break, champ. I'm keeping your parking spot."),
    L(
      'bradley',
      'happy',
      "Should have bought calls. Always buy calls. That's the whole secret. You're welcome.",
    ),
    L('bradley', 'happy', 'Don\'t worry, I\'ll mention you in my memoir. Chapter nine: "Other People."'),
    L('comply', 'angry', 'EMPLOYMENT STATUS: REVISED. ALL POSITIONS CLOSED. ALL FEELINGS UNREGULATED.'),
  ],
  breach: [
    L(
      'comply',
      'angry',
      'MAX-LOSS LINE BREACHED. POSITIONS LIQUIDATED AT MARKET. THIS IS WHAT THE LINE IS FOR.',
    ),
    L('comply', 'angry', 'RISK LIMIT EXCEEDED. THE DESK HAS BEEN PAUSED. PLEASE STEP AWAY FROM THE HOTKEYS.'),
    L(
      'comply',
      'angry',
      'LIQUIDATION COMPLETE. THE MARKET HAS BEEN INFORMED OF YOUR FEELINGS. IT DECLINED TO RESPOND.',
    ),
    L(
      'kessler',
      'angry',
      'You crossed the line. The line is called the line because you are not supposed to cross it.',
    ),
    L('kessler', 'angry', 'Risk has closed everything. Risk would like a word. Risk has several words.'),
    L('ines', 'worried', 'That line exists so one bad week never becomes one bad life. It did its job.'),
    L(
      'ines',
      'worried',
      'Next time, get out before the risk desk does it for you. They never get good fills.',
    ),
  ],
  shop: [
    L('ines', 'neutral', 'Buy tools that fix your worst habit. Everything else is decoration.'),
    L(
      'ines',
      'neutral',
      'Cartridge order matters. Additive first, multipliers last. Balatro was right about that.',
    ),
    L('ines', 'neutral', "An analyst you actually read beats a cartridge you don't understand."),
    L('ines', 'neutral', 'Interest pays you for holding cash. So does not blowing up.'),
    L('ines', 'neutral', 'Look for pairs. One cartridge is a perk. Two that feed each other is a strategy.'),
    L('ines', 'neutral', "Don't reroll just because the shop is boring. Boring shops are cheap."),
    L('bradley', 'happy', 'I buy everything in the shop. Then I buy the shop.'),
    L('kessler', 'neutral', 'The firm provides these tools at cost. The cost is, of course, your cash.'),
  ],
  endless: [
    L('kessler', 'happy', 'Year two. The targets grow. So, allegedly, do you.'),
    L('kessler', 'neutral', 'Endless mode is our term for "the job." Welcome to the job.'),
    L(
      'kessler',
      'happy',
      'Another year survived. HR has begun calling you "tenured." It is not a promotion.',
    ),
    L(
      'ines',
      'neutral',
      "Longer runs punish the same mistake more times. That's the whole secret of Endless.",
    ),
    L('bradley', 'angry', "Still here? My fund closed. Well, 'paused.' Dad is 'reviewing options.'"),
    L('comply', 'neutral', 'CONTINUATION APPROVED. REVIEW RULES WILL NOW BE COMBINED. FOR SPORT.'),
  ],
  rival: [
    L(
      'bradley',
      'happy',
      "Let's make it interesting. Outscore me this round and I'll pay. Lose and you pay. Easy.",
    ),
    L('bradley', 'angry', 'You beat my score? My score was having an off day.'),
    L(
      'bradley',
      'happy',
      'Ghost Bradley wins again. Real Bradley is at brunch. Both are undefeated in spirit.',
    ),
    L('bradley', 'neutral', 'My ghost trades the same tape you do. Minus the anxiety. Plus the trust fund.'),
    L(
      'bradley',
      'happy',
      "Momentum, baby. Buy what's going up. Sell it to someone who read your newsletter.",
    ),
    L('bradley', 'angry', "Whatever. Scores are a social construct. Money isn't. I have both."),
  ],
  parachute: [
    L(
      'kessler',
      'neutral',
      'Your Golden Parachute has deployed. Legal is impressed. Legal is rarely impressed.',
    ),
    L(
      'comply',
      'neutral',
      'PARACHUTE CLAUSE EXERCISED. SURVIVAL GRANTED ONCE. THE CLAUSE HAS BEEN SHREDDED.',
    ),
    L('ines', 'worried', "That was your one free life. Trade like you know it's gone, because it is."),
  ],
  tip_struggling: [
    L(
      'ines',
      'worried',
      'Rough patch. Slide conviction down to FEELER for a trade or two: a fifth of the risk cap. Stay in the game.',
    ),
    L(
      'ines',
      'worried',
      'Two losers in a row. Before the next one: is the street read with you, and is your short strike outside the expected move?',
    ),
    L(
      'ines',
      'neutral',
      'Behind the target is fine. Behind your stop is not. Take the planned loss and let the next trade catch up.',
    ),
    L(
      'ines',
      'neutral',
      'When nothing looks clean, waiting is a trade. Let a day pass and read the tape again.',
    ),
  ],
  tip_earnings: [
    L('bradley', 'happy', 'Earnings are free money. For whoever sold me the calls, apparently.'),
    L(
      'ines',
      'worried',
      'Earnings land inside this trade. A stock can gap straight past a strike overnight. Sell outside the implied move, or be out before the report.',
    ),
    L(
      'ines',
      'neutral',
      'Report tomorrow. The move is priced in the options; the surprise is not. Decide now whether you are holding on purpose.',
    ),
  ],
  tip_stop: [
    L(
      'kessler',
      'neutral',
      'Risk would like a word. The word is "stop." It is not a suggestion, legally speaking.',
    ),
    L(
      'ines',
      'neutral',
      "That's your stop. The plan was written by the calm version of you. Listen to them.",
    ),
    L('ines', 'neutral', 'A stop hit is not a failure. Holding past it is how small losses grow teeth.'),
  ],
  tip_roll: [
    L(
      'bradley',
      'neutral',
      "I roll everything. It's called conviction. My accountant calls it something else.",
    ),
    L('ines', 'neutral', 'Rolling buys time, not forgiveness. Roll for a credit or close it.'),
    L(
      'ines',
      'neutral',
      "Before you roll, look at the chart in the dialog: if the new strikes aren't safer, you're just paying to stay wrong.",
    ),
  ],
  tip_first_win: [
    L('kessler', 'happy', 'A realized gain. Frame it. Then do it again, preferably at scale.'),
    L(
      'ines',
      'happy',
      'First one in the books. Closing a winner early at your target: remember that feeling.',
    ),
    L('ines', 'happy', 'Locked in. Paper profit is a rumor; that one is real money.'),
  ],
  tip_window: [
    L('kessler', 'neutral', 'Tickets expire with the window. Unused ones pay a little. Targets pay more.'),
    L(
      'bradley',
      'happy',
      "Clock's ticking, rookie. I already placed three trades today. Two of them on purpose.",
    ),
    L(
      'ines',
      'neutral',
      'Two days left to open trades this round, and you still have tickets. Use them on a clean setup, or not at all.',
    ),
  ],
  tip_wait: [
    L('kessler', 'neutral', 'Observing the market is permitted. Billing for it is under review.'),
    L('bradley', 'neutral', "You're just... watching? Bold. I'd have traded twice by now. Badly, but twice."),
    L(
      'ines',
      'neutral',
      "Watching before you trade? Good. Untraded cards move with the clock: a day of bars can tell you which way it's leaning.",
    ),
  ],
};

/** Pick a line for a situation, seeded, optionally restricted to one speaker; fill placeholders. */
export function pickLine(
  trigger: Trigger,
  rng: Rng,
  vars: Record<string, string | number> = {},
  who?: CharacterId,
): Line {
  const pool = LINES[trigger].filter((l) => !who || l.who === who);
  const line = rng.pick(pool.length ? pool : LINES[trigger]);
  return { ...line, text: line.text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) };
}

export const LINE_COUNT = Object.values(LINES).reduce((a, l) => a + l.length, 0);
