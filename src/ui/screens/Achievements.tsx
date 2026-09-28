import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, evaluateAchievements } from '../../content/achievements';
import { checkAchievements, loadAchievementCtx, type Unlocked } from '../achievements';
import { hasBridge } from '../bridge';
import { Meter } from '../components/ui';
import { useApp } from '../store/app';
import { ArtIcon } from '../art';
import './screens.css';
import './achievements.css';

export function AchievementsScreen() {
  const back = useApp((s) => s.back);
  const [rows, setRows] = useState<ReturnType<typeof evaluateAchievements>>([]);
  const [unlocked, setUnlocked] = useState<Unlocked>({});
  useEffect(() => {
    if (!hasBridge()) return;
    void (async () => {
      setUnlocked(await checkAchievements(false));
      setRows(evaluateAchievements(await loadAchievementCtx()));
    })();
  }, []);
  const done = rows.filter((r) => r.done).length;
  const bonus = rows.filter((r) => r.done).reduce((a, r) => a + r.def.bonus, 0);
  return (
    <div className="screen achievements" data-testid="achievements-screen">
      <div className="ach-head">
        <h1 className="screen-title">ACHIEVEMENTS</h1>
        <div className="num tb-item">
          {done} / {ACHIEVEMENTS.length} · <span className="amber-text">+{bonus} Bonus</span>
        </div>
        <button className="pixel-btn" onClick={back}>
          ◀ BACK
        </button>
      </div>
      <div className="ach-grid">
        {rows.map(({ def, have, need, done: ok }) => {
          const secret = def.hidden && !ok;
          return (
            <div key={def.id} className={`ach panel ${ok ? 'done' : ''}`} data-testid={`ach-${def.id}`}>
              {!secret && (
                <ArtIcon category="achievement" id={def.id} name={def.name} onlyIfUploaded scale={2} />
              )}
              <div className="ach-name">{secret ? '???' : def.name}</div>
              <div className="ach-text">{secret ? 'A hidden achievement.' : def.text}</div>
              <Meter
                value={have}
                max={need}
                tone={ok ? 'cyan' : 'amber'}
                label={
                  ok
                    ? `done ${unlocked[def.id]?.slice(0, 10) ?? ''}`
                    : `${have.toLocaleString()} / ${need.toLocaleString()}`
                }
              />
              <div className="ach-bonus num">+{def.bonus} Bonus</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
