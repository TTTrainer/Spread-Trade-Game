import type { ISODate } from '../../src/engine/calendar';
import { filterWindows } from '../../src/engine/market/filter';
import type { EarningsScheduleItem, MarketDataSource, WindowFilter } from '../../src/engine/market/source';
import {
  contractId,
  type Bar,
  type Chain,
  type ContractKey,
  type DatasetMeta,
  type Dividend,
  type EarningsEvent,
  type EarningsTiming,
  type Fundamentals,
  type MacroEvent,
  type MacroKind,
  type OptionQuote,
  type RatePoint,
  type SizeTier,
  type Split,
  type SymbolInfo,
  type VixBar,
  type VolPoint,
  type WindowDef,
} from '../../src/engine/market/types';
import { all, get, openDb, type Db, type Stmt } from './sqlite';
import { decDate, decodeQuote, encDate, srcName, type ChainRowEnc } from './schema';

interface BarRow {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  src: number;
}

interface WindowRow {
  id: number;
  symbol: string;
  history_start: string;
  entry_date: string;
  end_date: string;
  forward_days: number;
  recent: number;
  weight: number;
  adx: number;
  trend_slope: number;
  vix: number;
  ivr: number;
  has_earnings: number;
  has_exdiv: number;
  has_fomc: number;
  max_gap_atr: number;
  spread_pct: number;
  spread_decile: number;
}

const rowToWindow = (r: WindowRow): WindowDef => ({
  id: r.id,
  symbol: r.symbol,
  historyStart: r.history_start,
  entryDate: r.entry_date,
  endDate: r.end_date,
  forwardDays: r.forward_days,
  recent: r.recent === 1,
  weight: r.weight,
  tags: {
    adx: r.adx,
    trendSlope: r.trend_slope,
    vix: r.vix,
    ivr: r.ivr,
    hasEarnings: r.has_earnings === 1,
    hasExDiv: r.has_exdiv === 1,
    hasFomc: r.has_fomc === 1,
    maxGapAtr: r.max_gap_atr,
    spreadPct: r.spread_pct,
    spreadDecile: r.spread_decile,
  },
});

/** Reads the built game.db (read-only). Lives in the main process, the tests and the simulator. */
export class SqliteSource implements MarketDataSource {
  readonly db: Db;
  private stmts = new Map<string, Stmt>();
  private windowCache: WindowDef[] | null = null;

  constructor(path: string) {
    this.db = openDb(path, { readOnly: true });
  }

