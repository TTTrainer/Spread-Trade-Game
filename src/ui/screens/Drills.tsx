import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  adaptiveWeights,
  dealQuestion,
  DRILL_INFO,
  DRILL_KINDS,
  gradeAnswer,
  releaseQuestion,
  SETUP_LABELS,
  summarize,
  type DrillAnswer,
  type DrillHistoryItem,
  type DrillKind,
  type DrillQuestion,
  type DrillResult,
} from '../../engine/drills/drills';
import type { WindowDef } from '../../engine/market/types';
import { BUCKET_GLYPHS, BUCKET_NAMES, CONFIDENCES, cutoffLabels, type Bucket } from '../../engine/scoring/calls';
import { Rng } from '../../engine/rng';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { ipcSource } from '../data/ipcSource';
import { Kbd, Meter, TiltCard } from '../components/ui';
import { MiniChart } from '../components/MiniChart';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import './screens.css';
import './drills.css';

const SESSION_LENGTH = 10;

type Mode = DrillKind | 'mixed';

async function loadHistory(): Promise<DrillHistoryItem[]> {
  if (!hasBridge()) return [];
  const rows = await bridge().invoke('user.drills');
  const out: DrillHistoryItem[] = [];
  for (const r of rows) {
    const results = (r.detail.results ?? []) as { kind: DrillKind; score: number; regime?: string }[];
    for (const x of results) out.push({ kind: x.kind, score: x.score, regime: x.regime });
  }
  return out;
}

export function DrillsScreen() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [history, setHistory] = useState<DrillHistoryItem[]>([]);
  const back = useApp((s) => s.back);
  useEffect(() => {
    void loadHistory().then(setHistory);
  }, [mode]);
  if (mode) return <DrillSession mode={mode} history={history} onExit={() => setMode(null)} />;
  const weights = adaptiveWeights(history);
  return (
    <div className="screen drills-menu" data-testid="drills-menu">
      <h1 className="screen-title">DRILLS</h1>
      <p className="screen-sub">Ten-question reps. Only drills adapt to your weak spots: the mixed session deals more of what you miss.</p>
      <div className="drill-grid">
        <TiltCard className="drill-card mixed" onClick={() => setMode('mixed')} testId="drill-mixed">
          <div className="drill-name">Adaptive Session</div>
          <div className="drill-blurb">10 mixed questions, weighted toward your weakest skills.</div>
          <div className="drill-weights num">
            {DRILL_KINDS.map((k) => (
              <div key={k}>
                {DRILL_INFO[k].skill}: <Meter value={weights[k]} max={1.4} tone="magenta" />
              </div>
            ))}
          </div>
        </TiltCard>
        {DRILL_KINDS.map((k) => {
          const xs = history.filter((h) => h.kind === k);
          const avg = xs.length ? xs.slice(-30).reduce((a, h) => a + h.score, 0) / Math.min(30, xs.length) : null;
          return (
            <TiltCard key={k} className="drill-card" onClick={() => setMode(k)} testId={`drill-${k}`}>
              <div className="drill-name">{DRILL_INFO[k].name}</div>
              <div className="drill-blurb">{DRILL_INFO[k].blurb}</div>
              <div className="num dim">
                {DRILL_INFO[k].skill} · {avg === null ? 'not tried yet' : `recent avg ${avg.toFixed(0)}`}
              </div>
            </TiltCard>
          );
        })}
      </div>
      <button className="pixel-btn" onClick={back}>
        ◀ BACK
      </button>
    </div>
  );
}

