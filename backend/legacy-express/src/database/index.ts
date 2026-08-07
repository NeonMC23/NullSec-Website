/** NullSec database connection (PostgreSQL via node-postgres). */
import pg from 'pg';
import { config } from '../config/index.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
};
