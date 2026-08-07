/** NullSec stateless session tokens. Raw tokens are never stored. */
import { randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { db } from '../database/index.js';
import { hashToken } from './hash.js';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Create a session row and return the raw token (returned to the client). */
export async function createSession(userId: number): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return token;
}

/** Look up a non-revoked, non-expired session by raw token. */
export async function getSessionByToken(
  token: string
): Promise<{ id: number; user_id: number } | null> {
  const tokenHash = await hashToken(token);
  const res = await db.query(
    `SELECT id, user_id FROM sessions
     WHERE token_hash = $1 AND revoked = FALSE AND expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );
  return res.rows[0] ?? null;
}

/** Revoke a session by raw token. */
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await db.query(`UPDATE sessions SET revoked = TRUE WHERE token_hash = $1`, [
    tokenHash,
  ]);
}
