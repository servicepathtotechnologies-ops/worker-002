/**
 * Oracle Database Node Executor
 *
 * Supports operations:
 * - select:           SELECT rows from a table with filters, sorting, and limits
 * - insert:           INSERT rows into a table with manual or auto column mapping
 * - update:           UPDATE rows in a table with column mapping and row filters
 * - insert_or_update: MERGE (upsert) rows using Oracle MERGE statement
 * - delete:           DELETE / TRUNCATE / DROP a table or matching rows
 * - execute_sql:      Execute any SQL or PL/SQL statement with bind variables
 *
 * Uses the node-oracledb driver.
 *
 * IMPORTANT node-oracledb rules enforced here:
 *  1. Never append a trailing semicolon to SQL passed to connection.execute().
 *  2. Always use bind variables for data values — never string-interpolate user input.
 *  3. Bind variables cannot substitute table/column names or DDL keywords.
 *  4. Statements on a single connection must not be executed in parallel.
 */

import { NodeExecutionContext } from '../../core/types/node-definition';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OracleCredentials {
  user: string;
  password: string;
  connectionString: string;
  // SSL / wallet
  useSSL?: boolean;
  walletPassword?: string;
  walletContent?: string;
  distinguishedName?: string;
  matchDistinguishedName?: boolean;
  allowWeakDistinguishedNameMatch?: boolean;
  // Pool
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
  poolMaxSessionLifeTime?: number;
  poolConnectionIdleTimeout?: number;
  // Connection
  connectionClassName?: string;
  connectionTimeout?: number;
  transportConnectionTimeout?: number;
  keepaliveProbeInterval?: number;
}

type OracleOperation = 'select' | 'insert' | 'update' | 'insert_or_update' | 'delete' | 'execute_sql';
type DeleteCommand = 'delete' | 'truncate' | 'drop';
type MappingColumnMode = 'manual' | 'auto';
type StatementBatching = 'single_statement' | 'independently' | 'transaction';
type CombineConditions = 'AND' | 'OR';

interface RowFilter {
  column: string;
  operator: string;
  value: unknown;
}

interface ColumnMapping {
  column: string;
  value: unknown;
}

