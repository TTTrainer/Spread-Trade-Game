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
import type { Leg } from '../../engine/strategies/types';
import { useTrading, type StudyId } from '../store/trading';
import { chartBridge } from './chartBridge';
import { PriceLadder } from './PriceLadder';

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
  const cardId = useTrading((s) => s.selectedCardId);
  const version = useTrading((s) => s.version);
  const studies = useTrading((s) => s.studies);
  const timeframe = useTrading((s) => s.timeframe);
  const builder = useTrading((s) => s.builder);
  const drawings = useTrading((s) => (cardId ? s.drawings[cardId] : undefined));
  const drawTool = useTrading((s) => s.drawTool);
  const ff = useTrading((s) => s.ff);
  const addDrawing = useTrading((s) => s.addDrawing);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const extraRef = useRef<{ key: StudyId | 'volume'; series: ISeriesApi<'Line' | 'Histogram'> }[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const drawRef = useRef<ISeriesApi<'Line'>[]>([]);
  const pendingRef = useRef<{ time: number; price: number } | null>(null);
  const [legend, setLegend] = useState<string>('');
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
    };
  }, [session, cardId, studiesKey, timeframe]);

  // Feed data (new bars arrive every simulated day).
  const bars = useMemo(() => {
    if (!session || !cardId) return [] as Bar[];
    const b = session.view(cardId).bars();
    return timeframe === 'W' ? weekly(b) : b;
  }, [session, cardId, version, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    if (!chart || !candles || bars.length === 0) return;
    candles.setData(
      bars.map((b) => ({ time: toTs(b.date), open: b.open, high: b.high, low: b.low, close: b.close })),
    );
    const closes = bars.map((b) => b.close);
    const byKey = (k: string) => extraRef.current.filter((e) => e.key === k).map((e) => e.series);
    const vol = byKey('volume')[0];
    if (vol)
      vol.setData(
        bars.map((b) => ({
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
          bars,
        ),
      );
      bb[1].setData(
        line(
          band.map((x) => x.mid),
          bars,
        ),
      );
      bb[2].setData(
        line(
          band.map((x) => x.lower),
          bars,
        ),
      );
    }
    const setOne = (k: StudyId, data: (number | null)[]) => byKey(k)[0]?.setData(line(data, bars));
    setOne('sma20', sma(closes, 20));
    setOne('sma50', sma(closes, 50));
    setOne('sma200', sma(closes, 200));
    setOne('ema9', ema(closes, 9));
    setOne('ema21', ema(closes, 21));
    const kc = byKey('keltner');
    if (kc.length === 2) {
      const k = keltner(bars);
      kc[0].setData(
        line(
          k.map((x) => x.upper),
          bars,
        ),
      );
      kc[1].setData(
        line(
          k.map((x) => x.lower),
          bars,
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
            time: toTs(bars[i].date),
            value: x.hist as number,
            color: (x.hist as number) >= 0 ? 'rgba(77,255,154,0.5)' : 'rgba(255,79,109,0.5)',
          })),
      );
      m[1].setData(
        line(
          mm.map((x) => x.macd),
          bars,
        ),
      );
      m[2].setData(
        line(
          mm.map((x) => x.signal),
          bars,
        ),
      );
    }
    setOne('atr', atr(bars));
    const rv = byKey('relvol')[0];
    if (rv) rv.setData(line(relativeVolume(bars), bars));
  }, [bars]);

  // Overlays: strikes, breakevens, expected move, support/resistance, drawings.
  const plan = useTrading((s) => s.plan)();
  const position = session && cardId ? session.openPositions().find((p) => p.cardId === cardId) : undefined;
  const legs: Leg[] = position ? position.legs : (plan?.legs ?? []);
  const breakevens = position ? [] : (plan?.metrics?.breakevens ?? []);
  const em = plan?.metrics?.expectedMove ?? null;
  const legKey = JSON.stringify([legs, breakevens, em, studiesKey, version]);

  useEffect(() => {
    const candles = candleRef.current;
    if (!candles || !session || !cardId) return;
    for (const l of linesRef.current) candles.removePriceLine(l);
    linesRef.current = [];
    const add = (
      price: number,
      color: string,
      title: string,
      style: LineStyle = LineStyle.Solid,
      width: 1 | 2 = 1,
    ) =>
      linesRef.current.push(
        candles.createPriceLine({
          price,
          color,
          lineWidth: width,
          lineStyle: style,
          axisLabelVisible: true,
          title,
        }),
      );
    for (const l of optionLegsOf(legs))
      add(
        l.strike,
        l.ratio < 0 ? COLORS.magenta : COLORS.cyan,
        `${l.ratio < 0 ? 'S' : 'L'} ${l.right}`,
        l.ratio < 0 ? LineStyle.Solid : LineStyle.Dashed,
        2,
      );
    for (const b of breakevens) add(b, COLORS.amber, 'BE', LineStyle.Dotted);
    const spot = session.view(cardId).spot();
    if (studies.includes('em') && em) {
      add(spot + em, COLORS.violet, '+EM', LineStyle.LargeDashed);
      add(spot - em, COLORS.violet, '-EM', LineStyle.LargeDashed);
    }
    if (studies.includes('sr'))
      for (const lvl of supportResistance(session.view(cardId).bars()))
        add(
          lvl.price,
          lvl.kind === 'support' ? 'rgba(77,255,154,0.6)' : 'rgba(255,79,109,0.6)',
          lvl.kind === 'support' ? 'SUP' : 'RES',
          LineStyle.SparseDotted,
        );
  }, [legKey]);

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
  }, [drawings, legKey]);

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
      <div className="chart-host" ref={hostRef} style={ff === 'idle' ? undefined : { right: 0 }} />
      <div className="chart-legend num">{legend}</div>
      {drawTool !== 'none' && (
        <div className="chart-drawhint num">
          {drawTool === 'trend' ? 'Click two points for a trendline' : 'Click a price for a horizontal line'}
        </div>
      )}
      <PriceLadder expiration={builder.expiration} legs={legs} />
    </div>
  );
}
