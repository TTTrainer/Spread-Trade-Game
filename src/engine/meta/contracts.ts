/**
 * The Contracts board: each week, five clients post one request each on a blind window. Filling
 * the request pays Bonus; the trade then plays out and pays more if it made money. The board is
 * seeded by the week, so it is the same all week and replays exactly.
 */

import { CLIENTS, type ClientDef } from '../../content/clients';
import { DESKS, DESK_ORDER } from '../../content/desks';
import { CONTRACTS } from '../../content/meta';
import type { DeskId } from '../../content/types';
import type { WindowDef } from '../market/types';
import { Rng } from '../rng';
import { STRUCTURES } from '../strategies/structures';
import type { StructureId } from '../strategies/types';
import { clientChecks, clientFitsDesk, type ClientTradeFacts } from '../run/clients';
import { dealWindows } from '../run/deal';

export interface Contract {
  id: string;
  week: string;
  clientId: string;
  windowId: number;
  /** Bonus for filling the request. */
  reward: number;
  /** Desks whose playbook can fill it. */
  desks: DeskId[];
}

export function contractBoard(windows: WindowDef[], indexSymbols: Set<string>, week: string): Contract[] {
  const rng = new Rng(`contracts:${week}`);
  const clients = rng.shuffle(CLIENTS).slice(0, CONTRACTS.perWeek);
  const { windows: dealt } = dealWindows(windows, rng.fork('deal'), {
    count: clients.length,
    excludeWindows: new Set(),
    excludeSymbols: new Set(),
    indexSymbols,
  });
  return clients.slice(0, dealt.length).map((c, i) => ({
    id: `${week}:${c.id}`,
    week,
    clientId: c.id,
    windowId: dealt[i].id,
    reward: c.cash * CONTRACTS.bonusPerCash,
    desks: DESK_ORDER.filter((d) => clientFitsDesk(c, d)),
  }));
}

/** Structures the player may use on a contract: their unlocked desks' playbooks that fit. */
export function contractStructures(c: ClientDef, unlocked: DeskId[]): StructureId[] {
  const out = new Set<StructureId>();
  for (const d of unlocked)
    for (const s of DESKS[d].structures) {
      const def = STRUCTURES[s];
      const r = c.request;
      if (
        (!r.family || def.family === r.family) &&
        (!r.direction || def.bias === r.direction) &&
        (r.credit === undefined || def.credit === r.credit)
      )
        out.add(s);
    }
  // Defined-risk spreads first: a cash-secured put or covered call ties up 100 shares' worth of cash,
  // which breaks a contract's risk cap on a small account, so it shouldn't be the one picked for you.
  return [...out].sort((a, b) => +(STRUCTURES[a].family === 'income') - +(STRUCTURES[b].family === 'income'));
}

export function contractFilled(c: ClientDef, facts: ClientTradeFacts, startEquityCents: number): boolean {
  return clientChecks(c.request, facts, startEquityCents).every((k) => k.pass);
}

/** Bonus for a finished contract: the reward if filled, plus half again if the trade made money. */
export function contractPayout(reward: number, filled: boolean, realizedCents: number): number {
  if (!filled) return 0;
  return reward + (realizedCents > 0 ? Math.round(reward * CONTRACTS.profitBonusFrac) : 0);
}
