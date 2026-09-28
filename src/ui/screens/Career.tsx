import { useEffect, useState } from 'react';
import { DESKS, DESK_ORDER } from '../../content/desks';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { STRUCTURES } from '../../engine/strategies/structures';
import { ROUND_NAMES } from '../../engine/run/engine';
import type { DeskId } from '../../content/types';
import { sfx } from '../../audio/sfx';
import { Modal, TiltCard } from '../components/ui';
import { money } from '../format';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { TradingLayout } from '../trading/TradingScreen';
import { RunEnd, ReviewIntro, ShopView, TallyView } from '../run/RunPhases';
import { careerBadges, RunLeftExtra, RunRightExtra, RunTopBar } from '../run/RunParts';
import './screens.css';
import '../run/run.css';

export function CareerScreen() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const { saveSummary, checkSave, newRun, resume, busy, abandon } = useRun();
  const [desk, setDesk] = useState<DeskId>('verticals');
  const [seed, setSeed] = useState('');
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  useEffect(() => {
    void checkSave();
  }, []);

  const start = async () => {
    sfx('whoosh');
    if (await newRun({ deskId: desk, seed })) go('run');
  };
  const cont = async () => {
    sfx('whoosh');
    if (await resume()) go('run');
  };

  return (
    <div className="screen career" data-testid="career-screen">
      <h1 className="screen-title">CAREER</h1>
      <p className="screen-sub">
        One run is one fiscal year: four quarters, three rounds each. Hit every target, stay above the
        Max-Loss Line, survive the Reviews.
      </p>
      {saveSummary && (
        <div className="panel save-panel" data-testid="save-panel">
          <div className="section-title">Run in progress</div>
          <div className="num save-line">
            {DESKS[saveSummary.desk].name} desk · Q{saveSummary.quarter} {ROUND_NAMES[saveSummary.roundIndex]}{' '}
            · cash ${saveSummary.cash} · equity {money(saveSummary.equityCents)} · seed {saveSummary.seed}
          </div>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={() => void cont()}
              disabled={busy}
              data-testid="continue-run"
            >
              {busy ? 'LOADING…' : 'CONTINUE ▶'}
            </button>
            <button className="pixel-btn" onClick={() => setConfirmAbandon(true)} disabled={busy}>
              ABANDON RUN
            </button>
          </div>
        </div>
      )}
      <div className="section-title">Pick a desk</div>
      <div className="desk-row">
        {DESK_ORDER.map((id) => {
          const d = DESKS[id];
          const locked = d.unlockCost > 0;
          return (
            <TiltCard
              key={id}
              className="desk-card"
              selected={desk === id}
              disabled={locked}
              onClick={() => !locked && setDesk(id)}
              testId={`desk-${id}`}
              rarity={id === 'verticals' ? 'U' : undefined}
            >
              <div className="desk-name">{d.name.toUpperCase()}</div>
              <div className="desk-blurb">{d.blurb}</div>
              <div className="desk-plays num">{d.structures.map((s) => STRUCTURES[s].short).join(' · ')}</div>
              <div className="desk-passive">
                <span className="dim">Passive:</span> {d.passiveText}
              </div>
              <div className="desk-kit dim">
                Starts with:{' '}
                {[
                  ...d.startingAnalysts.map((a) => ANALYSTS[a].name),
                  ...d.startingCartridges.map((c) => CARTRIDGE_BY_ID[c].name),
                ].join(', ') || 'nothing'}
              </div>
              {locked && <div className="desk-lock num">LOCKED · {d.unlockCost} Bonus</div>}
            </TiltCard>
          );
        })}
      </div>
      <div className="career-start">
        <label className="num">
          Seed (optional){' '}
          <input
            className="seed-input num"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            data-testid="seed-input"
          />
        </label>
        <button
          className="pixel-btn primary"
          onClick={() => (saveSummary ? setConfirmAbandon(true) : void start())}
          disabled={busy}
          data-testid="start-run"
        >
          {busy ? 'DEALING…' : 'START RUN ▶'}
        </button>
        <button className="pixel-btn" onClick={back}>
          BACK
        </button>
      </div>
      {confirmAbandon && (
        <Modal onClose={() => setConfirmAbandon(false)} testId="abandon-confirm">
          <h2>Abandon the run in progress?</h2>
          <p>There is no undo. The run ends as resigned and its trades stay in your Stats.</p>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={async () => {
                setConfirmAbandon(false);
                if (await resume()) await abandon();
                useRun.getState().leave();
                await checkSave();
              }}
              data-testid="abandon-yes"
            >
              ABANDON
            </button>
            <button className="pixel-btn" onClick={() => setConfirmAbandon(false)}>
              KEEP IT
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function RunScreen() {
  const engine = useRun((s) => s.engine);
  useRun((s) => s.version);
  const sectors = useRun((s) => s.sectors);
  const loadSectors = useRun((s) => s.loadSectors);
  const go = useApp((s) => s.go);
  const home = useApp((s) => s.home);
  useEffect(() => {
    void loadSectors();
    // Leaving the screen pauses the clock; the run is already saved.
    return () => useTrading.getState().pause();
  }, []);
  if (!engine) {
    return (
      <div className="screen">
        <p>No run loaded.</p>
        <button className="pixel-btn" onClick={() => go('career')}>
          CAREER
        </button>
      </div>
    );
  }
  const exit = () => {
    useRun.getState().leave();
    home();
  };
  const phase = engine.state.phase;
  if (phase === 'tally')
    return <TallyView key={`${engine.state.quarter}-${engine.state.roundIndex}`} e={engine} />;
  if (phase === 'shop') return <ShopView e={engine} />;
  if (phase === 'review_intro') return <ReviewIntro e={engine} />;
  if (phase === 'victory' || phase === 'defeat')
    return (
      <RunEnd
        e={engine}
        onNew={() => {
          useRun.getState().leave();
          go('career');
        }}
      />
    );
  const desk = DESKS[engine.state.config.deskId];
  return (
    <TradingLayout
      key={`${engine.state.quarter}-${engine.state.roundIndex}`}
      top={<RunTopBar e={engine} onMenu={exit} />}
      allowedStructures={desk.structures}
      levels={engine.state.levels}
      badges={careerBadges(engine, (sym) => sectors[sym] ?? null)}
      leftExtra={<RunLeftExtra e={engine} />}
      rightExtra={<RunRightExtra e={engine} />}
    />
  );
}
