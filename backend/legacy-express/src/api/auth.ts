/** Auth endpoints: register, login, logout, me. */
import { Router } from 'express';
import { db } from '../database/index.js';
import { hashRecoveryKey, verifyRecoveryKey } from '../auth/hash.js';
import { createSession, revokeSession } from '../auth/session.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { authMiddleware, type AuthedRequest } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', rateLimit(), async (req, res) => {
  const { recovery_key, identity_id, profile } = req.body ?? {};
  if (!recovery_key || typeof recovery_key !== 'string') {
    res.status(400).json({ error: 'recovery_key required' });
    return;
  }
  if (!identity_id || typeof identity_id !== 'string') {
    res.status(400).json({ error: 'identity_id required' });
    return;
  }
  if (profile && (typeof profile !== 'object' || Array.isArray(profile))) {
    res.status(400).json({ error: 'profile must be an object' });
    return;
  }

  const existing = await db.query(
    'SELECT id FROM users WHERE identity_id = $1',
    [identity_id]
  );
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'account_already_exists' });
    return;
  }

  const recoveryHash = await hashRecoveryKey(recovery_key);
  const username = profile?.username ?? 'Anonymous';
  const avatarSeed = profile?.avatar_seed ?? '';
  const settingsDefault = { version: 1, theme: 'system', language: 'en', privacy: { offline_only: true, telemetry: false }, appearance: { animations: true, reduced_motion: false } };
  const progressDefault = { version: 1, identity_id, missions: {}, articles: {}, weekly: {}, updated_at: new Date().toISOString() };

  const client = await db.query(
    `WITH u AS (
       INSERT INTO users (identity_id) VALUES ($1) RETURNING id
     ), rc AS (
       INSERT INTO recovery_credentials (user_id, recovery_hash)
       SELECT id, $2 FROM u
     ), up AS (
       INSERT INTO user_profiles (user_id, username, avatar_seed)
       SELECT id, $3, $4 FROM u
     ), us AS (
       INSERT INTO user_settings (user_id, settings_json)
       SELECT id, $5::jsonb FROM u
     )
     INSERT INTO user_progress (user_id, progress_json)
     SELECT id, $6::jsonb FROM u
     RETURNING user_id`,
    [identity_id, recoveryHash, username, avatarSeed,
      JSON.stringify(settingsDefault), JSON.stringify(progressDefault)]
  );
  const userId = client.rows[0]?.user_id;

  const token = await createSession(userId);
  res.status(201).json({ token, user_id: userId });
});

// POST /api/auth/login
authRouter.post('/login', rateLimit(), async (req, res) => {
  const { recovery_key, identity_id } = req.body ?? {};
  if (!recovery_key || typeof recovery_key !== 'string') {
    res.status(400).json({ error: 'recovery_key required' });
    return;
  }
  const userRes = await db.query(
    'SELECT id FROM users WHERE identity_id = $1',
    [identity_id]
  );
  const user = userRes.rows[0];
  if (!user) {
    res.status(404).json({ error: 'account_not_found' });
    return;
  }
  const credRes = await db.query(
    'SELECT recovery_hash FROM recovery_credentials WHERE user_id = $1',
    [user.id]
  );
  const cred = credRes.rows[0];
  const ok = cred ? await verifyRecoveryKey(recovery_key, cred.recovery_hash) : false;
  if (!ok) {
    res.status(401).json({ error: 'invalid_recovery_key' });
    return;
  }
  await db.query(
    'UPDATE recovery_credentials SET last_used_at = now() WHERE user_id = $1',
    [user.id]
  );
  const token = await createSession(user.id);
  res.json({ token, user_id: user.id });
});

// POST /api/auth/logout
authRouter.post('/logout', authMiddleware, async (req: AuthedRequest, res) => {
  const header = req.headers.authorization ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) await revokeSession(m[1]);
  res.json({ ok: true });
});

// GET /api/auth/me — authenticated user summary
authRouter.get('/me', authMiddleware, async (req: AuthedRequest, res) => {
  const userRes = await db.query(
    'SELECT id, identity_id, status, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  const user = userRes.rows[0];
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({ user });
});
