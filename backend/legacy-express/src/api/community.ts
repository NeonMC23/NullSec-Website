/**
 * Community endpoints — aggregated, anonymous, public statistics.
 * No authentication required. No personal data exposure.
 * Rate-limited + short-cache friendly.
 */
import { Router } from 'express';
import { db } from '../database/index.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const communityRouter = Router();

// Public rate limit (more lenient than auth).
const publicLimit = rateLimit(60);

/** GET /api/community/stats — global anonymous stats */
communityRouter.get('/stats', publicLimit, async (_req, res) => {
  const gs = await db.query(
    'SELECT active_users, completed_missions, countries_active, updated_at FROM anonymous_global_stats WHERE id = 1'
  );
  const countriesRes = await db.query(
    'SELECT COUNT(*)::int AS n FROM countries WHERE active = TRUE'
  );
  const topRes = await db.query(
    `SELECT c.code, c.region, COALESCE(SUM(m.completed_count),0)::bigint AS completed
     FROM countries c
     LEFT JOIN mission_activity m ON m.country_code = c.code
     GROUP BY c.code, c.region
     ORDER BY completed DESC LIMIT 10`
  );
  const row = gs.rows[0];
  res.json({
    active_users: Number(row?.active_users ?? 0),
    completed_missions: Number(row?.completed_missions ?? 0),
    countries_active: Number(row?.countries_active ?? countriesRes.rows[0]?.n ?? 0),
    updated_at: row?.updated_at ?? null,
    top_regions: (topRes.rows ?? []).map((r: { code: string; region: string; completed: string }) => ({
      code: r.code, region: r.region, completed: Number(r.completed)
    }))
  });
});

/** GET /api/community/map — per-country activity + intensity + density */
communityRouter.get('/map', publicLimit, async (_req, res) => {
  const rows = await db.query(
    `SELECT c.code, c.region, c.name, c.active, c.missions_available,
            COALESCE(SUM(m.completed_count), 0)::bigint AS completed,
            COUNT(m.mission_id)::int AS missions_with_activity
     FROM countries c
     LEFT JOIN mission_activity m ON m.country_code = c.code
     GROUP BY c.code
     ORDER BY c.code`
  );
  res.json({
    countries: rows.rows.map((r: {
      code: string; region: string; name: string; active: boolean;
      missions_available: number; completed: string; missions_with_activity: number;
    }) => ({
      code: r.code,
      name: r.name,
      region: r.region,
      active: r.active,
      missions_available: Number(r.missions_available),
      completed: Number(r.completed),
      mission_density: Number(r.missions_with_activity),
      activity_level: levelOf(Number(r.completed))
    }))
  });
});

/** GET /api/community/countries — active regions list */
communityRouter.get('/countries', publicLimit, async (_req, res) => {
  const rows = await db.query(
    `SELECT code, name, region, active, missions_available
     FROM countries
     ORDER BY active DESC, code`
  );
  res.json({ countries: rows.rows });
});

/**
 * POST /api/community/activity — anonymous mission completion counter.
 * Accepts an aggregated, anonymous increment (no identity, no location).
 * Called by the sync flow when a user completes a mission; it only bumps
 * anonymous counters.
 */
communityRouter.post('/activity', publicLimit, async (req, res) => {
  const { country, mission_id } = req.body ?? {};
  if (!mission_id || typeof mission_id !== 'string') {
    res.status(400).json({ error: 'mission_id required' });
    return;
  }
  const code = typeof country === 'string' && country.length === 2 ? country : null;

  if (code) {
    // Bump per-country mission counter (anonymous).
    await db.query(
      `INSERT INTO mission_activity (mission_id, country_code, completed_count, last_activity_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (country_code, mission_id)
       DO UPDATE SET completed_count = mission_activity.completed_count + 1,
                     last_activity_at = now(), updated_at = now()`,
      [mission_id, code]
    );
  }

  // Bump global anonymous counters.
  await db.query(
    `UPDATE anonymous_global_stats
     SET completed_missions = completed_missions + 1, updated_at = now()
     WHERE id = 1`
  );

  res.json({ ok: true });
});

/** GET /api/community/missions — mission activity per country */
communityRouter.get('/missions', publicLimit, async (_req, res) => {
  const rows = await db.query(
    `SELECT c.code AS country, c.missions_available,
            COALESCE(SUM(m.completed_count), 0)::bigint AS completed
     FROM countries c
     LEFT JOIN mission_activity m ON m.country_code = c.code
     GROUP BY c.code, c.missions_available
     ORDER BY completed DESC, c.code`
  );
  res.json((rows.rows ?? []).map((r: {
    country: string; missions_available: number; completed: string;
  }) => ({
    country: r.country,
    missions_available: Number(r.missions_available),
    completed: Number(r.completed)
  })));
});

/** Map a completion count to a coarse activity level. */
function levelOf(completed: number): string {
  if (completed <= 0) return 'none';
  if (completed < 100) return 'low';
  if (completed < 1000) return 'medium';
  if (completed < 5000) return 'high';
  return 'very-high';
}

/** GET /api/community/challenges — anonymous global challenges */
communityRouter.get('/challenges', publicLimit, async (_req, res) => {
  const rows = await db.query(
    `SELECT id, title, description, target_value, current_value, status, created_at, updated_at
     FROM community_challenges ORDER BY created_at DESC`
  );
  res.json({ challenges: rows.rows });
});

/** GET /api/community/ranking/countries — aggregated country ranking */
communityRouter.get('/ranking/countries', publicLimit, async (_req, res) => {
  const rows = await db.query(
    `SELECT c.code, c.name, c.region, c.active, c.missions_available,
            COALESCE(SUM(m.completed_count),0)::bigint AS completed
     FROM countries c
     LEFT JOIN mission_activity m ON m.country_code = c.code
     GROUP BY c.code
     ORDER BY completed DESC, c.code`
  );
  res.json({ countries: rows.rows.map((r: {
    code: string; name: string; region: string; active: boolean; missions_available: number; completed: string;
  }) => ({
    code: r.code, name: r.name, region: r.region, active: r.active,
    missions_available: Number(r.missions_available), completed: Number(r.completed)
  })) });
});

/** GET /api/community/ranking/regions — aggregated region ranking */
communityRouter.get('/ranking/regions', publicLimit, async (_req, res) => {
  const rows = await db.query(
    `SELECT c.region,
            COUNT(DISTINCT c.code)::int AS countries_active,
            COALESCE(SUM(m.completed_count),0)::bigint AS completed
     FROM countries c
     LEFT JOIN mission_activity m ON m.country_code = c.code
     GROUP BY c.region
     ORDER BY completed DESC, c.region`
  );
  res.json({ regions: rows.rows.map((r: {
    region: string; countries_active: number; completed: string;
  }) => ({
    region: r.region, countries_active: Number(r.countries_active), completed: Number(r.completed)
  })) });
});
