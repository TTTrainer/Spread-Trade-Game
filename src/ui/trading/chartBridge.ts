/** Lets the price ladder line its rows up with the chart's price axis. */
export const chartBridge: {
  priceToY: (p: number) => number | null;
  yToPrice: (y: number) => number | null;
  paneHeight: () => number;
} = {
  priceToY: () => null,
  yToPrice: () => null,
  paneHeight: () => 0,
};