function DrillSession({ mode, history, onExit }: { mode: Mode; history: DrillHistoryItem[]; onExit: () => void }) {
  const settings = useApp((s) => s.settings);
  const toast = useApp((s) => s.toast);
  const src = useMemo(() => ipcSource(), []);
  const rng = useMemo(() => new Rng(`drill-${Date.now()}`), []);
  const [windows, setWindows] = useState<WindowDef[]>([]);
  const [q, setQ] = useState<DrillQuestion | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [results, setResults] = useState<DrillResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(60);
  const plan = useRef<DrillKind[]>([]);

  useEffect(() => {
    void src.windows({}).then((w) => {
      setWindows(w);
      const weights = adaptiveWeights(history);
      plan.current = Array.from({ length: SESSION_LENGTH }, () => (mode === 'mixed' ? rng.weighted(DRILL_KINDS, (k) => weights[k]) : mode));
    });
  }, []);

  const next = async () => {
    if (!windows.length) return;
    const i = results.length + (result ? 1 : 0);
    if (result) setResults((r) => [...r, result]);
    setResult(null);
    if (i >= SESSION_LENGTH) {
      setDone(true);
      return;
    }
    setLoading(true);
    try {
      const kind = plan.current[i];
      const question = await dealQuestion(kind, { source: src, windows, rng, allowFlip: settings.blind.flipDrills, history });
      setQ(question);
      setLeft(DRILL_INFO[kind].seconds);
      sfx('deal');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (windows.length && !q) void next();
  }, [windows]);

  const submit = async (a: DrillAnswer) => {
    if (!q || result) return;
    const r = await gradeAnswer(q, a);
    releaseQuestion(q.id);
    setResult(r);
    sfx(r.correct ? 'coin' : r.score > 40 ? 'click' : 'loss');
  };

  // Timer: running out submits a blank answer.
  useEffect(() => {
    if (!q || result || loading) return;
    if (left <= 0) {
      void submit(blankAnswer(q));
      return;
    }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left, q, result, loading]);

  useEffect(() => {
    if (!done) return;
    const all = [...results];
    const s = summarize(all);
    if (hasBridge())
      void bridge().invoke('user.recordDrill', {
        id: `drill-${Date.now()}`,
        kind: mode,
        at: new Date().toISOString(),
        score: s.avgScore,
        detail: { summary: s, results: all.map((r) => ({ kind: r.kind, score: r.score, correct: r.correct, regime: r.detail.regime ?? null, brier: r.brier ?? null, confidence: r.detail.confidence ?? null })) },
      });
    sfx('win');
  }, [done]);

  if (done) return <DrillSummaryView results={results} onExit={onExit} />;
  const index = results.length + 1;
  const streak = (() => {
    let s = 0;
    for (let i = results.length - 1; i >= 0 && results[i].correct; i--) s++;
    return s + (result?.correct ? 1 : 0);
  })();
  return (
    <div className="screen drill-session" data-testid="drill-session">
      <div className="drill-top num">
        <button className="pixel-btn" onClick={onExit}>
          ◀ QUIT
        </button>
        <span>
          {q ? DRILL_INFO[q.kind].name : 'Loading'} · question {Math.min(index, SESSION_LENGTH)}/{SESSION_LENGTH}
        </span>
        <span className="amber-text">streak {streak}</span>
        <div className="drill-timer">
          <Meter value={result ? 0 : left} max={q ? DRILL_INFO[q.kind].seconds : 60} tone={left < 10 ? 'down' : 'cyan'} label={result ? 'answered' : `${left}s`} testId="drill-timer" />
        </div>
      </div>
      {loading && <div className="drill-loading num">Dealing a question…</div>}
      {q && !loading && <QuestionView key={q.id} q={q} result={result} onSubmit={(a) => void submit(a)} />}
      {result && (
        <motion.div className={`drill-result panel ${result.correct ? 'good' : 'bad'}`} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="drill-result">
          <div className="dr-head">
            <span className={result.correct ? 'up' : 'down'}>{result.correct ? '▲ HIT' : '▼ MISS'}</span> <span className="num">score {result.score}</span>
            {q && q.realSymbol !== 'DRILL' && (
              <span className="dim num">
                {' '}
                · it was {q.realSymbol} on {q.date}
              </span>
            )}
          </div>
          <p>{result.explanation}</p>
          <button className="pixel-btn primary" onClick={() => void next()} data-testid="drill-next">
            {index >= SESSION_LENGTH ? 'FINISH' : 'NEXT'} <Kbd>Enter</Kbd>
          </button>
          <EnterToContinue onEnter={() => void next()} />
        </motion.div>
      )}
    </div>
  );
}

function EnterToContinue({ onEnter }: { onEnter: () => void }) {
  useHotkeys({ confirm: () => onEnter() });
  return null;
}

function blankAnswer(q: DrillQuestion): DrillAnswer {
  switch (q.kind) {
    case 'blind_call':
      return { kind: 'blind_call', bucket: null, confidence: 0.5 };
    case 'guess_iv':
      return { kind: 'guess_iv', iv: 0 };
    case 'greeks':
      return { kind: 'greeks', index: null };
    case 'setup':
      return { kind: 'setup', choice: null };
    case 'em_darts':
      return { kind: 'em_darts', low: 0, high: 0 };
  }
}

