// CORS Middleware for Express

import { Request, Response, NextFunction } from 'express';
import { corsHeaders } from '../../shared/cors';
import { config } from '../config';

// Allowed origins - can be configured via environment variables
const getAllowedOrigins = (): string[] => {
  const isProduction = config.isProduction || process.env.NODE_ENV === 'production';
  
  // In production, only use environment variables
  if (isProduction) {
    const origins: string[] = [];
    
    if (config.corsOrigin) {
      const envOrigins = config.corsOrigin.split(',').map((o: string) => o.trim()).filter(Boolean);
      origins.push(...envOrigins);
    }

    if (process.env.ALLOWED_ORIGINS) {
      const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean);
      origins.push(...envOrigins);
    }
    
    if (origins.length === 0) {
      console.warn('⚠️  No CORS origins configured in production. Set CORS_ORIGIN or ALLOWED_ORIGINS environment variable.');
    }
    
    return [...new Set(origins)];
  }
  
  // Development: Include localhost origins and common deployment URLs
  const origins = [
    'http://localhost:5173',  // Vite dev server (default)
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://localhost:8080',  // Alternative Vite port
    'http://127.0.0.1:8080',
    'http://localhost:8081',  // Additional dev port
    'http://127.0.0.1:8081',
    // Common deployment URLs (also allow in development for testing)
    'https://ctrl-checks-black.vercel.app',
    'https://*.vercel.app',  // Allow all Vercel preview deployments
  ];

  // Add environment variable origins
  if (config.corsOrigin) {
    const envOrigins = config.corsOrigin.split(',').map((o: string) => o.trim()).filter(Boolean);
    origins.push(...envOrigins);
  }

  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean);
    origins.push(...envOrigins);
  }

  // Remove duplicates
  return [...new Set(origins)];
};

// Export for use in index.ts
export { getAllowedOrigins };

const allowedOrigins = getAllowedOrigins();
const allowAllOrigins = allowedOrigins.includes('*');

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  // Helper function to check if origin matches a pattern (e.g., *.vercel.app)
  const matchesPattern = (origin: string, pattern: string): boolean => {
    if (pattern.includes('*')) {
      // Convert wildcard pattern to regex (e.g., https://*.vercel.app -> https://.*\.vercel\.app)
      const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp(`^${escapedPattern}$`);
      return regex.test(origin);
    }
    return origin === pattern;
  };

  // Check if origin is allowed
  if (allowAllOrigins) {
    // If wildcard is enabled, allow all origins
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && (allowedOrigins.includes(origin) || allowedOrigins.some(pattern => matchesPattern(origin, pattern)))) {
    // Origin matches exactly or matches a wildcard pattern
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests with no origin (like mobile apps or curl requests)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Log blocked origin for debugging
    console.warn(`⚠️  CORS: Blocked origin ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`);
    // Still allow the request but with first allowed origin (for development/testing)
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || '*');
  }

  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}
