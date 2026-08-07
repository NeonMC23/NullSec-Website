/** Minimal in-memory rate limiter for auth endpoints. */
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(limit: number = config.authRateLimit) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + 60_000 };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > limit) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}
