/** GET /api/users/me — authenticated user + profile + settings + progress. */
import { Router } from 'express';
import { db } from '../database/index.js';
import { authMiddleware, type AuthedRequest } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/me', authMiddleware, async (req: AuthedRequest, res) => {
  const userRes = await db.query(
    'SELECT id, identity_id, status, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  const profileRes = await db.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [req.userId]
  );
  const settingsRes = await db.query(
    'SELECT settings_json FROM user_settings WHERE user_id = $1',
    [req.userId]
  );
  const progressRes = await db.query(
    'SELECT progress_json FROM user_progress WHERE user_id = $1',
    [req.userId]
  );
  res.json({
    user: userRes.rows[0] ?? null,
    profile: profileRes.rows[0] ?? null,
    settings: settingsRes.rows[0]?.settings_json ?? {},
    progress: progressRes.rows[0]?.progress_json ?? {}
  });
});
