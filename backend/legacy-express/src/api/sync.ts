/** Sync endpoints: push, pull. Protected by authMiddleware. */
import { Router } from 'express';
import { db } from '../database/index.js';
import { authMiddleware, type AuthedRequest } from '../middleware/auth.js';

export const syncRouter = Router();

// POST /api/sync/push — upsert profile/settings/progress, newest wins (updated_at)
syncRouter.post('/push', authMiddleware, async (req: AuthedRequest, res) => {
  const { profile, settings, progress } = req.body ?? {};
  const userId = req.userId as number;

  if (profile && typeof profile === 'object') {
    await db.query(
      `INSERT INTO user_profiles (user_id, username, avatar_seed, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         username = CASE WHEN $4::timestamptz IS NULL OR user_profiles.updated_at <= $4::timestamptz
                         THEN EXCLUDED.username ELSE user_profiles.username END,
         avatar_seed = CASE WHEN $4::timestamptz IS NULL OR user_profiles.updated_at <= $4::timestamptz
                         THEN EXCLUDED.avatar_seed ELSE user_profiles.avatar_seed END,
         updated_at = CASE WHEN $4::timestamptz IS NULL OR user_profiles.updated_at <= $4::timestamptz
                         THEN now() ELSE user_profiles.updated_at END`,
      [userId, profile.username ?? 'Anonymous', profile.avatar_seed ?? '',
        profile.updated_at || null]
    );
  }

  if (settings && typeof settings === 'object') {
    await db.query(
      `INSERT INTO user_settings (user_id, settings_json, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id)
       DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = now()`,
      [userId, JSON.stringify(settings)]
    );
  }

  if (progress && typeof progress === 'object') {
    await db.query(
      `INSERT INTO user_progress (user_id, progress_json, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id)
       DO UPDATE SET progress_json = EXCLUDED.progress_json, updated_at = now()`,
      [userId, JSON.stringify(progress)]
    );
  }

  res.json({ ok: true });
});

// GET /api/sync/pull — server-side profile/settings/progress
syncRouter.get('/pull', authMiddleware, async (req: AuthedRequest, res) => {
  const userId = req.userId as number;
  const profileRes = await db.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId]
  );
  const settingsRes = await db.query(
    'SELECT settings_json FROM user_settings WHERE user_id = $1',
    [userId]
  );
  const progressRes = await db.query(
    'SELECT progress_json FROM user_progress WHERE user_id = $1',
    [userId]
  );
  res.json({
    profile: profileRes.rows[0] ?? null,
    settings: settingsRes.rows[0]?.settings_json ?? {},
    progress: progressRes.rows[0]?.progress_json ?? {}
  });
});
