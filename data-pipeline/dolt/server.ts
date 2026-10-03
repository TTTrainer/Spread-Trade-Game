import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';

export interface DoltServer {
  port: number;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  stop(): Promise<void>;
}

/** Start `dolt sql-server` over the folder of clones and connect to it with mysql2. */
export async function startDoltServer(
  dolt: string,
  dataDir: string,
  port: number,
  log: (m: string) => void,
): Promise<DoltServer> {
  const child: ChildProcess = spawn(
    dolt,
    ['sql-server', '--data-dir', dataDir, '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: dataDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr?.on('data', (d: Buffer) => log(`[sql-server] ${d.toString().trim().slice(0, 200)}`));
  let conn: Connection | null = null;
  const deadline = Date.now() + 60_000;
  while (!conn) {
    try {
      conn = await createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        password: '',
        dateStrings: true,
        supportBigNumbers: true,
        decimalNumbers: true,
      });
    } catch (e) {
      if (Date.now() > deadline) {
        child.kill();
        throw new Error(`Dolt sql-server did not start: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const c = conn;
  return {
    port,
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const [rows] = await c.query<RowDataPacket[]>(sql, params);
      return rows as unknown as T[];
    },
    async stop() {
      await c.end().catch(() => undefined);
      child.kill();
    },
  };
}
