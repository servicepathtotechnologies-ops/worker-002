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

// Try to find .env file in common locations (in order of priority)
const possibleEnvPaths = [
  join(process.cwd(), 'worker', '.env'),         // If running from project root
  join(process.cwd(), '.env'),                   // Current working directory
  join(__dirname, '..', '..', '.env'),           // From compiled dist/ directory
  join(__dirname, '..', '.env'),                 // From src/core/ directory
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

// Validate required environment variables at startup
// Support both standard naming and VITE_ prefix (for shared .env files)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const missingVars: string[] = [];
if (!supabaseUrl) missingVars.push('SUPABASE_URL or VITE_SUPABASE_URL');
if (!supabaseKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY');

console.log('\n📋 Environment Variables Status:');
const urlSource = process.env.SUPABASE_URL ? 'SUPABASE_URL' : process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : 'none';
const keySource = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ? 'VITE_SUPABASE_SERVICE_ROLE_KEY' : 'none';
console.log(`   Supabase URL: ${supabaseUrl ? '✓ Set' : '✗ Missing'} ${supabaseUrl ? `(${supabaseUrl.substring(0, 30)}...)` : ''} ${urlSource !== 'none' ? `[from ${urlSource}]` : ''}`);
console.log(`   Supabase Key: ${supabaseKey ? '✓ Set' : '✗ Missing'} ${supabaseKey ? '(***hidden***)' : ''} ${keySource !== 'none' ? `[from ${keySource}]` : ''}`);

if (missingVars.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Please check your .env file in the worker directory.');
  console.error('   Make sure it contains one of these:');
  console.error('   SUPABASE_URL=https://your-project.supabase.co');
  console.error('   OR VITE_SUPABASE_URL=https://your-project.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.error('   OR VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.error('\n📝 You can copy env.example to .env as a starting point.');
  console.error(`   Current working directory: ${process.cwd()}\n`);
}
