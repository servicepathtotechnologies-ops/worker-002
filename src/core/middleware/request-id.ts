import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Assigns a unique request ID to every incoming request.
 * - Reads the incoming `x-request-id` header (from upstream proxy) if present.
 * - Otherwise generates a fresh UUID.
 * - Echoes the ID as `x-request-id` in the response so clients can log it.
 * - Attaches the ID as `req.requestId` for use in downstream handlers.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
