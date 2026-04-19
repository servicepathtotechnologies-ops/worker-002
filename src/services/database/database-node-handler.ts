/**
 * Database Node Handler
 * 
 * Central handler for all database node executions.
 * This is called from execute-workflow.ts to execute database nodes.
 */

import { NodeExecutionContext } from '../../core/types/node-definition';
import {
  runSQLServerNode,
  runMongoDBNode,
  runMySQLNode,
  runPostgresNode,
  runRedisNode,
  runSnowflakeNode,
  runSQLiteNode,
  runSupabaseNode,
  runTimescaleDBNode,
  runIntuitSmesNode,
  runOdooNode,
  runFirebaseNode,
  runGCSNode,
} from './index';

/**
 * Execute a database node by type
 */
export async function executeDatabaseNode(
  nodeType: string,
  context: NodeExecutionContext
): Promise<any> {
  switch (nodeType) {
    case 'sql_server':
    case 'mssql':
      return await runSQLServerNode(context);

    case 'mongodb':
      return await runMongoDBNode(context);

    case 'mysql':
      return await runMySQLNode(context);

    case 'postgres':
    case 'postgresql':
      return await runPostgresNode(context);

    case 'redis':
      return await runRedisNode(context);

    case 'snowflake':
      return await runSnowflakeNode(context);

    case 'sqlite':
      return await runSQLiteNode(context);

    case 'supabase':
      return await runSupabaseNode(context);

    case 'timescaledb':
    case 'timescale':
      return await runTimescaleDBNode(context);

    case 'intuit_smes':
    case 'intuit':
      return await runIntuitSmesNode(context);

    case 'odoo':
      return await runOdooNode(context);

    case 'firebase':
      return await runFirebaseNode(context);

    case 'google_cloud_storage':
      return await runGCSNode(context);

    default:
      return {
        success: false,
        error: `Unknown database node type: ${nodeType}`,
      };
  }
}
