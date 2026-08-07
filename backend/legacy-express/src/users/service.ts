/** NullSec users service. */
import { db } from '../database/index.js';

export async function findUserByIdentityId(identityId: string) {
  const res = await db.query(
    'SELECT id, identity_id, status FROM users WHERE identity_id = $1',
    [identityId]
  );
  return res.rows[0] ?? null;
}

export async function findUserById(id: number) {
  const res = await db.query(
    'SELECT id, identity_id, status, created_at FROM users WHERE id = $1',
    [id]
  );
  return res.rows[0] ?? null;
}

export async function createUser(identityId: string) {
  const res = await db.query(
    'INSERT INTO users (identity_id) VALUES ($1) RETURNING id, identity_id, status',
    [identityId]
  );
  return res.rows[0];
}
