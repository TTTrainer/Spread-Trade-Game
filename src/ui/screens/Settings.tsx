import { useEffect, useState } from 'react';
import { DEFAULT_HOTKEYS, HOTKEY_LABELS, type HotkeyAction, type Settings } from '../../shared/settings';
import type { DecisionKind } from '../../engine/lifecycle/types';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { eventToBinding } from '../hotkeys';
import { useApp } from '../store/app';
import { Modal } from '../components/ui';
import './screens.css';
import './settings.css';

type Section = 'game' | 'realism' | 'display' | 'audio' | 'hotkeys' | 'data';

const DP_LABELS: Record<DecisionKind, string> = {
  target_hit: 'Profit target hit',
  stop_hit: 'Stop hit',
  short_touched: 'Short strike touched',
  dte21: '21 days to expiration',
  earnings_tomorrow: 'Earnings tomorrow',
  exdiv_itm_call: 'Ex-dividend with an ITM short call',
  pin_risk: 'Pin risk at expiration',
  assigned_shares: 'Assigned shares',
};

function Toggle({
  label,
  value,
  onChange,
  hint,
  testId,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  testId?: string;
}) {
  return (
    <label className="set-row toggle" title={hint}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          sfx('click');
          onChange(e.target.checked);
        }}
        data-testid={testId}
      />
      <span>{label}</span>
      {hint && <span className="dim hint">{hint}</span>}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  testId?: string;
}) {
  return (
    <label className="set-row slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
      />
      <span className="num val">{fmt ? fmt(value) : value}</span>
    </label>
  );
}

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const back = useApp((s) => s.back);
  const [section, setSection] = useState<Section>('game');
  const set = (f: (s: Settings) => Settings) => update(f);
  return (
    <div className="screen settings-screen" data-testid="settings-screen">
      <div className="set-head">
        <h1 className="screen-title">SETTINGS</h1>
        <button className="pixel-btn" onClick={back}>
          ◀ BACK
        </button>
      </div>
      <div className="set-layout">
        <nav className="set-nav">
          {(['game', 'realism', 'display', 'audio', 'hotkeys', 'data'] as Section[]).map((s) => (
            <button
              key={s}
              className={`pixel-btn ${section === s ? 'primary' : ''}`}
              onClick={() => setSection(s)}
              data-testid={`set-${s}`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </nav>
        <div className="panel set-body">
          {section === 'game' && (
            <>
              <Slider
                label="Starting capital"
                value={settings.game.startingCapitalCents / 100}
                min={1000}
                max={100000}
                step={500}
                onChange={(v) => set((s) => ({ ...s, game: { ...s.game, startingCapitalCents: v * 100 } }))}
                fmt={(v) => `$${v.toLocaleString('en-US')}`}
                testId="set-capital"
              />
              <Slider
                label="Default short-strike delta"
                value={settings.game.shortDelta}
                min={0.1}
                max={0.45}
                step={0.01}
                onChange={(v) => set((s) => ({ ...s, game: { ...s.game, shortDelta: v } }))}
                fmt={(v) => `${Math.round(v * 100)}Δ`}
              />
              <Slider
                label="Fast-forward speed (seconds per day)"
                value={settings.game.ffSecondsPerDay}
                min={0.15}
                max={1}
                step={0.05}
                onChange={(v) => set((s) => ({ ...s, game: { ...s.game, ffSecondsPerDay: v } }))}
                fmt={(v) => v.toFixed(2)}
              />
              <div className="set-row">
                <span>Call buckets</span>
                <div className="seg num">
                  <button
                    className={settings.game.bucketMode === 'em' ? 'sel' : ''}
                    onClick={() => set((s) => ({ ...s, game: { ...s.game, bucketMode: 'em' } }))}
                  >
                    SCALED TO EXPECTED MOVE
                  </button>
                  <button
                    className={settings.game.bucketMode === 'fixed' ? 'sel' : ''}
                    onClick={() => set((s) => ({ ...s, game: { ...s.game, bucketMode: 'fixed' } }))}
                  >
                    FIXED ±1% / ±5%
                  </button>
                </div>
              </div>
              <Toggle
                label="Pure Market (no ARCADE cartridges)"
                value={settings.game.pureMarket}
                onChange={(v) => set((s) => ({ ...s, game: { ...s.game, pureMarket: v } }))}
                hint="Only powerups that mirror real edges"
                testId="set-pure"
              />
              <div className="section-title">Decision points that pause the fast-forward</div>
              {(Object.keys(DP_LABELS) as DecisionKind[]).map((k) => (
                <Toggle
                  key={k}
                  label={DP_LABELS[k]}
                  value={settings.game.pause[k]}
                  onChange={(v) =>
                    set((s) => ({ ...s, game: { ...s.game, pause: { ...s.game.pause, [k]: v } } }))
                  }
                />
              ))}
            </>
          )}
          {section === 'realism' && (
            <>
              <p className="dim">
                Each rule is its own toggle. Defined-risk collateral is always enforced; nothing in the game
                has undefined risk.
              </p>
              <Toggle
                label="Bid/ask spreads"
                value={settings.realism.bidAsk}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, bidAsk: v } }))}
                hint="Off: everything fills at mid"
                testId="set-bidask"
              />
              <Toggle
                label="Earnings gaps and IV crush"
                value={settings.realism.earnings}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, earnings: v } }))}
              />
              <Toggle
                label="Early assignment"
                value={settings.realism.earlyAssignment}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, earlyAssignment: v } }))}
              />
              <Toggle
                label="Expiration mechanics (assignment into shares, pin risk)"
                value={settings.realism.expirationMechanics}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, expirationMechanics: v } }))}
              />
              <Toggle
                label="Pattern day trader rule"
                value={settings.realism.pdt}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, pdt: v } }))}
              />
              <Toggle
                label="Fees ($0.65 per contract)"
                value={settings.realism.fees}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, fees: v } }))}
                testId="set-fees"
              />
              <Toggle
                label="Liquidity limits"
                value={settings.realism.liquidityLimits}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, liquidityLimits: v } }))}
                hint="At most 10 contracts per order; legs with a bid/ask wider than 50% of mid refuse to trade"
              />
              <Toggle
                label="Taxes (short-term gains estimate)"
                value={settings.realism.taxes}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, taxes: v } }))}
                hint="Career sets aside 24% of each round's net gain from your equity"
              />
              <Toggle
                label="Broker approval levels"
                value={settings.realism.approvalLevels}
                onChange={(v) => set((s) => ({ ...s, realism: { ...s.realism, approvalLevels: v } }))}
                hint="Spreads need a Level 3 margin account ($2,000 minimum equity)"
              />
              <div className="section-title">Blind transforms</div>
              <Toggle
                label="Rescale prices in blind mode (split-style)"
                value={settings.blind.rescale}
                onChange={(v) => set((s) => ({ ...s, blind: { ...s.blind, rescale: v } }))}
              />
              <Toggle
                label="Allow flipped charts in drills"
                value={settings.blind.flipDrills}
                onChange={(v) => set((s) => ({ ...s, blind: { ...s.blind, flipDrills: v } }))}
              />
              <Toggle
                label="Synthetic markets in Endless and drills"
                value={settings.blind.synthetic}
                onChange={(v) => set((s) => ({ ...s, blind: { ...s.blind, synthetic: v } }))}
              />
            </>
          )}
          {section === 'display' && (
            <>
              <Slider
                label="CRT scanlines"
                value={settings.display.crt}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set((s) => ({ ...s, display: { ...s.display, crt: v } }))}
                fmt={(v) => `${Math.round(v * 100)}%`}
                testId="set-crt"
              />
              <Slider
                label="UI scale"
                value={settings.display.uiScale}
                min={0.85}
                max={1.3}
                step={0.05}
                onChange={(v) => set((s) => ({ ...s, display: { ...s.display, uiScale: v } }))}
                fmt={(v) => `${Math.round(v * 100)}%`}
              />
              <Toggle
                label="Screen shake"
                value={settings.display.shake}
                onChange={(v) => set((s) => ({ ...s, display: { ...s.display, shake: v } }))}
              />
              <Toggle
                label="Reduced motion"
                value={settings.display.reducedMotion}
                onChange={(v) => set((s) => ({ ...s, display: { ...s.display, reducedMotion: v } }))}
              />
              <Toggle
                label="Colorblind-safe palette (blue/orange P/L)"
                value={settings.display.colorblind}
                onChange={(v) => set((s) => ({ ...s, display: { ...s.display, colorblind: v } }))}
                testId="set-colorblind"
              />
              <div className="set-row">
                <span>Terminal theme</span>
                <div className="seg num">
                  {(['indigo', 'amber', 'phosphor'] as const).map((t) => (
                    <button
                      key={t}
                      className={settings.display.theme === t ? 'sel' : ''}
                      onClick={() => set((s) => ({ ...s, display: { ...s.display, theme: t } }))}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <p className="num">
                Preview: <span className="up">▲ +$123.45</span> <span className="down">▼ −$67.89</span>
              </p>
            </>
          )}
          {section === 'audio' && (
            <>
              <Slider
                label="Master"
                value={settings.audio.master}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set((s) => ({ ...s, audio: { ...s.audio, master: v } }))}
                fmt={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Music"
                value={settings.audio.music}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set((s) => ({ ...s, audio: { ...s.audio, music: v } }))}
                fmt={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Sound effects"
                value={settings.audio.sfx}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => {
                  set((s) => ({ ...s, audio: { ...s.audio, sfx: v } }));
                  sfx('coin');
                }}
                fmt={(v) => `${Math.round(v * 100)}%`}
              />
              <div className="set-row">
                <span>Music style</span>
                <div className="seg num">
                  {(['synthwave', 'darkwave', 'chiptune'] as const).map((t) => (
                    <button
                      key={t}
                      className={settings.audio.style === t ? 'sel' : ''}
                      onClick={() => set((s) => ({ ...s, audio: { ...s.audio, style: t } }))}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {section === 'hotkeys' && <HotkeyEditor />}
          {section === 'data' && <DataPanel />}
        </div>
      </div>
    </div>
  );
}

function HotkeyEditor() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const [listening, setListening] = useState<HotkeyAction | null>(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const b = eventToBinding(e);
      if (b !== 'Escape') update((s) => ({ ...s, hotkeys: { ...s.hotkeys, [listening]: b } }));
      sfx('select');
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);
  const dupes = new Map<string, number>();
  for (const v of Object.values(settings.hotkeys)) dupes.set(v, (dupes.get(v) ?? 0) + 1);
  return (
    <>
      <div className="set-row">
        <span className="dim">Click a binding, then press the new key (Esc cancels).</span>
        <button
          className="pixel-btn"
          onClick={() => update((s) => ({ ...s, hotkeys: { ...DEFAULT_HOTKEYS } }))}
          data-testid="reset-hotkeys"
        >
          RESET TO THINKORSWIM DEFAULTS
        </button>
      </div>
      <div className="hotkey-grid num">
        {(Object.keys(HOTKEY_LABELS) as HotkeyAction[]).map((a) => (
          <div key={a} className="hk-row">
            <span>{HOTKEY_LABELS[a]}</span>
            <button
              className={`hk-btn ${listening === a ? 'listening' : ''} ${(dupes.get(settings.hotkeys[a]) ?? 0) > 1 ? 'dupe' : ''}`}
              onClick={() => setListening(a)}
              data-testid={`hk-${a}`}
            >
              {listening === a ? 'press a key…' : settings.hotkeys[a]}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function DataPanel() {
  const data = useApp((s) => s.data);
  const refresh = useApp((s) => s.refreshData);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; fraction: number; log: string[] }>({
    stage: '',
    fraction: 0,
    log: [],
  });
  const [report, setReport] = useState<string | null>(null);
  const [diskAsk, setDiskAsk] = useState<string | null>(null);
  useEffect(() => {
    if (!hasBridge()) return;
    return bridge().on('data.progress', (p) =>
      setProgress((cur) =>
        p.fraction < 0
          ? { ...cur, log: [...cur.log.slice(-8), p.message] }
          : { ...cur, stage: p.stage, fraction: p.fraction },
      ),
    );
  }, []);
  const run = async (mode: 'synthetic' | 'real' | 'sync', confirmLowDisk = false) => {
    setBusy(true);
    const r = await bridge().invoke('data.build', { mode, allowDownload: true, confirmLowDisk });
    setBusy(false);
    if (r.needsDiskConfirm) setDiskAsk(r.message);
    else toast(r.message, r.ok ? 'good' : 'warn');
    await refresh();
  };
  return (
    <>
      <div className="data-status num">
        <div>
          Market data:{' '}
          <b className="amber-text">
            {data ? (data.kind === 'synthetic' ? 'SIM (fictional companies)' : 'REAL') : '…'}
          </b>
        </div>
        <div>{data ? `${data.symbols} tickers through ${data.lastDate}` : ''}</div>
        <div className="dim">
          game.db: {data?.gameDbPath} {data?.gameDbExists ? '' : '(not built yet)'}
        </div>
        {data?.notes.map((n) => (
          <div key={n} className="dim">
            {n}
          </div>
        ))}
      </div>
      <p>
        <b>Build real market data</b> downloads about 16 GB from DoltHub (free, public options data) the first
        time, takes a few hours, and needs about 40 GB free. The game can fetch the Dolt tool by itself. You
        can keep playing the SIM market meanwhile.
      </p>
      <div className="modal-actions">
        <button
          className="pixel-btn primary"
          disabled={busy}
          onClick={() => void run('real')}
          data-testid="build-real"
        >
          BUILD REAL DATA
        </button>
        <button className="pixel-btn" disabled={busy} onClick={() => void run('sync')}>
          SYNC LATEST DAYS
        </button>
        <button className="pixel-btn" disabled={busy} onClick={() => void run('synthetic')}>
          REBUILD SIM DATABASE
        </button>
        <button
          className="pixel-btn"
          onClick={() => void bridge().invoke('data.report').then(setReport)}
          data-testid="view-report"
        >
          VIEW DATA REPORT
        </button>
      </div>
      {busy && (
        <div className="data-progress num">
          <div>
            {progress.stage} {progress.fraction >= 0 ? `${Math.round(progress.fraction * 100)}%` : ''}
          </div>
          {progress.log.map((l, i) => (
            <div key={i} className="dim">
              {l}
            </div>
          ))}
        </div>
      )}
      {diskAsk && (
        <Modal onClose={() => setDiskAsk(null)}>
          <h2>Low disk space</h2>
          <p>{diskAsk}</p>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => {
                setDiskAsk(null);
                void run('real', true);
              }}
            >
              CONTINUE ANYWAY
            </button>
            <button className="pixel-btn" onClick={() => setDiskAsk(null)}>
              CANCEL
            </button>
          </div>
        </Modal>
      )}
      {report && (
        <Modal onClose={() => setReport(null)} wide>
          <h2>Data report</h2>
          <pre className="report-text">{report}</pre>
        </Modal>
      )}
    </>
  );
}
