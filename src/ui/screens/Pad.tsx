import { useEffect, useRef, useState } from 'react';
import {
  COLLECTIONS,
  COLLECTION_ORDER,
  COSMETICS,
  PAD_TIERS,
  RANKS,
  SETUP_ORDER,
  SETUP_TRACKS,
  rankFor,
  unlockText,
  type CollectionId,
} from '../../content/meta';
import {
  buyCollectionItem,
  buyCosmetic,
  buyPadTier,
  buySetup,
  cosmeticUnlocked,
  nextCollectionPrice,
  perksFor,
  rankOf,
  toggleDeskItem,
} from '../../engine/meta/profile';
import { useApp } from '../store/app';
import { useProfile } from '../store/profile';
import { drawPad, PAD_H, PAD_W } from '../pad/scene';
import './screens.css';
import './pad.css';

type Tab = 'home' | CollectionId | 'setup' | 'items';

export function PadScreen() {
  const back = useApp((s) => s.back);
  const { profile, load, apply } = useProfile();
  const [tab, setTab] = useState<Tab>('home');
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const g = canvas.current?.getContext('2d');
    if (g) drawPad(g, { ...profile.pad, deskItems: profile.pad.deskItems });
  }, [profile]);

  const rank = rankFor(profile.xp);
  const tier = PAD_TIERS[profile.pad.tier];
  const next = PAD_TIERS[profile.pad.tier + 1];
  const perks = perksFor(profile);
  const perkLines = [
    perks.startCash ? `+$${perks.startCash} shop cash at the start of every run` : null,
    perks.month1Rerolls ? `+${perks.month1Rerolls} reroll in every Month 1` : null,
    perks.quarterStressRelief ? `-${perks.quarterStressRelief} stress at each new quarter` : null,
  ].filter(Boolean);

  return (
    <div className="screen pad-screen" data-testid="pad-screen">
      <div className="pad-head">
        <div>
          <h1 className="screen-title">THE PAD</h1>
          <p className="screen-sub">
            {tier.name}: {tier.blurb}
          </p>
        </div>
        <div className="pad-wallet num">
          <div>
            <span className="dim">RANK</span> <b className="cyan-text">{rank.name.toUpperCase()}</b>
          </div>
          <div data-testid="pad-bonus">
            <span className="dim">BONUS</span> <b className="amber-text">{profile.bonus}</b>
          </div>
        </div>
      </div>
      <div className="pad-grid">
        <div className="pad-stage panel">
          <canvas ref={canvas} width={PAD_W} height={PAD_H} className="pad-canvas" data-testid="pad-canvas" />
          <div className="pad-perks num">
            <b>Comfort perks:</b>{' '}
            {perkLines.length ? perkLines.join(' · ') : 'none yet (move up from the Studio)'}
          </div>
        </div>
        <div className="panel pad-shop">
          <div className="seg num pad-tabs">
            {(
              [
                ['home', 'HOME'],
                ['art', 'ART'],
                ['watches', 'WATCHES'],
                ['vehicles', 'VEHICLES'],
                ['setup', 'DESK SETUP'],
                ['items', 'DESK ITEMS'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? 'sel' : ''}
                onClick={() => setTab(id)}
                data-testid={`pad-tab-${id}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'home' && (
            <div className="pad-list">
              {PAD_TIERS.map((t) => {
                const owned = profile.pad.tier >= t.tier;
                const isNext = next?.tier === t.tier;
                const rankOk = rankOf(profile) >= t.rank;
                return (
                  <div key={t.id} className={`pad-row ${owned ? 'owned' : ''}`}>
                    <div>
                      <b>{t.name}</b> <span className="dim">{t.perkText}</span>
                      {!rankOk && <div className="dim">Needs {RANKS[t.rank].name}</div>}
                    </div>
                    {owned ? (
                      <span className="chip good">HOME</span>
                    ) : (
                      <button
                        className="pixel-btn"
                        disabled={!isNext || !rankOk || profile.bonus < t.cost}
                        onClick={() => void apply(buyPadTier)}
                        data-testid={`pad-buy-${t.id}`}
                      >
                        MOVE IN · {t.cost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {(tab === 'art' || tab === 'watches' || tab === 'vehicles') && <CollectionList col={tab} />}
          {tab === 'setup' && (
            <div className="pad-list">
              {SETUP_ORDER.map((track) => {
                const lv = profile.pad.setup[track];
                const def = SETUP_TRACKS[track];
                const nx = def.levels[lv + 1];
                return (
                  <div key={track} className="pad-row">
                    <div>
                      <b>{def.name}</b> <span className="dim">{def.levels[lv].name}</span>
                    </div>
                    {nx ? (
                      <button
                        className="pixel-btn"
                        disabled={profile.bonus < nx.cost}
                        onClick={() => void apply((p) => buySetup(p, track))}
                        data-testid={`pad-setup-${track}`}
                      >
                        {nx.name} · {nx.cost}
                      </button>
                    ) : (
                      <span className="chip good">MAXED</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'items' && (
            <div className="pad-list">
              <p className="dim">Up to four on the desk. Some are bought with Bonus; others are earned.</p>
              {COSMETICS.filter((c) => c.kind === 'deskitem').map((c) => {
                const open = cosmeticUnlocked(profile, c);
                const shown = profile.pad.deskItems.includes(c.value);
                return (
                  <div key={c.id} className={`pad-row ${open ? '' : 'locked'}`}>
                    <div>
                      <b>{c.name}</b> {!open && <span className="dim">{unlockText(c.unlock)}</span>}
                    </div>
                    {open ? (
                      <button
                        className={`pixel-btn ${shown ? 'primary' : ''}`}
                        onClick={() => void apply((p) => toggleDeskItem(p, c.value))}
                      >
                        {shown ? 'ON THE DESK' : 'DISPLAY'}
                      </button>
                    ) : c.unlock.kind === 'bonus' ? (
                      <button
                        className="pixel-btn"
                        disabled={profile.bonus < c.unlock.cost}
                        onClick={() => void apply((p) => buyCosmetic(p, c.id))}
                        data-testid={`pad-item-${c.value}`}
                      >
                        BUY · {c.unlock.cost}
                      </button>
                    ) : (
                      <span className="chip">LOCKED</span>
                    )}
                  </div>
                );
              })}
              <div className="section-title">Other cosmetics for Bonus</div>
              {COSMETICS.filter((c) => c.kind !== 'deskitem' && c.unlock.kind === 'bonus').map((c) => {
                const open = cosmeticUnlocked(profile, c);
                return (
                  <div key={c.id} className="pad-row">
                    <div>
                      <b>{c.name}</b>{' '}
                      <span className="dim">{c.kind === 'cardback' ? 'card back' : c.kind}</span>
                    </div>
                    {open ? (
                      <span className="chip good">OWNED · equip in Settings</span>
                    ) : (
                      <button
                        className="pixel-btn"
                        disabled={c.unlock.kind === 'bonus' && profile.bonus < c.unlock.cost}
                        onClick={() => void apply((p) => buyCosmetic(p, c.id))}
                      >
                        BUY · {c.unlock.kind === 'bonus' ? c.unlock.cost : ''}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button className="pixel-btn" onClick={back}>
          BACK
        </button>
      </div>
    </div>
  );
}

function CollectionList({ col }: { col: CollectionId }) {
  const { profile, apply } = useProfile();
  const c = COLLECTIONS[col];
  const price = nextCollectionPrice(profile, col);
  const owned = c.items.filter((i) => profile.pad.items.includes(i.id)).length;
  return (
    <div className="pad-list">
      <p className="dim num">
        {c.name}: {owned}/{c.items.length} collected. Next piece costs {price} Bonus (each one costs more).
        {owned === c.items.length && ' Collection complete.'}
      </p>
      {c.items.map((i) => {
        const has = profile.pad.items.includes(i.id);
        return (
          <div key={i.id} className={`pad-row ${has ? 'owned' : ''}`}>
            <span className="pad-swatch" style={{ background: i.colors[1], borderColor: i.colors[0] }} />
            <div className="pad-row-text">
              <b>{i.name}</b> <span className="dim">{i.blurb}</span>
            </div>
            {has ? (
              <span className="chip good">OWNED</span>
            ) : (
              <button
                className="pixel-btn"
                disabled={profile.bonus < price}
                onClick={() => void apply((p) => buyCollectionItem(p, col, i.id))}
                data-testid={`pad-buy-${i.id}`}
              >
                BUY · {price}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Kept for other screens that list what a collection holds. */
export const COLLECTION_LABELS = Object.fromEntries(COLLECTION_ORDER.map((c) => [c, COLLECTIONS[c].name]));
