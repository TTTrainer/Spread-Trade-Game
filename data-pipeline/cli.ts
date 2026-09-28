/**
 * npm run data:build   -- builds game.db from DoltHub (or --synthetic for the SIM market)
 * npm run data:sync    -- pulls the latest trading days into an existing real game.db
 * npm run data:report  -- writes data/REPORT.md
 *
 * Flags: --db <path>  --dolt-root <path>  --synthetic  --chain-days <n>  --yes (download Dolt, accept low disk)
 *        --tickers AAPL,MSFT  --skip-clone
 */
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { addDays } from '../src/engine/calendar';
import { buildRealDb, LowDiskError } from './dolt/extract';
import { get, openDb } from './lib/sqlite';
import { defaultPaths } from './paths';
import { writeReport } from './report';
import { buildSyntheticDb } from './synthetic';
import { validateGameDb } from './validate';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const REPORT_PATH = join(process.cwd(), 'data', 'REPORT.md');

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const paths = defaultPaths();
  const dbPath = arg('db') ?? paths.gameDb;
  const log = (m: string) => console.log(m);

  if (cmd === 'build') {
    // Build into a temp file and swap it in at the end, so a failed build never breaks the game.
    const tmp = `${dbPath}.building`;
    if (existsSync(tmp)) rmSync(tmp);
    if (flag('synthetic')) {
      const r = await buildSyntheticDb({
        path: tmp,
        chainDays: Number(arg('chain-days') ?? 300),
        progress: (m, f) => log(`[${Math.round(f * 100)}%] ${m}`),
      });
      log(
        `SIM database: ${r.symbols} symbols, ${r.chainRows.toLocaleString()} chain rows, ${r.windows} windows`,
      );
    } else {
      try {
        const r = await buildRealDb({
          gameDbPath: tmp,
          doltRoot: arg('dolt-root') ?? paths.doltRoot,
          allowDownload: flag('yes'),
          confirmLowDisk: flag('yes'),
          skipClone: flag('skip-clone'),
          tickers: arg('tickers')?.split(','),
          log,
          progress: (s, f) => log(`[${Math.round(f * 100)}%] ${s}`),
        });
        log(
          `Real database: ${r.tickers.length} tickers, ${r.chainRows.toLocaleString()} chain rows (${r.modeledDays} modeled days), ${r.windows} windows, through ${r.lastDate}`,
        );
      } catch (e) {
        if (e instanceof LowDiskError) {
          console.error(e.message + ' Re-run with --yes to continue anyway.');
          process.exit(2);
        }
        throw e;
      }
    }
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    renameSync(tmp, dbPath);
    for (const suffix of ['-wal', '-shm']) if (existsSync(tmp + suffix)) rmSync(tmp + suffix);
    writeReport(dbPath, REPORT_PATH);
    const db = openDb(dbPath, { readOnly: true });
    const issues = validateGameDb(db);
    db.close();
    log(
      issues.length === 0
        ? 'Validation passed.'
        : `Validation found ${issues.length} issue(s); see data/REPORT.md`,
    );
    log(`Wrote ${dbPath} and ${REPORT_PATH}`);
    return;
  }

  if (cmd === 'sync') {
    if (!existsSync(dbPath)) throw new Error(`No game.db at ${dbPath}. Run npm run data:build first.`);
    const db = openDb(dbPath, { readOnly: true });
    const meta = JSON.parse(
      get<{ value: string }>(db.prepare("SELECT value FROM meta WHERE key='dataset'"))?.value ?? '{}',
    ) as { kind: string; lastDate: string };
    const tickers = (db.prepare('SELECT symbol FROM symbols').all() as { symbol: string }[]).map(
      (r) => r.symbol,
    );
    db.close();
    if (meta.kind !== 'real')
      throw new Error('Sync only applies to the real database. Build it first with npm run data:build.');
    const r = await buildRealDb({
      gameDbPath: dbPath,
      doltRoot: arg('dolt-root') ?? paths.doltRoot,
      allowDownload: flag('yes'),
      confirmLowDisk: true,
      tickers,
      incrementalFrom: addDays(meta.lastDate, -10),
      log,
    });
    writeReport(dbPath, REPORT_PATH);
    log(`Synced through ${r.lastDate}.`);
    return;
  }

  if (cmd === 'report') {
    if (!existsSync(dbPath)) throw new Error(`No game.db at ${dbPath}. Run npm run data:build first.`);
    writeReport(dbPath, REPORT_PATH);
    log(`Wrote ${REPORT_PATH}`);
    return;
  }

  console.log('Usage: tsx data-pipeline/cli.ts <build|sync|report> [--synthetic] [--db path]');
  process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
