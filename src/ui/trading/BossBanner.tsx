/**
 * The boss's twist, on the chart where the trading happens: one line in the boss's color, plus the
 * one live number that twist depends on (the Collector's next-loss multiplier, the Margin Clerk's
 * cap, the card the Bursar is holding). Nothing shows outside a boss round.
 */

import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { useActiveBoss } from '../boss';
import { pct, pnlText } from '../format';
import type { RacePoint } from '../../engine/run/race';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';

export function BossBanner() {
  const boss = useActiveBoss();
  const e = useRun((s) => s.engine);
  useTrading((s) => s.version);
  const session = useTrading((s) => s.session);
  if (!boss || !e || e.state.phase !== 'round') return null;
  const { def, rule } = boss;
  let live: string | null = null;
  const goal = e.secondGoal();
  const race = e.race();
  if (rule.lossStreakStep !== undefined) {
    const n = e.lossStreak();
    live = `next loss x${(rule.lossStreakStep ** n).toFixed(2)}`;
  } else if (rule.riskCapMult !== undefined && session) {
    live = `risk cap ${pct(session.config.riskCapPct, 1)} per trade`;
  } else if (rule.leftCartOff) {
    const held = e.state.cartridges[0];
    live = held ? `holding ${CARTRIDGE_BY_ID[held]?.name ?? held}` : 'nothing to hold yet';
  } else if (goal) {
    live = `types ${goal.have}/${goal.need} ${goal.met ? '✔' : ''}`;
  } else if (race) {
    live = `${race.you >= race.spy ? '▲ AHEAD' : '▼ BEHIND'} of SPY`;
  }
  const style = e.bossStyle();
  return (
    <div className="boss-stack" data-testid="boss-stack">
      <div className="boss-banner num" data-testid="boss-banner" data-tip={`review:${def.market}`}>
        <span className="bb-skull">☠</span>
        <b className="bb-name">{def.name.toUpperCase()}</b>
        <span className="bb-twist">{def.twistText}</span>
        {live && (
          <span className="bb-live" data-testid="boss-live">
            {live}
          </span>
        )}
      </div>
      {style && (
        <div
          className={`boss-style num ${style.state}`}
          data-testid="boss-style"
          data-tip-title="Style bonus"
          data-tip-body={`Clear the round this way and ${def.name} pays $${style.cash} on top of the round win.`}
        >
          ★ STYLE +${style.cash}: {style.text}{' '}
          <b>{style.state === 'met' ? '✔ MET' : style.state === 'broken' ? '✘ MISSED' : '… ON TRACK'}</b>
        </div>
      )}
      {race && <SpyRace now={race} days={e.state.round.race ?? []} />}
    </div>
  );
}

/**
 * The Rebalancer's race as two lines since the round began: your trades' P/L and the same
 * capital in SPY, one point per day's close plus right now.
 */
function SpyRace({ now, days }: { now: RacePoint; days: RacePoint[] }) {
  const pts = [{ you: 0, spy: 0 }, ...days, now];
  const w = 220;
  const h = 46;
  const vals = pts.flatMap((p) => [p.you, p.spy]);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const x = (i: number) => (pts.length < 2 ? 0 : (i / (pts.length - 1)) * (w - 4) + 2);
  const y = (v: number) => h - 3 - ((v - lo) / Math.max(1, hi - lo)) * (h - 6);
  const line = (k: 'you' | 'spy') =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const ahead = now.you >= now.spy;
  return (
    <div
      className="boss-race num"
      data-testid="spy-race"
      data-tip-title="You vs SPY"
      data-tip-body="Your trades this round against the same money parked in SPY over the same days. Finish ahead for the full victory; behind, you only survive."
    >
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Your P/L against SPY this round">
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="br-zero" />
        <path d={line('spy')} className="br-spy" />
        <path d={line('you')} className="br-you" />
      </svg>
      <div className="br-legend">
        <span className="br-k you">YOU {pnlText(now.you)}</span>
        <span className="br-k spy">SPY {pnlText(now.spy)}</span>
        <b className={ahead ? 'up-text' : 'down-text'}>{ahead ? '▲ AHEAD' : '▼ BEHIND'}</b>
      </div>
    </div>
  );
}

/** A stamp across a panel the boss has locked ("SEALED", "TUITION"). */
export function LockStamp({ text, by }: { text: string; by: string }) {
  return (
    <span className="lock-stamp num" title={`${by} has locked this for the round`} data-testid="lock-stamp">
      🔒 {text}
    </span>
  );
}

/** A number a boss has sealed: a lock in its color, and who did it on hover. */
export function SealedText({ by, text = 'SEALED' }: { by: string; text?: string }) {
  return (
    <span className="sealed-num num" title={`${by} has sealed this for the round`} data-testid="sealed-num">
      🔒 {text}
    </span>
  );
}
