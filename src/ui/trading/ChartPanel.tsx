import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Logical,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  atr,
  bollinger,
  ema,
  keltner,
  macd,
  relativeVolume,
  rsi,
  sma,
  supportResistance,
} from '../../engine/market/indicators';
import type { Bar } from '../../engine/market/types';
import { optionLegsOf } from '../../engine/lifecycle/position';
import { diffDays } from '../../engine/calendar';
import { barsAhead } from './expiry';
import type { Leg } from '../../engine/strategies/types';
import { liveCardId, tradeOpen, useTrading, type StudyId } from '../store/trading';
import type { Position } from '../../engine/lifecycle/types';
import type { TradePlan } from '../../engine/trading/plan';
import { STRUCTURES } from '../../engine/strategies/structures';
import { chartBridge } from './chartBridge';
import { LivePnl, PositionHud } from './DayPlayer';
import { BossBanner } from './BossBanner';
import { useSealed } from '../boss';
import { StrikeHandle } from './StrikeHandle';
import { DayRecapPanel } from './DayRecap';
import { ChartZones } from './ChartZones';
import { formingBar, priceAt } from './dayPath';
import { useDayProgress } from './DayPlayer';
import { AnimatePresence, motion } from 'motion/react';

const toTs = (d: string) => (Date.parse(d) / 1000) as UTCTimestamp;
const toDate = (t: Time) => new Date((t as number) * 1000).toISOString().slice(0, 10);

function weekly(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let key = '';
  for (const b of bars) {
    const d = new Date(b.date + 'T00:00:00Z');
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    if (monday !== key) {
      if (cur) out.push(cur);
      key = monday;
      cur = { ...b };
    } else if (cur) {
      const c: Bar = cur;
      cur = {
        ...c,
        high: Math.max(c.high, b.high),
        low: Math.min(c.low, b.low),
        close: b.close,
        volume: c.volume + b.volume,
      };
    }
  }
  if (cur) out.push(cur);
  return out;
}

const COLORS = {
  up: '#4dff9a',
  down: '#ff4f6d',
  grid: 'rgba(91, 75, 196, 0.18)',
  text: '#a49de0',
  cyan: '#3ef2ff',
  magenta: '#ff3ea5',
  amber: '#ffbf3e',
  violet: '#9d6bff',
  planShort: 'rgba(255, 62, 165, 0.6)',
  planLong: 'rgba(62, 242, 255, 0.55)',
};

function line(data: (number | null)[], bars: Bar[]): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  data.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) out.push({ time: toTs(bars[i].date), value: v });
  });
  return out;
}

