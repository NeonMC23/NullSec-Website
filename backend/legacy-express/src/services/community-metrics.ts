/**
 * Community Metrics Engine — aggregated, anonymous impact calculations.
 * Never stores individual events; only maintains/reads aggregated counters.
 */
import { db } from '../database/index.js';

/** Compute the global aggregate metrics snapshot. */
export async function getGlobalMetrics() {
  const gs = await db.query(
    `SELECT total_completed, completed_missions, active_users,
            countries_active, active_regions, updated_at
     FROM anonymous_global_stats WHERE id = 1`
  );
  const row = gs.rows[0] ?? {};
  return {
    completedMissions: Number(row.total_completed ?? row.completed_missions ?? 0),
    activeCountries: Number(row.countries_active ?? 0),
    activeRegions: Number(row.active_regions ?? 0)
  };
}

/** Per-country aggregated counters. */
export async function getCountryMetrics() {
  const rows = await db.query(
    `SELECT c.code, c.name, c.region,
            COALESCE(ca.completed_count, 0)::bigint AS completed,
            c.missions_available AS missions_available,
            c.active
     FROM countries c
     LEFT JOIN country_activity ca ON ca.country_code = c.code
     ORDER BY completed DESC, c.code`
  );
  return rows.rows.map((r: {
    code: string; name: string; region: string; completed: string;
    missions_available: number; active: boolean;
  }) => ({
    country: r.code,
    name: r.name,
    region: r.region,
    completed: Number(r.completed),
    missions_available: Number(r.missions_available),
    active: r.active
  }));
}

/** Per-region aggregated counters. */
export async function getRegionMetrics() {
  const rows = await db.query(
    `SELECT region, completed_count AS completed
     FROM region_activity
     ORDER BY completed DESC, region`
  );
  return rows.rows.map((r: { region: string; completed: string }) => ({
    region: r.region,
    completed: Number(r.completed)
  }));
}

/** Challenge list with computed completion percentages. */
export async function getChallengeMetrics() {
  const rows = await db.query(
    `SELECT id, title, description, target_value, current_value, status, created_at, updated_at
     FROM community_challenges ORDER BY created_at DESC`
  );
  return rows.rows.map((r: {
    id: number; title: string; description: string;
    target_value: number; current_value: number; status: string;
    created_at: Date; updated_at: Date;
  }) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    target_value: Number(r.target_value),
    current_value: Number(r.current_value),
    status: r.status,
    completion_percent: r.target_value > 0
      ? Math.min(100, Math.round((Number(r.current_value) / Number(r.target_value)) * 10000) / 100)
      : 0
  }));
}

/** Map data for the Europe activity map (intensity per country). */
export async function getMapActivity() {
  const rows = await db.query(
    `SELECT c.code, c.name, c.region, c.active, c.missions_available,
            COALESCE(ca.completed_count, 0)::bigint AS completed
     FROM countries c
     LEFT JOIN country_activity ca ON ca.country_code = c.code
     ORDER BY c.code`
  );
  return rows.rows.map((r: {
    code: string; name: string; region: string; active: boolean;
    missions_available: number; completed: string;
  }) => ({
    code: r.code,
    name: r.name,
    region: r.region,
    active: r.active,
    missions_available: Number(r.missions_available),
    completed: Number(r.completed),
    activity_level: levelOf(Number(r.completed))
  }));
}

function levelOf(completed: number): string {
  if (completed <= 0) return 'none';
  if (completed < 100) return 'low';
  if (completed < 1000) return 'medium';
  if (completed < 5000) return 'high';
  return 'very-high';
}
