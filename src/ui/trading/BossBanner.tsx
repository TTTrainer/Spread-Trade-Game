/**
 * The boss's twist, on the chart where the trading happens: one line in the boss's color, plus the
 * one live number that twist depends on (the Collector's next-loss multiplier, the Margin Clerk's
 * cap, the card the Bursar is holding). Nothing shows outside a boss round.
 */

import { lastMark } from '../../engine/lifecycle/position';
import { testedShort } from '../../engine/run/collector';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { useActiveBoss } from '../boss';
import { pct, pnlText, pts } from '../format';
import type { RacePoint } from '../../engine/run/race';
import { useRun } from '../store/run';
import { useTrading } from '../store/trading';
import { showdownLabel, twistLine } from '../../content/bosses';
import type { ReactNode } from 'react';
import type { RunEngine } from '../../engine/run/engine';
import { STRUCTURES } from '../../engine/strategies/structures';

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
  if (rule.interestRate !== undefined) {
    // What he has taken, and the losing trades sitting at a strike now (charged at the close).
    const due = (session?.openPositions() ?? []).filter((p) => {
      const m = lastMark(p);
      return !!m && m.plCents < 0 && !!testedShort(p.legs, m.spot);
    }).length;
    live = `paid −${pts(e.state.round.interest ?? 0)}${due ? ` · ${due} at a strike: charged at the close` : ''}`;
  } else if (rule.lossStreakStep !== undefined) {
    const n = e.lossStreak();
    live = `next loss x${(rule.lossStreakStep ** n).toFixed(2)}`;
  } else if (rule.riskCapMult !== undefined && session) {
    live = `risk cap ${pct(session.config.riskCapPct, 1)} per trade`;
  } else if (rule.leftCartOff) {
    const held = e.state.cartridges[0];
    live = held ? `holding ${CARTRIDGE_BY_ID[held]?.name ?? held}` : 'nothing to hold yet';
  } else if (goal) {
    live = `types ${goal.have}/${goal.need} ${goal.met ? '✔' : ''}`;
  } else if (rule.duel) {
    const d = e.duelNow();
    live = d?.started ? `${d.you >= d.rival ? '▲ AHEAD' : '▼ BEHIND'} of Chad` : 'Chad waits for the clock';
  } else if (race) {
    live = `${race.you >= race.spy ? '▲ AHEAD' : '▼ BEHIND'} of SPY`;
  }
  const style = e.bossStyle();
  return (
    <div className="boss-stack" data-testid="boss-stack">
      <div className="boss-banner num" data-testid="boss-banner" data-tip={`review:${def.market}`}>
        <span className="bb-skull">☠</span>
        <b className="bb-name">{def.name.toUpperCase()}</b>
        {showdownLabel(e.state.round.showdown ?? 0) && (
          <span className="bb-showdown">{showdownLabel(e.state.round.showdown ?? 0)}</span>
        )}
        <span className="bb-twist">{twistLine(def.id, e.state.round.showdown ?? 0)}</span>
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
      {rule.duel && <DuelView e={e} />}
    </div>
  );
}

/**
 * A race as two lines since the round began: your trades' P/L against the other line (SPY on the
 * same money for the Rebalancer, Chad's book for the Early Retiree), one point per day's close
 * plus right now.
 */
function Race({
  now,
  days,
  label,
  testId,
  tip,
  children,
}: {
  now: { you: number; them: number };
  days: { you: number; them: number }[];
  label: string;
  testId: string;
  tip: string;
  children?: ReactNode;
}) {
  const pts = [{ you: 0, them: 0 }, ...days, now];
  const w = 320;
  const h = 80;
  const vals = pts.flatMap((p) => [p.you, p.them]);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const x = (i: number) => (pts.length < 2 ? 0 : (i / (pts.length - 1)) * (w - 4) + 2);
  const y = (v: number) => h - 3 - ((v - lo) / Math.max(1, hi - lo)) * (h - 6);
  const line = (k: 'you' | 'them') =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const ahead = now.you >= now.them;
  return (
    <div
      className="boss-race num"
      data-testid={testId}
      data-tip-title={`You vs ${label}`}
      data-tip-body={tip}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-label={`Your P/L against ${label} this round`}
      >
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="br-zero" />
        <path d={line('them')} className="br-spy" />
        <path d={line('you')} className="br-you" />
      </svg>
      <div className="br-legend">
        <span className="br-k you">YOU {pnlText(now.you)}</span>
        <span className="br-k spy">
          {label.toUpperCase()} {pnlText(now.them)}
        </span>
        <b className={ahead ? 'up-text' : 'down-text'}>{ahead ? '▲ AHEAD' : '▼ BEHIND'}</b>
      </div>
      {children}
    </div>
  );
}

function SpyRace({ now, days }: { now: RacePoint; days: RacePoint[] }) {
  return (
    <Race
      now={{ you: now.you, them: now.spy }}
      days={days.map((d) => ({ you: d.you, them: d.spy }))}
      label="SPY"
      testId="spy-race"
      tip="Your trades this round against the same money parked in SPY over the same days. Finish ahead for the full victory; behind, you only survive."
    />
  );
}

/** Chad's book beside yours: the race, and his trades as they stand. */
function DuelView({ e }: { e: RunEngine }) {
  const d = e.duelNow();
  if (!d) return null;
  if (!d.started)
    return (
      <div className="boss-race num duel-wait" data-testid="duel">
        CHAD opens his book on these cards when the clock starts. Finish ahead of his P/L for x1.5 on the
        round.
      </div>
    );
  return (
    <Race
      now={{ you: d.you, them: d.rival }}
      days={(e.state.round.duelRace ?? []).map((x) => ({ you: x.you, them: x.rival }))}
      label="Chad"
      testId="duel"
      tip="Chad trades the same cards in his own book: out-of-the-money call spreads, one contract each, no stops, held to the end. Finish ahead of his P/L and your round scores x1.5; behind him, x0.75 (your closed trades count; his open ones at their mark)."
    >
      <div className="duel-book">
        {d.trades.map((t, i) => (
          <span key={i} className="duel-t">
            {t.symbol} {STRUCTURES[t.structureId].short}{' '}
            <b className={t.plCents >= 0 ? 'up-text' : 'down-text'}>{pnlText(t.plCents)}</b>
            {t.open ? '' : ' ✓'}
          </span>
        ))}
        {d.trades.length === 0 && <span className="dim">no trades (nothing fit)</span>}
      </div>
    </Race>
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