function QuestionView({ q, result, onSubmit }: { q: DrillQuestion; result: DrillResult | null; onSubmit: (a: DrillAnswer) => void }) {
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [conf, setConf] = useState(0.7);
  const [iv, setIv] = useState(0.35);
  const [range, setRange] = useState<{ low: number; high: number } | null>(null);
  const answered = !!result;
  const bars = answered && result.revealBars.length ? result.revealBars : q.bars;
  const revealFrom = answered && result.revealBars.length ? q.bars.length : undefined;

  useHotkeys(
    q.kind === 'blind_call' && !answered
      ? {
          bucket1: () => setBucket(0),
          bucket2: () => setBucket(1),
          bucket3: () => setBucket(2),
          bucket4: () => setBucket(3),
          bucket5: () => setBucket(4),
          conf1: () => setConf(0.5),
          conf2: () => setConf(0.6),
          conf3: () => setConf(0.7),
          conf4: () => setConf(0.8),
          conf5: () => setConf(0.9),
          confirm: () => bucket !== null && onSubmit({ kind: 'blind_call', bucket, confidence: conf }),
        }
      : {},
  );

  const chart = (extra: Partial<Parameters<typeof MiniChart>[0]> = {}) => (
    <MiniChart bars={bars} width={1100} height={q.kind === 'setup' ? 440 : 400} revealFrom={revealFrom} testId="drill-chart" {...extra} />
  );

  switch (q.kind) {
    case 'blind_call': {
      const labels = cutoffLabels({ emPct: q.emPct, mode: 'em' });
      return (
        <div className="question">
          <div className="q-prompt">
            <b>{q.displaySymbol}</b> {q.flipped && <span className="chip warn">MAYBE FLIPPED</span>} Where will it be in 10 trading days? Expected move ±{(q.emPct * 100).toFixed(1)}%.
          </div>
          {chart({ showBands: true })}
          <div className="q-answers">
            {([0, 1, 2, 3, 4] as Bucket[]).map((b) => (
              <TiltCard key={b} className={`call-card big b${b}`} selected={bucket === b} onClick={() => !answered && setBucket(b)} testId={`dcall-${b}`}>
                <div className="call-glyph">{BUCKET_GLYPHS[b]}</div>
                <div className="call-name">{BUCKET_NAMES[b]}</div>
                <div className="call-cut num">{labels[b]}</div>
              </TiltCard>
            ))}
            <div className="conf-col num">
              {CONFIDENCES.map((c) => (
                <button key={c} className={`conf-btn ${conf === c ? 'sel' : ''}`} onClick={() => setConf(c)}>
                  {Math.round(c * 100)}%
                </button>
              ))}
            </div>
            <button className="pixel-btn primary" disabled={answered || bucket === null} onClick={() => bucket !== null && onSubmit({ kind: 'blind_call', bucket, confidence: conf })} data-testid="drill-submit">
              LOCK IT IN <Kbd>Enter</Kbd>
            </button>
          </div>
        </div>
      );
    }
    case 'guess_iv':
      return (
        <div className="question">
          <div className="q-prompt">
            <b>{q.displaySymbol}</b>: the {q.strike} straddle for {q.dte} days costs <b className="amber-text">{(q.callMid + q.putMid).toFixed(2)}</b> (call {q.callMid.toFixed(2)}, put {q.putMid.toFixed(2)}). 20-day realized vol: {q.hv20 === null ? '—' : `${(q.hv20 * 100).toFixed(0)}%`}. What IV is the market charging?
          </div>
          {chart()}
          <div className="q-answers num">
            <input type="range" min={0.05} max={2} step={0.01} value={iv} onChange={(e) => setIv(Number(e.target.value))} disabled={answered} className="iv-slider" data-testid="iv-slider" />
            <span className="iv-guess">{Math.round(iv * 100)}%</span>
            <button className="pixel-btn primary" disabled={answered} onClick={() => onSubmit({ kind: 'guess_iv', iv })} data-testid="drill-submit">
              GUESS
            </button>
          </div>
        </div>
      );
    case 'greeks':
      return (
        <div className="question">
          <div className="q-prompt">{q.description}</div>
          <div className="greeks-card num">
            <div>Δ {q.greeks.delta.toFixed(1)}</div>
            <div>Γ {q.greeks.gamma.toFixed(2)}</div>
            <div>Θ {q.greeks.theta.toFixed(2)}/day</div>
            <div>Vega {q.greeks.vega.toFixed(2)}</div>
          </div>
          <div className="q-prompt">
            The stock moves <b>{q.move >= 0 ? '+' : ''}
            {q.move.toFixed(2)}</b> over <b>{q.days}</b> day{q.days > 1 ? 's' : ''} and IV changes <b>{q.ivPts >= 0 ? '+' : ''}
            {q.ivPts}</b> points. What is your P/L?
          </div>
          <div className="q-answers">
            {q.choices.map((c, i) => (
              <button
                key={i}
                className={`pixel-btn choice num ${answered && i === q.answerIndex ? 'right' : ''}`}
                disabled={answered}
                onClick={() => onSubmit({ kind: 'greeks', index: i })}
                data-testid={`choice-${i}`}
              >
                {c >= 0 ? '▲ +' : '▼ −'}${Math.abs(c)}
              </button>
            ))}
          </div>
        </div>
      );
    case 'setup':
      return (
        <div className="question">
          <div className="q-prompt">
            <b>{q.displaySymbol}</b>: which setup is on the chart right now?
          </div>
          {chart({ showBands: true, showSma: true, showRsi: true })}
          <div className="q-answers">
            {q.choices.map((c, i) => (
              <button key={c} className={`pixel-btn choice ${answered && c === q.answer ? 'right' : ''}`} disabled={answered} onClick={() => onSubmit({ kind: 'setup', choice: c })} data-testid={`choice-${i}`}>
                {SETUP_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      );
    case 'em_darts':
      return (
        <div className="question">
          <div className="q-prompt">
            <b>{q.displaySymbol}</b> at {q.spot.toFixed(2)}. The at-the-money straddle for {q.dte} days costs <b className="amber-text">{q.em.toFixed(2)}</b>. Drag on the chart to mark where it will finish.
          </div>
          {chart({ range, onRange: answered ? undefined : setRange, hLines: answered ? [{ price: q.spot + q.em, color: '#9d6bff', label: '+EM' }, { price: q.spot - q.em, color: '#9d6bff', label: '-EM' }] : [] })}
          <div className="q-answers num">
            <span>{range ? `${Math.min(range.low, range.high).toFixed(2)} – ${Math.max(range.low, range.high).toFixed(2)}` : 'drag a range on the chart'}</span>
            <button className="pixel-btn primary" disabled={answered || !range} onClick={() => range && onSubmit({ kind: 'em_darts', low: range.low, high: range.high })} data-testid="drill-submit">
              THROW
            </button>
          </div>
        </div>
      );
  }
}

function DrillSummaryView({ results, onExit }: { results: DrillResult[]; onExit: () => void }) {
  const s = summarize(results);
  return (
    <div className="screen drill-summary" data-testid="drill-summary">
      <h1 className="screen-title">DRILL COMPLETE</h1>
      <div className="summary-grid num">
        <div className="panel sum-box">
          <div className="section-title">Score</div>
          <div className="big-num">{s.avgScore.toFixed(0)}</div>
          <div>
            {s.correct}/{s.questions} hits · best streak {s.bestStreak}
          </div>
          {s.meanBrier !== null && <div>Brier {s.meanBrier.toFixed(3)} (lower is better)</div>}
        </div>
        <div className="panel sum-box">
          <div className="section-title">By skill</div>
          {Object.entries(s.byKind).map(([k, v]) => (
            <div key={k}>
              {DRILL_INFO[k as DrillKind].name}: {v?.avg.toFixed(0)} ({v?.n})
            </div>
          ))}
        </div>
        <div className="panel sum-box">
          <div className="section-title">Calibration (blind calls)</div>
          <svg width={260} height={160} className="calib">
            <line x1={20} y1={140} x2={250} y2={10} stroke="#5b4bc4" strokeDasharray="4 3" />
            {s.calibration.map((c) => {
              const cx = 20 + ((c.confidence - 0.4) / 0.6) * 230;
              const cy = 140 - c.hitRate * 130;
              return c.n > 0 ? <circle key={c.confidence} cx={cx} cy={cy} r={3 + c.n * 1.5} fill="#ffbf3e" /> : null;
            })}
            <text x={20} y={156} className="axis">
              50%
            </text>
            <text x={225} y={156} className="axis">
              90%
            </text>
          </svg>
          <div className="dim">Dots on the dashed line mean your confidence matches your hit rate.</div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="pixel-btn primary" onClick={onExit} data-testid="drill-exit">
          BACK TO DRILLS
        </button>
      </div>
    </div>
  );
}
