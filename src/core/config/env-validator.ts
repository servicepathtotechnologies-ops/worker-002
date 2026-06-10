/**
 * Startup environment variable validator.
 *
 * Call validateEnv() immediately after env-loader runs, before any service
 * initialization. On missing required vars the process exits with code 1 so
 * the operator sees a clear list rather than a cryptic downstream error.
 */

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/** Variables that must be present for the worker to function at all. */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
  'COGNITO_ISSUER',
  'AWS_REGION',
  'GEMINI_API_KEY',
] as const;

/** Variables whose absence degrades functionality but does not crash the worker. */
const RECOMMENDED_VARS = [
  'COGNITO_DOMAIN',
  'COGNITO_ADMIN_CLIENT_ID',
  'COGNITO_CLIENT_SECRET',
  'FRONTEND_URL',
  'AI_GENERATOR_URL',
  'AI_GENERATOR_SERVICE_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'SENTRY_DSN',
] as const;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const missing = REQUIRED_VARS.filter(key => !env[key] || env[key]!.trim() === '');
  const warnings = RECOMMENDED_VARS.filter(key => !env[key] || env[key]!.trim() === '');
  return { valid: missing.length === 0, missing, warnings };
}

/**
 * Run validation and exit(1) if any required var is missing.
 * Safe to call in tests — pass a mock env object instead of process.env.
 */
export function assertEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'test') return;

  const { valid, missing, warnings } = validateEnv(env);

  if (warnings.length > 0) {
    console.warn('[EnvValidator] ⚠  Recommended vars not set:', warnings.join(', '));
  }

  if (!valid) {
    console.error('\n[EnvValidator] ❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\n💡 Copy worker/.env.example → worker/.env and fill in the values.\n');
    process.exit(1);
  }
}
