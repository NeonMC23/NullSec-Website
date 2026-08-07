/**
 * Community impact metrics endpoints (public, aggregated, cached-friendly).
 */
import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  getGlobalMetrics, getCountryMetrics, getRegionMetrics, getChallengeMetrics, getMapActivity
} from '../services/community-metrics.js';

export const communityMetricsRouter = Router();

const publicLimit = rateLimit(60);

/** GET /api/community/metrics */
communityMetricsRouter.get('/metrics', publicLimit, async (_req, res) => {
  const [globalM, countries, regions, challenges] = await Promise.all([
    getGlobalMetrics(), getCountryMetrics(), getRegionMetrics(), getChallengeMetrics()
  ]);
  res.json({ global: globalM, countries, regions, challenges });
});

/** GET /api/community/activity/map */
communityMetricsRouter.get('/activity/map', publicLimit, async (_req, res) => {
  const countries = await getMapActivity();
  res.json({ countries });
});
