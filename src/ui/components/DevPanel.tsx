/**
 * Developer mode (Settings → Game): a DEV button and panel (Ctrl+Shift+D) for playtesting.
 * Playtest notes stamped with where you are (screen, run, round, day, card) plus an optional
 * screenshot; "unlock everything"; and run levers (cash, stress, tickets, meter, any cartridge,
 * analyst, memo or voucher). Run levers go through the run's action log like any other action.
 */

import { useEffect, useState } from 'react';
import { ANALYSTS, ANALYST_IDS } from '../../content/analysts';
import { BOSSES, BOSS_IDS, type BossId } from '../../content/bosses';
import { CARTRIDGES } from '../../content/cartridges';
import { DEV_CHECKS, type DevSetup } from '../../content/devChecklist';
import { OPTIONS_COURSE } from '../../content/optionsCourse';
import { MEMOS, MEMO_IDS, VOUCHERS, VOUCHER_IDS } from '../../content/items';
import type { AnalystId, MemoId, VoucherId } from '../../content/types';
import { unlockEverything } from '../../engine/meta/profile';
import type { DevOp } from '../../engine/run/types';
import { sfx } from '../../audio/sfx';
import { bridge, hasBridge } from '../bridge';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useBuilder } from '../store/builder';
import { useProfile } from '../store/profile';
import { startTutorial, useRun } from '../store/run';
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

interface CheckResult {
  status: 'ok' | 'issue' | null;
  note: string;
  at?: string;
}

const CHECKS_KEY = 'devChecklist';

