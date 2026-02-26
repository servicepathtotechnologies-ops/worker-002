/**
 * MySQL Node Executor
 * 
 * Supports operations:
 * - executeQuery: Execute raw SQL queries with parameters
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 * 
 * Uses mysql2/promise driver with connection pooling.
 */

import mysql from 'mysql2/promise';
import { NodeExecutionContext } from '../../core/types/node-definition';

interface MySQLCredentials {
  host: string;
  port: number | string;
  username: string;
  password: string;
  database: string;
  ssl?: boolean | object;
}

interface MySQLOperation {
  name: 'executeQuery' | 'insert' | 'update' | 'delete';
  query?: string;
  table?: string;
  data?: Record<string, any> | Record<string, any>[];
  where?: Record<string, any>;
  params?: any[];
}

/**
 * Validate MySQL credentials
 */
function validateCredentials(credentials: MySQLCredentials): { valid: boolean; error?: string } {
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
  
  const port = parseInt(String(credentials.port || 3306));
  if (isNaN(port) || port < 1 || port > 65535) {
    return { valid: false, error: 'port must be a valid number between 1 and 65535' };
  }

  return { valid: true };
}

/**
 * Build WHERE clause from object
 */
function buildWhereClause(where: Record<string, any>): { clause: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(where)) {
    conditions.push(`\`${key}\` = ?`);
    params.push(value);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Execute MySQL operation
 */
async function executeOperation(
  connection: mysql.PoolConnection,
  operation: MySQLOperation
): Promise<any> {
  switch (operation.name) {
    case 'executeQuery': {
      if (!operation.query) {
        throw new Error('query is required for executeQuery operation');
      }

      const [rows] = await connection.execute(operation.query, operation.params || []);
      const [result] = await connection.execute('SELECT ROW_COUNT() as affectedRows');
      const affectedRows = (result as any[])[0]?.affectedRows || 0;

      return {
        rows: rows as any[],
        rowsAffected: affectedRows,
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
      const insertedIds: any[] = [];

      for (const record of dataArray) {
        const columns = Object.keys(record);
        const values = columns.map(() => '?');
        const columnsStr = columns.map(col => `\`${col}\``).join(', ');
        const valuesStr = values.join(', ');
        const params = columns.map(col => record[col]);

        const query = `INSERT INTO \`${operation.table}\` (${columnsStr}) VALUES (${valuesStr})`;

        const [result] = await connection.execute(query, params) as any;
        insertedIds.push({ insertId: result.insertId, ...record });
      }

      return {
        inserted: insertedIds,
        count: insertedIds.length,
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

      const { clause: whereClause, params: whereParams } = buildWhereClause(operation.where);
      const setClauses: string[] = [];
      const setParams: any[] = [];

      for (const [key, value] of Object.entries(operation.data)) {
        setClauses.push(`\`${key}\` = ?`);
        setParams.push(value);
      }

      const query = `UPDATE \`${operation.table}\` SET ${setClauses.join(', ')} ${whereClause}`;
      const params = [...setParams, ...whereParams];

      const [result] = await connection.execute(query, params) as any;
      return {
        rowsAffected: result.affectedRows || 0,
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
      const query = `DELETE FROM \`${operation.table}\` ${whereClause}`;

      const [result] = await connection.execute(query, whereParams) as any;
      return {
        rowsAffected: result.affectedRows || 0,
      };
    }

    default:
      throw new Error(`Unsupported operation: ${operation.name}`);
  }
}

/**
 * Run MySQL node
 */
export async function runMySQLNode(context: NodeExecutionContext): Promise<any> {
  const { inputs } = context;

  // Extract credentials
  const credentials: MySQLCredentials = {
    host: inputs.host,
    port: inputs.port || 3306,
    username: inputs.username,
    password: inputs.password,
    database: inputs.database,
    ssl: inputs.ssl,
  };

  // Extract operation
  const operation: MySQLOperation = {
    name: inputs.operation,
    query: inputs.query,
    table: inputs.table,
    data: inputs.data,
    where: inputs.where,
    params: inputs.params,
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

  const validOperations = ['executeQuery', 'insert', 'update', 'delete'];
  if (!validOperations.includes(operation.name)) {
    return {
      success: false,
      error: `operation must be one of: ${validOperations.join(', ')}`,
    };
  }

  // Create connection pool
  const poolConfig: any = {
    host: credentials.host,
    port: parseInt(String(credentials.port)),
    user: credentials.username,
    password: credentials.password,
    database: credentials.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  // Handle SSL configuration
  if (credentials.ssl === true) {
    poolConfig.ssl = { rejectUnauthorized: false };
  } else if (credentials.ssl && typeof credentials.ssl === 'object') {
    poolConfig.ssl = credentials.ssl;
  }
  // If ssl is false or undefined, don't include it (defaults to no SSL)

  const pool = mysql.createPool(poolConfig);

  let connection: mysql.PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    // Execute operation
    const result = await executeOperation(connection, operation);

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'MySQL operation failed',
    };
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}
