// Environment Configuration for CtrlChecks Worker
// Production-ready with proper validation

const isProduction = process.env.NODE_ENV === 'production';

// Validate required environment variables in production
const requireEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (isProduction && !value) {
    throw new Error(`❌ Required environment variable ${key} is missing in production`);
  }
  return value || '';
};

export const config: any = {
  // Database — AWS RDS PostgreSQL
  databaseUrl: process.env.DATABASE_URL,

  // AWS Cognito
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
  cognitoClientId: process.env.COGNITO_CLIENT_ID || '',
  cognitoClientSecret: process.env.COGNITO_CLIENT_SECRET || '',
  cognitoDomain: process.env.COGNITO_DOMAIN || '',
  cognitoIssuer: process.env.COGNITO_ISSUER ||
    `https://cognito-idp.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID || ''}`,
  awsRegion: process.env.AWS_REGION || 'ap-south-1',

  // Redis (if used)
  redisUrl: process.env.REDIS_URL,
  
  // Port
  port: parseInt(process.env.PORT || '3001', 10),
  
  // CORS - Production: Must be set via environment variable
  corsOrigin: isProduction 
    ? requireEnv('CORS_ORIGIN', process.env.ALLOWED_ORIGINS || '')
    : (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || 'http://localhost:5173'),
  
  // API Keys
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
  
  // Payment Gateway - Razorpay
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  
  // Subscription System Configuration
  subscriptionMode: process.env.SUBSCRIPTION_MODE || (isProduction ? 'production' : 'development'),
  developmentPricing: process.env.DEVELOPMENT_PRICING === 'true' || !isProduction, // ₹1 pricing for development
  
  // Google OAuth
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  
  // Zoho OAuth
  zohoOAuthClientId: process.env.ZOHO_OAUTH_CLIENT_ID,
  zohoOAuthClientSecret: process.env.ZOHO_OAUTH_CLIENT_SECRET,
  
  // Token Encryption
  encryptionKey: process.env.ENCRYPTION_KEY,
  jwtSecret: process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
  
  // Gemini-first node selection (Path B): use LLM + registry for node selection; when false or Path B fails, use keyword-based (Path A)
  useGeminiFirstNodeSelection: true,

  // When true, skip enhanced-keyword-matcher.ts fallback entirely and use Gemini-first exclusively
  useGeminiFirstExclusively: true,

  // Other
  lovableApiKey: process.env.LOVABLE_API_KEY,
  webhookSecret: process.env.WEBHOOK_SECRET,
  publicBaseUrl: requireEnv('PUBLIC_BASE_URL', isProduction ? '' : 'http://localhost:3001'),
  workerId: process.env.WORKER_ID || (isProduction ? 'worker-prod' : 'worker-local'),
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'WARN' : 'INFO'),
  processTimeoutSeconds: parseInt(process.env.PROCESS_TIMEOUT_SECONDS || '1800', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  reliability: {
    strictValidation: true,
    validateNodeOutput: true,
    aiSelfCheckEnabled: true,
    aiSelfCheckMaxAttempts: 2,
    distributedRateLimitEnabled: true,
    distributedRateLimitRedisUrl: process.env.REDIS_URL || '',
    redisSessionEnabled: true,
    redisSessionPrefix: 'session:',
    tracingEnabled: true,
    tracingServiceName: 'ctrlchecks-worker',
    tracingOtlpEndpoint: '',
    dlqMandatoryRouting: true,
    autonomousOpsEnabled: true,
    autonomousOpsMaxRemediationAttempts: 3,
    autonomousOpsIntervalMs: 10 * 60_000, // 10 minutes (was 60s — reduced to cut idle DB load)
    autonomousOpsBreakerResetCooldownMs: 120_000,
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 60_000,
      resetTimeoutMs: 300_000,
    },
  },
};
