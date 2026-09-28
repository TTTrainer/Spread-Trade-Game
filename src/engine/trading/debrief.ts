/**
 * The debrief for one closed trade: the reveal (real ticker and dates), why it made or lost
 * money, the process grade, mistake tags, what else you could have done, and the call result.
 */

import { diffDays, type ISODate } from '../calendar';
import type { Cents } from '../money';
import type { ContractKey, OptionQuote } from '../market/types';
import type { Position } from '../lifecycle/types';
import { attribute, type Attribution } from '../scoring/attribution';
import {
  alternateKeys,
  alternateSpecs,
  benchmarkCents,
  valueAlternates,
  type AlternateResult,
} from '../scoring/alternates';
import { resolveCall, BUCKET_GLYPHS, BUCKET_NAMES, type CallResult } from '../scoring/calls';
import { mistakeTags, processGrade, type MistakeTag, type ProcessGrade } from '../scoring/grade';
import { STRUCTURES } from '../strategies/structures';
import { contractId } from '../market/types';
import type { TradingSession } from './session';

export interface TradeDebrief {
  positionId: string;
  cardId: string;
  displaySymbol: string;
  realSymbol: string;
  structureName: string;
  entryDate: ISODate;
  exitDate: ISODate;
  entryLabel: string;
  exitLabel: string;
  daysHeld: number;
  realizedCents: Cents;
  riskCents: Cents;
  returnOnRisk: number;
  exitReason: string;
  attribution: Attribution;
  grade: ProcessGrade;
  tags: MistakeTag[];
  alternates: AlternateResult[];
  call: CallResult | null;
  callLine: string;
  benchmarkCents: Cents;
  alphaCents: Cents;
  catalyst: string;
  modeledMarks: number;
}

export async function buildDebrief(session: TradingSession, positionId: string): Promise<TradeDebrief> {
  const pos = session.position(positionId) as Position;
  if (!pos || pos.status !== 'closed') throw new Error('Debrief needs a closed position');
  const card = session.card(pos.cardId);
  const view = session.view(pos.cardId);
  const exit = pos.closedOn as ISODate;
  const attribution = attribute(pos);
  const declined = session.decisionHistory
    .filter((d) => d.dp.positionId === pos.id && d.action === 'hold')
    .map((d) => d.dp.kind);
  const gradeInput = {
    pos,
    riskCapPct: session.config.riskCapPct,
    earningsAcknowledged: card.earningsAck,
    declinedDecisions: declined,
  };
  const grade = processGrade(gradeInput);
  const tags = mistakeTags(gradeInput);

  // Alternates on the same chain over the same dates.
  const entryChain = session.chain(pos.cardId);
  let alternates: AlternateResult[] = [];
  const exp = pos.entry.dte > 0 ? addIso(pos.openedOn, pos.entry.dte) : null;
  if (entryChain && exp) {
    const bullish = card.call ? card.call.bucket >= 2 : STRUCTURES[pos.structureId].bias !== 'bear';
    const specs = alternateSpecs(entryChain, exp, bullish);
    const keys = alternateKeys(specs);
    const quotes = new Map<string, OptionQuote>();
    const expired = exit > exp;
    if (!expired) {
      for (const k of dedupe(keys)) {
        const rows = await view.history(k, exit, exit);
        if (rows[0]) quotes.set(contractId(k), rows[0]);
      }
    }
    const exitSpot =
      pos.marks.find((m) => m.date === exit)?.spot ??
      pos.marks[pos.marks.length - 1]?.spot ??
      entryChain.spot;
    alternates = valueAlternates(
      specs,
      entryChain,
      exitSpot,
      (k) => quotes.get(contractId(k)) ?? null,
      expired,
    );
  }

  const exitSpot = pos.marks[pos.marks.length - 1]?.spot ?? pos.entry.spot;
  const daysHeld = Math.max(0, diffDays(pos.openedOn, exit));
  const call = card.call ? resolveCall(card.call, pos.entry.spot, exitSpot, daysHeld) : null;
  const callLine =
    card.call && call
      ? `You called ${BUCKET_GLYPHS[card.call.bucket]} ${BUCKET_NAMES[card.call.bucket]} at ${Math.round(card.call.confidence * 100)}%. It went ${BUCKET_GLYPHS[call.actual]} ${BUCKET_NAMES[call.actual]} (${call.movePct >= 0 ? '+' : ''}${(call.movePct * 100).toFixed(1)}%): ${call.exact ? 'exact' : call.adjacent ? 'one bucket off' : 'wrong'}.`
      : 'No call recorded.';

  const bench = view.benchmarkBars();
  const b0 = bench.find((b) => b.date === pos.openedOn)?.close;
  const b1 = bench.find((b) => b.date === exit)?.close ?? bench[bench.length - 1]?.close;
  const benchmark = b0 && b1 ? benchmarkCents(pos.entry.maxLossCents, b0, b1) : 0;
  const realized = pos.realizedCents ?? 0;

  return {
    positionId: pos.id,
    cardId: pos.cardId,
    displaySymbol: card.displaySymbol,
    realSymbol: card.realSymbol,
    structureName: STRUCTURES[pos.structureId].name,
    entryDate: pos.openedOn,
    exitDate: exit,
    entryLabel: view.dayLabel(pos.openedOn),
    exitLabel: view.dayLabel(exit),
    daysHeld,
    realizedCents: realized,
    riskCents: pos.entry.maxLossCents,
    returnOnRisk: pos.entry.maxLossCents > 0 ? realized / pos.entry.maxLossCents : 0,
    exitReason: pos.exitReason ?? 'open',
    attribution,
    grade,
    tags,
    alternates,
    call,
    callLine,
    benchmarkCents: benchmark,
    alphaCents: realized - benchmark,
    catalyst: catalystLine(session, pos),
    modeledMarks: pos.marks.filter((m) => m.modeled).length,
  };
}

