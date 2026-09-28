/**
 * Client requests: which constraints a trade meets. The builder shows the checklist live and the
 * engine fills the request when a placed trade passes every line.
 */

import type { ClientDef, ClientRequest } from '../../content/clients';
import { DESKS } from '../../content/desks';
import type { DeskId } from '../../content/types';
import { formatCents } from '../money';
import { STRUCTURES } from '../strategies/structures';
import type { StructureId } from '../strategies/types';

export interface ClientTradeFacts {
  structureId: StructureId;
  maxLossCents: number;
  pop: number;
  dte: number;
  credit: boolean;
  rewardToRisk: number | null;
  edgeTier: 'top10' | 'top25' | 'none' | null;
}

export interface ClientCheck {
  label: string;
  pass: boolean;
}

export function clientChecks(
  req: ClientRequest,
  t: ClientTradeFacts | null,
  startEquityCents: number,
): ClientCheck[] {
  const out: ClientCheck[] = [];
  const def = t ? STRUCTURES[t.structureId] : null;
  if (req.direction) {
    const name =
      req.direction === 'long_vol'
        ? 'long volatility'
        : req.direction === 'bull'
          ? 'bullish'
          : req.direction === 'bear'
            ? 'bearish'
            : 'neutral';
    out.push({ label: `Direction: ${name}`, pass: !!def && def.bias === req.direction });
  }
  if (req.family) out.push({ label: `Structure: ${req.family}`, pass: !!def && def.family === req.family });
  if (req.credit !== undefined)
    out.push({
      label: req.credit ? 'Opens for a credit' : 'Opens for a debit',
      pass: !!t && t.credit === req.credit,
    });
  if (req.maxLossPct !== undefined) {
    const cap = Math.round(startEquityCents * req.maxLossPct);
    out.push({ label: `Max loss ≤ ${formatCents(cap)}`, pass: !!t && t.maxLossCents <= cap });
  }
  if (req.minPop !== undefined)
    out.push({ label: `POP ≥ ${Math.round(req.minPop * 100)}%`, pass: !!t && t.pop >= req.minPop - 1e-9 });
  if (req.minDte !== undefined) out.push({ label: `DTE ≥ ${req.minDte}`, pass: !!t && t.dte >= req.minDte });
  if (req.maxDte !== undefined) out.push({ label: `DTE ≤ ${req.maxDte}`, pass: !!t && t.dte <= req.maxDte });
  if (req.minRR !== undefined)
    out.push({
      label: `Reward/risk ≥ ${req.minRR}`,
      pass: !!t && t.rewardToRisk !== null && t.rewardToRisk >= req.minRR - 1e-9,
    });
  if (req.edgeTop25)
    out.push({ label: 'Edge Rank top 25%', pass: !!t && (t.edgeTier === 'top10' || t.edgeTier === 'top25') });
  return out;
}

/** Can this desk's playbook satisfy the request at all? */
export function clientFitsDesk(c: ClientDef, desk: DeskId): boolean {
  const structures = DESKS[desk].structures.map((s) => STRUCTURES[s]);
  const r = c.request;
  return structures.some(
    (d) =>
      (!r.family || d.family === r.family) &&
      (!r.direction || d.bias === r.direction) &&
      (r.credit === undefined || d.credit === r.credit),
  );
}
