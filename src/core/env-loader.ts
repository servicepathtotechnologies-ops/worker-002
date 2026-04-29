/**
 * Environment Variable Loader
 * 
 * CRITICAL: This module MUST be imported FIRST in index.ts
 * It loads environment variables from .env files before any other code runs.
 * 
 * This ensures:
 * - process.env is populated before config.ts reads it
 * - All services have access to environment variables
 * - Proper error handling if .env file is missing
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

// 🚨 CRITICAL: Load dotenv IMMEDIATELY and SYNCHRONOUSLY
// This must happen before any other code that might read process.env

// Try to find env files in common locations (in order of priority)
const possibleEnvPaths = [
  join(process.cwd(), 'worker', 'env'),          // If running from project root (legacy filename)
  join(process.cwd(), 'worker', '.env'),         // If running from project root
  join(process.cwd(), 'env'),                    // Current working directory (legacy filename)
  join(process.cwd(), '.env'),                   // Current working directory
  join(process.cwd(), '..', 'env'),              // Parent legacy filename
  join(process.cwd(), '..', '.env'),             // If running from nested worker/worker
  join(__dirname, '..', '..', 'env'),            // From compiled dist/ directory legacy filename
  join(__dirname, '..', '..', '.env'),           // From compiled dist/ directory
  join(__dirname, '..', 'env'),                  // From src/core/ directory legacy filename
  join(__dirname, '..', '.env'),                 // From src/core/ directory
  join(__dirname, '..', '..', '..', 'env'),      // From src/core when env is in worker root (legacy)
  join(__dirname, '..', '..', '..', '.env'),     // From src/core when env is in worker root
];

let envLoaded = false;
let loadedFromPath: string | null = null;

// Try each path in order
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    try {
      const envResult = dotenv.config({ 
        path: envPath,
        override: false, // Don't override existing env vars
        debug: process.env.DOTENV_DEBUG === 'true', // Enable debug mode if requested
      });
      
      if (!envResult.error) {
        console.log(`✅ Loaded .env from: ${envPath}`);
        envLoaded = true;
        loadedFromPath = envPath;
        break;
      } else {
        console.warn(`⚠️  Failed to load .env from ${envPath}: ${envResult.error.message}`);
      }
    } catch (error) {
      console.warn(`⚠️  Error loading .env from ${envPath}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

// Fallback: Try default dotenv.config() (searches current directory and parent directories)
if (!envLoaded) {
  try {
    const envResult = dotenv.config({
      override: false,
      debug: process.env.DOTENV_DEBUG === 'true',
    });
    
    if (!envResult.error) {
      // Check if it actually loaded something
      if (envResult.parsed && Object.keys(envResult.parsed).length > 0) {
        console.log(`✅ Loaded .env from default location (${process.cwd()})`);
        envLoaded = true;
        loadedFromPath = 'default';
      } else {
        console.warn(`⚠️  dotenv.config() succeeded but no variables were loaded`);
      }
    } else {
      // Only warn if it's not a "file not found" error (which is expected)
      if (!envResult.error.message.includes('ENOENT')) {
        console.warn(`⚠️  dotenv.config() error: ${envResult.error.message}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Error in dotenv.config():`, error instanceof Error ? error.message : String(error));
  }
}

// Final check: If still not loaded, provide helpful error message
if (!envLoaded) {
  console.warn(`\n⚠️  Warning: Could not load .env file from any expected location`);
  console.warn(`   Tried paths:`);
  possibleEnvPaths.forEach(path => {
    console.warn(`     - ${path} ${existsSync(path) ? '(exists)' : '(not found)'}`);
  });
  console.warn(`   Current working directory: ${process.cwd()}`);
  console.warn(`   __dirname: ${__dirname}`);
  console.warn(`\n💡 Tip: Create a .env file in one of these locations:`);
  console.warn(`   - ${join(process.cwd(), 'worker', '.env')} (recommended)`);
  console.warn(`   - ${join(process.cwd(), '.env')}`);
  console.warn(`\n📝 You can copy env.example to .env as a starting point.\n`);
}

// Validate required AWS environment variables at startup
console.log('\n📋 Environment Variables Status:');
const dbUrl = process.env.DATABASE_URL;
const cognitoPool = process.env.COGNITO_USER_POOL_ID;
console.log(`   DATABASE_URL:           ${dbUrl         ? '✓ Set' : '✗ Missing'}`);
console.log(`   COGNITO_USER_POOL_ID:   ${cognitoPool   ? '✓ Set' : '✗ Missing'}`);
console.log(`   COGNITO_CLIENT_ID:      ${process.env.COGNITO_CLIENT_ID    ? '✓ Set' : '✗ Missing'}`);
console.log(`   REDIS_URL:              ${process.env.REDIS_URL             ? '✓ Set' : '⚠ Optional/Missing'}`);
console.log(`   GEMINI_API_KEY:         ${process.env.GEMINI_API_KEY       ? '✓ Set' : '✗ Missing'}`);

const missingVars: string[] = [];
if (!dbUrl)       missingVars.push('DATABASE_URL');
if (!cognitoPool) missingVars.push('COGNITO_USER_POOL_ID');

if (missingVars.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\n💡 Please check worker/.env (or worker/env for local compatibility)\n');
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}