/** The biggest thing that happened while the trade was on, stated as plain facts. */
function catalystLine(session: TradingSession, pos: Position): string {
  const view = session.view(pos.cardId);
  const card = session.card(pos.cardId);
  const exit = pos.closedOn ?? view.now;
  const earn = view.earnings().past.find((e) => e.reactionDate > pos.openedOn && e.reactionDate <= exit);
  if (earn && earn.movePct !== null) {
    const beat =
      earn.actual !== null && earn.estimate !== null
        ? earn.actual >= earn.estimate
          ? 'beat'
          : 'missed'
        : 'reported';
    const implied =
      earn.impliedMovePct !== null ? ` against an implied ±${earn.impliedMovePct.toFixed(1)}%` : '';
    return `${card.realSymbol} ${beat} estimates and moved ${earn.movePct >= 0 ? '+' : ''}${earn.movePct.toFixed(1)}% on ${earn.reactionDate}${implied}.`;
  }
  const bars = view.bars().filter((b) => b.date > pos.openedOn && b.date <= exit);
  let best = { date: '', move: 0 };
  for (let i = 1; i < bars.length; i++) {
    const m = bars[i].close / bars[i - 1].close - 1;
    if (Math.abs(m) > Math.abs(best.move)) best = { date: bars[i].date, move: m };
  }
  if (!best.date) return `${card.realSymbol}: no major event while the trade was on.`;
  return `${card.realSymbol}'s biggest day was ${best.date}: ${best.move >= 0 ? '+' : ''}${(best.move * 100).toFixed(1)}%.`;
}

function addIso(d: ISODate, days: number): ISODate {
  return new Date(Date.parse(d) + days * 86400000).toISOString().slice(0, 10);
}

function dedupe(keys: ContractKey[]): ContractKey[] {
  const seen = new Set<string>();
  return keys.filter((k) => {
    const id = contractId(k);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
