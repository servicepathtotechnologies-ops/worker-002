/**
 * CORS middleware — production-strict.
 *
 * Production allowlist (NODE_ENV=production):
 *   - Hardcoded: ctrlchecks.ai domains only
 *   - Env-driven: FRONTEND_URL + ALLOWED_ORIGINS (comma-separated)
 *   - NO wildcard origins; NO Vercel preview URLs
 *
 * Development: localhost variants + Vercel preview wildcard are also allowed.
 *
 * Blocked origins in production receive 403 (not a silent passthrough).
 * Requests with no Origin header are allowed (mobile / curl / server-to-server).
 */

import { Request, Response, NextFunction } from 'express';
import { corsHeaders } from '../../shared/cors';
import { config } from '../config';

const isProduction = config.isProduction || process.env.NODE_ENV === 'production';

function buildAllowedOrigins(): string[] {
  const origins: string[] = [
    'https://ctrlchecks.ai',
    'https://www.ctrlchecks.ai',
    'https://app.ctrlchecks.ai',
  ];

  if (!isProduction) {
    origins.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
      'https://ctrl-checks-black.vercel.app',
      'https://*.vercel.app'
    );
  }

  // Env-driven additions (works in both environments)
  const envOrigins: string[] = [];
  if (config.corsOrigin) {
    envOrigins.push(...config.corsOrigin.split(',').map((o: string) => o.trim()).filter(Boolean));
  }
  if (process.env.FRONTEND_URL) {
    envOrigins.push(process.env.FRONTEND_URL.trim());
  }
  if (process.env.ALLOWED_ORIGINS) {
    envOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean));
  }

  return [...new Set([...origins, ...envOrigins])];
}

function matchesPattern(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(origin);
}

// Evaluate at module load; env does not change after startup.
const allowedOrigins = buildAllowedOrigins();

// Exported as a function to preserve the public API used by index.ts.
export function getAllowedOrigins(): string[] {
  return allowedOrigins;
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (!origin) {
    // No Origin header — non-browser (mobile app, curl, server-to-server). Allow.
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.some((pattern) => matchesPattern(origin, pattern))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    // Unknown origin — block in production; warn in development.
    if (isProduction) {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Origin not in allowlist',
        code: 'CORS_BLOCKED',
      });
    }
    // Dev: allow but warn so developers notice configuration gaps.
    console.warn(`[CORS] Warning — unknown origin in dev: ${origin}`);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}
