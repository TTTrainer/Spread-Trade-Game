# The payout: making a closed trade feel like a Balatro hand (1.6.1)

Jacob's note: in Balatro a good hand feels great because the jokers all fire in a satisfying chain.
Closing a winning trade here should feel the same, show what each cartridge did, and closing at a
profit shouldn't just happen quietly in the background.

## What makes Balatro's scoring feel good

From write-ups on Balatro's feedback design ([Blake Crosley's design guide](https://blakecrosley.com/guides/design/balatro),
[PSU on reward design from arcades to Balatro](https://www.psu.com/news/why-winning-feels-so-good-reward-design-from-arcades-to-balatro/),
[Inverse on scoring big](https://www.inverse.com/gaming/balatro-tips-for-scoring-big)) and player discussions
on its Steam forums:

1. **The hand is played out one step at a time.** It doesn't just print a total. Each card scores in turn,
   then each joker fires in order, left to right. You watch your build work.
2. **Each step is tied to the thing that caused it.** The card or joker that scores jumps and wiggles, and a
   small label pops off it ("+4 Mult", "X2 Mult"). You always know who did what.
3. **Two counters, two colors.** Chips are blue, mult is red, and both tick up as the steps land. The
   multiplication at the end is the payoff.
4. **The pitch climbs.** Each scoring step plays a slightly higher note, so a long chain sounds like it's
   building toward something. Mult steps have their own sound.
5. **It speeds up as it goes.** The first steps are slow enough to read. Later ones come faster, so a big
   build feels like a rush, not a wait.
6. **The total lands hard.** chips × mult slams into a big number. If it beats the blind, the score
   catches fire, the screen shakes and coins burst.
7. **You can skip it.** Any click speeds the chain up, so it never gets in the way of a player who's seen it.

## What the game does now

When any trade closes in a run (you cash it out, a target or stop fills, it expires, or the window ends),
the **payout** panel plays before the clock moves on:

- **Header:** CASH OUT (a win you or your plan closed), EXPIRY PAYDAY (a win that expired), CLOSED AT THE
  BELL, STOP TAKEN · PLAN KEPT (a planned stop), or LOSS. Then the stock, the structure and the dollar P/L.
- **CHIPS × MULT (× SCORE):** a blue chips box and a red mult box tick through every step the engine used.
  Each box pops when it changes. A third amber box shows any score multiplier (for example 2x Leverage).
- **Your cartridges, as cards:** every cartridge you own sits in a row. When one fires, it jumps and a label
  pops off it ("+3 mult", "×2 score"), with its trigger in plain words under it ("Every winner",
  "Short premium held over a weekend"). Cartridges that didn't fire stay dim, so you can see which part of
  your build did nothing on this trade.
- **The rail fires too:** the same cartridge on the top bar jiggles and drops the same label, which ties the
  panel to your build on screen.
- **The other steps** (structure base, levels, your call, discipline, desk) scroll in a short log.
- **Sound:** a coin for the P/L, a chip clink for chip steps, a rising blip for +mult, a heavier hit for ×mult.
  The pitch climbs a semitone each step. The total lands with a slam.
- **Speed:** slow at first, faster as it goes (each step about 14% quicker than the one before).
- **The total:** "= +N POINTS" slams in big. A bar shows your round score before and after against the
  target. If this trade clears the round, the panel catches fire: a fire sound, a coin burst, a shake
  and a TARGET CLEARED stamp.
- **Landing:** the panel shrinks and flies into the SCORE box on the top bar, and the score ticks up only
  then. Until the payout lands, the top bar's score and the round goal don't count it, so the number you
  see always matches what you've watched.
- **Order:** the clock waits for the payout, so do coworker lines and the next decision. Several trades
  closing at once play one after another.
- **Skip:** click the panel, or press Space or Enter, to jump straight to the total.
- **Setting:** Settings → "Payout when a trade closes": FULL, FAST (half the time) or OFF (the old way:
  the round tally plays it at the end of the round).

Every number in the payout is the engine's own score trace. The animation never changes the score.

## "Trades close automatically, which isn't satisfying"

- By default a hit profit target already stops the clock and asks: **CASH OUT** or **LET IT RIDE**. The
  month menu's "pause when a target hits" box now takes effect right away, mid-run (before, it only applied to
  the next run, which is likely why targets kept filling on their own).
- Whatever closes the trade, the moment is now the payout, not a toast. Expiry wins get their own
  EXPIRY PAYDAY header, so the Income desk's many expiring trades land as a payday.
- A planned stop gets STOP TAKEN · PLAN KEPT in the payout. Taking the stop you planned is a decision worth
  marking, which serves the goal of making a disciplined exit feel good.

## Ideas for later (not built)

- Per-cartridge sound variants (each rarity a different instrument).
- A slot-machine roll on the chips box instead of a pop.
- Score-scaled shake and flash: bigger totals shake harder (now only a cleared target shakes).
