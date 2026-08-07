/** Bearer token auth middleware. */
import type { Request, Response, NextFunction } from 'express';
import { getSessionByToken } from '../auth/session.js';

export interface AuthedRequest extends Request {
  userId?: number;
  sessionId?: number;
}

export function authMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  // Always return to avoid async gaps after the response is sent.
  void (async () => {
    try {
      const session = await getSessionByToken(m[1]);
      if (!session) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      req.userId = session.user_id;
      req.sessionId = session.id;
      next();
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  })();
}
