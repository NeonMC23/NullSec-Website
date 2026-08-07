/**
 * Anonymous Mission Completion Pipeline.
 * POST /api/community/activity — increments aggregated anonymous counters.
 * NO identity, NO username, NO recovery key, NO session accepted.
 * Only anonymous aggregated activity: { mission_id, country_code, region, timestamp }.
 */
import { Router } from 'express';
import { db } from '../database/index.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const activityRouter = Router();

const activityLimit = rateLimit(20);

// Allowed identity fields — reject if present.
const FORBIDDEN_KEYS = ['identity_id', 'identityId', 'username', 'user', 'token', 'session', 'recovery_key', 'recoveryKey'];

const VALID_COUNTRIES = new Set([
  'FR','DE','GB','ES','IT','NL','BE','CH','AT','PT','SE','NO','DK','FI',
  'IE','PL','CZ','SK','HU','RO','BG','GR','HR','SI','EE','LV','LT'
]);

activityRouter.post('/activity', activityLimit, async (req, res) => {
  const body = req.body ?? {};

  // Reject any payload containing identity fields.
  for (const key of FORBIDDEN_KEYS) {
    if (key in body) {
      res.status(400).json({ error: 'identity_fields_not_allowed' });
      return;
    }
  }

  const missionId = body.mission_id;
  if (typeof missionId !== 'string' || !missionId) {
    res.status(400).json({ error: 'mission_id required' });
    return;
  }

  // Validate country code if provided.
  const code = body.country_code;
  if (code !== undefined && code !== null) {
    if (typeof code !== 'string' || code.length !== 2 || !VALID_COUNTRIES.has(code.toUpperCase())) {
      res.status(400).json({ error: 'invalid_country_code' });
      return;
    }
  }
  const countryCode = typeof code === 'string' ? code.toUpperCase() : null;

  // Validate region if provided.
  const region = body.region;
  if (region !== undefined && region !== null && typeof region !== 'string') {
    res.status(400).json({ error: 'invalid_region' });
    return;
  }
  const regionStr = typeof region === 'string' && region ? region : 'Europe';

  // 1) mission_activity (per mission/country)
  if (countryCode) {
    await db.query(
      `INSERT INTO mission_activity (mission_id, country_code, completed_count, last_activity_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (country_code, mission_id)
       DO UPDATE SET completed_count = mission_activity.completed_count + 1,
                     last_activity_at = now(), updated_at = now()`,
      [missionId, countryCode]
    );
  }

  // 2) country_activity (per-country aggregated)
  if (countryCode) {
    await db.query(
      `INSERT INTO country_activity (country_code, completed_count)
       VALUES ($1, 1)
       ON CONFLICT (country_code)
       DO UPDATE SET completed_count = country_activity.completed_count + 1,
                     updated_at = now()`,
      [countryCode]
    );
    // ensure the country is flagged active
    await db.query(
      'UPDATE countries SET active = TRUE, updated_at = now() WHERE code = $1',
      [countryCode]
    );
  }

  // 3) region_activity (per-region aggregated)
  await db.query(
    `INSERT INTO region_activity (region, completed_count)
     VALUES ($1, 1)
     ON CONFLICT (region)
     DO UPDATE SET completed_count = region_activity.completed_count + 1,
                   updated_at = now()`,
    [regionStr]
  );

  // 4) challenge progress — increment active challenges (aggregated)
  await db.query(
    `UPDATE community_challenges
     SET current_value = current_value + 1, updated_at = now()
     WHERE status = 'active'`
  );

  // 5) anonymous_global_stats
  await db.query(
    `UPDATE anonymous_global_stats
     SET total_completed = total_completed + 1,
         completed_missions = completed_missions + 1,
         active_regions = (SELECT COUNT(*)::int FROM region_activity WHERE completed_count > 0),
         countries_active = (SELECT COUNT(*)::int FROM countries WHERE active = TRUE),
         updated_at = now()
     WHERE id = 1`
  );

  res.json({ ok: true });
});
