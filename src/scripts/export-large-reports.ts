// Example: export-large-reports.ts
import { Pool } from 'pg';
import { streamLargeQuery } from '@/lib/pg-cursor-util';

// Configure your database connection (adjust as needed)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const sql = 'SELECT * FROM "Report"'
  const params: Array<unknown> = []
  let rowCount = 0;
  await streamLargeQuery(pool, sql, params, (row) => {
    // Process each row (e.g., write to file, transform, etc.)
    console.log(row);
    rowCount++;
  }, 1000);
  console.log(`Exported ${rowCount} rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
