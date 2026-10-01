import type { Bucket } from '../scoring/calls';
import { STRUCTURES } from './structures';
import type { StructureId } from './types';

/**
 * The structure that fits a call: keep the current one if it already leans the same way,
 * otherwise the playbook's first match (credit first, the way a premium seller trades).
 */
export function fitStructure(
  current: StructureId,
  bucket: Bucket,
  allowed: StructureId[] | null,
): StructureId {
  const want = bucket <= 1 ? 'bear' : bucket >= 3 ? 'bull' : 'neutral';
  if (STRUCTURES[current].bias === want) return current;
  const prefs: Record<string, StructureId[]> = {
    bull: ['bull_put', 'bull_call', 'cash_secured_put', 'diagonal'],
    // A covered call is the call alone (your shares are off the books): it pays below the strike.
    bear: ['bear_call', 'bear_put', 'covered_call'],
    neutral: ['iron_condor', 'iron_fly', 'bwb_condor', 'calendar', 'double_calendar'],
  };
  return prefs[want].find((id) => !allowed || allowed.includes(id)) ?? current;
}
