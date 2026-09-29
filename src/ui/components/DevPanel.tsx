/**
 * Developer mode (Settings → Game): a DEV button and panel (Ctrl+Shift+D) for playtesting.
 * Playtest notes stamped with where you are (screen, run, round, day, card) plus an optional
 * screenshot; "unlock everything"; and run levers (cash, stress, tickets, meter, any cartridge,
 * analyst, memo or voucher). Run levers go through the run's action log like any other action.
 */

import { useEffect, useState } from 'react';
import { ANALYSTS, ANALYST_IDS } from '../../content/analysts';
import { CARTRIDGES } from '../../content/cartridges';
import { MEMOS, MEMO_IDS, VOUCHERS, VOUCHER_IDS } from '../../content/items';
import type { AnalystId, MemoId, VoucherId } from '../../content/types';
import { unlockEverything } from '../../engine/meta/profile';
import type { DevOp } from '../../engine/run/types';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useProfile } from '../store/profile';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { Kbd, Modal } from './ui';

export interface DevNote {
  at: string;
  context: string;
  text: string;
  shot?: string;
}

const NOTES_KEY = 'devNotes';

/** Where you are right now, in one line, so a note makes sense later. */
function contextLine(): string {
  const app = useApp.getState();
  const parts: string[] = [`screen ${app.screen}`];
  const e = useRun.getState().engine;
  if (e && (app.screen === 'run' || app.screen === 'career')) {
    const st = e.state;
    parts.push(
      `run ${st.config.deskId} seed ${st.config.seed}`,
      `Q${st.quarter} R${st.roundIndex + 1} ${st.phase}`,
    );
    parts.push(`cash $${st.cash} stress ${st.stress} meter ${st.round.meter}/${st.round.target}`);
  }
  const t = useTrading.getState();
  const s = t.session;
  if (s) {
    parts.push(`day ${s.dayIndex}`);
    if (t.selectedCardId) {
      const c = s.card(t.selectedCardId);
      parts.push(`card ${c.displaySymbol} (${c.realSymbol} ${s.view(c.id).now})`);
    }
  }
  return parts.join(' · ');
}

async function loadNotes(): Promise<DevNote[]> {
  if (!hasBridge()) return [];
  return ((await bridge().invoke('user.get', NOTES_KEY)) as DevNote[] | null) ?? [];
}

async function saveNotes(notes: DevNote[]): Promise<void> {
  if (hasBridge()) await bridge().invoke('user.set', NOTES_KEY, notes);
}

function notesMarkdown(notes: DevNote[]): string {
  return [
    '# Playtest notes',
    '',
    ...notes
      .slice()
      .reverse()
      .map(
        (n) => `- **${n.at}** ${n.text}\n  - _${n.context}_${n.shot ? `\n  - screenshot: ${n.shot}` : ''}`,
      ),
  ].join('\n');
}

