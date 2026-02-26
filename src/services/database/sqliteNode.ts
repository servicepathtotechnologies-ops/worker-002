/**
 * SQLite Node Executor
 * 
 * Supports operations:
 * - executeQuery: Execute raw SQL queries with parameters
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 * 
 * Uses better-sqlite3 driver (synchronous API with async wrapper).
 */

// Note: better-sqlite3 needs to be installed: npm install better-sqlite3
// For now, using a type declaration to avoid compilation errors
// @ts-ignore - better-sqlite3 will be installed separately
import Database from 'better-sqlite3';
import { NodeExecutionContext } from '../../core/types/node-definition';
import * as path from 'path';
import * as fs from 'fs';

interface SQLiteCredentials {
  filename: string;
  readonly?: boolean;
}

interface SQLiteOperation {
  name: 'executeQuery' | 'insert' | 'update' | 'delete';
  query?: string;
  table?: string;
  data?: Record<string, any> | Record<string, any>[];
  where?: Record<string, any>;
  params?: any[];
}

/**
 * Validate SQLite credentials
 */
function validateCredentials(credentials: SQLiteCredentials): { valid: boolean; error?: string } {
  if (!credentials.filename || typeof credentials.filename !== 'string' || credentials.filename.trim() === '') {
    return { valid: false, error: 'filename is required' };
  }

  // Resolve file path
  const filePath = path.isAbsolute(credentials.filename)
    ? credentials.filename
    : path.resolve(process.cwd(), credentials.filename);

  // Check if file exists (for readonly mode) or if directory exists (for write mode)
  if (credentials.readonly) {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: `Database file does not exist: ${filePath}` };
    }
  } else {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      return { valid: false, error: `Directory does not exist: ${dir}` };
    }
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
    conditions.push(`"${key}" = ?`);
    params.push(value);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Execute SQLite operation
 */
function executeOperation(
  db: Database.Database,
  operation: SQLiteOperation
): any {
  switch (operation.name) {
    case 'executeQuery': {
      if (!operation.query) {
        throw new Error('query is required for executeQuery operation');
      }

      const stmt = db.prepare(operation.query);
      const params = operation.params || [];

      // Check if it's a SELECT query
      if (operation.query.trim().toUpperCase().startsWith('SELECT')) {
        const rows = stmt.all(...params);
        return {
          rows: rows,
          rowsAffected: rows.length,
        };
      } else {
        const result = stmt.run(...params);
        return {
          rowsAffected: result.changes || 0,
          lastInsertRowid: result.lastInsertRowid || null,
        };
      }
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
        const values = columns.map(() => '?');
        const columnsStr = columns.map(col => `"${col}"`).join(', ');
        const valuesStr = values.join(', ');
        const params = columns.map(col => record[col]);

        const query = `INSERT INTO "${operation.table}" (${columnsStr}) VALUES (${valuesStr})`;
        const stmt = db.prepare(query);
        const result = stmt.run(...params);

        // Get inserted row
        const selectStmt = db.prepare(`SELECT * FROM "${operation.table}" WHERE rowid = ?`);
        const insertedRow = selectStmt.get(result.lastInsertRowid);
        insertedRows.push(insertedRow);
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

      const { clause: whereClause, params: whereParams } = buildWhereClause(operation.where);
      const setClauses: string[] = [];
      const setParams: any[] = [];

      for (const [key, value] of Object.entries(operation.data)) {
        setClauses.push(`"${key}" = ?`);
        setParams.push(value);
      }

      const query = `UPDATE "${operation.table}" SET ${setClauses.join(', ')} ${whereClause}`;
      const params = [...setParams, ...whereParams];
      const stmt = db.prepare(query);
      const result = stmt.run(...params);

      return {
        rowsAffected: result.changes || 0,
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
      const query = `DELETE FROM "${operation.table}" ${whereClause}`;
      const stmt = db.prepare(query);
      const result = stmt.run(...whereParams);

      return {
        rowsAffected: result.changes || 0,
      };
    }

    default:
      throw new Error(`Unsupported operation: ${operation.name}`);
  }
}

/**
 * Run SQLite node
 */
export async function runSQLiteNode(context: NodeExecutionContext): Promise<any> {
  const { inputs } = context;

  // Extract credentials
  const credentials: SQLiteCredentials = {
    filename: inputs.filename,
    readonly: inputs.readonly === true,
  };

  // Extract operation
  const operation: SQLiteOperation = {
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

  // Resolve file path
  const filePath = path.isAbsolute(credentials.filename)
    ? credentials.filename
    : path.resolve(process.cwd(), credentials.filename);

  let db: Database.Database | null = null;

  try {
    // Open database
    db = new Database(filePath, {
      readonly: credentials.readonly || false,
    });

    // Execute operation (better-sqlite3 is synchronous, but we wrap it in async)
    const result = await Promise.resolve(executeOperation(db, operation));

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'SQLite operation failed',
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        console.error('[SQLite] Error closing database:', closeError);
      }
    }
  }
}
