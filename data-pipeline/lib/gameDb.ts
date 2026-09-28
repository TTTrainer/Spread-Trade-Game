import type {
  Bar,
  Chain,
  DatasetMeta,
  Dividend,
  EarningsEvent,
  Fundamentals,
  MacroEvent,
  RatePoint,
  Split,
  SymbolInfo,
  VixBar,
  VolPoint,
  WindowDef,
} from '../../src/engine/market/types';
import type { ISODate } from '../../src/engine/calendar';
import { openDb, tx, type Db } from './sqlite';
import { decDate, encDate, encodeQuote, ENCODING, GAME_DB_DDL, SCHEMA_VERSION, srcCode } from './schema';
import { liquidityScore } from './derived';

/** Writes game.db. Used by the real Dolt pipeline and by the SIM materializer alike. */
export class GameDbWriter {
  readonly db: Db;

  constructor(path: string) {
    this.db = openDb(path);
    this.db.exec(GAME_DB_DDL);
  }

  setMeta(meta: DatasetMeta): void {
    const st = this.db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)');
    tx(this.db, () => {
      st.run('schema_version', String(SCHEMA_VERSION));
      st.run('dataset', JSON.stringify(meta));
      st.run('encoding', JSON.stringify(ENCODING));
    });
  }

  putSymbols(list: SymbolInfo[]): void {
    const st = this.db.prepare(
      `INSERT OR REPLACE INTO symbols(symbol,name,sector,size_tier,kind,is_etf,weeklies,first_date,last_date,chain_first_date,reason,liquidity,iv_level)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    tx(this.db, () => {
      for (const s of list)
        st.run(
          s.symbol,
          s.name,
          s.sector,
          s.sizeTier,
          s.kind,
          s.isEtf ? 1 : 0,
          s.weeklies ? 1 : 0,
          s.firstDate,
          s.lastDate,
          s.chainFirstDate,
          s.reason,
          s.liquidity,
          s.ivLevel,
        );
    });
  }

  putTradingDays(days: ISODate[]): void {
    const st = this.db.prepare('INSERT OR IGNORE INTO trading_days(date) VALUES (?)');
    tx(this.db, () => {
      for (const d of days) st.run(encDate(d));
    });
  }

  putBars(symbol: string, bars: Bar[]): void {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO bars(symbol,date,open,high,low,close,volume,src) VALUES (?,?,?,?,?,?,?,?)',
    );
    tx(this.db, () => {
      for (const b of bars)
        st.run(
          symbol,
          encDate(b.date),
          b.open,
          b.high,
          b.low,
          b.close,
          Math.round(b.volume),
          srcCode(b.source),
        );
    });
  }

  putChains(chains: Chain[]): void {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO chains(symbol,date,expiration,strike,cp,bid,ask,iv,delta,gamma,theta,vega,rho,src) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    const day = this.db.prepare(
      'INSERT OR REPLACE INTO chain_days(symbol,date,spot,src,spread) VALUES (?,?,?,?,?)',
    );
    tx(this.db, () => {
      for (const c of chains) {
        const d = encDate(c.date);
        day.run(c.symbol, d, c.spot, srcCode(c.source), liquidityScore([c]));
        for (const q of c.quotes) {
          const e = encodeQuote(q);
          st.run(
            c.symbol,
            d,
            e.expiration,
            e.strike,
            e.cp,
            e.bid,
            e.ask,
            e.iv,
            e.delta,
            e.gamma,
            e.theta,
            e.vega,
            e.rho,
            e.src,
          );
        }
      }
    });
  }

  putVol(symbol: string, pts: VolPoint[]): void {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO vol(symbol,date,iv30,hv20,ivr,ivp) VALUES (?,?,?,?,?,?)',
    );
    tx(this.db, () => {
      for (const v of pts) st.run(symbol, encDate(v.date), v.iv30, v.hv20, v.ivr, v.ivp);
    });
  }

  putEarnings(list: EarningsEvent[]): void {
    const st = this.db.prepare(
      `INSERT OR REPLACE INTO earnings(symbol,date,timing,reaction_date,estimate,actual,surprise_pct,gap_pct,move_pct,implied_move_pct,iv_before,iv_after)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    tx(this.db, () => {
      for (const e of list)
        st.run(
          e.symbol,
          e.date,
          e.timing,
          e.reactionDate,
          e.estimate,
          e.actual,
          e.surprisePct,
          e.gapPct,
          e.movePct,
          e.impliedMovePct,
          e.ivBefore,
          e.ivAfter,
        );
    });
  }

  putDividends(list: Dividend[]): void {
    const st = this.db.prepare('INSERT OR REPLACE INTO dividends(symbol,ex_date,amount) VALUES (?,?,?)');
    tx(this.db, () => {
      for (const d of list) st.run(d.symbol, d.exDate, d.amount);
    });
  }

  putSplits(list: Split[]): void {
    const st = this.db.prepare('INSERT OR REPLACE INTO splits(symbol,ex_date,ratio) VALUES (?,?,?)');
    tx(this.db, () => {
      for (const s of list) st.run(s.symbol, s.exDate, s.ratio);
    });
  }

  putRates(list: RatePoint[]): void {
    const st = this.db.prepare('INSERT OR REPLACE INTO rates(date,r3m,r1y,r2y,r10y) VALUES (?,?,?,?,?)');
    tx(this.db, () => {
      for (const r of list) st.run(r.date, r.r3m, r.r1y, r.r2y, r.r10y);
    });
  }

  putVix(list: VixBar[]): void {
    const st = this.db.prepare('INSERT OR REPLACE INTO vix(date,open,high,low,close) VALUES (?,?,?,?,?)');
    tx(this.db, () => {
      for (const v of list) st.run(v.date, v.open, v.high, v.low, v.close);
    });
  }

  putMacro(list: MacroEvent[]): void {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO macro_events(date,kind,label,verified) VALUES (?,?,?,?)',
    );
    tx(this.db, () => {
      for (const m of list) st.run(m.date, m.kind, m.label, m.verified ? 1 : 0);
    });
  }

  putFundamentals(list: Fundamentals[]): void {
    const st = this.db.prepare(
      'INSERT OR REPLACE INTO fundamentals(symbol,report_date,period_end,eps,eps_estimate,revenue,net_income,shares_out) VALUES (?,?,?,?,?,?,?,?)',
    );
    tx(this.db, () => {
      for (const f of list)
        st.run(
          f.symbol,
          f.reportDate,
          f.periodEnd,
          f.eps,
          f.epsEstimate,
          f.revenue,
          f.netIncome,
          f.sharesOut,
        );
    });
  }

  replaceWindows(list: WindowDef[]): void {
    const st = this.db.prepare(
      `INSERT INTO windows(id,symbol,history_start,entry_date,end_date,forward_days,recent,weight,adx,trend_slope,vix,ivr,has_earnings,has_exdiv,has_fomc,max_gap_atr,spread_pct,spread_decile)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    tx(this.db, () => {
      this.db.exec('DELETE FROM windows');
      for (const w of list) {
        const t = w.tags;
        st.run(
          w.id,
          w.symbol,
          w.historyStart,
          w.entryDate,
          w.endDate,
          w.forwardDays,
          w.recent ? 1 : 0,
          w.weight,
          t.adx,
          t.trendSlope,
          t.vix,
          t.ivr,
          t.hasEarnings ? 1 : 0,
          t.hasExDiv ? 1 : 0,
          t.hasFomc ? 1 : 0,
          t.maxGapAtr,
          t.spreadPct,
          t.spreadDecile,
        );
      }
    });
  }

  /** Existing real-chain days, per-day spreads and IV30 history (used by incremental sync). */
  existingHistory(symbol: string): {
    realDays: Set<ISODate>;
    spreads: Map<ISODate, number>;
    iv30: Map<ISODate, number>;
  } {
    const realDays = new Set<ISODate>();
    const spreads = new Map<ISODate, number>();
    for (const r of this.db
      .prepare('SELECT date, src, spread FROM chain_days WHERE symbol = ?')
      .all(symbol) as { date: number; src: number; spread: number | null }[]) {
      const d = decDate(r.date);
      if (r.src !== 1) realDays.add(d);
      if (r.spread !== null) spreads.set(d, r.spread);
    }
    const iv30 = new Map<ISODate, number>();
    for (const r of this.db
      .prepare('SELECT date, iv30 FROM vol WHERE symbol = ? AND iv30 IS NOT NULL')
      .all(symbol) as { date: number; iv30: number }[]) {
      iv30.set(decDate(r.date), r.iv30);
    }
    return { realDays, spreads, iv30 };
  }

  close(): void {
    this.db.exec('PRAGMA optimize;');
    this.db.close();
  }
}
