import {
  briefFromView,
  FULL_ACCESS,
  type BriefAccess,
  type Lean,
  type NewsBrief,
} from '../../engine/news/brief';
import { useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { rsi, sma } from '../../engine/market/indicators';
import type { TradingSession } from '../../engine/trading/session';
import { sfx } from '../../audio/sfx';
import { Modal } from '../components/ui';
import { liveCardId, useTrading } from '../store/trading';

const cache = new Map<string, NewsBrief | null>();

/** The brief for a card as of its current day (cached: it only changes when the day does). */
export function briefFor(
  session: TradingSession,
  cardId: string,
  access: BriefAccess = FULL_ACCESS,
): NewsBrief | null {
  const view = session.view(cardId);
  const key = `${session.config.seed}|${cardId}|${view.transform.displaySymbol}|${view.now}|${+access.earningsDetail}${+access.ivDetail}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (cache.size > 300) cache.clear();
  const bars = view.bars();
  let brief: NewsBrief | null = null;
  if (bars.length >= 2) {
    // Real companies by name get plain facts; codenames and invented companies get the satirical desk.
    const mode = session.config.blind || bars[bars.length - 1].source === 'synthetic' ? 'blind' : 'open';
    brief = briefFromView(view, { mode, access });
  }
  cache.set(key, brief);
  return brief;
}

const GLYPH: Record<Lean, string> = { 2: '▲▲', 1: '▲', 0: '◆', [-1]: '▼', [-2]: '▼▼' };
const SHORT: Record<Lean, string> = {
  2: 'BULLISH',
  1: 'LEANS BULL',
  0: 'MIXED',
  [-1]: 'LEANS BEAR',
  [-2]: 'BEARISH',
};
const leanClass = (l: Lean): string => (l > 0 ? 'up' : l < 0 ? 'down' : 'flat');
const why = (w: number): string => (w > 0 ? '▲' : '▼');

/** A lineup-card chip: the crowd's lean at a glance, with the reasons on hover. */
export function StreetChip({ brief }: { brief: NewsBrief }) {
  const s = brief.street;
  return (
    <span
      className={`chip street ${leanClass(s.lean)}`}
      data-testid="street-chip"
      data-tip-title={`Street read: ${s.label}`}
      data-tip-body={`${s.reasons.map((r) => `${why(r.weight)} ${r.text}.`).join(' ')} The crowd's view from the news, the trend and the market as of today. It is not a promise.`}
    >
      {GLYPH[s.lean]} {SHORT[s.lean]}
    </span>
  );
}

function agoText(n: number): string {
  return n === 0 ? 'TODAY' : `${n}D AGO`;
}

/** The numbers behind the brief's widgets, read from the same time-gated view. */
export interface BriefVisuals {
  closes: number[];
  /** Up to a year of closes, for the big brief. */
  year: number[];
  spot: number;
  hi52: number;
  lo52: number;
  chg20: number | null;
  rsi: number | null;
  sma50: number | null;
  sma200: number | null;
  bench: number[];
  bench20: number | null;
  vix: number | null;
  vixCloses: number[];
  iv30: number | null;
  hv20: number | null;
  ivr: number | null;
}

const vcache = new Map<string, BriefVisuals | null>();

export function briefVisuals(session: TradingSession, cardId: string): BriefVisuals | null {
  const view = session.view(cardId);
  const key = `${session.config.seed}|${cardId}|${view.transform.displaySymbol}|${view.now}`;
  if (vcache.has(key)) return vcache.get(key) ?? null;
  if (vcache.size > 300) vcache.clear();
  const bars = view.bars();
  if (bars.length < 2) {
    vcache.set(key, null);
    return null;
  }
  const all = bars.map((b) => b.close);
  const year = bars.slice(-252);
  const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];
  const bench = view.benchmarkBars().map((b) => b.close);
  const vix = view.vix().map((v) => v.close);
  const vol = last(view.vol());
  const pctOver = (xs: number[], n: number) =>
    xs.length > n ? xs[xs.length - 1] / xs[xs.length - 1 - n] - 1 : null;
  const out: BriefVisuals = {
    closes: all.slice(-60),
    year: all.slice(-252),
    spot: all[all.length - 1],
    hi52: Math.max(...year.map((b) => b.high)),
    lo52: Math.min(...year.map((b) => b.low)),
    chg20: pctOver(all, 20),
    rsi: last(rsi(all, 14)) ?? null,
    sma50: last(sma(all, 50)) ?? null,
    sma200: last(sma(all, 200)) ?? null,
    bench: bench.slice(-40),
    bench20: pctOver(bench, 20),
    vix: last(vix) ?? null,
    vixCloses: vix.slice(-40),
    iv30: vol?.iv30 ?? null,
    hv20: vol?.hv20 ?? null,
    ivr: vol?.ivr ?? null,
  };
  vcache.set(key, out);
  return out;
}

