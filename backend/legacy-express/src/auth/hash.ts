/** NullSec recovery-key hashing. Uses argon2id. */
import argon2 from 'argon2';

/** Hash a recovery key for storage. Never store the raw key. */
export async function hashRecoveryKey(key: string): Promise<string> {
  return argon2.hash(key, { type: argon2.argon2id });
}

/** Constant-time verify of a recovery key against a stored hash. */
export async function verifyRecoveryKey(
  key: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, key);
  } catch {
    return false;
  }
}

/** Hash a session token (sha256) for storage. Never store the raw token. */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
