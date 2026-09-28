/** Shapes stored in user.db, shared by the main process and the renderer. */

export interface SaveSlot {
  slot: string;
  kind: 'run' | 'sandbox' | 'daily' | 'live';
  updatedAt: string;
  summary: Record<string, unknown>;
  data: unknown;
}

export interface TradeRow {
  id: string;
  mode: 'career' | 'daily' | 'sandbox' | 'live' | 'contracts' | 'tutorial';
  runId: string | null;
  desk: string | null;
  closedOn: string;
  openedOn: string;
  symbol: string;
  displaySymbol: string;
  structure: string;
  qty: number;
  realizedCents: number;
  riskCents: number;
  benchmarkCents: number;
  alphaCents: number;
  exitReason: string;
  grade: string;
  tags: string[];
  callBucket: number | null;
  callConf: number | null;
  callActual: number | null;
  brier: number | null;
  regime: {
    vix: number | null;
    ivr: number | null;
    trend: number | null;
    adx: number | null;
    earnings: boolean;
  };
  recordedAt: string;
  data?: Record<string, unknown>;
}

export interface DrillRow {
  id: string;
  kind: string;
  at: string;
  score: number;
  detail: Record<string, unknown>;
}

export interface RunRow {
  id: string;
  mode: string;
  desk: string;
  seed: string;
  tier: number;
  startedAt: string;
  endedAt: string | null;
  result: string;
  rounds: number;
  score: number;
  calGrade: string | null;
  alphaCents: number;
  xp: number;
  bonus: number;
  data?: Record<string, unknown>;
}
