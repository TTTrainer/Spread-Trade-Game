/**
 * The boss's twist, on the chart where the trading happens: one line in the boss's color, plus the
 * one live number that twist depends on (the Collector's next-loss multiplier, the Margin Clerk's
 * cap, the card the Bursar is holding). Nothing shows outside a boss round.
 */

import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { useActiveBoss } from '../boss';
import { pct } from '../format';
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
  if (rule.lossStreakStep !== undefined) {
    const n = e.lossStreak();
    live = `next loss x${(rule.lossStreakStep ** n).toFixed(2)}`;
  } else if (rule.riskCapMult !== undefined && session) {
    live = `risk cap ${pct(session.config.riskCapPct, 1)} per trade`;
  } else if (rule.leftCartOff) {
    const held = e.state.cartridges[0];
    live = held ? `holding ${CARTRIDGE_BY_ID[held]?.name ?? held}` : 'nothing to hold yet';
  }
  return (
    <div className="boss-banner num" data-testid="boss-banner" data-tip={`review:${def.market}`}>
      <span className="bb-skull">☠</span>
      <b className="bb-name">{def.name.toUpperCase()}</b>
      <span className="bb-twist">{def.twistText}</span>
      {live && <span className="bb-live">{live}</span>}
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
