/**
 * Database Migration Checker
 * 
 * Checks for missing AWS RDS PostgreSQL migrations on server startup.
 * This ensures the database schema is always up-to-date.
 */

import { getDbClient } from './db-client';

export interface MigrationCheckResult {
  applied: boolean;
  message: string;
  error?: string;
}

/**
 * Check if workflows table has required columns.
 */
export async function checkWorkflowsSchemaColumns(): Promise<MigrationCheckResult> {
  try {
    const db = getDbClient();
    
    // Check required columns by attempting to query them through the RDS client.
    const { error: checkError } = await db
      .from('workflows')
      .select('settings, graph, metadata, setup_completed, setup_stage, setup_completed_at')
      .limit(1);
    
    // If no error, all columns exist
    if (!checkError) {
      return {
        applied: false,
        message: 'workflows table has all required columns',
      };
    }
    
    // If error is about missing columns, we need to add them
    if (checkError.message?.includes('column')) {
      const missingColumns: string[] = [];
      if (checkError.message.includes('settings')) missingColumns.push('settings');
      if (checkError.message.includes('graph')) missingColumns.push('graph');
      if (checkError.message.includes('metadata')) missingColumns.push('metadata');
      if (checkError.message.includes('setup_completed')) missingColumns.push('setup_completed');
      if (checkError.message.includes('setup_stage')) missingColumns.push('setup_stage');
      if (checkError.message.includes('setup_completed_at')) missingColumns.push('setup_completed_at');
      
      console.log(`[MigrationChecker] Missing columns detected: ${missingColumns.join(', ')}`);
      console.warn('[MigrationChecker] Apply the AWS RDS SQL migrations in ctrl_checks/sql_migrations/');
      
      return {
        applied: false,
        message: `Migration check completed - missing columns: ${missingColumns.join(', ')}`,
        error: 'AWS RDS schema is missing required columns. Apply the SQL files in ctrl_checks/sql_migrations/.',
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

export async function checkConnectionsSchemaColumns(): Promise<MigrationCheckResult> {
  try {
    const db = getDbClient();
    const { error: checkError } = await db
      .from('connections')
      .select('revoked_at, replaced_by_connection_id, external_account_id, external_account_email')
      .limit(1);

    if (!checkError) {
      return {
        applied: false,
        message: 'connections table has all required lifecycle columns',
      };
    }

    if (checkError.message?.includes('column')) {
      console.warn('[MigrationChecker] Apply AWS RDS SQL migration 30_harden_connection_lifecycle.sql');
      return {
        applied: false,
        message: 'Connection lifecycle migration is missing',
        error: 'AWS RDS schema is missing connection lifecycle columns. Apply ctrl_checks/sql_migrations/30_harden_connection_lifecycle.sql.',
      };
    }

    return {
      applied: false,
      message: 'Error checking connection lifecycle columns',
      error: checkError.message,
    };
  } catch (error: any) {
    return {
      applied: false,
      message: 'Failed to check connection lifecycle columns',
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
  
  // Check workflows table columns.
  const schemaResult = await checkWorkflowsSchemaColumns();
  results.push(schemaResult);

  const connectionsResult = await checkConnectionsSchemaColumns();
  results.push(connectionsResult);
  
  return results;
}
