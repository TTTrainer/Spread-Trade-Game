/** A simulator worker thread: plays its share of runs and streams the results back. */

import { parentPort, workerData } from 'node:worker_threads';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import type { MarketDataSource } from '../../src/engine/market/source';
import { simulateRun, type SimSpec } from './runOne';

interface Job {
  specs: SimSpec[];
  db: string | null;
}

async function main(): Promise<void> {
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
