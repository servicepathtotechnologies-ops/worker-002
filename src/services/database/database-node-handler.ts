/**
 * Database Node Handler
 * 
 * Central handler for all database node executions.
 * This is called from execute-workflow.ts to execute database nodes.
 */

import { NodeExecutionContext } from '../../core/types/node-definition';

/**
 * Execute a database node by type
 */
export async function executeDatabaseNode(
  nodeType: string,
  context: NodeExecutionContext
): Promise<any> {
  switch (nodeType) {
    case 'sql_server':
    case 'mssql': {
      const { runSQLServerNode } = await import('./sqlServerNode');
      return await runSQLServerNode(context);
    }

    case 'mongodb': {
      const { runMongoDBNode } = await import('./mongoDBNode');
      return await runMongoDBNode(context);
    }

    case 'mysql': {
      const { runMySQLNode } = await import('./mysqlNode');
      return await runMySQLNode(context);
    }

    case 'postgres':
    case 'postgresql': {
      const { runPostgresNode } = await import('./postgresNode');
      return await runPostgresNode(context);
    }

    case 'redis': {
      const { runRedisNode } = await import('./redisNode');
      return await runRedisNode(context);
    }

    case 'snowflake': {
      const { runSnowflakeNode } = await import('./snowflakeNode');
      return await runSnowflakeNode(context);
    }

    case 'sqlite': {
      const { runSQLiteNode } = await import('./sqliteNode');
      return await runSQLiteNode(context);
    }

    case 'db': {
      const { runSupabaseNode } = await import('./supabaseNode');
      return await runSupabaseNode(context);
    }

    case 'timescaledb':
    case 'timescale': {
      const { runTimescaleDBNode } = await import('./timescaleDBNode');
      return await runTimescaleDBNode(context);
    }

    case 'intuit_smes':
    case 'intuit': {
      const { runIntuitSmesNode } = await import('./intuitSmesNode');
      return await runIntuitSmesNode(context);
    }

    case 'odoo': {
      const { runOdooNode } = await import('./odooNode');
      return await runOdooNode(context);
    }

    case 'firebase': {
      const { runFirebaseNode } = await import('./firebaseNode');
      return await runFirebaseNode(context);
    }

    case 'google_cloud_storage': {
      const { runGCSNode } = await import('./gcsNode');
      return await runGCSNode(context);
    }

    default:
      return {
        success: false,
        error: `Unknown database node type: ${nodeType}`,
      };
  }
}
