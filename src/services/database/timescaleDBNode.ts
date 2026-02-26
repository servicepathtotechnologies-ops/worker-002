/**
 * TimescaleDB Node Executor
 * 
 * TimescaleDB is a PostgreSQL extension, so it uses the same connection
 * and most operations as PostgreSQL. This executor extends the PostgreSQL
 * executor with TimescaleDB-specific time-series operations.
 * 
 * Supports operations:
 * - executeQuery: Execute raw SQL queries with parameters
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 * - timeBucket: Time-bucket aggregation (TimescaleDB specific)
 * - first: Get first value in a time bucket (TimescaleDB specific)
 * - last: Get last value in a time bucket (TimescaleDB specific)
 * 
 * Uses pg driver with connection pooling (same as PostgreSQL).
 */

import { Pool, PoolClient } from 'pg';
import { NodeExecutionContext } from '../../core/types/node-definition';

interface TimescaleDBCredentials {
  host: string;
  port: number | string;
  username: string;
  password: string;
  database: string;
  ssl?: boolean | object;
}

interface TimescaleDBOperation {
  name: 'executeQuery' | 'insert' | 'update' | 'delete' | 'timeBucket' | 'first' | 'last';
  query?: string;
  table?: string;
  data?: Record<string, any> | Record<string, any>[];
  where?: Record<string, any>;
  params?: any[];
  // TimescaleDB-specific
  timeColumn?: string;
  interval?: string;
  bucketColumn?: string;
  valueColumn?: string;
}

/**
 * Validate TimescaleDB credentials (same as PostgreSQL)
 */
function validateCredentials(credentials: TimescaleDBCredentials): { valid: boolean; error?: string } {
  if (!credentials.host || typeof credentials.host !== 'string' || credentials.host.trim() === '') {
    return { valid: false, error: 'host is required' };
  }
  if (!credentials.username || typeof credentials.username !== 'string' || credentials.username.trim() === '') {
    return { valid: false, error: 'username is required' };
  }
  if (!credentials.password || typeof credentials.password !== 'string') {
    return { valid: false, error: 'password is required' };
  }
  if (!credentials.database || typeof credentials.database !== 'string' || credentials.database.trim() === '') {
    return { valid: false, error: 'database is required' };
  }
  
  const port = parseInt(String(credentials.port || 5432));
  if (isNaN(port) || port < 1 || port > 65535) {
    return { valid: false, error: 'port must be a valid number between 1 and 65535' };
  }

  return { valid: true };
}

/**
 * Build WHERE clause from object
 */
function buildWhereClause(where: Record<string, any>): { clause: string; params: any[]; paramIndex: number } {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(where)) {
    conditions.push(`"${key}" = $${paramIndex}`);
    params.push(value);
    paramIndex++;
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    paramIndex,
  };
}

/**
 * Execute TimescaleDB operation
 */
