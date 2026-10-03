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
    text: 'Stress gains are 10% smaller for the rest of the run.',
    passive: { stressGainMult: 0.9 },
  },
  margin_clerk: {
    name: 'Liquidity Line',
    text: 'Your per-trade risk cap is 10% larger.',
    passive: { riskCapMult: 1.1 },
  },
  underwriter: {
    name: 'Reinsurance Treaty',
    text: 'The Max-Loss Line sits 1% further away.',
    passive: { maxLossLineDelta: 0.01 },
  },
  landlord: {
    name: 'Rent Roll',
    text: 'Interest pays up to $2 more each round.',
    passive: { interestCapAdd: 2 },
  },
  early_retiree: {
    name: 'FIRE Number',
    text: 'Interest pays up to $1 more, and shop rerolls cost $1 less.',
    passive: { interestCapAdd: 1, rerollCostDelta: -1 },
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
    text: 'Shop rerolls cost $1 less.',
    passive: { rerollCostDelta: -1 },
  },
  executor: {
    name: 'Living Trust',
    text: 'Stress gains are 10% smaller for the rest of the run.',
    passive: { stressGainMult: 0.9 },
  },
  collector: {
    name: 'Debt Paid in Full',
    text: 'Interest pays up to $1 more, and the Max-Loss Line sits 0.5% further away.',
    passive: { interestCapAdd: 1, maxLossLineDelta: 0.005 },
  },
  rebalancer: {
    name: 'Board Seat',
    text: 'One more cartridge slot.',
    passive: { cartridgeSlotsAdd: 1 },
  },
};
