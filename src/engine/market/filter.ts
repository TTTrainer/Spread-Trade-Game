import type { WindowFilter } from './source';
import type { WindowDef } from './types';

/** Shared window filtering so every data source answers Review filters the same way. */
export function matchesFilter(w: WindowDef, f: WindowFilter): boolean {
  if (f.symbols && !f.symbols.includes(w.symbol)) return false;
  if (f.recent !== undefined && w.recent !== f.recent) return false;
  if (f.minAdx !== undefined && w.tags.adx < f.minAdx) return false;
  if (f.maxAdx !== undefined && w.tags.adx >= f.maxAdx) return false;
  if (f.minVix !== undefined && w.tags.vix < f.minVix) return false;
  if (f.minIvr !== undefined && w.tags.ivr < f.minIvr) return false;
  if (f.maxIvr !== undefined && w.tags.ivr >= f.maxIvr) return false;
  if (f.hasEarnings !== undefined && w.tags.hasEarnings !== f.hasEarnings) return false;
  if (f.hasExDiv !== undefined && w.tags.hasExDiv !== f.hasExDiv) return false;
  if (f.hasFomc !== undefined && w.tags.hasFomc !== f.hasFomc) return false;
  if (f.minGapAtr !== undefined && w.tags.maxGapAtr < f.minGapAtr) return false;
  if (f.minSpreadDecile !== undefined && w.tags.spreadDecile < f.minSpreadDecile) return false;
  if (f.entryFrom !== undefined && w.entryDate < f.entryFrom) return false;
  if (f.entryTo !== undefined && w.entryDate > f.entryTo) return false;
  return true;
}

export function filterWindows(all: WindowDef[], f: WindowFilter): WindowDef[] {
  const out = all.filter((w) => matchesFilter(w, f));
  return f.limit !== undefined ? out.slice(0, f.limit) : out;
}
