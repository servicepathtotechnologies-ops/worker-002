/**
 * Sentry error tracking initialization for the worker service.
 *
 * Call initSentry() once at startup, immediately after env-loader.
 * If SENTRY_DSN is not set the function is a no-op so dev/test environments
 * are unaffected.
 *
 * Secret scrubbing: beforeSend strips Authorization headers and any key that
 * looks like a credential before the event leaves the process.
 */

import * as Sentry from '@sentry/node';

const SCRUBBED_KEYS = new Set([
  'authorization',
  'x-service-key',
  'x-api-key',
  'cookie',
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'gemini_api_key',
  'aws_secret_access_key',
  'aws_access_key_id',
  'database_url',
  'redis_url',
]);

function scrubObject(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SCRUBBED_KEYS.has(k.toLowerCase()) ? '[Filtered]' : v;
  }
  return out;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    beforeSend(event) {
      if (event.request?.headers) {
        event.request.headers = scrubObject(event.request.headers as Record<string, any>);
      }
      if (event.request?.data && typeof event.request.data === 'object') {
        event.request.data = scrubObject(event.request.data as Record<string, any>);
      }
      return event;
    },
  });

  console.log('[Sentry] ✅ Error tracking initialized');
}

export { Sentry };
