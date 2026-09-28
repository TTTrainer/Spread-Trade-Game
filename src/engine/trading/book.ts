/**
 * Builds the lifecycle's DayBook (today's close) from a MarketView.
 */
import { atr } from '../market/indicators';
import type { MarketView } from '../market/view';
import type { DayBook } from '../lifecycle/types';

export function dayBook(view: MarketView, divYield: number): DayBook {
  const bars = view.bars();
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const a = atr(bars, 14);
  const prevAtr = a[a.length - 2] ?? null;
  const tomorrow = view.upcomingTradingDays()[0] ?? null;
  const e = view.earnings();
  const divs = view.dividends();
  const next = e.upcoming[0];
  return {
    date: view.now,
    spot: last.close,
    open: last.open,
    rate: view.rate(),
    divYield,
    quote: (k) => view.quote(k),
    earningsTomorrow: !!next && tomorrow !== null && next.reactionDate === tomorrow,
    exDivToday: divs.find((d) => d.exDate === view.now) ?? null,
    exDivTomorrow: tomorrow ? (divs.find((d) => d.exDate === tomorrow) ?? null) : null,
    gapDay: !!prev && prevAtr !== null && prevAtr > 0 && Math.abs(last.open - prev.close) > 2 * prevAtr,
    atr: a[a.length - 1] ?? null,
  };
}