  private st(sql: string): Stmt {
    let s = this.stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  close(): void {
    this.db.close();
  }

  async meta(): Promise<DatasetMeta> {
    const row = get<{ value: string }>(this.st("SELECT value FROM meta WHERE key = 'dataset'"));
    if (!row) throw new Error('game.db has no dataset metadata');
    return JSON.parse(row.value) as DatasetMeta;
  }

  async symbols(): Promise<SymbolInfo[]> {
    return all<Record<string, string | number | null>>(this.st('SELECT * FROM symbols ORDER BY symbol')).map(
      (r) => ({
        symbol: String(r.symbol),
        name: String(r.name),
        sector: String(r.sector),
        sizeTier: String(r.size_tier) as SizeTier,
        kind: r.kind === 'synthetic' ? 'synthetic' : 'real',
        isEtf: r.is_etf === 1,
        weeklies: r.weeklies === 1,
        firstDate: String(r.first_date),
        lastDate: String(r.last_date),
        chainFirstDate: String(r.chain_first_date),
        reason: String(r.reason),
        liquidity: r.liquidity === null ? null : Number(r.liquidity),
        ivLevel: r.iv_level === null ? null : Number(r.iv_level),
      }),
    );
  }

  async tradingDays(from: ISODate, to: ISODate): Promise<ISODate[]> {
    return all<{ date: number }>(
      this.st('SELECT date FROM trading_days WHERE date BETWEEN ? AND ? ORDER BY date'),
      encDate(from),
      encDate(to),
    ).map((r) => decDate(r.date));
  }

  async bars(symbol: string, from: ISODate, to: ISODate): Promise<Bar[]> {
    return all<BarRow>(
      this.st(
        'SELECT date, open, high, low, close, volume, src FROM bars WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date',
      ),
      symbol,
      encDate(from),
      encDate(to),
    ).map((r) => ({
      date: decDate(r.date),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      source: srcName(r.src),
    }));
  }

  async chain(symbol: string, date: ISODate): Promise<Chain | null> {
    const day = get<{ spot: number; src: number }>(
      this.st('SELECT spot, src FROM chain_days WHERE symbol = ? AND date = ?'),
      symbol,
      encDate(date),
    );
    if (!day) return null;
    const rows = all<ChainRowEnc>(
      this.st(
        'SELECT expiration, strike, cp, bid, ask, iv, delta, gamma, theta, vega, rho, src FROM chains WHERE symbol = ? AND date = ? ORDER BY expiration, strike, cp',
      ),
      symbol,
      encDate(date),
    );
    return { symbol, date, spot: day.spot, source: srcName(day.src), quotes: rows.map(decodeQuote) };
  }

  async quotes(
    symbol: string,
    keys: ContractKey[],
    from: ISODate,
    to: ISODate,
  ): Promise<(OptionQuote & { date: ISODate })[]> {
    const out: (OptionQuote & { date: ISODate })[] = [];
    const st = this.st(
      'SELECT date, expiration, strike, cp, bid, ask, iv, delta, gamma, theta, vega, rho, src FROM chains WHERE symbol = ? AND date BETWEEN ? AND ? AND expiration = ? AND strike = ? AND cp = ? ORDER BY date',
    );
    const seen = new Set<string>();
    for (const k of keys) {
      const id = contractId(k);
      if (seen.has(id)) continue;
      seen.add(id);
      const rows = all<ChainRowEnc & { date: number }>(
        st,
        symbol,
        encDate(from),
        encDate(to),
        encDate(k.expiration),
        Math.round(k.strike * 1000),
        k.right,
      );
      for (const r of rows) out.push({ ...decodeQuote(r), date: decDate(r.date) });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async earnings(symbol: string, from: ISODate, to: ISODate): Promise<EarningsEvent[]> {
    return all<Record<string, string | number | null>>(
      this.st('SELECT * FROM earnings WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date'),
      symbol,
      from,
      to,
    ).map((r) => ({
      symbol: String(r.symbol),
      date: String(r.date),
      timing: String(r.timing) as EarningsTiming,
      reactionDate: String(r.reaction_date),
      estimate: r.estimate as number | null,
      actual: r.actual as number | null,
      surprisePct: r.surprise_pct as number | null,
      gapPct: r.gap_pct as number | null,
      movePct: r.move_pct as number | null,
      impliedMovePct: r.implied_move_pct as number | null,
      ivBefore: r.iv_before as number | null,
      ivAfter: r.iv_after as number | null,
    }));
  }

  async earningsSchedule(symbol: string, from: ISODate, to: ISODate): Promise<EarningsScheduleItem[]> {
    return all<{ symbol: string; date: string; timing: string; reaction_date: string }>(
      this.st(
        'SELECT symbol, date, timing, reaction_date FROM earnings WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date',
      ),
      symbol,
      from,
      to,
    ).map((r) => ({
      symbol: r.symbol,
      date: r.date,
      timing: r.timing as EarningsTiming,
      reactionDate: r.reaction_date,
    }));
  }

  async dividends(symbol: string, from: ISODate, to: ISODate): Promise<Dividend[]> {
    return all<{ symbol: string; ex_date: string; amount: number }>(
      this.st(
        'SELECT symbol, ex_date, amount FROM dividends WHERE symbol = ? AND ex_date BETWEEN ? AND ? ORDER BY ex_date',
      ),
      symbol,
      from,
      to,
    ).map((r) => ({ symbol: r.symbol, exDate: r.ex_date, amount: r.amount }));
  }

  async splits(symbol: string): Promise<Split[]> {
    return all<{ symbol: string; ex_date: string; ratio: number }>(
      this.st('SELECT symbol, ex_date, ratio FROM splits WHERE symbol = ? ORDER BY ex_date'),
      symbol,
    ).map((r) => ({ symbol: r.symbol, exDate: r.ex_date, ratio: r.ratio }));
  }

  async vol(symbol: string, from: ISODate, to: ISODate): Promise<VolPoint[]> {
    return all<{
      date: number;
      iv30: number | null;
      hv20: number | null;
      ivr: number | null;
      ivp: number | null;
    }>(
      this.st(
        'SELECT date, iv30, hv20, ivr, ivp FROM vol WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date',
      ),
      symbol,
      encDate(from),
      encDate(to),
    ).map((r) => ({ date: decDate(r.date), iv30: r.iv30, hv20: r.hv20, ivr: r.ivr, ivp: r.ivp }));
  }

  async fundamentals(symbol: string, from: ISODate, to: ISODate): Promise<Fundamentals[]> {
    return all<Record<string, string | number | null>>(
      this.st(
        'SELECT * FROM fundamentals WHERE symbol = ? AND report_date BETWEEN ? AND ? ORDER BY report_date',
      ),
      symbol,
      from,
      to,
    ).map((r) => ({
      symbol: String(r.symbol),
      reportDate: String(r.report_date),
      periodEnd: String(r.period_end),
      eps: r.eps as number | null,
      epsEstimate: r.eps_estimate as number | null,
      revenue: r.revenue as number | null,
      netIncome: r.net_income as number | null,
      sharesOut: r.shares_out as number | null,
    }));
  }

  async rates(from: ISODate, to: ISODate): Promise<RatePoint[]> {
    return all<RatePoint>(
      this.st('SELECT date, r3m, r1y, r2y, r10y FROM rates WHERE date BETWEEN ? AND ? ORDER BY date'),
      from,
      to,
    );
  }

  async vix(from: ISODate, to: ISODate): Promise<VixBar[]> {
    return all<VixBar>(
      this.st('SELECT date, open, high, low, close FROM vix WHERE date BETWEEN ? AND ? ORDER BY date'),
      from,
      to,
    );
  }

  async macro(from: ISODate, to: ISODate): Promise<MacroEvent[]> {
    return all<{ date: string; kind: string; label: string; verified: number }>(
      this.st(
        'SELECT date, kind, label, verified FROM macro_events WHERE date BETWEEN ? AND ? ORDER BY date, kind',
      ),
      from,
      to,
    ).map((r) => ({ date: r.date, kind: r.kind as MacroKind, label: r.label, verified: r.verified === 1 }));
  }

  private allWindows(): WindowDef[] {
    if (!this.windowCache)
      this.windowCache = all<WindowRow>(this.st('SELECT * FROM windows ORDER BY id')).map(rowToWindow);
    return this.windowCache;
  }

  async windows(filter: WindowFilter): Promise<WindowDef[]> {
    return filterWindows(this.allWindows(), filter);
  }

  async window(id: number): Promise<WindowDef | null> {
    const r = get<WindowRow>(this.st('SELECT * FROM windows WHERE id = ?'), id);
    return r ? rowToWindow(r) : null;
  }
}
