import { useEffect, useState } from 'react';
import { DESKS, DESK_ORDER } from '../../content/desks';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { STRUCTURES } from '../../engine/strategies/structures';
import { yearLabel } from '../../engine/run/engine';
import { RISK_TIERS } from '../../content/tiers';
import {
  CARTRIDGE_PACKS,
  COMPLIANCE_RULES,
  HEAT_MILESTONES,
  RANKS,
  heatOf,
  rankFor,
} from '../../content/meta';
import { buyPack, deskPrice, packUnlocked, unlockDesk } from '../../engine/meta/profile';
import { useProfile } from '../store/profile';
import { Portrait } from '../components/Portrait';
import { TutorialCoach } from '../run/Tutorial';
import type { DeskId } from '../../content/types';
import { sfx } from '../../audio/sfx';
import { Meter, Modal, TiltCard } from '../components/ui';
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
  const settings = useApp((s) => s.settings);
  const { saveSummary, checkSave, newRun, resume, busy, abandon } = useRun();
  const { profile, load, apply } = useProfile();
  const [desk, setDesk] = useState<DeskId>('verticals');
  const [seed, setSeed] = useState('');
  const [tier, setTier] = useState(0);
  const [rules, setRules] = useState<string[]>([]);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  useEffect(() => {
    void checkSave('career');
    void load().then((p) => setTier(Math.min(p.maxTier, tier)));
  }, []);

  const rank = rankFor(profile.xp);
  const next = RANKS[rank.rank + 1];
  const heat = heatOf(rules);

  const start = async () => {
    sfx('whoosh');
    if (await newRun({ deskId: desk, seed, tier, compliance: rules })) go('run');
  };
  const cont = async () => {
    sfx('whoosh');
    if (await resume('career')) go('run');
  };
  const tutorial = async () => {
    sfx('whoosh');
    if (
      await newRun({
        deskId: 'verticals',
        seed: 'tutorial-ines',
        mode: 'tutorial',
        practice: true,
        quarters: 1,
        slot: 'tutorial',
      })
    )
      go('run');
  };

  return (
    <div className="screen career" data-testid="career-screen">
      <div className="career-head">
        <div>
          <h1 className="screen-title">CAREER</h1>
          <p className="screen-sub">
            One run is one fiscal year: four quarters, three rounds each. Hit every target, stay above the
            Max-Loss Line, survive the Reviews.
          </p>
        </div>
        <div
          className="career-ladder panel num"
          data-testid="career-rank"
          title={next ? `Next: ${next.name}. ${next.unlocks}` : 'Top of the ladder'}
        >
          <div>
            <span className="dim">RANK</span> <b className="cyan-text">{rank.name.toUpperCase()}</b>
          </div>
          <Meter
            value={next ? profile.xp - rank.xp : 1}
            max={next ? next.xp - rank.xp : 1}
            tone="cyan"
            label={<span>{next ? `${profile.xp} / ${next.xp} XP` : `${profile.xp} XP · max rank`}</span>}
          />
          <div data-testid="career-bonus">
            <span className="dim">BONUS</span> <b className="amber-text">{profile.bonus}</b>
          </div>
        </div>
      </div>
      {!profile.tutorialDone && !saveSummary && (
        <div className="panel tutorial-banner" data-testid="tutorial-banner">
          <Portrait id="ines" mood="happy" scale={1} />
          <div>
            <b>New here?</b> Ines walks you through three practice rounds: the lineup, calling your shot,
            building a bull put, the clock, the tally and the shop. Nothing counts, and you keep her mug.
          </div>
          <button
            className="pixel-btn primary"
            onClick={() => void tutorial()}
            disabled={busy}
            data-testid="start-tutorial"
          >
            TUTORIAL ▶
          </button>
        </div>
      )}
      {saveSummary && (
        <div className="panel save-panel" data-testid="save-panel">
          <div className="section-title">Run in progress</div>
          <div className="num save-line">
            {DESKS[saveSummary.desk].name} desk · {yearLabel(saveSummary.quarter, saveSummary.roundIndex)} ·
            cash ${saveSummary.cash} · equity {money(saveSummary.equityCents)} · seed {saveSummary.seed}
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
          const locked = !profile.desks.includes(id);
          const price = deskPrice(profile, id);
          const best = profile.tierCleared[id];
          return (
            <div key={id} className="desk-slot">
              <TiltCard
                className="desk-card"
                selected={desk === id}
                disabled={locked}
                onClick={() => !locked && setDesk(id)}
                testId={`desk-${id}`}
                rarity={id === 'verticals' ? 'U' : undefined}
              >
                <div className="desk-name">{d.name.toUpperCase()}</div>
                <div className="desk-blurb">{d.blurb}</div>
                <div className="desk-plays num">
                  {d.structures.map((s) => STRUCTURES[s].short).join(' · ')}
                </div>
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
                {!locked && best !== undefined && (
                  <div className="desk-best num amber-text">Cleared up to Tier {best}</div>
                )}
                {locked && <div className="desk-lock num">LOCKED</div>}
              </TiltCard>
              {locked && (
                <button
                  className="pixel-btn desk-unlock"
                  disabled={profile.bonus < price}
                  onClick={() => void apply((p) => unlockDesk(p, id)).then((ok) => ok && setDesk(id))}
                  data-testid={`unlock-${id}`}
                  title={price < d.unlockCost ? `Rank discount: was ${d.unlockCost}` : undefined}
                >
                  UNLOCK · {price} BONUS
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="career-options">
        <div className="panel career-opt">
          <div className="section-title">Risk Tier</div>
          <div className="seg num" data-testid="tier-picker">
            {RISK_TIERS.map((t) => (
              <button
                key={t.tier}
                className={tier === t.tier ? 'sel' : ''}
                disabled={t.tier > profile.maxTier}
                title={t.tier > profile.maxTier ? `Clear a year at Tier ${t.tier - 1} to unlock` : t.text}
                onClick={() => setTier(t.tier)}
                data-testid={`tier-${t.tier}`}
              >
                {t.tier > profile.maxTier ? '🔒' : ''}
                {t.tier}
              </button>
            ))}
          </div>
          <div className="dim small">
            {tier === 0
              ? 'Base rules. Clear a year to unlock Tier 1.'
              : `Cumulative: ${RISK_TIERS.slice(1, tier + 1)
                  .map((t) => t.text)
                  .join(' ')}`}
          </div>
        </div>
        <div className="panel career-opt">
          <div className="section-title">
            Compliance Rules{' '}
            <span className="chip warn" data-testid="heat-total">
              HEAT {heat}
            </span>
          </div>
          <div className="compliance-list">
            {COMPLIANCE_RULES.map((r) => {
              const on = rules.includes(r.id);
              return (
                <label key={r.id} className={`comp-rule ${on ? 'on' : ''}`} title={r.text}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setRules(on ? rules.filter((x) => x !== r.id) : [...rules, r.id])}
                    data-testid={`rule-${r.id}`}
                  />
                  <span>
                    {r.name} <span className="dim">+{r.heat}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="dim small">
            Optional and harsher. Clear a year with Heat to unlock cosmetics (best so far: {profile.heatBest};
            next at {HEAT_MILESTONES.find((m) => m.heat > profile.heatBest)?.heat ?? '—'}).
          </div>
        </div>
        <div className="panel career-opt">
          <div className="section-title">Cartridge packs</div>
          {CARTRIDGE_PACKS.map((pk) => {
            const open = packUnlocked(profile, pk.id);
            return (
              <div key={pk.id} className="pack-row">
                <div>
                  <b>{pk.name}</b>{' '}
                  <span className="dim small">
                    {pk.cartridges.map((c) => CARTRIDGE_BY_ID[c].name).join(', ')}
                  </span>
                </div>
                {open ? (
                  <span className="chip good">IN THE POOL</span>
                ) : (
                  <button
                    className="pixel-btn"
                    disabled={profile.bonus < pk.bonus}
                    onClick={() => void apply((p) => buyPack(p, pk.id))}
                    title={`Free at ${RANKS[pk.rank].name}`}
                    data-testid={`pack-${pk.id}`}
                  >
                    {pk.bonus} BONUS
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
          disabled={busy || !profile.desks.includes(desk)}
          data-testid="start-run"
        >
          {busy ? 'DEALING…' : 'START RUN ▶'}
        </button>
        <button
          className="pixel-btn"
          onClick={() => void tutorial()}
          disabled={busy}
          data-testid="career-tutorial"
        >
          TUTORIAL
        </button>
        <button className="pixel-btn" onClick={() => go('achievements')} data-testid="career-achievements">
          ACHIEVEMENTS
        </button>
        <button className="pixel-btn" onClick={() => go('pad')}>
          THE PAD
        </button>
        <button className="pixel-btn" onClick={back}>
          BACK
        </button>
      </div>
      {settings.game.pureMarket && (
        <p className="dim small">Pure Market is on (Settings): ARCADE cartridges are out of the shop.</p>
      )}
      {confirmAbandon && (
        <Modal onClose={() => setConfirmAbandon(false)} testId="abandon-confirm">
          <h2>Abandon the run in progress?</h2>
          <p>There is no undo. The run ends as resigned and its trades stay in your Stats.</p>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              onClick={async () => {
                setConfirmAbandon(false);
                if (await resume('career')) await abandon();
                useRun.getState().leave();
                await checkSave('career');
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
  const slot = useRun.getState().slot;
  const coach = engine.state.config.mode === 'tutorial' ? <TutorialCoach e={engine} /> : null;
  const phase = engine.state.phase;
  let body: React.ReactElement;
  if (phase === 'tally')
    body = <TallyView key={`${engine.state.quarter}-${engine.state.roundIndex}`} e={engine} />;
  else if (phase === 'shop') body = <ShopView e={engine} />;
  else if (phase === 'review_intro') body = <ReviewIntro e={engine} />;
  else if (phase === 'victory' || phase === 'defeat')
    body = (
      <RunEnd
        e={engine}
        ghost={slot === 'daily' ? useRun.getState().ghost : null}
        newLabel={slot === 'daily' ? 'BACK TO DAILY' : slot === 'tutorial' ? 'ON TO CAREER' : 'NEW RUN'}
        onNew={() => {
          useRun.getState().leave();
          go(slot === 'daily' ? 'daily' : 'career');
        }}
      />
    );
  else {
    const desk = DESKS[engine.state.config.deskId];
    body = (
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
  return (
    <>
      {body}
      {coach}
    </>
  );
}
