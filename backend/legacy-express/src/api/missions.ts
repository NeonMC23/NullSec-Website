/** Public mission metadata endpoint (GET /api/missions). */
import { Router } from 'express';
import { db } from '../database/index.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const missionsRouter = Router();

const publicLimit = rateLimit(60);

missionsRouter.get('/', publicLimit, async (_req, res) => {
  const rows = await db.query(
    'SELECT code, missions_available FROM countries ORDER BY code'
  );
  // Aggregate completion per country for a global counter reference.
  const agg = await db.query(
    `SELECT c.code,
            COALESCE(SUM(m.completed_count),0)::bigint AS completed
     FROM countries c
     LEFT JOIN mission_activity m ON m.country_code = c.code
     GROUP BY c.code`
  );
  const byCode = new Map(agg.rows.map((r: { code: string; completed: string }) => [r.code, Number(r.completed)]));
  res.json({
    missions: (rows.rows ?? []).map((r: { code: string; missions_available: number }) => ({
      country: r.code,
      missions_available: Number(r.missions_available),
      completed: byCode.get(r.code) || 0
    }))
  });
});
