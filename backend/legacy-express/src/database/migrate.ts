/**
 * Migration runner with applied-migration tracking.
 * In production you may prefer a dedicated tool (node-pg-migrate); this
 * keeps the scaffold self-contained.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './index.js';

async function migrate() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  const appliedRes = await db.query(
    'SELECT filename FROM schema_migrations'
  );
  const applied = new Set(appliedRes.rows.map((r: { filename: string }) => r.filename));

  const dir = join(process.cwd(), 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log('applied', file);
  }
  console.log('migrations complete');
  process.exit(0);
}

migrate().catch((e) => {
  console.error('migration failed', e);
  process.exit(1);
});
