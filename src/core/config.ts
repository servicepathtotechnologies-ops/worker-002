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
  // Database
  databaseUrl: process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  
  // Supabase (if still using for auth)
  // Support both standard naming and VITE_ prefix (for shared .env files)
  supabaseUrl: requireEnv('SUPABASE_URL', process.env.VITE_SUPABASE_URL || ''),
  supabaseKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''),
  
  // Ollama
  // Check both OLLAMA_BASE_URL (backend) and VITE_OLLAMA_BASE_URL (frontend) for compatibility
  ollamaHost: process.env.OLLAMA_BASE_URL || process.env.VITE_OLLAMA_BASE_URL || (isProduction ? '' : 'http://localhost:11434'),
  
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
  
  // Google OAuth
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  
  // Zoho OAuth
  zohoOAuthClientId: process.env.ZOHO_OAUTH_CLIENT_ID,
  zohoOAuthClientSecret: process.env.ZOHO_OAUTH_CLIENT_SECRET,
  
  // Token Encryption
  encryptionKey: process.env.ENCRYPTION_KEY,
  
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
};
