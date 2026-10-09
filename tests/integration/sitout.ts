import type { RunEngine } from '../../src/engine/run/engine';

/** A skip sits the round out: let its days pass (no trades) until the next round is dealt. */
export async function skip(e: RunEngine): Promise<void> {
  const at = `${e.state.quarter}:${e.state.roundIndex}`;
  await e.dispatch({ t: 'skip' });
  for (let guard = 0; guard < 50; guard++) {
    if (
      !e.state.round.sitOut ||
      e.state.phase !== 'round' ||
      `${e.state.quarter}:${e.state.roundIndex}` !== at
    )
      return;
    await e.dispatch({ t: 's', a: { t: 'begin' } });
    await e.dispatch({ t: 's', a: { t: 'end' } });
  }
}

/** One trading day, holding through any decision point. */
export async function day(e: RunEngine): Promise<void> {
  const s = e.session;
  if (!s) return;
  await e.dispatch({ t: 's', a: { t: 'begin' } });
  for (const d of s.decisions.slice())
    await e.dispatch({ t: 's', a: { t: 'decide', dpId: d.id, action: 'hold' } });
  if (e.session === s && s.inDay) await e.dispatch({ t: 's', a: { t: 'end' } });
}