export function ChartPanel() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const version = useTrading((s) => s.version);
  const allStudies = useTrading((s) => s.studies);
  // The Shell Company seals the studies: only volume stays.
  const studiesSealed = useSealed('studies');
  const studies = useMemo(
    () => (studiesSealed ? allStudies.filter((x) => x === 'vol') : allStudies),
    [allStudies, studiesSealed],
  );
  const timeframe = useTrading((s) => s.timeframe);
  const drawings = useTrading((s) => (cardId ? s.drawings[cardId] : undefined));
  const drawTool = useTrading((s) => s.drawTool);
  const ff = useTrading((s) => s.ff);
  const addDrawing = useTrading((s) => s.addDrawing);
  // The builder's sliders move the strike and expiration lines: redraw on every change.
  useTrading((s) => s.builder);
  const dragging = useTrading((s) => s.dragging);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const extraRef = useRef<{ key: StudyId | 'volume'; series: ISeriesApi<'Line' | 'Histogram'> }[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const shortLinesRef = useRef<IPriceLine[]>([]);
  const drawRef = useRef<ISeriesApi<'Line'>[]>([]);
  const pendingRef = useRef<{ time: number; price: number } | null>(null);
  const [legend, setLegend] = useState<string>('');
  // Bumped whenever the chart is rebuilt (new card, studies or timeframe) so data and overlays reload.
  const [chartGen, setChartGen] = useState(0);
  const blind = session?.config.blind ?? false;
  const studiesKey = studies.slice().sort().join(',');

  // Create the chart for this card / study set / timeframe.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !session || !cardId) return;
    const view = session.view(cardId);
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0826' },
        textColor: COLORS.text,
        fontFamily: 'VT323, monospace',
        fontSize: 16,
        attributionLogo: true,
        panes: { separatorColor: '#3b2f86', separatorHoverColor: '#5b4bc4' },
      },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#3b2f86' },
      timeScale: {
        borderColor: '#3b2f86',
        rightOffset: 6,
        // Wider candles once the clock runs, so each new day is big enough to watch form.
        barSpacing: useTrading.getState().ff === 'idle' ? 7 : 15,
        tickMarkFormatter: (t: Time) =>
          blind ? view.dayLabel(toDate(t)).replace('Day ', 'D') : toDate(t).slice(5),
      },
      localization: {
        timeFormatter: (t: Time) => (blind ? view.dayLabel(toDate(t)) : toDate(t)),
        priceFormatter: (p: number) => p.toFixed(2),
      },
    });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    candleRef.current = candles;
    const extras: { key: StudyId | 'volume'; series: ISeriesApi<'Line' | 'Histogram'> }[] = [];
    if (studies.includes('vol')) {
      const v = chart.addSeries(HistogramSeries, {
        priceScaleId: 'vol',
        priceFormat: { type: 'volume' },
        color: 'rgba(157,107,255,0.35)',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      extras.push({ key: 'volume', series: v });
    }
    const addLine = (
      key: StudyId,
      color: string,
      pane = 0,
      style: LineStyle = LineStyle.Solid,
      width: 1 | 2 = 1,
    ) => {
      const s = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: width,
          lineStyle: style,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        pane,
      );
      extras.push({ key, series: s });
      return s;
    };
    if (studies.includes('bb')) {
      addLine('bb', 'rgba(62,242,255,0.55)');
      addLine('bb', 'rgba(62,242,255,0.3)', 0, LineStyle.Dotted);
      addLine('bb', 'rgba(62,242,255,0.55)');
    }
    if (studies.includes('sma20')) addLine('sma20', COLORS.amber);
    if (studies.includes('sma50')) addLine('sma50', '#ff8a3d');
    if (studies.includes('sma200')) addLine('sma200', '#ff3e3e', 0, LineStyle.Solid, 2);
    if (studies.includes('ema9')) addLine('ema9', '#c6ff5e');
    if (studies.includes('ema21')) addLine('ema21', '#6bff8f');
    if (studies.includes('keltner')) {
      addLine('keltner', 'rgba(255,62,165,0.5)', 0, LineStyle.Dashed);
      addLine('keltner', 'rgba(255,62,165,0.5)', 0, LineStyle.Dashed);
    }
    let pane = 1;
    if (studies.includes('rsi')) {
      addLine('rsi', COLORS.violet, pane);
      pane++;
    }
    if (studies.includes('macd')) {
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      extras.push({ key: 'macd', series: h });
      addLine('macd', COLORS.cyan, pane);
      addLine('macd', COLORS.amber, pane);
      pane++;
    }
    if (studies.includes('atr')) {
      addLine('atr', COLORS.amber, pane);
      pane++;
    }
    if (studies.includes('relvol')) {
      const h = chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, color: 'rgba(62,242,255,0.5)' },
        pane,
      );
      extras.push({ key: 'relvol', series: h });
      pane++;
    }
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(3);
      for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(0.8);
    }
    extraRef.current = extras;
    chartBridge.priceToY = (p) => candles.priceToCoordinate(p);
    chartBridge.yToPrice = (y) => candles.coordinateToPrice(y);
    chartBridge.paneHeight = () => panes[0]?.getHeight() ?? host.clientHeight;
    chartBridge.barCount = () => candles.data().length;
    chartBridge.plotWidth = () => chart.timeScale().width();
    chartBridge.lastBar = () => {
      const d = candles.data();
      if (!d.length) return { date: null, inView: false };
      const i = d.length - 1;
      const r = chart.timeScale().getVisibleLogicalRange();
      return { date: toDate(d[i].time), inView: !!r && i >= r.from - 0.5 && i <= r.to + 0.5 };
    };
    chartBridge.xForDate = (d) => chart.timeScale().timeToCoordinate(toTs(d));
    chartBridge.xAhead = (n) => {
      const len = candles.data().length;
      return len ? chart.timeScale().logicalToCoordinate((len - 1 + n) as Logical) : null;
    };
    setChartGen((g) => g + 1);
    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(candles) as
        { open: number; high: number; low: number; close: number } | undefined;
      if (!d || !param.time) return setLegend('');
      const label = blind ? view.dayLabel(toDate(param.time)) : toDate(param.time);
      setLegend(
        `${label}  O ${d.open.toFixed(2)}  H ${d.high.toFixed(2)}  L ${d.low.toFixed(2)}  C ${d.close.toFixed(2)}`,
      );
    });
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      linesRef.current = [];
      drawRef.current = [];
      chartBridge.priceToY = () => null;
      chartBridge.xAhead = () => null;
      chartBridge.xForDate = () => null;
    };
  }, [session, cardId, studiesKey, timeframe]);

  // Feed data only when a new simulated day arrives (not on every click), so the chart and its
  // studies recompute once per day during the fast-forward.
  const now = session && cardId ? session.view(cardId).now : '';
  const bars = useMemo(() => {
    if (!session || !cardId) return [] as Bar[];
    const b = session.view(cardId).bars();
    return timeframe === 'W' ? weekly(b) : b;
  }, [session, cardId, now, timeframe]);
  // A day being played back: the newest candle forms on screen instead of appearing whole.
  const anim = useTrading((s) => s.dayAnim);
  const stamp = useTrading((s) => s.stamp);
  const cardAnim = anim && cardId ? anim.cards[cardId] : undefined;
  const animKey =
    anim && cardAnim && anim.ms > 0 && timeframe === 'D' && bars[bars.length - 1]?.date === cardAnim.date
      ? anim.id
      : 0;

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    if (!chart || !candles || bars.length === 0) return;
    const full = bars;
    // While the day plays, everything (studies too) shows yesterday; the new candle is drawn live.
    const shown = animKey ? full.slice(0, -1) : full;
    candles.setData(
      shown.map((b) => ({ time: toTs(b.date), open: b.open, high: b.high, low: b.low, close: b.close })),
    );
    const closes = shown.map((b) => b.close);
    const byKey = (k: string) => extraRef.current.filter((e) => e.key === k).map((e) => e.series);
    const vol = byKey('volume')[0];
    if (vol)
      vol.setData(
        shown.map((b) => ({
          time: toTs(b.date),
          value: b.volume,
          color: b.close >= b.open ? 'rgba(77,255,154,0.28)' : 'rgba(255,79,109,0.28)',
        })),
      );
    const bb = byKey('bb');
    if (bb.length === 3) {
      const band = bollinger(closes);
      bb[0].setData(
        line(
          band.map((x) => x.upper),
          shown,
        ),
      );
      bb[1].setData(
        line(
          band.map((x) => x.mid),
          shown,
        ),
      );
      bb[2].setData(
        line(
          band.map((x) => x.lower),
          shown,
        ),
      );
    }
    const setOne = (k: StudyId, data: (number | null)[]) => byKey(k)[0]?.setData(line(data, shown));
    setOne('sma20', sma(closes, 20));
    setOne('sma50', sma(closes, 50));
    setOne('sma200', sma(closes, 200));
    setOne('ema9', ema(closes, 9));
    setOne('ema21', ema(closes, 21));
    const kc = byKey('keltner');
    if (kc.length === 2) {
      const k = keltner(shown);
      kc[0].setData(
        line(
          k.map((x) => x.upper),
          shown,
        ),
      );
      kc[1].setData(
        line(
          k.map((x) => x.lower),
          shown,
        ),
      );
    }
    setOne('rsi', rsi(closes));
    const m = byKey('macd');
    if (m.length === 3) {
      const mm = macd(closes);
      m[0].setData(
        mm
          .map((x, i) => ({ x, i }))
          .filter(({ x }) => x.hist !== null)
          .map(({ x, i }) => ({
            time: toTs(shown[i].date),
            value: x.hist as number,
            color: (x.hist as number) >= 0 ? 'rgba(77,255,154,0.5)' : 'rgba(255,79,109,0.5)',
          })),
      );
      m[1].setData(
        line(
          mm.map((x) => x.macd),
          shown,
        ),
      );
      m[2].setData(
        line(
          mm.map((x) => x.signal),
          shown,
        ),
      );
    }
    setOne('atr', atr(shown));
    const rv = byKey('relvol')[0];
    if (rv) rv.setData(line(relativeVolume(shown), shown));
    if (!animKey || !anim || !cardAnim) return;
    const a = anim;
    const c = cardAnim;
    const time = toTs(c.date);
    const vTotal = full[full.length - 1].volume;
    let raf = 0;
    const tick = (nowMs: number) => {
      const t = Math.min(1, Math.max(0, (nowMs - a.startedAt) / a.ms));
      const fb = formingBar(c.path, t);
      candles.update({ time, ...fb });
      vol?.update({
        time,
        value: vTotal * t,
        color: fb.close >= fb.open ? 'rgba(77,255,154,0.28)' : 'rgba(255,79,109,0.28)',
      });
      // Price leaning on a short strike: the strike line flashes.
      if (c.tension >= 0.7)
        for (const l of shortLinesRef.current)
          l.applyOptions({ color: Math.floor(nowMs / 110) % 2 ? '#ffffff' : COLORS.magenta, lineWidth: 3 });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const l of shortLinesRef.current) l.applyOptions({ color: COLORS.magenta, lineWidth: 2 });
    };
  }, [bars, animKey, chartGen]);

  // Zoom in on the recent candles while the clock runs; zoom back out to build the next trade.
  const clockOn = ff !== 'idle';
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().applyOptions({ barSpacing: clockOn ? 15 : 7 });
    chart.timeScale().scrollToRealTime();
  }, [clockOn]);

  // Overlays: strikes, breakevens, expected move, support/resistance, drawings.
  const planHidden = useTrading((s) => s.planHidden);
  const position = session && cardId ? session.openPositions().find((p) => p.cardId === cardId) : undefined;
  const fullPlan = useTrading((s) => s.plan)();
  const plan = planHidden && !position ? null : fullPlan;
  const legs: Leg[] = position ? position.legs : (plan?.legs ?? []);
  const breakevens = position ? [] : (plan?.metrics?.breakevens ?? []);
  const em = plan?.metrics?.expectedMove ?? null;
  const legKey = JSON.stringify([legs, breakevens, em, studiesKey, version, dragging]);

  // Expiration: solid for the open trade, dotted for the one being planned. Future days have no
  // bars, so it sits that many trading days (or weeks) past the newest candle.
  const exps = optionLegsOf(legs).map((l) => l.expiration);
  // The Executor seals a planned trade's expiration: no line to read it off until it's open.
  const dteSealed = useSealed('dte');
  const expHidden = !!dteSealed && !position && exps.length > 0;
  const exp = exps.length && !expHidden ? exps.reduce((a, b) => (a < b ? a : b)) : null;
  const expAhead = exp && now && exp > now ? barsAhead(now, exp, timeframe) : null;
  const expDte = exp && now ? diffDays(now, exp) : null;
  // Leave room on the right to see the expiration, up to 40% of the chart; beyond that an arrow
  // at the edge points to it.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const visible = ts.width() / ts.options().barSpacing;
    const room = visible > 20 ? Math.floor(visible * 0.4) : 30;
    // A sealed expiration gets the same fixed room whatever it is, so the room can't give it away.
    const offset = expHidden
      ? Math.min(14, room)
      : expAhead === null
        ? 6
        : Math.min(Math.max(6, expAhead + 3), room);
    ts.applyOptions({ rightOffset: offset });
  }, [expAhead, expHidden, clockOn, chartGen]);

  useEffect(() => {
    const candles = candleRef.current;
    if (!candles || !session || !cardId) return;
    for (const l of linesRef.current) candles.removePriceLine(l);
    linesRef.current = [];
    shortLinesRef.current = [];
    // While a strike is dragged, the axis labels step aside: the handle is the one to watch.
    const add = (
      price: number,
      color: string,
      title: string,
      style: LineStyle = LineStyle.Solid,
      width: 1 | 2 | 3 = 1,
    ) =>
      linesRef.current.push(
        candles.createPriceLine({
          price,
          color,
          lineWidth: width,
          lineStyle: style,
          axisLabelVisible: !dragging,
          title: dragging ? '' : title,
        }),
      );
    // Keep the trade's strikes in view (but not mid-drag, or the scale would chase the cursor).
    const strikes = optionLegsOf(legs)
      .map((l) => l.strike)
      .filter((k) => Number.isFinite(k) && k > 0);
    candles.applyOptions({
      autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = base();
        if (!r || dragging || !strikes.length) return r;
        const { minValue, maxValue } = r.priceRange;
        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return r;
        // Never zoom out past three times the candles' own range for a far-away strike.
        const span = Math.max(maxValue - minValue, maxValue * 0.01);
        const lo = Math.max(minValue - span, Math.min(minValue, ...strikes));
        const hi = Math.min(maxValue + span, Math.max(maxValue, ...strikes));
        if (!(hi > lo)) return r;
        return { ...r, priceRange: { minValue: lo - (hi - lo) * 0.03, maxValue: hi + (hi - lo) * 0.03 } };
      },
    });
    // Your open trade: bold solid lines marked YOUR. A trade still being planned: thin dashed
    // PLAN lines in paler colors, so the two can never be mistaken for each other.
    const live = !!position;
    for (const l of optionLegsOf(legs)) {
      const short = l.ratio < 0;
      add(
        l.strike,
        short ? (live ? COLORS.magenta : COLORS.planShort) : live ? COLORS.cyan : COLORS.planLong,
        `${live ? '● YOUR' : 'PLAN'} ${short ? 'S' : 'L'} ${l.right}`,
        live ? LineStyle.Solid : LineStyle.Dashed,
        live ? (short ? 3 : 2) : 1,
      );
      if (short) shortLinesRef.current.push(linesRef.current[linesRef.current.length - 1]);
    }
    for (const b of breakevens) add(b, COLORS.amber, 'BE', LineStyle.Dotted);
    const spot = session.view(cardId).spot();
    if (studies.includes('em') && em && !dragging) {
      add(spot + em, COLORS.violet, '+EM', LineStyle.LargeDashed);
      add(spot - em, COLORS.violet, '-EM', LineStyle.LargeDashed);
    }
    // Two standard deviations: where a short strike sits for roughly 95% odds of staying out.
    if (studies.includes('em2') && em && !dragging) {
      add(spot + 2 * em, 'rgba(157,107,255,0.6)', '+2σ', LineStyle.SparseDotted);
      add(spot - 2 * em, 'rgba(157,107,255,0.6)', '-2σ', LineStyle.SparseDotted);
    }
    if (studies.includes('sr') && !dragging)
      for (const lvl of supportResistance(session.view(cardId).bars()))
        add(
          lvl.price,
          lvl.kind === 'support' ? 'rgba(77,255,154,0.6)' : 'rgba(255,79,109,0.6)',
          lvl.kind === 'support' ? 'SUP' : 'RES',
          LineStyle.SparseDotted,
        );
  }, [legKey, chartGen]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    if (!chart || !candles) return;
    for (const s of drawRef.current) chart.removeSeries(s);
    drawRef.current = [];
    for (const d of drawings ?? []) {
      if (d.kind === 'hline') {
        linesRef.current.push(
          candles.createPriceLine({
            price: d.points[0].price,
            color: COLORS.amber,
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: false,
            title: '',
          }),
        );
      } else if (d.points.length === 2 && d.points[0].time !== d.points[1].time) {
        const s = chart.addSeries(LineSeries, {
          color: COLORS.amber,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const pts = d.points.slice().sort((a, b) => a.time - b.time);
        s.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
        drawRef.current.push(s);
      }
    }
  }, [drawings, legKey, chartGen]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    if (!chart || !candles || drawTool === 'none') return;
    const onClick = (param: { time?: Time; point?: { x: number; y: number } }) => {
      if (!param.time || !param.point) return;
      const price = candles.coordinateToPrice(param.point.y);
      if (price === null) return;
      const pt = { time: param.time as number, price };
      if (drawTool === 'hline') addDrawing({ kind: 'hline', points: [pt] });
      else if (!pendingRef.current) pendingRef.current = pt;
      else {
        addDrawing({ kind: 'trend', points: [pendingRef.current, pt] });
        pendingRef.current = null;
      }
    };
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [drawTool]);

  return (
    <div className="chart-panel panel" data-testid="chart-panel">
      <div className="chart-host" ref={hostRef} />
      {cardId && <ChartTitle cardId={cardId} legend={legend} />}
      {drawTool !== 'none' && (
        <div className="chart-drawhint num">
          {drawTool === 'trend' ? 'Click two points for a trendline' : 'Click a price for a horizontal line'}
        </div>
      )}
      {(!planHidden || position) && <ChartZones />}
      <TradeBadge position={position} plan={plan} />
      {expAhead !== null && expDte !== null && <ExpiryLine ahead={expAhead} dte={expDte} open={!!position} />}
      {expHidden && dteSealed && <SealedExpiry by={dteSealed} />}
      {!planHidden && <StrikeHandle />}
      <PositionHud />
      {cardId && <PracticeMarkLine cardId={cardId} />}
      <BossBanner />
      <DayRecapPanel />
      <AnimatePresence>
        {stamp && (
          <motion.div
            key={stamp.id}
            className={`fill-stamp ${stamp.plan ? 'plan' : stamp.credit ? 'credit' : 'debit'}`}
            data-testid="fill-stamp"
            initial={{ scale: 2.4, opacity: 0, rotate: -16 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 520, damping: 17 }}
          >
            <div className="fs-title">{stamp.title}</div>
            <div className="fs-text num">{stamp.text}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {anim && anim.ms > 0 && (
          <motion.div
            key={anim.id}
            className={`day-flash num ${anim.tension >= 0.7 ? 'tense' : ''}`}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: [0, 0.9, 0.9, 0], scale: 1 }}
            transition={{ duration: Math.min(1.2, anim.ms / 1000), times: [0, 0.15, 0.6, 1] }}
          >
            DAY {session?.dayIndex ?? 0}
            {anim.tension >= 1 ? ' · STRIKE HIT' : anim.tension >= 0.7 ? ' · TESTING' : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Top left of the chart: whose chart this is, its price and today's move (following the forming
 * candle while the day plays), then the bar under the cursor.
 */
function ChartTitle({ cardId, legend }: { cardId: string; legend: string }) {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const p = useDayProgress();
  if (!session) return null;
  const card = session.card(cardId);
  const bars = session.view(cardId).bars();
  const live = p?.anim.cards[cardId];
  const px = live ? priceAt(live.path, p.t) : (bars.at(-1)?.close ?? 0);
  const prev = live ? live.prevClose : (bars.at(-2)?.close ?? px);
  const chg = prev > 0 ? px / prev - 1 : 0;
  const up = chg >= 0;
  const real = !session.config.blind && card.realSymbol !== card.displaySymbol ? card.realSymbol : null;
  return (
    <div className="chart-title num" data-testid="chart-symbol">
      <b className="ct-sym">{card.displaySymbol}</b>
      {real && <span className="ct-real">{real}</span>}
      <span className="ct-px">{px.toFixed(2)}</span>
      <span className={`ct-chg ${up ? 'up-text' : 'down-text'}`}>
        {up ? '▲' : '▼'} {up ? '+' : '−'}
        {Math.abs(chg * 100).toFixed(2)}%
      </span>
      {legend && <span className="ct-legend">{legend}</span>}
    </div>
  );
}

/**
 * The tutorial's practice trade: the floor (or ceiling) it was built around, as a line across the
 * chart with a ring on each day the stock turned there.
 */
function PracticeMarkLine({ cardId }: { cardId: string }) {
  const mark = useTrading((s) => s.practiceMark);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!mark) return;
    // Follow scrolling and zooming, like the expiration line.
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, [mark]);
  if (!mark || mark.cardId !== cardId) return null;
  const y = chartBridge.priceToY(mark.price);
  const w = chartBridge.plotWidth();
  const h = chartBridge.paneHeight();
  if (y === null || w <= 0 || y < 0 || y > h) return null;
  const floor = mark.kind === 'floor';
  return (
    <div
      className="practice-mark"
      style={{ width: w, height: h }}
      data-testid="practice-mark"
      data-kind={mark.kind}
    >
      <div className={`pm-line ${mark.kind}`} style={{ top: y }} />
      <span className={`pm-tag num ${mark.kind}`} style={{ top: floor ? y + 6 : y - 30 }}>
        {floor ? '▼ FLOOR' : '▲ CEILING'} {mark.price.toFixed(2)} · turned here {mark.touches.length}×
      </span>
      {mark.touches.map((t) => {
        const x = chartBridge.xForDate(t.date);
        const ty = chartBridge.priceToY(t.price);
        return x === null || ty === null ? null : (
          <i key={t.date} className="pm-touch" style={{ left: x, top: ty }} />
        );
      })}
    </div>
  );
}

/** Top left of the chart: are these lines a trade you placed, or one you're still shaping? */
function TradeBadge({ position, plan }: { position: Position | undefined; plan: TradePlan | null }) {
  const canTrade = useTrading(tradeOpen);
  if (position) {
    const strikes = optionLegsOf(position.legs)
      .map((l) => l.strike)
      .join('/');
    return (
      <div
        className="trade-badge open num"
        data-testid="trade-badge"
        data-kind="open"
        data-tip-title="Your open trade"
        data-tip-body="The solid lines marked YOUR are the trade you placed on this card. The shaded box runs from the day you opened it to its expiration."
      >
        <b>● OPEN TRADE</b> {STRUCTURES[position.structureId].short} {strikes} ×{position.qty}{' '}
        <LivePnl pos={position} />
      </div>
    );
  }
  if (plan && plan.legs.length && canTrade) {
    const strikes = optionLegsOf(plan.legs)
      .map((l) => l.strike)
      .join('/');
    return (
      <div
        className="trade-badge plan num"
        data-testid="trade-badge"
        data-kind="plan"
        data-tip-title="A plan, not a trade"
        data-tip-body="The dashed PLAN lines show the trade you're shaping. Nothing is placed until you press SELL or BUY."
      >
        <b>◌ PLANNING</b> {STRUCTURES[plan.structureId].short} {strikes} · not placed yet
      </div>
    );
  }
  return null;
}

/** The Executor's seal where the expiration line would be: at the chart's right edge. */
function SealedExpiry({ by }: { by: string }) {
  const w = chartBridge.plotWidth();
  if (w <= 0) return null;
  return (
    <div
      className="exp-edge num plan sealed"
      style={{ left: w - 2 }}
      data-testid="exp-sealed"
      data-tip-title="Expiration sealed"
      data-tip-body={`${by} has sealed when this trade would expire. It shows once the trade is open; max profit and max loss still show.`}
    >
      🔒 EXP ?
    </div>
  );
}

function ExpiryLine({ ahead, dte, open }: { ahead: number; dte: number; open: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    // Follow scrolling and zooming, like the payoff zones do.
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);
  const w = chartBridge.plotWidth();
  const h = chartBridge.paneHeight();
  const x = chartBridge.xAhead(ahead);
  if (w <= 0 || h <= 0) return null;
  const label = `${open ? 'EXPIRES' : 'EXP'} ${dte}d`;
  const tip = open
    ? `Your trade expires in ${dte} calendar days (${ahead} trading days). Past this line it settles at intrinsic value.`
    : `The planned trade would expire in ${dte} calendar days (${ahead} trading days).`;
  if (x === null || x > w - 2)
    return (
      <div
        className={`exp-edge num ${open ? 'open' : 'plan'}`}
        style={{ left: w - 2 }}
        data-testid="exp-line"
        data-exp-offscreen="1"
        data-tip-title="Expiration"
        data-tip-body={`${tip} It's off the right edge of the chart.`}
      >
        {label} ▶
      </div>
    );
  if (x < 0) return null;
  return (
    <div
      className={`exp-line ${open ? 'open' : 'plan'}`}
      style={{ left: x, height: h }}
      data-testid="exp-line"
      data-exp-style={open ? 'solid' : 'dotted'}
    >
      <span className="exp-tag num" data-tip-title="Expiration" data-tip-body={tip}>
        {label}
      </span>
    </div>
  );
}