function DevPanel({ onClose }: { onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const engine = useRun((s) => s.engine);
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  const [notes, setNotes] = useState<DevNote[]>([]);
  const [text, setText] = useState('');
  const [cart, setCart] = useState(CARTRIDGES[0].id);
  const [analyst, setAnalyst] = useState<AnalystId>(ANALYST_IDS[0]);
  const [memo, setMemo] = useState<MemoId>(MEMO_IDS[0]);
  const [voucher, setVoucher] = useState<VoucherId>(VOUCHER_IDS[0]);
  const [ctx] = useState(contextLine);
  useEffect(() => {
    void loadNotes().then(setNotes);
  }, []);

  const addNote = async (withShot: boolean) => {
    if (!text.trim() && !withShot) return;
    let shot: string | undefined;
    if (withShot && hasBridge()) {
      // Close the panel for a clean picture, then reopen.
      onClose();
      await new Promise((r) => setTimeout(r, 250));
      shot = (await bridge().invoke('system.screenshot', `playtest-${Date.now()}`)) ?? undefined;
    }
    const n: DevNote = {
      at: new Date().toLocaleString(),
      context: ctx,
      text: text.trim() || '(screenshot)',
      shot,
    };
    const next = [n, ...notes];
    setNotes(next);
    setText('');
    await saveNotes(next);
    sfx('stamp');
    toast(shot ? `Note saved with a screenshot: ${shot}` : 'Note saved.', 'good');
  };

  const run = engine && !engine.over ? engine : null;
  const lever = (op: DevOp) => {
    sfx('click');
    void act({ t: 'dev', op });
  };

  return (
    <Modal onClose={onClose} wide testId="dev-panel">
      <div className="dev-head">
        <h2>Developer mode</h2>
        <span className="dim num small">
          For playtesting. Levers touch the game layer only, never market data.
        </span>
      </div>
      <div className="dev-grid">
        <section className="dev-sec">
          <div className="section-title">Playtest notes</div>
          <div className="dev-ctx num">{ctx}</div>
          <textarea
            className="dev-note"
            data-testid="dev-note"
            value={text}
            placeholder="What happened, what felt off, what you'd change…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) void addNote(false);
            }}
          />
          <div className="dev-row">
            <button
              className="pixel-btn primary"
              onClick={() => void addNote(false)}
              data-testid="dev-add-note"
            >
              ✎ ADD NOTE <Kbd>Ctrl+Enter</Kbd>
            </button>
            <button className="pixel-btn" onClick={() => void addNote(true)} data-testid="dev-shot">
              ◳ SCREENSHOT + NOTE
            </button>
          </div>
          <div className="dev-notes num">
            {notes.length === 0 && <div className="dim">No notes yet.</div>}
            {notes.map((n, i) => (
              <div key={`${n.at}-${i}`} className="dev-n">
                <div>
                  <b>{n.at}</b> {n.text}
                </div>
                <div className="dim small">
                  {n.context}
                  {n.shot && ` · 📷 ${n.shot}`}
                </div>
                <button
                  className="dev-x"
                  onClick={() => {
                    const next = notes.filter((_, j) => j !== i);
                    setNotes(next);
                    void saveNotes(next);
                  }}
                  aria-label="Delete note"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="dev-row">
            <button
              className="pixel-btn"
              disabled={notes.length === 0}
              onClick={async () => {
                if (!hasBridge()) return;
                const path = await bridge().invoke(
                  'system.saveTextFile',
                  'playtest-notes.md',
                  notesMarkdown(notes),
                );
                if (path) toast(`Notes saved to ${path}`, 'good');
              }}
              data-testid="dev-export"
            >
              ⤓ EXPORT .MD
            </button>
            <button
              className="pixel-btn"
              disabled={notes.length === 0}
              onClick={() => {
                void navigator.clipboard?.writeText(notesMarkdown(notes));
                toast('Notes copied.', 'good');
              }}
            >
              ⧉ COPY ALL
            </button>
          </div>
        </section>
        <section className="dev-sec">
          <div className="section-title">Unlocks</div>
          <div className="dev-row">
            <button
              className="pixel-btn primary"
              data-testid="dev-unlock"
              onClick={async () => {
                await useProfile.getState().set(unlockEverything);
                sfx('win');
                toast(
                  'Everything unlocked: desks, packs, tiers, the Pad and cosmetics (+5000 Bonus).',
                  'good',
                );
              }}
            >
              ★ UNLOCK EVERYTHING
            </button>
          </div>
          <div className="section-title">Run levers {run ? '' : '(start or continue a run)'}</div>
          <fieldset className="dev-levers num" disabled={!run}>
            <div className="dev-row">
              <span className="dev-k">$ CASH {run ? `$${run.state.cash}` : ''}</span>
              <button onClick={() => lever({ k: 'cash', delta: -10 })}>−10</button>
              <button onClick={() => lever({ k: 'cash', delta: 10 })} data-testid="dev-cash">
                +10
              </button>
              <button onClick={() => lever({ k: 'cash', delta: 50 })}>+50</button>
            </div>
            <div className="dev-row">
              <span className="dev-k">♥ STRESS {run ? run.state.stress : ''}</span>
              <button onClick={() => lever({ k: 'stress', delta: -20 })}>−20</button>
              <button onClick={() => run && lever({ k: 'stress', delta: -run.state.stress })}>0</button>
              <button onClick={() => lever({ k: 'stress', delta: 20 })}>+20</button>
            </div>
            <div className="dev-row">
              <span className="dev-k">🎫 TICKETS / ⟳ REROLLS</span>
              <button onClick={() => lever({ k: 'tickets', delta: 1 })}>+1 ticket</button>
              <button onClick={() => lever({ k: 'rerolls', delta: 1 })}>+1 reroll</button>
            </div>
            <div className="dev-row">
              <span className="dev-k">
                ◎ METER {run ? `${run.state.round.meter}/${run.state.round.target}` : ''}
              </span>
              <button
                onClick={() => run && lever({ k: 'meter', delta: Math.ceil(run.state.round.target / 4) })}
              >
                +25% target
              </button>
              <button
                onClick={() =>
                  run &&
                  lever({ k: 'meter', delta: Math.max(0, run.state.round.target - run.state.round.meter) })
                }
              >
                fill to target
              </button>
            </div>
            <div className="dev-row">
              <select value={cart} onChange={(e) => setCart(e.target.value)} data-testid="dev-cart-pick">
                {CARTRIDGES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.rarity})
                  </option>
                ))}
              </select>
              <button onClick={() => lever({ k: 'cartridge', id: cart })} data-testid="dev-cart-give">
                GIVE CARTRIDGE
              </button>
            </div>
            <div className="dev-row">
              <select value={analyst} onChange={(e) => setAnalyst(e.target.value as AnalystId)}>
                {ANALYST_IDS.map((a) => (
                  <option key={a} value={a}>
                    {ANALYSTS[a].name}
                  </option>
                ))}
              </select>
              <button onClick={() => lever({ k: 'analyst', id: analyst })}>HIRE / LEVEL UP</button>
            </div>
            <div className="dev-row">
              <select value={memo} onChange={(e) => setMemo(e.target.value as MemoId)}>
                {MEMO_IDS.map((m) => (
                  <option key={m} value={m}>
                    {MEMOS[m].name}
                  </option>
                ))}
              </select>
              <button onClick={() => lever({ k: 'memo', id: memo })}>ADD MEMO</button>
            </div>
            <div className="dev-row">
              <select value={voucher} onChange={(e) => setVoucher(e.target.value as VoucherId)}>
                {VOUCHER_IDS.map((v) => (
                  <option key={v} value={v}>
                    {VOUCHERS[v].name}
                  </option>
                ))}
              </select>
              <button onClick={() => lever({ k: 'voucher', id: voucher })}>ADD VOUCHER</button>
            </div>
          </fieldset>
        </section>
      </div>
    </Modal>
  );
}

/** The DEV button and panel, present only with developer mode on. */
export function DevLayer() {
  const dev = useApp((s) => s.settings.game.devMode);
  const [open, setOpen] = useState(false);
  useHotkeys({ devPanel: () => dev && setOpen((o) => !o) });
  if (!dev) return null;
  return (
    <>
      <button
        className="dev-fab num"
        onClick={() => {
          sfx('select');
          setOpen(true);
        }}
        data-testid="dev-fab"
        data-tip-title="Developer mode"
        data-tip-body="Notes, screenshots, unlocks and run levers (Ctrl+Shift+D)."
      >
        DEV
      </button>
      {open && <DevPanel onClose={() => setOpen(false)} />}
    </>
  );
}