/** The checklist for the dev: by group, each check's result and note, then the playtest notes. */
function checklistMarkdown(res: Record<string, CheckResult>, version: string, notes: DevNote[]): string {
  const mark = (r?: CheckResult) => (r?.status === 'ok' ? '[x]' : r?.status === 'issue' ? '[!]' : '[ ]');
  const groups = [...new Set(DEV_CHECKS.map((c) => c.group))];
  const done = DEV_CHECKS.filter((c) => res[c.id]?.status).length;
  const issues = DEV_CHECKS.filter((c) => res[c.id]?.status === 'issue').length;
  return [
    `# Test checklist · Spread Trading Game ${version}`,
    '',
    `Saved ${new Date().toLocaleString()}. ${done} of ${DEV_CHECKS.length} checked, ${issues} with a problem. [x] works, [!] problem, [ ] not tried.`,
    ...groups.flatMap((g) => [
      '',
      `## ${g}`,
      '',
      ...DEV_CHECKS.filter((c) => c.group === g).map((c) => {
        const r = res[c.id];
        return `- ${mark(r)} **${c.title}** (${c.ver})${r?.note ? `: ${r.note}` : ''}${r?.at ? ` _(${r.at})_` : ''}`;
      }),
    ]),
    ...(notes.length ? ['', notesMarkdown(notes).replace(/^# /, '## ')] : []),
  ].join('\n');
}

const waitFor = async (ok: () => boolean, ms = 20_000): Promise<boolean> => {
  const t0 = Date.now();
  while (!ok() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  return ok();
};

/** Into the Trade Builder, then the ticker, payoff, ticker list or course lesson a check needs. */
async function builderSetup(b: NonNullable<DevSetup['builder']>): Promise<void> {
  const app = useApp.getState();
  if (b.lesson) {
    const idx = Math.max(
      0,
      OPTIONS_COURSE.findIndex((l) => l.id === b.lesson),
    );
    app.updateSettings((st) => ({
      ...st,
      game: { ...st.game, courseProgress: { idx, done: st.game.courseProgress?.done ?? [] } },
    }));
  }
  app.go('builder');
  // The builder opens its first ticker on arrival; without any data there's nothing more to set.
  const ready = await waitFor(() => {
    const s = useBuilder.getState().session;
    return !!s && useTrading.getState().session === s && !useBuilder.getState().loading;
  });
  if (b.ticker) await useBuilder.getState().open(b.ticker);
  if (!ready) return;
  const t = useTrading.getState();
  if (b.payoff) t.setPayoffOpen(true);
  if (b.tickers) useBuilder.getState().setTickersOpen(true);
  if (b.lesson) {
    // Away and back, so the course opens at the lesson just set.
    t.setRightTab('trade');
    await new Promise((r) => setTimeout(r, 50));
    useTrading.getState().setRightTab('learn');
  }
}

/** Run a check's setup through the same store actions the screens use. */
async function runSetup(s: DevSetup): Promise<void> {
  const app = useApp.getState();
  if (s.game) app.updateSettings((st) => ({ ...st, game: { ...st.game, ...s.game } }));
  if (s.tutorial) {
    if (await startTutorial()) app.go('run');
    return;
  }
  if (s.screen === 'live') return app.go('live');
  if (s.screen === 'settingsData') {
    useApp.setState({ settingsAt: 'data' });
    return app.go('settings');
  }
  if (s.builder) return builderSetup(s.builder);
  const run = useRun.getState();
  if (s.run) {
    await run.newRun({
      deskId: 'verticals',
      seed: `devcheck-${Date.now().toString(36)}`,
      compliance: s.compliance,
    });
    app.go('run');
  }
  const act = useRun.getState().act;
  if (s.cash) await act({ t: 'dev', op: { k: 'cash', delta: s.cash } });
  if (s.closeMenu || s.boss) await act({ t: 'boardDone' });
  if (s.boss) await act({ t: 'dev', op: { k: 'boss', id: s.boss } });
  if (s.clearReview) {
    await act({ t: 'startReview' });
    const target = useRun.getState().engine?.state.round.target ?? 0;
    await act({ t: 'dev', op: { k: 'meter', delta: target * 2 } });
    await act({ t: 'endRound' });
  }
}

/** The test checklist: try each thing, tick it (worked or a problem) and leave a note. */
function Checklist({ onClose }: { onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const [res, setRes] = useState<Record<string, CheckResult>>({});
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState<DevNote[]>([]);
  useEffect(() => {
    if (!hasBridge()) return;
    void bridge()
      .invoke('user.get', CHECKS_KEY)
      .then((r) => setRes(((r as Record<string, CheckResult> | null) ?? {}) as Record<string, CheckResult>));
    void bridge()
      .invoke('system.info')
      .then((i) => setVersion(i.version));
    void loadNotes().then(setNotes);
  }, []);
  const markdown = () => checklistMarkdown(res, version, notes);
  const save = (next: Record<string, CheckResult>) => {
    setRes(next);
    if (hasBridge()) void bridge().invoke('user.set', CHECKS_KEY, next);
  };
  const update = (id: string, patch: Partial<CheckResult>) =>
    save({
      ...res,
      [id]: {
        status: patch.status !== undefined ? patch.status : (res[id]?.status ?? null),
        note: patch.note ?? res[id]?.note ?? '',
        at: new Date().toLocaleString(),
      },
    });
  const done = DEV_CHECKS.filter((c) => res[c.id]?.status).length;
  const groups = [...new Set(DEV_CHECKS.map((c) => c.group))];
  return (
    <section className="dev-sec dev-checks" data-testid="dev-checklist">
      <div className="dev-row">
        <span className="num">
          <b>{done}</b> of {DEV_CHECKS.length} checked
        </span>
        <span className="dim small">
          What changed since 1.6. SET UP takes you to it (a run check replaces the current run).
        </span>
      </div>
      <div className="dc-list">
        {groups.map((g) => (
          <div key={g} className="dc-group">
            <div className="section-title">{g}</div>
            {DEV_CHECKS.filter((c) => c.group === g).map((c) => {
              const r = res[c.id];
              return (
                <div key={c.id} className={`dc-row ${r?.status ?? ''}`} data-testid={`check-${c.id}`}>
                  <div className="dc-main">
                    <b>
                      {c.title} <span className="dc-ver">{c.ver}</span>
                    </b>
                    <div className="dim small">{c.look}</div>
                    <input
                      className="dc-note"
                      value={r?.note ?? ''}
                      placeholder="Note (what happened)…"
                      onChange={(e) => update(c.id, { note: e.target.value })}
                      data-testid={`check-note-${c.id}`}
                    />
                  </div>
                  <div className="dc-btns">
                    {c.setup && (
                      <button
                        className="pixel-btn small"
                        onClick={async () => {
                          sfx('click');
                          onClose();
                          await runSetup(c.setup!);
                          toast(`Set up: ${c.title}`, 'info');
                        }}
                        data-testid={`check-setup-${c.id}`}
                      >
                        ▶ SET UP
                      </button>
                    )}
                    <button
                      className={`pixel-btn small ${r?.status === 'ok' ? 'primary' : ''}`}
                      onClick={() => update(c.id, { status: r?.status === 'ok' ? null : 'ok' })}
                      data-testid={`check-ok-${c.id}`}
                    >
                      ✔ WORKS
                    </button>
                    <button
                      className={`pixel-btn small ${r?.status === 'issue' ? 'danger' : ''}`}
                      onClick={() => update(c.id, { status: r?.status === 'issue' ? null : 'issue' })}
                      data-testid={`check-issue-${c.id}`}
                    >
                      ✘ PROBLEM
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="dev-row">
        <button
          className="pixel-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(markdown());
            toast('Checklist copied.', 'good');
          }}
          data-testid="check-copy"
        >
          ⧉ COPY ALL
        </button>
        <button
          className="pixel-btn"
          onClick={async () => {
            if (!hasBridge()) return;
            const path = await bridge().invoke(
              'system.saveTextFile',
              `test-checklist-${version || 'dev'}.md`,
              markdown(),
            );
            if (path) toast(`Checklist saved to ${path}`, 'good');
          }}
          data-testid="check-export"
        >
          ⤓ SAVE AS FILE
        </button>
      </div>
    </section>
  );
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
  const [boss, setBoss] = useState<BossId>('controller');
  const [voucher, setVoucher] = useState<VoucherId>(VOUCHER_IDS[0]);
  const [ctx] = useState(contextLine);
  const [tab, setTab] = useState<'levers' | 'checklist'>('levers');
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
        <div className="dev-tabs">
          <button
            className={`pixel-btn small ${tab === 'levers' ? 'primary' : ''}`}
            onClick={() => setTab('levers')}
            data-testid="dev-tab-levers"
          >
            NOTES &amp; LEVERS
          </button>
          <button
            className={`pixel-btn small ${tab === 'checklist' ? 'primary' : ''}`}
            onClick={() => setTab('checklist')}
            data-testid="dev-tab-checklist"
          >
            ☑ TEST CHECKLIST
          </button>
        </div>
      </div>
      {tab === 'checklist' && <Checklist onClose={onClose} />}
      <div className="dev-grid" hidden={tab !== 'levers'}>
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
              <select
                value={boss}
                onChange={(e) => setBoss(e.target.value as BossId)}
                data-testid="dev-boss-pick"
              >
                {BOSS_IDS.map((b) => (
                  <option key={b} value={b}>
                    {BOSSES[b].name}
                    {BOSSES[b].ready ? '' : ' (not built)'}
                  </option>
                ))}
              </select>
              <button onClick={() => lever({ k: 'boss', id: boss })} data-testid="dev-boss-go">
                FACE THIS BOSS NOW
              </button>
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
