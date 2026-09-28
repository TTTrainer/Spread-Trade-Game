/**
 * Writes the SIM market into a game.db with exactly the schema the real pipeline produces.
 * Chains are materialized for the last `chainDays` trading days (the SIM source can price
 * any day on demand, so the database only needs enough to exercise the real code path).
 */
import { SyntheticSource } from '../src/engine/market/synthetic/source';
import { SYNTH_FIRST_BAR, SYNTH_LAST_DATE } from '../src/engine/market/synthetic/universe';
import { buildSymbolWindows, finalizeWindows } from '../src/engine/market/windows';
import { tradingDaysBetween, type ISODate } from '../src/engine/calendar';
import { GameDbWriter } from './lib/gameDb';

export interface SynthBuildOptions {
  path: string;
  symbols?: string[];
  chainDays?: number;
  lastDate?: ISODate;
  progress?: (msg: string, fraction: number) => void;
}

export async function buildSyntheticDb(
  opts: SynthBuildOptions,
): Promise<{ symbols: number; chainRows: number; windows: number }> {
  const lastDate = opts.lastDate ?? SYNTH_LAST_DATE;
  const src = new SyntheticSource({ lastDate, symbols: opts.symbols });
  const w = new GameDbWriter(opts.path);
  const meta = await src.meta();
  const days = tradingDaysBetween(SYNTH_FIRST_BAR, lastDate);
  const chainDays = opts.chainDays ?? 300;
  const chainFrom = days[Math.max(0, days.length - chainDays)];
  w.setMeta({
    ...meta,
    builtAt: new Date().toISOString(),
    notes: [...meta.notes, `Chains materialized from ${chainFrom}`],
  });
  w.putTradingDays(days);
  const syms = await src.symbols();
  w.putSymbols(syms.map((s) => ({ ...s, chainFirstDate: chainFrom })));
  w.putRates(await src.rates(SYNTH_FIRST_BAR, lastDate));
  w.putVix(await src.vix(SYNTH_FIRST_BAR, lastDate));
  w.putMacro(await src.macro(SYNTH_FIRST_BAR, '2026-12-31'));
  let chainRows = 0;
  const raw = [];
  for (let i = 0; i < syms.length; i++) {
    const s = syms[i].symbol;
    opts.progress?.(`SIM ${s}`, i / syms.length);
    const bars = await src.bars(s, SYNTH_FIRST_BAR, lastDate);
    w.putBars(s, bars);
    const vol = await src.vol(s, SYNTH_FIRST_BAR, lastDate);
    w.putVol(s, vol);
    const earnings = await src.earnings(s, SYNTH_FIRST_BAR, '2026-12-31');
    w.putEarnings(earnings);
    const divs = await src.dividends(s, SYNTH_FIRST_BAR, '2026-12-31');
    w.putDividends(divs);
    const splits = await src.splits(s);
    w.putSplits(splits);
    w.putFundamentals(await src.fundamentals(s, SYNTH_FIRST_BAR, lastDate));
    const chainDates = days.filter((d) => d >= chainFrom);
    for (let j = 0; j < chainDates.length; j += 20) {
      const batch = [];
      for (const d of chainDates.slice(j, j + 20)) {
        const c = await src.chain(s, d);
        if (c) {
          batch.push(c);
          chainRows += c.quotes.length;
        }
      }
      w.putChains(batch);
    }
    const volMap = new Map(vol.map((v) => [v.date, v] as const));
    const vix = new Map((await src.vix(SYNTH_FIRST_BAR, lastDate)).map((v) => [v.date, v.close] as const));
    const chainSet = new Set(chainDates);
    raw.push(
      ...buildSymbolWindows({
        symbol: s,
        bars,
        hasChain: (d) => chainSet.has(d),
        splits,
        earningsReactionDates: earnings.map((e) => e.reactionDate),
        exDivDates: divs.map((d) => d.exDate),
        macro: await src.macro(SYNTH_FIRST_BAR, '2026-12-31'),
        vixClose: (d) => vix.get(d) ?? null,
        vol: (d) => volMap.get(d) ?? null,
        spreadPct: () => syms[i].liquidity,
      }),
    );
  }
  const windows = finalizeWindows(raw, lastDate);
  w.replaceWindows(windows);
  w.close();
  opts.progress?.('SIM done', 1);
  return { symbols: syms.length, chainRows, windows: windows.length };
}