async function executeOperation(
  client: PoolClient,
  operation: TimescaleDBOperation
): Promise<any> {
  switch (operation.name) {
    case 'executeQuery': {
      if (!operation.query) {
        throw new Error('query is required for executeQuery operation');
      }

      const result = await client.query(operation.query, operation.params || []);
      return {
        rows: result.rows,
        rowsAffected: result.rowCount || 0,
      };
    }

    case 'insert': {
      if (!operation.table) {
        throw new Error('table is required for insert operation');
      }
      if (!operation.data) {
        throw new Error('data is required for insert operation');
      }

      const dataArray = Array.isArray(operation.data) ? operation.data : [operation.data];
      const insertedRows: any[] = [];

      for (const record of dataArray) {
        const columns = Object.keys(record);
        const values = columns.map((_, idx) => `$${idx + 1}`);
        const columnsStr = columns.map(col => `"${col}"`).join(', ');
        const valuesStr = values.join(', ');
        const params = columns.map(col => record[col]);

        const query = `INSERT INTO "${operation.table}" (${columnsStr}) VALUES (${valuesStr}) RETURNING *`;

        const result = await client.query(query, params);
        insertedRows.push(...result.rows);
      }

      return {
        inserted: insertedRows,
        count: insertedRows.length,
      };
    }

    case 'update': {
      if (!operation.table) {
        throw new Error('table is required for update operation');
      }
      if (!operation.data) {
        throw new Error('data is required for update operation');
      }
      if (!operation.where) {
        throw new Error('where clause is required for update operation');
      }

      const { clause: whereClause, params: whereParams, paramIndex } = buildWhereClause(operation.where);
      const setClauses: string[] = [];
      const setParams: any[] = [];
      let currentParamIndex = paramIndex;

      for (const [key, value] of Object.entries(operation.data)) {
        setClauses.push(`"${key}" = $${currentParamIndex}`);
        setParams.push(value);
        currentParamIndex++;
      }

      const query = `UPDATE "${operation.table}" SET ${setClauses.join(', ')} ${whereClause} RETURNING *`;
      const params = [...setParams, ...whereParams];

      const result = await client.query(query, params);
      return {
        rows: result.rows,
        rowsAffected: result.rowCount || 0,
      };
    }

    case 'delete': {
      if (!operation.table) {
        throw new Error('table is required for delete operation');
      }
      if (!operation.where) {
        throw new Error('where clause is required for delete operation');
      }

      const { clause: whereClause, params: whereParams } = buildWhereClause(operation.where);
      const query = `DELETE FROM "${operation.table}" ${whereClause} RETURNING *`;

      const result = await client.query(query, whereParams);
      return {
        rows: result.rows,
        rowsAffected: result.rowCount || 0,
      };
    }

    case 'timeBucket': {
      if (!operation.table) {
        throw new Error('table is required for timeBucket operation');
      }
      if (!operation.timeColumn) {
        throw new Error('timeColumn is required for timeBucket operation');
      }
      if (!operation.interval) {
        throw new Error('interval is required for timeBucket operation');
      }
      if (!operation.bucketColumn) {
        throw new Error('bucketColumn is required for timeBucket operation');
      }

      const whereResult = operation.where
        ? buildWhereClause(operation.where)
        : { clause: '', params: [], paramIndex: 1 };
      const { clause: whereClause, params: whereParams } = whereResult;

      // Build aggregation columns
      const aggColumns = operation.bucketColumn
        ? [`time_bucket('${operation.interval}', "${operation.timeColumn}") AS bucket`, `"${operation.bucketColumn}"`]
        : [`time_bucket('${operation.interval}', "${operation.timeColumn}") AS bucket`];

      const query = `
        SELECT ${aggColumns.join(', ')}, COUNT(*) as count
        FROM "${operation.table}"
        ${whereClause}
        GROUP BY bucket${operation.bucketColumn ? `, "${operation.bucketColumn}"` : ''}
        ORDER BY bucket
      `;

      const result = await client.query(query, whereParams);
      return {
        rows: result.rows,
        count: result.rows.length,
      };
    }

    case 'first': {
      if (!operation.table) {
        throw new Error('table is required for first operation');
      }
      if (!operation.timeColumn) {
        throw new Error('timeColumn is required for first operation');
      }
      if (!operation.interval) {
        throw new Error('interval is required for first operation');
      }
      if (!operation.valueColumn) {
        throw new Error('valueColumn is required for first operation');
      }

      const whereResult = operation.where
        ? buildWhereClause(operation.where)
        : { clause: '', params: [], paramIndex: 1 };
      const { clause: whereClause, params: whereParams } = whereResult;

      const query = `
        SELECT 
          time_bucket('${operation.interval}', "${operation.timeColumn}") AS bucket,
          first("${operation.valueColumn}", "${operation.timeColumn}") AS first_value
        FROM "${operation.table}"
        ${whereClause}
        GROUP BY bucket
        ORDER BY bucket
      `;

      const result = await client.query(query, whereParams);
      return {
        rows: result.rows,
        count: result.rows.length,
      };
    }

    case 'last': {
      if (!operation.table) {
        throw new Error('table is required for last operation');
      }
      if (!operation.timeColumn) {
        throw new Error('timeColumn is required for last operation');
      }
      if (!operation.interval) {
        throw new Error('interval is required for last operation');
      }
      if (!operation.valueColumn) {
        throw new Error('valueColumn is required for last operation');
      }

      const whereResult = operation.where
        ? buildWhereClause(operation.where)
        : { clause: '', params: [], paramIndex: 1 };
      const { clause: whereClause, params: whereParams } = whereResult;

      const query = `
        SELECT 
          time_bucket('${operation.interval}', "${operation.timeColumn}") AS bucket,
          last("${operation.valueColumn}", "${operation.timeColumn}") AS last_value
        FROM "${operation.table}"
        ${whereClause}
        GROUP BY bucket
        ORDER BY bucket
      `;

      const result = await client.query(query, whereParams);
      return {
        rows: result.rows,
        count: result.rows.length,
      };
    }

    default:
      throw new Error(`Unsupported operation: ${operation.name}`);
  }
}

/**
 * Run TimescaleDB node
 */
export async function runTimescaleDBNode(context: NodeExecutionContext): Promise<any> {
  const { inputs } = context;

  // Extract credentials
  const credentials: TimescaleDBCredentials = {
    host: inputs.host,
    port: inputs.port || 5432,
    username: inputs.username,
    password: inputs.password,
    database: inputs.database,
    ssl: inputs.ssl === true ? { rejectUnauthorized: false } : inputs.ssl || false,
  };

  // Extract operation
  const operation: TimescaleDBOperation = {
    name: inputs.operation,
    query: inputs.query,
    table: inputs.table,
    data: inputs.data,
    where: inputs.where,
    params: inputs.params,
    timeColumn: inputs.timeColumn,
    interval: inputs.interval,
    bucketColumn: inputs.bucketColumn,
    valueColumn: inputs.valueColumn,
  };

  // Validate credentials
  const validation = validateCredentials(credentials);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Validate operation
  if (!operation.name) {
    return {
      success: false,
      error: 'operation is required',
    };
  }

  const validOperations = ['executeQuery', 'insert', 'update', 'delete', 'timeBucket', 'first', 'last'];
  if (!validOperations.includes(operation.name)) {
    return {
      success: false,
      error: `operation must be one of: ${validOperations.join(', ')}`,
    };
  }

  // Create connection pool
  const pool = new Pool({
    host: credentials.host,
    port: parseInt(String(credentials.port)),
    user: credentials.username,
    password: credentials.password,
    database: credentials.database,
    ssl: credentials.ssl,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  let client: PoolClient | null = null;

  try {
    client = await pool.connect();

    // Execute operation
    const result = await executeOperation(client, operation);

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'TimescaleDB operation failed',
    };
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}
