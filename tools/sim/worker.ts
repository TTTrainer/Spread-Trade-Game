/** A simulator worker thread: plays its share of runs and streams the results back. */

import { parentPort, workerData } from 'node:worker_threads';
import { BALANCE } from '../../src/content/balance';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import type { MarketDataSource } from '../../src/engine/market/source';
import { simulateRun, type SimSpec } from './runOne';

interface Job {
  specs: SimSpec[];
  db: string | null;
}

/** Tuning runs can override balance values: STG_BALANCE='{"scoring":{"lossChipsScale":1.5}}'. */
function applyOverrides(): void {
  const raw = process.env.STG_BALANCE;
  if (!raw) return;
  const patch = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  const target = BALANCE as unknown as Record<string, Record<string, unknown>>;
  for (const [section, values] of Object.entries(patch)) Object.assign(target[section], values);
}

async function main(): Promise<void> {
  applyOverrides();
  const job = workerData as Job;
  let source: MarketDataSource;
  if (job.db) {
    const { SqliteSource } = await import('../../data-pipeline/lib/sqliteSource');
    source = new SqliteSource(job.db);
  } else source = new SyntheticSource();
  for (const spec of job.specs) {
    const r = await simulateRun(source, spec);
    parentPort?.postMessage(r);
  }
}

void main();
