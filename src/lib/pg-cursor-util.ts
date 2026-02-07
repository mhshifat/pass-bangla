// pg-cursor-util.ts
import { Pool } from "pg"
import Cursor from "pg-cursor"

// Utility to stream large queries using pg-cursor
export async function streamLargeQuery<T = unknown>(
  pool: Pool,
  sql: string,
  params: Array<unknown> = [],
  onRow: (row: T) => void,
  batchSize = 1000
): Promise<void> {
  const client = await pool.connect();
  try {
    const cursor = client.query(new Cursor(sql, params));
    function readNext() {
      return new Promise<void>((resolve, reject) => {
        cursor.read(batchSize, (err: Error | undefined, rows: unknown[]) => {
          if (err) return reject(err);
          if (!rows.length) {
            cursor.close(() => resolve());
            return;
          }
          for (const row of rows as T[]) onRow(row);
          readNext().then(resolve, reject);
        });
      });
    }
    await readNext();
  } finally {
    client.release();
  }
}
