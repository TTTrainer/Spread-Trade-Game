/** Memos (consumables), vouchers (permanent for the run) and tags (rewards for skipping). */

import type { MemoDef, MemoId, TagDef, TagId, VoucherDef, VoucherId } from './types';

export const MEMOS: Record<MemoId, MemoDef> = {
  reroll: {
    id: 'reroll',
    name: 'Reroll Memo',
    text: 'Redraw every lineup card you have not traded.',
    when: 'before_clock',
  },
  extra_ticket: {
    id: 'extra_ticket',
    name: 'Extra Ticket',
    text: '+1 trade this round.',
    when: 'before_clock',
  },
  time_skip: {
    id: 'time_skip',
    name: 'Time Skip',
    text: 'Enter the selected card 2 trading days later (see more bars first).',
    when: 'before_clock',
  },
  roll_voucher: {
    id: 'roll_voucher',
    name: 'Roll Voucher',
    text: 'Your next roll fills at mid.',
    when: 'anytime',
  },
  vacation: { id: 'vacation', name: 'Vacation Day', text: '-30 stress.', when: 'anytime' },
  lens: { id: 'lens', name: 'Lens', text: 'Sector and size for all cards this round.', when: 'anytime' },
  hedge: {
    id: 'hedge',
    name: 'Hedge Memo',
    text: 'Your next losing trade counts 50% on the meter.',
    when: 'anytime',
  },
  analyst_loan: {
    id: 'analyst_loan',
    name: 'Analyst Loan',
    text: 'Borrow any analyst you do not have for this round.',
    when: 'anytime',
  },
  due_diligence: {
    id: 'due_diligence',
    name: 'Due Diligence',
    text: "The selected card's last 5 earnings reactions.",
    when: 'anytime',
  },
  double_down: {
    id: 'double_down',
    name: 'Double Down',
    text: "Your next trade's meter points x2, gains and losses.",
    when: 'before_clock',
  },
  compliance_waiver: {
    id: 'compliance_waiver',
    name: 'Compliance Waiver',
    text: 'No Max-Loss Line this round. +20 stress.',
    when: 'before_clock',
  },
};

export const MEMO_IDS = Object.keys(MEMOS) as MemoId[];

export const VOUCHERS: Record<VoucherId, VoucherDef> = {
  second_monitor: {
    id: 'second_monitor',
    name: 'Second Monitor',
    text: '+1 lineup card.',
    passive: { lineupAdd: 1 },
  },
  terminal_pro: {
    id: 'terminal_pro',
    name: 'Terminal Pro',
    text: '+1 analyst seat.',
    passive: { analystSeatsAdd: 1 },
  },
  prime_broker: {
    id: 'prime_broker',
    name: 'Prime Broker',
    text: '+1 cartridge slot.',
    passive: { cartridgeSlotsAdd: 1 },
  },
  dma: {
    id: 'dma',
    name: 'DMA',
    text: 'Fills 10% closer to mid.',
    passive: { execution: { marketImprove: 0.1, limitBoost: 0.1 } },
  },
  margin_upgrade: {
    id: 'margin_upgrade',
    name: 'Margin Upgrade',
    text: 'Risk cap +20%.',
    passive: { riskCapMult: 1.2 },
  },
  algo_execution: {
    id: 'algo_execution',
    name: 'Algo Execution',
    text: 'Brackets execute automatically at your desk defaults (no confirm step).',
    passive: { autoBrackets: true },
  },
  research_budget: {
    id: 'research_budget',
    name: 'Research Budget',
    text: '+1 analyst offer in every shop.',
    passive: { analystOffersAdd: 1 },
  },
  clearance: { id: 'clearance', name: 'Clearance', text: 'Shop prices -25%.', passive: { priceMult: 0.75 } },
  seed_capital: {
    id: 'seed_capital',
    name: 'Seed Capital',
    text: '+$10 now and interest cap +$1.',
    passive: { interestCapAdd: 1 },
    cashNow: 10,
  },
  risk_committee: {
    id: 'risk_committee',
    name: 'Friend on the Risk Committee',
    text: 'Max-Loss Line +1% (looser).',
    passive: { maxLossLineDelta: 0.01 },
  },
};

export const VOUCHER_IDS = Object.keys(VOUCHERS) as VoucherId[];

export const TAGS: Record<TagId, TagDef> = {
  discipline: { id: 'discipline', name: 'Discipline Tag', text: '-20 stress, +$4.' },
  analyst: { id: 'analyst', name: 'Analyst Tag', text: 'A free analyst in the next shop.' },
  cartridge: { id: 'cartridge', name: 'Cartridge Tag', text: 'A free Uncommon cartridge in the next shop.' },
  playbook: { id: 'playbook', name: 'Playbook Tag', text: '2 free Playbook Pages for your desk.' },
  investment: { id: 'investment', name: 'Investment Tag', text: '+$15 after the next Review.' },
  double: { id: 'double', name: 'Double Tag', text: 'Copies the next tag you get.' },
  reroll: { id: 'reroll', name: 'Reroll Tag', text: '2 free rerolls in the next shop.' },
  calm: { id: 'calm', name: 'Calm Tag', text: "Next round's Max-Loss Line +2% (looser)." },
};

export const TAG_IDS = Object.keys(TAGS) as TagId[];
