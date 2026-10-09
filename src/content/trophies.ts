/**
 * Boss trophies: beating a boss for the first time in a run hands over a permanent buff themed on
 * it, like a voucher you can't buy. Game layer only (stress, shop, slots, the loss line); none of
 * them touches prices, fills or events. Beating the same boss again (in Endless) pays cash instead.
 */

import type { BossId } from './bosses';
import type { VoucherDef } from './types';

export interface TrophyDef {
  name: string;
  text: string;
  passive: VoucherDef['passive'];
}

export const BOSS_TROPHIES: Record<BossId, TrophyDef> = {
  controller: {
    name: 'Audited Books',
    text: 'Stress gains are 20% smaller for the rest of the run.',
    passive: { stressGainMult: 0.8 },
  },
  margin_clerk: {
    name: 'Liquidity Line',
    text: 'Your per-trade risk cap is 15% larger.',
    passive: { riskCapMult: 1.15 },
  },
  underwriter: {
    name: 'Reinsurance Treaty',
    text: 'The Max-Loss Line sits 5% further away.',
    passive: { maxLossLineDelta: 0.05 },
  },
  landlord: {
    name: 'Rent Roll',
    text: 'Interest pays up to $3 more each round.',
    passive: { interestCapAdd: 3 },
  },
  early_retiree: {
    name: 'FIRE Number',
    text: 'Interest pays up to $2 more, and shop rerolls cost $1 less.',
    passive: { interestCapAdd: 2, rerollCostDelta: -1 },
  },
  tax_man: {
    name: 'Loss Harvest',
    text: 'The first shop reroll every visit is free.',
    passive: { freeFirstShopReroll: true },
  },
  bursar: {
    name: 'Scholarship',
    text: 'The shop shows one more offer.',
    passive: { shopSlotsAdd: 1 },
  },
  allocator: {
    name: 'Rebalanced Book',
    text: 'The shop offers one more analyst.',
    passive: { analystOffersAdd: 1 },
  },
  shell_company: {
    name: 'Nominee Director',
    text: 'Shop rerolls cost $2 less.',
    passive: { rerollCostDelta: -2 },
  },
  executor: {
    name: 'Living Trust',
    text: 'Stress gains are 20% smaller for the rest of the run.',
    passive: { stressGainMult: 0.8 },
  },
  collector: {
    name: 'Debt Paid in Full',
    text: 'Interest pays up to $2 more, and the Max-Loss Line sits 2.5% further away.',
    passive: { interestCapAdd: 2, maxLossLineDelta: 0.025 },
  },
  rebalancer: {
    name: 'Board Seat',
    text: 'One more cartridge slot.',
    passive: { cartridgeSlotsAdd: 1 },
  },
};
