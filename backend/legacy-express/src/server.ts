/** NullSec backend entry point (server.ts). */
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config/index.js';
import { authRouter } from './api/auth.js';
import { usersRouter } from './api/users.js';
import { syncRouter } from './api/sync.js';
import { communityRouter } from './api/community.js';
import { missionsRouter } from './api/missions.js';
import { activityRouter } from './api/activity.js';
import { communityMetricsRouter } from './api/community-metrics.js';

const app = express();

// Secure headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0'); // rely on CSP
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );
  next();
});

// CORS (only the configured frontend origin; minimal, no wildcard auth)
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nullsec-backend', env: config.nodeEnv });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/sync', syncRouter);
app.use('/api/missions', missionsRouter);
app.use('/api/community', communityRouter);
app.use('/api/community', activityRouter);
app.use('/api/community', communityMetricsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`nullsec-backend listening on :${config.port} (${config.nodeEnv})`);
});
