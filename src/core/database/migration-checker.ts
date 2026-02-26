/**
 * Database Migration Checker
 * 
 * Automatically checks and applies missing migrations on server startup.
 * This ensures the database schema is always up-to-date.
 */

import { getSupabaseClient } from './supabase-compat';

export interface MigrationCheckResult {
  applied: boolean;
  message: string;
  error?: string;
}

/**
 * Check if workflows table has required columns (settings, graph, metadata)
 */
export async function checkWorkflowsSchemaColumns(): Promise<MigrationCheckResult> {
  try {
    const supabase = getSupabaseClient();
    
    // Check all three columns by attempting to query them
    const { error: checkError } = await supabase
      .from('workflows')
      .select('settings, graph, metadata')
      .limit(1);
    
    // If no error, all columns exist
    if (!checkError) {
      return {
        applied: false,
        message: 'workflows table has all required columns (settings, graph, metadata)',
      };
    }
    
    // If error is about missing columns, we need to add them
    if (checkError.message?.includes('column')) {
      const missingColumns: string[] = [];
      if (checkError.message.includes('settings')) missingColumns.push('settings');
      if (checkError.message.includes('graph')) missingColumns.push('graph');
      if (checkError.message.includes('metadata')) missingColumns.push('metadata');
      
      console.log(`[MigrationChecker] Missing columns detected: ${missingColumns.join(', ')}`);
      console.warn('[MigrationChecker] Automatic migration not supported via Supabase client');
      console.warn('[MigrationChecker] Please run migration manually: worker/migrations/010_add_workflows_metadata.sql');
      
      return {
        applied: false,
        message: `Migration check completed - missing columns: ${missingColumns.join(', ')}`,
        error: 'Supabase client does not support arbitrary SQL execution. Please run the migration manually in Supabase SQL Editor.',
      };
    }
    
    // Other error - return it
    return {
      applied: false,
      message: 'Error checking workflow columns',
      error: checkError.message,
    };
  } catch (error: any) {
    return {
      applied: false,
      message: 'Failed to check workflow columns',
      error: error?.message || String(error),
    };
  }
}

/**
 * @deprecated Use checkWorkflowsSchemaColumns instead
 */
export async function checkWorkflowsMetadataColumn(): Promise<MigrationCheckResult> {
  return checkWorkflowsSchemaColumns();
}

/**
 * Check all critical migrations on startup
 */
export async function checkAllMigrations(): Promise<MigrationCheckResult[]> {
  const results: MigrationCheckResult[] = [];
  
  // Check workflows table columns (settings, graph, metadata)
  const schemaResult = await checkWorkflowsSchemaColumns();
  results.push(schemaResult);
  
  return results;
}
