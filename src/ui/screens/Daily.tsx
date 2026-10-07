import { useEffect, useState } from 'react';
import { DESKS } from '../../content/desks';
import { DAILY_DESKS } from '../../content/meta';
import { dailyKey, liveStreak } from '../../engine/meta/profile';
import { sfx } from '../../audio/sfx';
import { Portrait } from '../components/Portrait';
import { bridge, hasBridge } from '../bridge';
import { useApp } from '../store/app';
import { useProfile } from '../store/profile';
import { computeGhost, useRun, type DailyGhost } from '../store/run';
import { pts } from '../format';
import './screens.css';
import './modes.css';

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}

export function dailyToday(now = new Date()): {
  key: string;
  seed: string;
  desk: (typeof DAILY_DESKS)[number];
} {
  const key = dailyKey(now);
  return { key, seed: `daily-${key}`, desk: DAILY_DESKS[dayOfYear(now) % DAILY_DESKS.length] };
}

export function DailyScreen() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const { profile, load } = useProfile();
  const { newRun, resume, busy, checkSave, saveSummary, setGhost } = useRun();
  const [ghost, setLocalGhost] = useState<DailyGhost | null>(null);
  const [thinking, setThinking] = useState(false);
  const today = dailyToday();
  const result = profile.daily.results[today.key];
  const staleSave = !!saveSummary && saveSummary.seed !== today.seed;

  useEffect(() => {
    void load();
    void checkSave('daily');
    if (hasBridge())
      void bridge()
        .invoke('user.get', 'dailyGhost')
        .then((g) => {
          const x = g as DailyGhost | null;
          if (x?.seed === today.seed) setLocalGhost(x);
        });
  }, []);

  const start = async () => {
    sfx('whoosh');
    let g = ghost;
    if (!g) {
      setThinking(true);
      try {
        g = await computeGhost(today.seed, today.desk);
        setLocalGhost(g);
      } finally {
        setThinking(false);
      }
    }
    setGhost(g);
    if (await newRun({ deskId: today.desk, seed: today.seed, mode: 'daily', quarters: 1, slot: 'daily' }))
      go('run');
  };
  const cont = async () => {
    setGhost(ghost);
    if (await resume('daily')) go('run');
  };

  const recent = Object.entries(profile.daily.results)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 7);

  return (
    <div className="screen daily" data-testid="daily-screen">
      <h1 className="screen-title">DAILY</h1>
      <p className="screen-sub">
        One seeded quarter (Month 1, Month 2, a Review), the same for everyone today, on default rules. Beat
        Bradley's ghost and keep your streak.
      </p>
      <div className="mode-grid">
        <div className="panel mode-card">
          <div className="section-title">Today · {today.key}</div>
          <div className="num big-line">
            {DESKS[today.desk].name.toUpperCase()} DESK <span className="dim">· seed {today.seed}</span>
          </div>
          <div className="num" data-testid="daily-streak">
            Streak <b className="amber-text">{liveStreak(profile, today.key)}</b> day(s) · best{' '}
            {profile.daily.bestStreak}
          </div>
          {result ? (
            <div className="daily-done num" data-testid="daily-result">
              Done today: {pts(result.points)} points ({result.outcome}), Bradley {pts(result.ghost)}.{' '}
              <span className={result.points > result.ghost ? 'up-text' : 'down-text'}>
                {result.points > result.ghost ? 'You won the day.' : 'Bradley won the day.'}
              </span>{' '}
              Come back tomorrow for a new seed.
            </div>
          ) : saveSummary && !staleSave ? (
            <button
              className="pixel-btn primary"
              onClick={() => void cont()}
              disabled={busy}
              data-testid="daily-continue"
            >
              {busy ? 'LOADING…' : 'CONTINUE TODAY ▶'}
            </button>
          ) : (
            <button
              className="pixel-btn primary"
              onClick={() => void start()}
              disabled={busy || thinking}
              data-testid="daily-start"
            >
              {thinking ? 'BRADLEY IS TRADING YOUR SEED…' : busy ? 'DEALING…' : "PLAY TODAY'S DAILY ▶"}
            </button>
          )}
          {staleSave && !result && (
            <p className="dim">
              An unfinished Daily from another day is set aside; today's seed starts fresh.
            </p>
          )}
        </div>
        <div className="panel mode-card ghost-card">
          <Portrait
            id="bradley"
            mood={ghost && result && result.points > ghost.total ? 'angry' : 'happy'}
            scale={2}
          />
          <div>
            <div className="section-title">Bradley's ghost</div>
            {ghost ? (
              <div className="num" data-testid="ghost-score">
                {pts(ghost.total)} points ·{' '}
                {ghost.rounds.map((r, i) => (
                  <span key={i} className="dim">
                    {['M1', 'M2', 'Rev'][i]} {pts(r)}{' '}
                  </span>
                ))}
              </div>
            ) : (
              <div className="dim">He plays today's seed when you start. By the book. Every time.</div>
            )}
            <p className="dim small">"I don't need luck. I have a process. And a trust fund."</p>
          </div>
        </div>
      </div>
      {recent.length > 0 && (
        <div className="panel mode-card">
          <div className="section-title">Last days</div>
          <table className="end-rounds num">
            <thead>
              <tr>
                <th>Day</th>
                <th>You</th>
                <th>Bradley</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(([k, r]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{pts(r.points)}</td>
                  <td>{pts(r.ghost)}</td>
                  <td className={r.points > r.ghost ? 'up-text' : 'down-text'}>{r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="modal-actions">
        <button className="pixel-btn" onClick={back}>
          BACK
        </button>
      </div>
    </div>
  );
}
