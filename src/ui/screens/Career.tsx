import { useEffect, useState } from 'react';
import { PlanSetup } from '../components/PlanSetup';
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
import { ArtIcon } from '../art';
import type { DeskId } from '../../content/types';
import { sfx } from '../../audio/sfx';
import { Meter, Modal, TiltCard } from '../components/ui';
import { money } from '../format';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { bridge, hasBridge } from '../bridge';
import { TradingLayout } from '../trading/TradingScreen';
import { RunEnd, ReviewIntro, ShopView, TallyView } from '../run/RunPhases';
import { CartridgeMini } from '../run/Shop';
import { Primer } from '../run/Primer';
import { ANALYST_SHORT } from '../../content/summaries';
import {
  careerBadges,
  careerBriefAccess,
  GoalCard,
  RunLeftExtra,
  RunRightExtra,
  RunTopBar,
} from '../run/RunParts';
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
  const [tab, setTab] = useState<'start' | 'options'>('start');
  const [capAsk, setCapAsk] = useState(false);
  const updateSettings = useApp((s) => s.updateSettings);
  // A tutorial left part-way can be picked up again at the same lesson.
  const [tutorialSaved, setTutorialSaved] = useState(false);

  useEffect(() => {
    if (hasBridge())
      void bridge()
        .invoke('user.listSaves')
        .then((slots) => setTutorialSaved(slots.some((x) => x.slot === 'tutorial')));
    void checkSave('career');
    void load().then((p) => setTier(Math.min(p.maxTier, tier)));
  }, []);

  const rank = rankFor(profile.xp);
  const next = RANKS[rank.rank + 1];
  const heat = heatOf(rules);

  const start = async (startEquityCents?: number) => {
    // Income trades tie up the whole share price: ask what to start with first.
    if (desk === 'income' && startEquityCents === undefined) {
      sfx('select');
      setCapAsk(true);
      return;
    }
    sfx('whoosh');
    if (await newRun({ deskId: desk, seed, tier, compliance: rules, startEquityCents })) go('run');
  };
  const cont = async () => {
    sfx('whoosh');
    if (await resume('career')) go('run');
  };
  const resumeTutorial = async () => {
    sfx('whoosh');
    if (await resume('tutorial')) go('run');
  };
  const tutorial = async () => {
    sfx('whoosh');
    // A new tutorial starts its lessons from the top.
    useApp.getState().updateSettings((st) => ({ ...st, game: { ...st.game, tutorialProgress: null } }));
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
      <div className="career-tabs num" role="tablist">
        <button
          className={tab === 'start' ? 'sel' : ''}
          onClick={() => (sfx('click'), setTab('start'))}
          role="tab"
          aria-selected={tab === 'start'}
          data-testid="ctab-start"
        >
          ▶ QUICK START
        </button>
        <button
          className={tab === 'options' ? 'sel' : ''}
          onClick={() => (sfx('click'), setTab('options'))}
          role="tab"
          aria-selected={tab === 'options'}
          data-testid="ctab-options"
        >
          ⚙ CHALLENGE &amp; OPTIONS
          {(tier > 0 || rules.length > 0 || seed) && (
            <span className="ct-badge">
              {tier > 0 ? `T${tier}` : ''}
              {rules.length ? ` HEAT ${heat}` : ''}
              {seed ? ' SEED' : ''}
            </span>
          )}
        </button>
      </div>
      <div className="career-body">
        {tab === 'start' && (
          <>
            {!profile.tutorialDone && !saveSummary && (
              <div className="panel tutorial-banner" data-testid="tutorial-banner">
                <Portrait id="ines" mood="happy" scale={1} />
                <div>
                  <b>New to options?</b> Ines starts you on an empty desk and switches it on one piece at a
                  time: the goal, your first trade, the clock, the score, then the powerups. Nothing counts,
                  and you keep her mug.
                </div>
                {tutorialSaved && (
                  <button
                    className="pixel-btn primary"
                    onClick={() => void resumeTutorial()}
                    disabled={busy}
                    data-testid="continue-tutorial"
                  >
                    CONTINUE ▶
                  </button>
                )}
                <button
                  className={`pixel-btn ${tutorialSaved ? '' : 'primary'}`}
                  onClick={() => void tutorial()}
                  disabled={busy}
                  data-testid="start-tutorial"
                >
                  {tutorialSaved ? 'START OVER' : 'TUTORIAL ▶'}
                </button>
              </div>
            )}
            {saveSummary && (
              <div className="panel save-panel" data-testid="save-panel">
                <div className="section-title">Run in progress</div>
                <div className="num save-line">
                  {DESKS[saveSummary.desk].name} desk ·{' '}
                  {yearLabel(saveSummary.quarter, saveSummary.roundIndex)} · cash ${saveSummary.cash} · equity{' '}
                  {money(saveSummary.equityCents)} · seed {saveSummary.seed}
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
                      tip={`desk:${id}`}
                      rarity={id === 'verticals' ? 'U' : undefined}
                    >
                      <ArtIcon
                        category="desk"
                        id={id}
                        name={d.name}
                        onlyIfUploaded
                        style={{ width: '100%', height: 'auto' }}
                      />
                      <div className="desk-name">{d.name.toUpperCase()}</div>
                      <div className="desk-blurb">{d.blurb}</div>
                      <div className="desk-plays num">
                        {d.structures.map((s) => STRUCTURES[s].short).join(' · ')}
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
            <StartingKit deskId={desk} />
          </>
        )}
        {tab === 'options' && (
          <div className="career-options">
            <div className="panel career-opt">
              <div className="section-title">Seed</div>
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
              <div className="dim small">Same seed, same deal: replay a run or race a friend on it.</div>
            </div>
            <div className="panel career-opt">
              <div className="section-title" data-tip="g:plan_set">
                Your plan (every trade)
              </div>
              <PlanSetup compact />
            </div>
            <div className="panel career-opt">
              <div className="section-title" data-tip="g:risk_tier">
                Risk Tier
              </div>
              {/* A ladder, like stakes: each tier adds its rule on top of the ones below it. */}
              <div className="tier-ladder num" data-testid="tier-picker" role="radiogroup">
                {RISK_TIERS.map((t) => {
                  const locked = t.tier > profile.maxTier;
                  const on = t.tier <= tier;
                  return (
                    <button
                      key={t.tier}
                      role="radio"
                      aria-checked={tier === t.tier}
                      className={`tier-row ${tier === t.tier ? 'sel' : ''} ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}
                      disabled={locked}
                      onClick={() => (sfx('select'), setTier(t.tier))}
                      data-testid={`tier-${t.tier}`}
                    >
                      <b className="tier-n">{locked ? '🔒' : t.tier}</b>
                      <span className="tier-text">
                        {t.tier === 0 ? 'Base rules' : t.text}
                        {locked && <span className="dim"> · clear a year at Tier {t.tier - 1}</span>}
                      </span>
                      {on && t.tier > 0 && <span className="tier-on">✔</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="panel career-opt">
              <div className="section-title">
                Compliance Rules{' '}
                <span className="chip warn" data-testid="heat-total" data-tip="g:heat">
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
                Optional and harsher. Clear a year with Heat to unlock cosmetics (best so far:{' '}
                {profile.heatBest}; next at{' '}
                {HEAT_MILESTONES.find((m) => m.heat > profile.heatBest)?.heat ?? '—'}).
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
        )}
      </div>
      <div className="career-start">
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
      {capAsk && (
        <IncomeCapital
          initial={settings.game.incomeCapitalCents}
          onClose={() => setCapAsk(false)}
          onPick={(cents) => {
            setCapAsk(false);
            updateSettings((x) => ({ ...x, game: { ...x.game, incomeCapitalCents: cents } }));
            void start(cents);
          }}
        />
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

const INCOME_PRESETS = [2_500_000, 5_000_000, 10_000_000, 25_000_000];

/**
 * Starting capital for an Income run. A cash-secured put sets aside the whole strike (a $60 stock
 * is $6,000 a contract), so $5,000 barely opens one. Covered calls need no cash: they are sold
 * against 500 shares of each stock the player is assumed to own, kept off the books.
 */
function IncomeCapital({
  initial,
  onClose,
  onPick,
}: {
  initial: number;
  onClose: () => void;
  onPick: (cents: number) => void;
}) {
  const [dollars, setDollars] = useState(Math.round(initial / 100));
  const cents = Math.max(100_000, Math.round(dollars) * 100);
  return (
    <Modal onClose={onClose} testId="income-capital">
      <h2>Starting capital for this Income run</h2>
      <p>
        Cash-secured puts set aside the whole strike (a $60 stock ties up $6,000 per contract), so a small
        account can barely open one. <b>At least $50,000 is recommended.</b> Covered calls need no cash: you
        own 500 shares of every stock, kept off the books, and sell calls against them. Only the options count
        in your P/L. Targets, risk caps and the Max-Loss Line are all percentages, so a bigger account doesn't
        make the run easier.
      </p>
      <div className="modal-actions income-presets">
        {INCOME_PRESETS.map((c) => (
          <button
            key={c}
            className={`pixel-btn ${c === cents ? 'primary' : ''}`}
            onClick={() => setDollars(c / 100)}
            data-testid={`income-cap-${c / 100}`}
          >
            {money(c).replace('.00', '')}
            {c === DESKS.income.recommendedCapitalCents ? ' ★' : ''}
          </button>
        ))}
        <label className="num">
          $
          <input
            className="capital"
            type="number"
            min={1000}
            step={1000}
            value={dollars}
            onChange={(e) => setDollars(Number(e.target.value) || 0)}
            data-testid="income-cap-input"
          />
        </label>
      </div>
      {cents < (DESKS.income.recommendedCapitalCents ?? 0) && (
        <p className="warn-text small">Under $50,000 most cash-secured puts won't fit the risk cap.</p>
      )}
      <div className="modal-actions">
        <button className="pixel-btn primary" onClick={() => onPick(cents)} data-testid="income-cap-go">
          START WITH {money(cents).replace('.00', '')} ▶
        </button>
        <button className="pixel-btn" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </Modal>
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
        briefAccess={careerBriefAccess(engine)}
        leftExtra={<RunLeftExtra e={engine} />}
        leftPinned={<GoalCard e={engine} />}
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

/** What the chosen desk hands you on day one, as cards, beside the three rules that win runs. */
function StartingKit({ deskId }: { deskId: DeskId }) {
  const d = DESKS[deskId];
  return (
    <div className="kit-row" data-testid="starting-kit">
      <div className="panel kit-panel">
        <div className="section-title">
          Your starting kit · <span className="amber-text">{d.name}</span>
        </div>
        <div className="kit-cards">
          {d.startingCartridges.map((c) => (
            <CartridgeMini key={c} id={c} />
          ))}
          {d.startingAnalysts.map((a) => (
            <div key={a} className="cart-mini analyst" data-tip={`analyst:${a}`}>
              <ArtIcon category="analyst" id={a} name={ANALYSTS[a].name} />
              <div className="cm-body">
                <div className="cm-name">{ANALYSTS[a].name}</div>
                <div className="cm-get fx-info">
                  <span className="sc-glyph">◉</span> {ANALYST_SHORT[a]}
                </div>
              </div>
            </div>
          ))}
          <div className="cart-mini passive" data-tip={`desk:${deskId}`}>
            <span className="kit-passive-ico">★</span>
            <div className="cm-body">
              <div className="cm-name">Desk passive</div>
              <div className="cm-text">{d.passiveText}</div>
            </div>
          </div>
        </div>
        <div className="kit-plays">
          {d.structures.map((st) => (
            <span key={st} className="kit-play num" data-tip={`struct:${st}`}>
              <ArtIcon category="page" id={st} name={STRUCTURES[st].name} scale={0.5} />
              {STRUCTURES[st].short}
            </span>
          ))}
        </div>
      </div>
      <div className="panel kit-panel primer-panel">
        <div className="section-title">How runs are won</div>
        <Primer />
      </div>
    </div>
  );
}
