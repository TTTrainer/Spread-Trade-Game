/** Lets the price ladder line its rows up with the chart's price axis. */
export const chartBridge: {
  priceToY: (p: number) => number | null;
  yToPrice: (y: number) => number | null;
  paneHeight: () => number;
  /** Candles currently drawn (tests use it to prove the chart is never left empty). */
  barCount: () => number;
  /** Width of the plotting area (the chart without its price axis). */
  plotWidth: () => number;
} = {
  priceToY: () => null,
  yToPrice: () => null,
  paneHeight: () => 0,
  barCount: () => 0,
  plotWidth: () => 0,
};
