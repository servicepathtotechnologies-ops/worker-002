// Supabase-compatible database client
// Provides same interface as Supabase client for easy migration

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  // Check if Supabase is configured (allow empty strings to be treated as not configured)
  const hasUrl = config.supabaseUrl && config.supabaseUrl.trim() !== '';
  const hasKey = config.supabaseKey && config.supabaseKey.trim() !== '';
  
  // Check if URL is a placeholder
  const isPlaceholderUrl = hasUrl && (
    config.supabaseUrl.includes('your-project') ||
    config.supabaseUrl.includes('your-project-id') ||
    config.supabaseUrl.includes('example.com') ||
    !config.supabaseUrl.includes('.supabase.co')
  );
  
  if (!hasUrl || !hasKey || isPlaceholderUrl) {
    const missing = [];
    if (!hasUrl) missing.push('SUPABASE_URL');
    if (isPlaceholderUrl) missing.push('SUPABASE_URL (placeholder detected)');
    if (!hasKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    
    console.error('\n❌ Supabase configuration error:');
    console.error(`   Issues: ${missing.join(', ')}`);
    if (isPlaceholderUrl) {
      console.error(`   SUPABASE_URL: ✗ Placeholder detected (${config.supabaseUrl})`);
      console.error('   ⚠️  You need to replace the placeholder with your actual Supabase project URL!');
    } else {
      console.error(`   SUPABASE_URL: ${hasUrl ? '✓ Set' : '✗ Missing'}`);
    }
    console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${hasKey ? '✓ Set' : '✗ Missing'}`);
    console.error('\n💡 Make sure you have a .env file in the worker directory with:');
    console.error('   SUPABASE_URL=https://YOUR-ACTUAL-PROJECT-ID.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    console.error('\n📝 To get your Supabase URL and key:');
    console.error('   1. Go to https://supabase.com/dashboard');
    console.error('   2. Select your project');
    console.error('   3. Go to Settings > API');
    console.error('   4. Copy the Project URL and service_role key\n');
    
    throw new Error(`Supabase configuration invalid. ${isPlaceholderUrl ? 'SUPABASE_URL contains a placeholder value.' : `Missing: ${missing.join(', ')}.`} Please update your .env file with actual Supabase credentials.`);
  }

  supabaseClient = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

/**
 * Create a new Supabase client instance
 */
export function createSupabaseClient(url?: string, key?: string): SupabaseClient {
  const supabaseUrl = url || config.supabaseUrl;
  const supabaseKey = key || config.supabaseKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and Service Role Key are required.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
