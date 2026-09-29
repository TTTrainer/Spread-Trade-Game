/** Lets overlays (strike handles, zones, the expiration line) line up with the chart's axes. */
export const chartBridge: {
  priceToY: (p: number) => number | null;
  yToPrice: (y: number) => number | null;
  paneHeight: () => number;
  /** Candles currently drawn (tests use it to prove the chart is never left empty). */
  barCount: () => number;
  /** Width of the plotting area (the chart without its price axis). */
  plotWidth: () => number;
  /** The newest candle's date and whether it is inside the visible range (tests use it). */
  lastBar: () => { date: string | null; inView: boolean };
  /** Screen x of the bar `n` bars past the newest one (future days have no bars yet). */
  xAhead: (n: number) => number | null;
} = {
  priceToY: () => null,
  yToPrice: () => null,
  paneHeight: () => 0,
  barCount: () => 0,
  plotWidth: () => 0,
  lastBar: () => ({ date: null, inView: false }),
  xAhead: () => null,
};