/** A tiny line of closes; the last point glows. */
export function Sparkline({
  values,
  height = 34,
  marks,
}: {
  values: number[];
  height?: number;
  marks?: number[];
}) {
  if (values.length < 2) return <div className="bspark" style={{ height }} />;
  const lo = Math.min(...values, ...(marks ?? []));
  const hi = Math.max(...values, ...(marks ?? []));
  const W = 100;
  const y = (v: number) => (hi === lo ? height / 2 : 2 + (1 - (v - lo) / (hi - lo)) * (height - 4));
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      className={`bspark ${up ? 'up' : 'down'}`}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
    >
      {marks?.map((m) => (
        <line key={m} x1={0} x2={W} y1={y(m)} y2={y(m)} className="bspark-mark" />
      ))}
      <polyline points={`0,${height} ${pts} ${W},${height}`} className="bspark-area" />
      <polyline points={pts} className="bspark-line" vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={y(values[values.length - 1])} r={2.2} className="bspark-dot" />
    </svg>
  );
}

/** A 0..1 bar with optional zone shading and a marker. */
function Meter({
  at,
  zones,
  cls = '',
  labels,
}: {
  at: number;
  zones?: { from: number; to: number; cls: string }[];
  cls?: string;
  labels?: [string, string];
}) {
  const x = Math.max(0, Math.min(1, at));
  return (
    <div className={`bm ${cls}`}>
      <div className="bm-track">
        {zones?.map((z) => (
          <span
            key={z.cls + z.from}
            className={`bm-zone ${z.cls}`}
            style={{ left: `${z.from * 100}%`, width: `${(z.to - z.from) * 100}%` }}
          />
        ))}
        <span className="bm-fill" style={{ width: `${x * 100}%` }} />
        <span className="bm-mark" style={{ left: `${x * 100}%` }} />
      </div>
      {labels && (
        <div className="bm-labels num">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

const sgn = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;

function StreetWidget({ b, v, big }: { b: NewsBrief; v?: BriefVisuals; big?: boolean }) {
  const s = b.street;
  // The score runs roughly −4..+4; the needle sits on the same scale as the five labels.
  const at = (Math.max(-4, Math.min(4, s.score)) + 4) / 8;
  return (
    <div className={`bw bw-street ${leanClass(s.lean)}`} data-tip="g:street_read" data-testid="bw-street">
      <div className="bw-k">STREET READ · {b.symbol}</div>
      <div className="brief-lean">
        <span className="brief-glyph">{GLYPH[s.lean]}</span> {s.label}
      </div>
      <div className="street-gauge" aria-hidden="true">
        {([-2, -1, 0, 1, 2] as Lean[]).map((l) => (
          <span key={l} className={`sg-seg ${leanClass(l)} ${l === s.lean ? 'on' : ''}`} />
        ))}
        <span className="sg-needle" style={{ left: `${at * 100}%` }} />
      </div>
      <ul className="brief-reasons">
        {s.reasons.slice(0, big ? 6 : 3).map((r) => (
          <li key={r.text} className={r.weight > 0 ? 'up' : 'down'}>
            <span className="rglyph">{why(r.weight)}</span> {r.text}
          </li>
        ))}
        {s.reasons.length === 0 && <li className="dim">Nothing stands out either way.</li>}
      </ul>
      {big && v && (
        <div className="bw-year">
          <div className="bw-sub num">
            {v.year.length >= 200 ? 'ONE YEAR' : `${v.year.length} DAYS`} · dashed: 50- and 200-day averages
          </div>
          <Sparkline
            values={v.year}
            height={120}
            marks={[v.sma50, v.sma200].filter((x): x is number => x !== null)}
          />
        </div>
      )}
    </div>
  );
}

function PriceWidget({ v, b }: { v: BriefVisuals; b: NewsBrief }) {
  const pos = v.hi52 > v.lo52 ? (v.spot - v.lo52) / (v.hi52 - v.lo52) : 0.5;
  return (
    <div
      className="bw"
      data-tip-title="The stock"
      data-tip-body={`${b.trend.join('. ')}. The line is the last 60 days (dashed: the 50-day average); the number is the change over the last 20.`}
      data-testid="bw-price"
    >
      <div className="bw-k">
        PRICE
        {v.chg20 !== null && (
          <span className={`bw-num ${v.chg20 >= 0 ? 'up' : 'down'}`}>
            {v.chg20 >= 0 ? '▲' : '▼'} {sgn(v.chg20)}
          </span>
        )}
      </div>
      <Sparkline values={v.closes} marks={v.sma50 !== null ? [v.sma50] : undefined} />
      <div className="bw-sub num">52-WEEK RANGE</div>
      <Meter at={pos} cls="range" labels={[v.lo52.toFixed(0), v.hi52.toFixed(0)]} />
    </div>
  );
}

function MomentumWidget({ v }: { v: BriefVisuals }) {
  const r = v.rsi;
  const trendChip = (label: string, avg: number | null) =>
    avg === null ? null : (
      <span className={`trend-chip ${v.spot >= avg ? 'up' : 'down'}`}>
        {v.spot >= avg ? '▲' : '▼'} {label}
      </span>
    );
  return (
    <div
      className="bw"
      data-tip-title="Momentum"
      data-tip-body="RSI over 70 is stretched up (overbought), under 30 stretched down (oversold). The chips show whether the price sits above or below its 50- and 200-day averages."
      data-testid="bw-momentum"
    >
      <div className="bw-k">
        RSI 14
        {r !== null && (
          <span className={`bw-num ${r >= 70 ? 'down' : r <= 30 ? 'up' : ''}`}>{r.toFixed(0)}</span>
        )}
      </div>
      {r !== null ? (
        <Meter
          at={r / 100}
          cls="rsi"
          zones={[
            { from: 0, to: 0.3, cls: 'z-low' },
            { from: 0.7, to: 1, cls: 'z-high' },
          ]}
          labels={[r <= 30 ? 'OVERSOLD' : '30', r >= 70 ? 'OVERBOUGHT' : '70']}
        />
      ) : (
        <div className="dim small">Not enough history.</div>
      )}
      <div className="trend-chips num">
        {trendChip('50D', v.sma50)}
        {trendChip('200D', v.sma200)}
      </div>
    </div>
  );
}

function VolWidget({ v, b, access }: { v: BriefVisuals; b: NewsBrief; access: BriefAccess }) {
  const em = v.iv30 !== null ? v.iv30 * Math.sqrt(30 / 365) : null;
  const top = Math.max(v.iv30 ?? 0, v.hv20 ?? 0, 0.01) * 1.15;
  return (
    <div
      className="bw"
      data-tip-title="Options"
      data-tip-body={b.options ?? 'No options read yet.'}
      data-testid="bw-vol"
    >
      <div className="bw-k">
        MONTH MOVE
        {em !== null && <span className="bw-num amber-text">±{(em * 100).toFixed(1)}%</span>}
      </div>
      {access.ivDetail ? (
        <>
          {v.ivr !== null && (
            <>
              <div className="bw-sub num">
                IV RANK <b className={v.ivr >= 50 ? 'amber-text' : ''}>{v.ivr.toFixed(0)}</b>
                <span className="dim">{v.ivr >= 50 ? ' rich' : v.ivr <= 20 ? ' cheap' : ''}</span>
              </div>
              <Meter at={v.ivr / 100} cls="ivr" zones={[{ from: 0.5, to: 1, cls: 'z-rich' }]} />
            </>
          )}
          {v.iv30 !== null && v.hv20 !== null && (
            <div className="ivhv num">
              <div>
                <span>IMPLIED</span>
                <i style={{ width: `${(v.iv30 / top) * 100}%` }} className="iv" />
                <b>{(v.iv30 * 100).toFixed(0)}</b>
              </div>
              <div>
                <span>ACTUAL</span>
                <i style={{ width: `${(v.hv20 / top) * 100}%` }} className="hv" />
                <b>{(v.hv20 * 100).toFixed(0)}</b>
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="bw-lock num"
          data-tip-title="Locked"
          data-tip-body="Hire a volatility analyst to see IV rank and implied against actual movement."
        >
          ⚿ IV DETAIL · ANALYST
        </div>
      )}
    </div>
  );
}

function MarketWidget({ v, b }: { v: BriefVisuals; b: NewsBrief }) {
  const vix = v.vix;
  const mood = vix === null ? '' : vix < 15 ? 'calm' : vix < 22 ? 'normal' : vix < 30 ? 'jumpy' : 'panic';
  return (
    <div
      className="bw"
      data-tip-title="The market"
      data-tip-body={`${b.market.text} VIX is the market's fear gauge: under 15 is calm, over 25 is scared.`}
      data-testid="bw-market"
    >
      <div className="bw-k">
        MARKET
        {v.bench20 !== null && (
          <span className={`bw-num ${v.bench20 >= 0 ? 'up' : 'down'}`}>
            {v.bench20 >= 0 ? '▲' : '▼'} {sgn(v.bench20)}
          </span>
        )}
      </div>
      <Sparkline values={v.bench} height={26} />
      {vix !== null && (
        <>
          <div className="bw-sub num">
            VIX <b className={`vix-${mood}`}>{vix.toFixed(1)}</b> <span className="dim">{mood}</span>
          </div>
          <Meter
            at={Math.min(1, (vix - 10) / 30)}
            cls="vix"
            zones={[
              { from: 0, to: 5 / 30, cls: 'z-calm' },
              { from: 12 / 30, to: 1, cls: 'z-fear' },
            ]}
          />
        </>
      )}
    </div>
  );
}

const EV_GLYPH: Record<string, string> = { earnings: 'E', exdiv: 'D', FOMC: 'F', CPI: 'C' };

/** What's scheduled, on a line of days, with your trade's expiration laid over it. */
function Timeline({
  b,
  expDays,
  posDays,
  list = false,
}: {
  b: NewsBrief;
  expDays: number | null;
  posDays: number[];
  list?: boolean;
}) {
  const span = Math.min(70, Math.max(35, (expDays ?? 0) + 7, ...posDays.map((d) => d + 5)));
  const x = (d: number) => `${Math.max(0, Math.min(1, d / span)) * 100}%`;
  const inside = b.upcoming.filter((u) => expDays !== null && u.inDays <= expDays);
  // Events close together stack on two lanes so none hides another.
  const lanes: number[] = [];
  b.upcoming.forEach((u, i) => {
    const prev = b.upcoming[i - 1];
    lanes.push(prev && (u.inDays - prev.inDays) / span < 0.07 ? 1 - lanes[i - 1] : 0);
  });
  return (
    <div className="bw bw-wide" data-tip="g:brief_upcoming" data-testid="bw-timeline">
      <div className="bw-k">
        COMING UP
        {inside.some((u) => u.kind === 'earnings') && (
          <span className="bw-num warn-text">⚠ EARNINGS INSIDE YOUR TRADE</span>
        )}
      </div>
      <div className="tl">
        <div className="tl-axis" />
        {expDays !== null && (
          <div className="tl-trade" style={{ width: x(expDays) }}>
            <span className="tl-exp num">EXP {expDays}d</span>
          </div>
        )}
        {posDays.map((d, i) => (
          <span
            key={i}
            className="tl-pos"
            style={{ left: x(d) }}
            title={`An open position expires in ${d} days`}
          />
        ))}
        {b.upcoming.map((u, i) => (
          <span
            key={u.kind + u.inDays}
            className={`tl-ev ev-${u.kind} lane${lanes[i]} ${expDays !== null && u.inDays <= expDays ? 'inside' : ''}`}
            style={{ left: x(u.inDays) }}
            data-tip-title={u.kind === 'earnings' ? 'Earnings' : u.kind === 'exdiv' ? 'Ex-dividend' : u.kind}
            data-tip-body={u.text}
          >
            {EV_GLYPH[u.kind]}
          </span>
        ))}
        <span className="tl-tick num" style={{ left: 0 }}>
          TODAY
        </span>
        <span className="tl-tick num end">{span}d</span>
      </div>
      {b.upcoming.length === 0 && <div className="dim small">Nothing scheduled.</div>}
      {list &&
        b.upcoming.map((u) => (
          <div key={u.kind + u.inDays} className={`brief-ev ${u.kind === 'earnings' ? 'warn' : ''}`}>
            <span className="tl-ev-inline num">{EV_GLYPH[u.kind]}</span> {u.text}
          </div>
        ))}
    </div>
  );
}

function NewsFeed({ b, max }: { b: NewsBrief; max: number }) {
  return (
    <div className="bw bw-wide" data-testid="bw-news">
      <div className="bw-k" data-tip="g:brief_news">
        NEWS · 30 DAYS
      </div>
      {b.headlines.length === 0 && <div className="brief-v dim">A quiet month. No headlines.</div>}
      {b.headlines.slice(0, max).map((h, i) => (
        <div key={`${h.ago}-${h.kind}-${i}`} className={`brief-news ${h.tone}`} data-testid="brief-headline">
          <span className="news-ago num">
            {h.tone === 'up' ? '▲' : h.tone === 'down' ? '▼' : '•'} {agoText(h.ago)}
          </span>
          <span className="news-text">{h.text}</span>
        </div>
      ))}
      {b.headlines.length > max && (
        <div className="dim small num">+{b.headlines.length - max} more · expand ⤢</div>
      )}
    </div>
  );
}

function useTradeDays(): { expDays: number | null; posDays: number[] } {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const exp = useTrading((s) => s.builder.expiration);
  if (!session || !cardId) return { expDays: null, posDays: [] };
  const now = session.view(cardId).now;
  const posDays = session
    .openPositions()
    .filter((p) => p.cardId === cardId)
    .flatMap((p) => p.legs.filter((l) => l.kind === 'option').map((l) => diffDays(now, l.expiration)))
    .filter((d, i, a) => a.indexOf(d) === i);
  return { expDays: exp ? diffDays(now, exp) : null, posDays };
}

export function NewsBriefPanel({ access = FULL_ACCESS }: { access?: BriefAccess }) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const [big, setBig] = useState(false);
  useTrading((s) => s.version);
  const days = useTradeDays();
  if (!session || !cardId) return null;
  const b = briefFor(session, cardId, access);
  const v = briefVisuals(session, cardId);
  if (!b || !v) return <div className="brief dim num">No news yet.</div>;
  return (
    <div className="brief" data-testid="news-brief">
      <button
        className="brief-expand num"
        onClick={() => {
          sfx('select');
          setBig(true);
        }}
        data-testid="brief-expand"
        data-tip-title="Expand the brief"
        data-tip-body="The whole brief on one big screen: every widget, every headline and the notes behind them."
      >
        ⤢
      </button>
      <StreetWidget b={b} />
      <div className="bw-grid">
        <PriceWidget v={v} b={b} />
        <MomentumWidget v={v} />
        <VolWidget v={v} b={b} access={access} />
        <MarketWidget v={v} b={b} />
      </div>
      <Timeline b={b} {...days} />
      <NewsFeed b={b} max={3} />
      {big && (
        <Modal onClose={() => setBig(false)} wide testId="brief-big">
          <div className="brief big">
            <h2>
              Morning brief · {b.symbol} <span className="num dim">{v.spot.toFixed(2)}</span>
            </h2>
            <div className="bw-big-grid">
              <StreetWidget b={b} v={v} big />
              <div className="bw-grid">
                <PriceWidget v={v} b={b} />
                <MomentumWidget v={v} />
                <VolWidget v={v} b={b} access={access} />
                <MarketWidget v={v} b={b} />
              </div>
              <Timeline b={b} {...days} list />
              <NewsFeed b={b} max={12} />
              <div className="bw bw-wide bw-notes">
                <div className="bw-k">NOTES</div>
                {[...b.trend, b.market.text, ...(b.options ? [b.options] : [])].map((t) => (
                  <div key={t} className="brief-v">
                    · {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
