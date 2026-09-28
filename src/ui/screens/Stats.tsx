import { useEffect, useMemo, useState } from 'react';
import {
  breakdown,
  calibration,
  equityCurve,
  mistakeTrends,
  summarize,
  toCsv,
  type BreakdownKey,
  type LedgerTrade,
} from '../../engine/stats/stats';
import { MISTAKE_LABELS, type MistakeTag } from '../../engine/scoring/grade';
import { STRUCTURES } from '../../engine/strategies/structures';
import type { StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import type { TradeRow } from '../../shared/userData';
import { bridge, hasBridge } from '../bridge';
import { money, pct } from '../format';
import { Pnl } from '../components/ui';
import { useApp } from '../store/app';
import './screens.css';
import './stats.css';

/** Categorical slots validated against the dark chart surface (dataviz validator: all checks pass). */
const SERIES = ['#0e9fb4', '#bd7f16', '#e2358d', '#8d5df2', '#2a9f62'];
const MODES = ['all', 'career', 'daily', 'sandbox', 'live', 'contracts', 'tutorial'] as const;
const BREAKDOWNS: { key: BreakdownKey; label: string }[] = [
  { key: 'structure', label: 'Structure' },
  { key: 'desk', label: 'Desk' },
  { key: 'symbol', label: 'Ticker' },
  { key: 'vix', label: 'VIX regime' },
  { key: 'ivr', label: 'IV rank' },
  { key: 'trend', label: 'Trend' },
  { key: 'earnings', label: 'Earnings' },
];

function Tile({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="stat-tile panel" data-testid={testId}>
      <div className="section-title">{label}</div>
      <div className="tile-value num">{value}</div>
      {sub && <div className="tile-sub num">{sub}</div>}
    </div>
  );
}

function EquityChart({ rows }: { rows: LedgerTrade[] }) {
  const pts = useMemo(() => equityCurve(rows), [rows]);
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = 280;
  const pad = { l: 70, r: 110, t: 16, b: 28 };
  if (pts.length === 0) return <div className="empty num">No closed trades yet.</div>;
  const ys = pts.flatMap((p) => [p.cumCents, p.benchCents, 0]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const sx = (i: number) =>
    pad.l + (pts.length === 1 ? (W - pad.l - pad.r) / 2 : ((i - 1) / (pts.length - 1)) * (W - pad.l - pad.r));
  const sy = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const path = (f: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.index).toFixed(1)},${sy(f(p)).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  const hp = hover !== null ? pts[hover] : null;
  const ticks = [lo, lo + span / 2, hi];
  return (
    <div className="chart-box">
      <div className="legend num">
        <span>
          <i style={{ background: SERIES[0] }} /> Your P/L
        </span>
        <span>
          <i style={{ background: SERIES[1] }} /> Benchmark (same capital in SPY)
        </span>
      </div>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="stats-svg"
        data-testid="equity-chart"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((x - pad.l) / (W - pad.l - pad.r)) * (pts.length - 1));
          setHover(i >= 0 && i < pts.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="rgba(91,75,196,0.25)" />
            <text x={pad.l - 6} y={sy(v) + 4} textAnchor="end" className="axis">
              {money(Math.round(v))}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="#6c64a8" />
        <path d={path((p) => p.benchCents)} fill="none" stroke={SERIES[1]} strokeWidth={2} />
        <path d={path((p) => p.cumCents)} fill="none" stroke={SERIES[0]} strokeWidth={2} />
        <text x={sx(last.index) + 8} y={sy(last.cumCents) + 4} className="axis label">
          You {money(last.cumCents)}
        </text>
        <text x={sx(last.index) + 8} y={sy(last.benchCents) + 16} className="axis label">
          SPY {money(last.benchCents)}
        </text>
        <text x={pad.l} y={H - 8} className="axis">
          trade 1
        </text>
        <text x={W - pad.r} y={H - 8} textAnchor="end" className="axis">
          trade {pts.length}
        </text>
        {hp && (
          <g>
            <line
              x1={sx(hp.index)}
              x2={sx(hp.index)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="#ece9ff"
              strokeOpacity={0.35}
            />
            <circle
              cx={sx(hp.index)}
              cy={sy(hp.cumCents)}
              r={4}
              fill={SERIES[0]}
              stroke="#0b0826"
              strokeWidth={2}
            />
            <circle
              cx={sx(hp.index)}
              cy={sy(hp.benchCents)}
              r={4}
              fill={SERIES[1]}
              stroke="#0b0826"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {hp && (
        <div className="eq-tooltip num" data-testid="equity-tooltip">
          Trade {hp.index} · {hp.date} · You {money(hp.cumCents)} · SPY {money(hp.benchCents)} · alpha{' '}
          {money(hp.alphaCents, true)}
        </div>
      )}
    </div>
  );
}

function CalibrationChart({ rows }: { rows: LedgerTrade[] }) {
  const c = useMemo(() => calibration(rows), [rows]);
  const [tip, setTip] = useState<string | null>(null);
  const W = 320;
  const H = 240;
  const pad = 34;
  const sx = (x: number) => pad + ((x - 0.4) / 0.6) * (W - pad - 10);
  const sy = (y: number) => H - pad - y * (H - pad - 10);
  return (
    <div className="chart-box">
      <svg width={W} height={H} className="stats-svg" data-testid="calibration-chart">
        <line x1={sx(0.4)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="#6c64a8" strokeDasharray="4 3" />
        {[0, 0.5, 1].map((y) => (
          <text key={y} x={pad - 4} y={sy(y) + 4} textAnchor="end" className="axis">
            {Math.round(y * 100)}%
          </text>
        ))}
        {[0.5, 0.7, 0.9].map((x) => (
          <text key={x} x={sx(x)} y={H - pad + 16} textAnchor="middle" className="axis">
            {Math.round(x * 100)}%
          </text>
        ))}
        <text x={W / 2} y={H - 4} textAnchor="middle" className="axis">
          your confidence → hit rate
        </text>
        {c.points
          .filter((p) => p.n > 0)
          .map((p) => (
            <circle
              key={p.confidence}
              cx={sx(p.confidence)}
              cy={sy(p.hitRate)}
              r={Math.min(14, 5 + Math.sqrt(p.n) * 2)}
              fill={SERIES[2]}
              stroke="#0b0826"
              strokeWidth={2}
              onMouseEnter={() =>
                setTip(
                  `${Math.round(p.confidence * 100)}% calls: ${Math.round(p.hitRate * 100)}% exact over ${p.n}`,
                )
              }
              onMouseLeave={() => setTip(null)}
            />
          ))}
      </svg>
      <div className="num tile-sub">
        {tip ??
          (c.calls
            ? `${c.calls} calls · Brier ${c.meanBrier?.toFixed(3)} · grade ${c.grade}`
            : 'No calls recorded yet.')}
      </div>
    </div>
  );
}

function BreakdownTable({ rows, by }: { rows: LedgerTrade[]; by: BreakdownKey }) {
  const groups = useMemo(() => breakdown(rows, by), [rows, by]);
  const max = Math.max(1, ...groups.map((g) => Math.abs(g.summary.totalCents)));
  const label = (k: string) =>
    by === 'structure' && k in STRUCTURES ? STRUCTURES[k as StructureId].name : k;
  return (
    <table className="bd-table num" data-testid="breakdown-table">
      <thead>
        <tr>
          <th>{BREAKDOWNS.find((b) => b.key === by)?.label}</th>
          <th>Trades</th>
          <th>Win %</th>
          <th>Expectancy</th>
          <th>Profit factor</th>
          <th>Total P/L</th>
          <th className="bar-col" />
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.key}>
            <td>{label(g.key)}</td>
            <td>{g.summary.trades}</td>
            <td>{pct(g.summary.winRate, 0)}</td>
            <td>
              <Pnl cents={Math.round(g.summary.expectancyCents)} />
            </td>
            <td>{g.summary.profitFactor === null ? '∞' : g.summary.profitFactor.toFixed(2)}</td>
            <td>
              <Pnl cents={g.summary.totalCents} />
            </td>
            <td className="bar-col">
              <span className="bd-bar">
                <span
                  className={`bd-fill ${g.summary.totalCents >= 0 ? 'pos' : 'neg'}`}
                  style={{
                    width: `${(Math.abs(g.summary.totalCents) / max) * 50}%`,
                    [g.summary.totalCents >= 0 ? 'left' : 'right']: '50%',
                  }}
                />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MistakeHeat({ rows }: { rows: LedgerTrade[] }) {
  const m = useMemo(() => mistakeTrends(rows, 10, 8), [rows]);
  const tags = Object.keys(m.rates);
  if (tags.length === 0) return <div className="empty num">No mistake tags yet. Keep it that way.</div>;
  return (
    <table className="heat-table num" data-testid="mistake-heat">
      <thead>
        <tr>
          <th>Mistake</th>
          {m.blocks.map((b) => (
            <th key={b.label}>{b.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tags.map((t) => (
          <tr key={t}>
            <td>{MISTAKE_LABELS[t as MistakeTag] ?? t}</td>
            {m.rates[t].map((r, i) => (
              <td
                key={i}
                title={`${Math.round(r * 100)}% of trades ${m.blocks[i].label}`}
                style={{ background: `rgba(226,53,141,${0.08 + r * 0.8})` }}
              >
                {Math.round(r * 100)}%
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsScreen() {
  const back = useApp((s) => s.back);
  const toast = useApp((s) => s.toast);
  const [all, setAll] = useState<TradeRow[]>([]);
  const [mode, setMode] = useState<(typeof MODES)[number]>('all');
  const [by, setBy] = useState<BreakdownKey>('structure');
  useEffect(() => {
    if (hasBridge()) void bridge().invoke('user.trades').then(setAll);
  }, []);
  const rows: LedgerTrade[] = useMemo(
    () => (mode === 'all' ? all : all.filter((r) => r.mode === mode)),
    [all, mode],
  );
  const s = summarize(rows);
  const exportCsv = async () => {
    const path = await bridge().invoke('system.saveTextFile', 'spread-trading-trades.csv', toCsv(rows));
    if (path) {
      sfx('coin');
      toast(`Saved ${rows.length} trades to ${path}`, 'good');
    }
  };
  return (
    <div className="screen stats-screen" data-testid="stats-screen">
      <div className="stats-head">
        <h1 className="screen-title">STATS</h1>
        <div className="filters num">
          <span className="dim">Mode</span>
          <div className="seg">
            {MODES.map((m) => (
              <button
                key={m}
                className={mode === m ? 'sel' : ''}
                onClick={() => setMode(m)}
                data-testid={`mode-${m}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="pixel-btn"
            onClick={() => useApp.getState().go('achievements')}
            data-testid="open-achievements"
          >
            ACHIEVEMENTS
          </button>
          <button
            className="pixel-btn primary"
            onClick={() => void exportCsv()}
            disabled={rows.length === 0}
            data-testid="export-csv"
          >
            EXPORT CSV
          </button>
          <button className="pixel-btn" onClick={back}>
            ◀ BACK
          </button>
        </div>
      </div>
      <p className="screen-sub">
        From the real ledger only: every closed trade, as it actually filled. The arcade meter never touches
        these numbers.
      </p>
      <div className="tiles">
        <Tile
          label="Trades"
          value={s.trades}
          sub={`${s.wins} wins · ${s.losses} losses`}
          testId="tile-trades"
        />
        <Tile label="Win rate" value={pct(s.winRate, 0)} testId="tile-winrate" />
        <Tile
          label="Expectancy"
          value={<Pnl cents={Math.round(s.expectancyCents)} />}
          sub="per trade"
          testId="tile-expectancy"
        />
        <Tile
          label="Avg win / loss"
          value={
            <>
              <Pnl cents={Math.round(s.avgWinCents)} /> / <Pnl cents={Math.round(s.avgLossCents)} />
            </>
          }
        />
        <Tile
          label="Profit factor"
          value={s.profitFactor === null ? '∞' : s.profitFactor.toFixed(2)}
          sub="gross wins ÷ gross losses"
          testId="tile-pf"
        />
        <Tile
          label="Total P/L"
          value={<Pnl cents={s.totalCents} />}
          sub={`max drawdown ${money(s.maxDrawdownCents)}`}
        />
        <Tile
          label="Alpha vs SPY"
          value={<Pnl cents={s.alphaCents} />}
          sub={`benchmark ${money(s.benchmarkCents, true)}`}
          testId="tile-alpha"
        />
      </div>
      <div className="stats-grid">
        <div className="panel box">
          <div className="section-title">Equity curve vs benchmark</div>
          <EquityChart rows={rows} />
        </div>
        <div className="panel box">
          <div className="section-title">Calibration</div>
          <CalibrationChart rows={rows} />
        </div>
      </div>
      <div className="stats-grid">
        <div className="panel box">
          <div className="section-title">Breakdown</div>
          <div className="seg num" style={{ marginBottom: 6 }}>
            {BREAKDOWNS.map((b) => (
              <button
                key={b.key}
                className={by === b.key ? 'sel' : ''}
                onClick={() => setBy(b.key)}
                data-testid={`by-${b.key}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <BreakdownTable rows={rows} by={by} />
        </div>
        <div className="panel box">
          <div className="section-title">Mistake tags over time (per 10 trades)</div>
          <MistakeHeat rows={rows} />
        </div>
      </div>
    </div>
  );
}
