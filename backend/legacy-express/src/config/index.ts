/** NullSec backend configuration (from env). */

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://nullsec:nullsec@localhost:5432/nullsec',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 5),
  // Comma-separated list of allowed frontend origins.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Reserved for future JWT/signing needs; not used for raw-token storage.
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
};
