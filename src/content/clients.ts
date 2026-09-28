/**
 * Clients: fictional, satirical personalities with one trade request each. A client shows up in
 * about 1 round in 3 as an optional side objective. Placing a trade that meets every constraint
 * fills the request (cash + reputation); leaving it unfilled costs only reputation.
 */

import type { StructureFamily } from '../engine/strategies/types';

export interface ClientRequest {
  direction?: 'bull' | 'bear' | 'neutral' | 'long_vol';
  /** Max loss as a fraction of the round's starting equity (shown in dollars). */
  maxLossPct?: number;
  minPop?: number;
  maxDte?: number;
  minDte?: number;
  family?: StructureFamily;
  credit?: boolean;
  /** Reward-to-risk at expiration (max profit / max loss). */
  minRR?: number;
  edgeTop25?: boolean;
}

export interface ClientDef {
  id: string;
  name: string;
  persona: string;
  ask: string;
  request: ClientRequest;
  cash: number;
  reputation: number;
}

export const CLIENTS: ClientDef[] = [
  {
    id: 'treasury7',
    name: 'TREASURY-7',
    persona: "A robotics startup's treasury bot. Has never experienced joy, only yield.",
    ask: 'Defined-risk income. Low drama. High probability.',
    request: { credit: true, maxLossPct: 0.06, minPop: 0.7 },
    cash: 5,
    reputation: 2,
  },
  {
    id: 'marguerite',
    name: "Aunt Marguerite's Family Office",
    persona: 'Four generations of money, one generation of patience. Wants the market to go up politely.',
    ask: 'A bullish position, small risk, back within 45 days.',
    request: { direction: 'bull', maxLossPct: 0.04, maxDte: 45 },
    cash: 4,
    reputation: 1,
  },
  {
    id: 'garage',
    name: 'The Hedge Fund in a Garage',
    persona: 'Two former interns, one espresso machine, a pitch deck titled "Contrarian by Design."',
    ask: 'Something bearish that pays at least 40 cents per dollar risked.',
    request: { direction: 'bear', minRR: 0.4 },
    cash: 5,
    reputation: 2,
  },
  {
    id: 'stroud_trust',
    name: 'The Stroud Family Trust',
    persona: "Bradley's father's trust. Bradley is not allowed to trade it. Nobody will say why.",
    ask: 'Anything with a 75% chance of profit. The trustees like sleeping.',
    request: { minPop: 0.75 },
    cash: 6,
    reputation: 2,
  },
  {
    id: 'dr_penny',
    name: 'Dr. Penny Pincher, DDS',
    persona: 'A dentist with a spreadsheet. Treats every dollar like a molar: extract carefully.',
    ask: 'Collect a credit. Never risk more than 3% of the account.',
    request: { credit: true, maxLossPct: 0.03 },
    cash: 4,
    reputation: 1,
  },
  {
    id: 'meridian',
    name: 'Meridian Municipal Pension',
    persona: 'Guards the retirements of 40,000 bus drivers. Reads every trade confirmation, twice.',
    ask: 'A credit trade, 25 to 50 days out, at least 65% to win.',
    request: { credit: true, minDte: 25, maxDte: 50, minPop: 0.65 },
    cash: 5,
    reputation: 3,
  },
  {
    id: 'crypto_kyle',
    name: 'Crypto Kyle',
    persona: 'Owns four hardware wallets and zero curtains. Believes a week is a long-term hold.',
    ask: 'A weekly: 10 days or less. Direction optional, adrenaline required.',
    request: { maxDte: 10 },
    cash: 4,
    reputation: 1,
  },
  {
    id: 'lesser_duchy',
    name: 'Sovereign Fund of a Lesser Duchy',
    persona: 'A nation of 9,000 people and one very serious spreadsheet about range-bound markets.',
    ask: 'A neutral position that profits if nothing happens. Nothing is their national pastime.',
    request: { direction: 'neutral', family: 'condor' },
    cash: 6,
    reputation: 3,
  },
  {
    id: 'vol_bros',
    name: 'Vol Bros LLC',
    persona: 'Buy volatility, lift weights, discuss both at length.',
    ask: 'Long volatility. They want to be paid when it moves. Anything moves.',
    request: { direction: 'long_vol', family: 'volatility' },
    cash: 5,
    reputation: 2,
  },
  {
    id: 'calm_harbor',
    name: 'Calm Harbor Retirement Village',
    persona: "A residents' investment club that meets Tuesdays after bingo. Fierce about dividends.",
    ask: 'Income on stock they would be happy to own.',
    request: { family: 'income', minPop: 0.6 },
    cash: 5,
    reputation: 2,
  },
  {
    id: 'temporal',
    name: 'Temporal Arbitrage Partners',
    persona: 'Their logo is a clock with no hands. Their office is always about to be moved.',
    ask: 'A time spread: sell the front month, own the back.',
    request: { family: 'calendar' },
    cash: 5,
    reputation: 2,
  },
  {
    id: 'influencer',
    name: 'Gregory, Finance Influencer',
    persona: '2.3 million followers, 11 trades. Needs content. Needs it to look amazing in a thumbnail.',
    ask: 'A debit spread that pays at least 1.5 times what it risks.',
    request: { credit: false, minRR: 1.5, family: 'vertical' },
    cash: 4,
    reputation: 1,
  },
  {
    id: 'lemonade',
    name: 'Quantum Lemonade Co.',
    persona: 'A beverage startup valued at more than several actual lemon orchards.',
    ask: 'Hedge their exposure: a bearish trade, max loss 5%, at least 60% to win.',
    request: { direction: 'bear', maxLossPct: 0.05, minPop: 0.6 },
    cash: 5,
    reputation: 2,
  },
  {
    id: 'the_committee',
    name: 'The Investment Committee',
    persona: 'Seven people, one opinion, zero ownership of it.',
    ask: 'A trade priced in the top 25% of its chain (Edge Rank). They like good prices. They love blaming bad ones.',
    request: { edgeTop25: true },
    cash: 6,
    reputation: 2,
  },
];

export const CLIENT_BY_ID: Record<string, ClientDef> = Object.fromEntries(CLIENTS.map((c) => [c.id, c]));