interface SortConfig {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface OracleConfig {
  operation: OracleOperation;
  schema?: string;
  table?: string;
  mappingColumnMode?: MappingColumnMode;
  columnMappings?: ColumnMapping[];
  selectRows?: RowFilter[];
  combineConditions?: CombineConditions;
  sort?: SortConfig[];
  returnAll?: boolean;
  limit?: number;
  deleteCommand?: DeleteCommand;
  statement?: string;
  bindParams?: Record<string, unknown> | unknown[];
  statementBatching?: StatementBatching;
  autoCommit?: boolean;
  outputColumns?: string[];
  outputNumbersAsString?: boolean;
  fetchArraySize?: number;
  prefetchRows?: number;
}

interface OracleResult {
  success: boolean;
  operation: string;
  schema: string | null;
  table: string | null;
  rows: unknown[];
  rowsAffected: number;
  meta: Record<string, unknown>;
  warning: string | null;
  error: { code?: string; message: string } | null;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateCredentials(creds: OracleCredentials): string | null {
  if (!creds.user?.trim()) return 'Oracle credential "user" is required';
  if (!creds.password) return 'Oracle credential "password" is required';
  if (!creds.connectionString?.trim()) return 'Oracle credential "connectionString" is required';
  return null;
}

function validateConfig(cfg: OracleConfig): string | null {
  const validOps: OracleOperation[] = ['select', 'insert', 'update', 'insert_or_update', 'delete', 'execute_sql'];
  if (!validOps.includes(cfg.operation)) {
    return `Invalid Oracle operation "${cfg.operation}". Must be one of: ${validOps.join(', ')}`;
  }

  if (cfg.operation !== 'execute_sql') {
    if (!cfg.schema?.trim()) return `"schema" is required for operation "${cfg.operation}"`;
    if (!cfg.table?.trim()) return `"table" is required for operation "${cfg.operation}"`;
  }

  if (cfg.operation === 'execute_sql') {
    if (!cfg.statement?.trim()) return '"statement" is required for execute_sql operation';
    if (cfg.statement.trimEnd().endsWith(';')) {
      return 'SQL statement must not end with a semicolon (node-oracledb requirement)';
    }
  }

  if (cfg.operation === 'delete') {
    const validCmds: DeleteCommand[] = ['delete', 'truncate', 'drop'];
    const cmd = cfg.deleteCommand ?? 'delete';
    if (!validCmds.includes(cmd)) {
      return `"deleteCommand" must be one of: ${validCmds.join(', ')}`;
    }
  }

  if (cfg.limit !== undefined && cfg.limit !== null) {
    if (!Number.isInteger(cfg.limit) || cfg.limit < 1) {
      return '"limit" must be a positive integer';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

/** Quote an Oracle identifier (schema/table/column name). */
function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Build a qualified table reference, e.g. "HR"."EMPLOYEES" */
function tableRef(schema: string, table: string): string {
  return `${quoteId(schema)}.${quoteId(table)}`;
}

/**
 * Build a WHERE clause from RowFilter array.
 * Returns { sql, binds } where binds is a positional array.
 * Bind placeholders are :b0, :b1, … (named binds for clarity).
 */
function buildWhereClause(
  filters: RowFilter[],
  combine: CombineConditions,
  bindOffset = 0
): { sql: string; binds: Record<string, unknown> } {
  if (!filters || filters.length === 0) return { sql: '', binds: {} };

  const parts: string[] = [];
  const binds: Record<string, unknown> = {};

  filters.forEach((f, i) => {
    const bindKey = `w${bindOffset + i}`;
    parts.push(`${quoteId(f.column)} ${f.operator} :${bindKey}`);
    binds[bindKey] = f.value;
  });

  return {
    sql: `WHERE ${parts.join(` ${combine} `)}`,
    binds,
  };
}

/** Build ORDER BY clause from sort config. */
function buildOrderBy(sort: SortConfig[]): string {
  if (!sort || sort.length === 0) return '';
  const parts = sort.map(s => `${quoteId(s.column)} ${s.direction === 'DESC' ? 'DESC' : 'ASC'}`);
  return `ORDER BY ${parts.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Operation executors
// ---------------------------------------------------------------------------

async function execSelect(
  connection: any,
  cfg: OracleConfig
): Promise<{ rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> }> {
  const { sql: whereSql, binds: whereBinds } = buildWhereClause(
    cfg.selectRows ?? [],
    cfg.combineConditions ?? 'AND'
  );
  const orderSql = buildOrderBy(cfg.sort ?? []);

  let limitSql = '';
  if (!cfg.returnAll) {
    const lim = cfg.limit ?? 50;
    limitSql = `FETCH FIRST ${lim} ROWS ONLY`;
  }

  const sql = [
    `SELECT * FROM ${tableRef(cfg.schema!, cfg.table!)}`,
    whereSql,
    orderSql,
    limitSql,
  ]
    .filter(Boolean)
    .join(' ');

  const options: Record<string, unknown> = {
    outFormat: 4002, // oracledb.OUT_FORMAT_OBJECT
    autoCommit: false,
  };
  if (cfg.fetchArraySize) options.fetchArraySize = cfg.fetchArraySize;
  if (cfg.prefetchRows) options.prefetchRows = cfg.prefetchRows;
  if (cfg.outputNumbersAsString) options.fetchTypeHandler = () => ({ type: 2001 }); // STRING

  const result = await connection.execute(sql, whereBinds, options);
  const rows: unknown[] = result.rows ?? [];

  return {
    rows,
    rowsAffected: rows.length,
    meta: {
      returnedAll: cfg.returnAll ?? false,
      limit: cfg.returnAll ? null : (cfg.limit ?? 50),
    },
  };
}

async function execInsert(
  connection: any,
  cfg: OracleConfig,
  inputData: Record<string, unknown>
): Promise<{ rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> }> {
  // Resolve column mappings
  let mappings: ColumnMapping[] = [];
  if (cfg.mappingColumnMode === 'auto') {
    mappings = Object.entries(inputData).map(([col, val]) => ({ column: col, value: val }));
  } else {
    mappings = cfg.columnMappings ?? [];
  }

  if (mappings.length === 0) {
    throw new Error('No column mappings provided for insert operation');
  }

  const columns = mappings.map(m => quoteId(m.column)).join(', ');
  const bindKeys = mappings.map((_, i) => `:v${i}`).join(', ');
  const binds: Record<string, unknown> = {};
  mappings.forEach((m, i) => { binds[`v${i}`] = m.value; });

  let sql = `INSERT INTO ${tableRef(cfg.schema!, cfg.table!)} (${columns}) VALUES (${bindKeys})`;

  // Return requested columns via RETURNING … INTO
  let returningRows: unknown[] = [];
  if (cfg.outputColumns && cfg.outputColumns.length > 0) {
    const retCols = cfg.outputColumns.map(quoteId).join(', ');
    const retBindKeys = cfg.outputColumns.map((_, i) => `:r${i}`).join(', ');
    cfg.outputColumns.forEach((_, i) => {
      (binds as any)[`r${i}`] = { dir: 3003, type: 2001 }; // OUT, STRING — simplified
    });
    sql += ` RETURNING ${retCols} INTO ${retBindKeys}`;
  }

  const result = await connection.execute(sql, binds, {
    autoCommit: cfg.autoCommit ?? true,
  });

  if (cfg.outputColumns && cfg.outputColumns.length > 0) {
    const row: Record<string, unknown> = {};
    cfg.outputColumns.forEach((col, i) => {
      row[col] = (result.outBinds as any)?.[`r${i}`]?.[0];
    });
    returningRows = [row];
  }

  return {
    rows: returningRows,
    rowsAffected: result.rowsAffected ?? 1,
    meta: { statementBatching: cfg.statementBatching ?? 'single_statement' },
  };
}

async function execUpdate(
  connection: any,
  cfg: OracleConfig,
  inputData: Record<string, unknown>
): Promise<{ rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> }> {
  let mappings: ColumnMapping[] = [];
  if (cfg.mappingColumnMode === 'auto') {
    mappings = Object.entries(inputData).map(([col, val]) => ({ column: col, value: val }));
  } else {
    mappings = cfg.columnMappings ?? [];
  }

  if (mappings.length === 0) {
    throw new Error('No column mappings provided for update operation');
  }

  const setBinds: Record<string, unknown> = {};
  const setClauses = mappings.map((m, i) => {
    setBinds[`s${i}`] = m.value;
    return `${quoteId(m.column)} = :s${i}`;
  });

  const { sql: whereSql, binds: whereBinds } = buildWhereClause(
    cfg.selectRows ?? [],
    cfg.combineConditions ?? 'AND',
    mappings.length
  );

  if (!whereSql) {
    throw new Error(
      'UPDATE without a WHERE clause would affect all rows. Provide selectRows to filter.'
    );
  }

  const sql = `UPDATE ${tableRef(cfg.schema!, cfg.table!)} SET ${setClauses.join(', ')} ${whereSql}`;
  const binds = { ...setBinds, ...whereBinds };

  const result = await connection.execute(sql, binds, {
    autoCommit: cfg.autoCommit ?? true,
  });

  return {
    rows: [],
    rowsAffected: result.rowsAffected ?? 0,
    meta: { statementBatching: cfg.statementBatching ?? 'single_statement' },
  };
}

async function execUpsert(
  connection: any,
  cfg: OracleConfig,
  inputData: Record<string, unknown>
): Promise<{ rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> }> {
  let mappings: ColumnMapping[] = [];
  if (cfg.mappingColumnMode === 'auto') {
    mappings = Object.entries(inputData).map(([col, val]) => ({ column: col, value: val }));
  } else {
    mappings = cfg.columnMappings ?? [];
  }

  if (mappings.length === 0) {
    throw new Error('No column mappings provided for insert_or_update operation');
  }

  // Key columns come from selectRows (match conditions)
  const keyFilters = cfg.selectRows ?? [];
  if (keyFilters.length === 0) {
    throw new Error(
      'insert_or_update requires at least one selectRows entry to identify the match key'
    );
  }

  // Build MERGE statement
  // USING (SELECT :v0 AS col0, :v1 AS col1, … FROM DUAL) src
  const srcCols = mappings.map((m, i) => `:v${i} AS ${quoteId(`src_${m.column}`)}`).join(', ');
  const onClauses = keyFilters
    .map(f => `tgt.${quoteId(f.column)} = src.${quoteId(`src_${f.column}`)}`)
    .join(' AND ');
  const updateClauses = mappings
    .filter(m => !keyFilters.find(f => f.column === m.column))
    .map(m => `tgt.${quoteId(m.column)} = src.${quoteId(`src_${m.column}`)}`)
    .join(', ');
  const insertCols = mappings.map(m => quoteId(m.column)).join(', ');
  const insertVals = mappings.map(m => `src.${quoteId(`src_${m.column}`)}`).join(', ');

  const sql = [
    `MERGE INTO ${tableRef(cfg.schema!, cfg.table!)} tgt`,
    `USING (SELECT ${srcCols} FROM DUAL) src`,
    `ON (${onClauses})`,
    updateClauses ? `WHEN MATCHED THEN UPDATE SET ${updateClauses}` : '',
    `WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals})`,
  ]
    .filter(Boolean)
    .join(' ');

  const binds: Record<string, unknown> = {};
  mappings.forEach((m, i) => { binds[`v${i}`] = m.value; });

  const result = await connection.execute(sql, binds, {
    autoCommit: cfg.autoCommit ?? true,
  });

  return {
    rows: [],
    rowsAffected: result.rowsAffected ?? 0,
    meta: { statementBatching: cfg.statementBatching ?? 'single_statement' },
  };
}

async function execDelete(
  connection: any,
  cfg: OracleConfig
): Promise<{ rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> }> {
  const cmd: DeleteCommand = cfg.deleteCommand ?? 'delete';
  const tbl = tableRef(cfg.schema!, cfg.table!);
  let sql: string;
  let binds: Record<string, unknown> = {};
  let rowsAffected = 0;

  if (cmd === 'truncate') {
    sql = `TRUNCATE TABLE ${tbl}`;
  } else if (cmd === 'drop') {
    sql = `DROP TABLE ${tbl}`;
  } else {
    // delete with optional WHERE
    const { sql: whereSql, binds: whereBinds } = buildWhereClause(
      cfg.selectRows ?? [],
      cfg.combineConditions ?? 'AND'
    );
    sql = `DELETE FROM ${tbl} ${whereSql}`.trim();
    binds = whereBinds;
  }

  const result = await connection.execute(sql, binds, {
    autoCommit: cfg.autoCommit ?? true,
  });
  rowsAffected = result.rowsAffected ?? 0;

  return {
    rows: [],
    rowsAffected,
    meta: { deleteCommand: cmd },
  };
}

async function execSql(
  connection: any,
  cfg: OracleConfig
): Promise<{ rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> }> {
  const statement = cfg.statement!;
  const binds = cfg.bindParams ?? {};

  const options: Record<string, unknown> = {
    outFormat: 4002, // OUT_FORMAT_OBJECT
    autoCommit: cfg.autoCommit ?? true,
  };
  if (cfg.fetchArraySize) options.fetchArraySize = cfg.fetchArraySize;
  if (cfg.prefetchRows) options.prefetchRows = cfg.prefetchRows;

  const result = await connection.execute(statement, binds, options);
  const rows: unknown[] = result.rows ?? [];

  // Detect statement type from first keyword
  const firstWord = statement.trimStart().split(/\s+/)[0].toUpperCase();

  return {
    rows,
    rowsAffected: result.rowsAffected ?? 0,
    meta: { statementType: firstWord },
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runOracleNode(context: NodeExecutionContext): Promise<OracleResult> {
  const { inputs } = context;

  // ── Credentials ──────────────────────────────────────────────────────────
  const credentials: OracleCredentials = {
    user: inputs.user ?? inputs.username ?? '',
    password: inputs.password ?? '',
    connectionString: inputs.connectionString ?? '',
    useSSL: inputs.useSSL,
    walletPassword: inputs.walletPassword,
    walletContent: inputs.walletContent,
    distinguishedName: inputs.distinguishedName,
    matchDistinguishedName: inputs.matchDistinguishedName,
    allowWeakDistinguishedNameMatch: inputs.allowWeakDistinguishedNameMatch,
    poolMin: inputs.poolMin,
    poolMax: inputs.poolMax,
    poolIncrement: inputs.poolIncrement,
    poolMaxSessionLifeTime: inputs.poolMaxSessionLifeTime,
    poolConnectionIdleTimeout: inputs.poolConnectionIdleTimeout,
    connectionClassName: inputs.connectionClassName,
    connectionTimeout: inputs.connectionTimeout,
    transportConnectionTimeout: inputs.transportConnectionTimeout,
    keepaliveProbeInterval: inputs.keepaliveProbeInterval,
  };

  const credError = validateCredentials(credentials);
  if (credError) {
    return errorResult(inputs.operation ?? 'unknown', inputs.schema, inputs.table, credError);
  }

  // ── Config ────────────────────────────────────────────────────────────────
  const cfg: OracleConfig = {
    operation: (inputs.operation ?? 'select') as OracleOperation,
    schema: inputs.schema,
    table: inputs.table,
    mappingColumnMode: (inputs.mappingColumnMode ?? 'manual') as MappingColumnMode,
    columnMappings: inputs.columnMappings ?? [],
    selectRows: inputs.selectRows ?? [],
    combineConditions: (inputs.combineConditions ?? 'AND') as CombineConditions,
    sort: inputs.sort ?? [],
    returnAll: inputs.returnAll ?? false,
    limit: inputs.limit ?? 50,
    deleteCommand: (inputs.deleteCommand ?? 'delete') as DeleteCommand,
    statement: inputs.statement,
    bindParams: inputs.bindParams ?? {},
    statementBatching: (inputs.statementBatching ?? 'single_statement') as StatementBatching,
    autoCommit: inputs.autoCommit ?? true,
    outputColumns: inputs.outputColumns ?? [],
    outputNumbersAsString: inputs.outputNumbersAsString ?? false,
    fetchArraySize: inputs.fetchArraySize ?? 100,
    prefetchRows: inputs.prefetchRows ?? 100,
  };

  const cfgError = validateConfig(cfg);
  if (cfgError) {
    return errorResult(cfg.operation, cfg.schema ?? null, cfg.table ?? null, cfgError);
  }

  // ── Connect ───────────────────────────────────────────────────────────────
  let oracledb: any;
  try {
    oracledb = require('oracledb');
  } catch {
    return errorResult(
      cfg.operation,
      cfg.schema ?? null,
      cfg.table ?? null,
      'oracledb driver is not installed. Run: npm install oracledb'
    );
  }

  // Build pool config
  const poolAttrs: Record<string, unknown> = {
    user: credentials.user,
    password: credentials.password,
    connectString: credentials.connectionString,
    poolMin: credentials.poolMin ?? 1,
    poolMax: credentials.poolMax ?? 5,
    poolIncrement: credentials.poolIncrement ?? 1,
  };

  if (credentials.poolMaxSessionLifeTime !== undefined) {
    poolAttrs.poolMaxSessionLifeTime = credentials.poolMaxSessionLifeTime;
  }
  if (credentials.poolConnectionIdleTimeout !== undefined) {
    poolAttrs.poolConnectionIdleTimeout = credentials.poolConnectionIdleTimeout;
  }
  if (credentials.connectionClassName) {
    poolAttrs.connectionClass = credentials.connectionClassName;
  }

  // SSL / wallet
  if (credentials.useSSL || credentials.walletContent) {
    const walletOpts: Record<string, unknown> = {};
    if (credentials.walletPassword) walletOpts.walletPassword = credentials.walletPassword;
    if (credentials.walletContent) walletOpts.walletContent = credentials.walletContent;
    if (credentials.distinguishedName) walletOpts.httpsProxy = credentials.distinguishedName;
    poolAttrs.walletLocation = walletOpts;
  }

  let pool: any;
  let connection: any;

  try {
    pool = await oracledb.createPool(poolAttrs);
    connection = await pool.getConnection();

    // ── Dispatch ──────────────────────────────────────────────────────────
    // Extract plain input object for auto-mapping
    const inputData: Record<string, unknown> = { ...inputs };

    let opResult: { rows: unknown[]; rowsAffected: number; meta: Record<string, unknown> };

    switch (cfg.operation) {
      case 'select':
        opResult = await execSelect(connection, cfg);
        break;
      case 'insert':
        opResult = await execInsert(connection, cfg, inputData);
        break;
      case 'update':
        opResult = await execUpdate(connection, cfg, inputData);
        break;
      case 'insert_or_update':
        opResult = await execUpsert(connection, cfg, inputData);
        break;
      case 'delete':
        opResult = await execDelete(connection, cfg);
        break;
      case 'execute_sql':
        opResult = await execSql(connection, cfg);
        break;
      default:
        throw new Error(`Unsupported operation: ${cfg.operation}`);
    }

    return {
      success: true,
      operation: cfg.operation,
      schema: cfg.schema ?? null,
      table: cfg.table ?? null,
      rows: opResult.rows,
      rowsAffected: opResult.rowsAffected,
      meta: opResult.meta,
      warning: null,
      error: null,
    };
  } catch (err: any) {
    const code: string | undefined = err.errorNum ? `ORA-${String(err.errorNum).padStart(5, '0')}` : undefined;
    return {
      success: false,
      operation: cfg.operation,
      schema: cfg.schema ?? null,
      table: cfg.table ?? null,
      rows: [],
      rowsAffected: 0,
      meta: {},
      warning: null,
      error: { code, message: err.message ?? 'Oracle operation failed' },
    };
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
    if (pool) {
      try { await pool.close(0); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(
  operation: string,
  schema: string | null | undefined,
  table: string | null | undefined,
  message: string
): OracleResult {
  return {
    success: false,
    operation,
    schema: schema ?? null,
    table: table ?? null,
    rows: [],
    rowsAffected: 0,
    meta: {},
    warning: null,
    error: { message },
  };
}
