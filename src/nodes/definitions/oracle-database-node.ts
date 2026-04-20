/**
 * Oracle Database Node Definition
 *
 * Supports operations:
 * - select:           SELECT rows with filters, sorting, and limits
 * - insert:           INSERT rows with manual or auto column mapping
 * - update:           UPDATE rows with column mapping and row filters
 * - insert_or_update: MERGE (upsert) via Oracle MERGE statement
 * - delete:           DELETE / TRUNCATE / DROP
 * - execute_sql:      Execute any SQL or PL/SQL with bind variables
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runOracleNode } from '../../services/database/oracleNode';

export const oracleDatabaseNodeDefinition: NodeDefinition = {
  type: 'oracle_database',
  label: 'Oracle Database',
  category: 'database',
  description:
    'Execute SQL and perform select, insert, update, upsert, and delete operations on Oracle Database tables.',
  icon: 'Database',
  version: 1,

  inputSchema: {
    // ── Credentials ──────────────────────────────────────────────────────────
    user: {
      type: 'string',
      description: 'Oracle database username',
      required: true,
      default: '',
    },
    password: {
      type: 'string',
      description: 'Oracle database password',
      required: true,
      default: '',
    },
    connectionString: {
      type: 'string',
      description:
        'Oracle connection string (e.g. localhost:1521/ORCL or a TNS alias)',
      required: true,
      default: '',
    },
    // ── Operation ────────────────────────────────────────────────────────────
    operation: {
      type: 'string',
      description: 'The Oracle Database action to perform.',
      required: true,
      default: 'select',
      examples: ['select', 'insert', 'update', 'insert_or_update', 'delete', 'execute_sql'],
      ui: {
        options: [
          { label: 'Select', value: 'select' },
          { label: 'Insert', value: 'insert' },
          { label: 'Update', value: 'update' },
          { label: 'Insert or Update (Upsert)', value: 'insert_or_update' },
          { label: 'Delete', value: 'delete' },
          { label: 'Execute SQL', value: 'execute_sql' },
        ],
      },
    },
    // ── Schema / Table ───────────────────────────────────────────────────────
    schema: {
      type: 'string',
      description: 'The Oracle schema that contains the table to work with.',
      required: false,
      default: '',
      examples: ['HR', 'APP_SCHEMA', '{{$json.schema}}'],
    },
    table: {
      type: 'string',
      description: 'The Oracle table to read from or write to.',
      required: false,
      default: '',
      examples: ['EMPLOYEES', 'ORDERS', '{{$json.table}}'],
    },
    // ── Column mapping ───────────────────────────────────────────────────────
    mappingColumnMode: {
      type: 'string',
      description:
        'How incoming fields are mapped to Oracle columns for insert, update, and upsert operations.',
      required: false,
      default: 'manual',
      ui: {
        options: [
          { label: 'Manual', value: 'manual' },
          { label: 'Auto', value: 'auto' },
        ],
      },
    },
    columnMappings: {
      type: 'array',
      description:
        'Manual column-to-value mappings (array of { column, value }) used when mappingColumnMode is manual.',
      required: false,
      default: [],
    },
    // ── Row filters ──────────────────────────────────────────────────────────
    selectRows: {
      type: 'array',
      description:
        'Filter conditions for selecting, updating, or deleting rows. Each item: { column, operator, value }.',
      required: false,
      default: [],
    },
    combineConditions: {
      type: 'string',
      description: 'How to combine multiple row-selection conditions.',
      required: false,
      default: 'AND',
      ui: {
        options: [
          { label: 'AND', value: 'AND' },
          { label: 'OR', value: 'OR' },
        ],
      },
    },
    // ── Sort / Limit ─────────────────────────────────────────────────────────
    sort: {
      type: 'array',
      description: 'Sort configuration for select operations. Each item: { column, direction }.',
      required: false,
      default: [],
    },
    returnAll: {
      type: 'boolean',
      description: 'Whether to return all rows for select operations.',
      required: false,
      default: false,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of rows to return when returnAll is false.',
      required: false,
      default: 50,
    },
    // ── Delete ───────────────────────────────────────────────────────────────
    deleteCommand: {
      type: 'string',
      description: 'Delete behavior for the delete operation.',
      required: false,
      default: 'delete',
      ui: {
        options: [
          { label: 'Delete Rows', value: 'delete' },
          { label: 'Truncate Table', value: 'truncate' },
          { label: 'Drop Table', value: 'drop' },
        ],
      },
    },
    // ── Execute SQL ──────────────────────────────────────────────────────────
    statement: {
      type: 'string',
      description:
        'The SQL or PL/SQL statement to execute (execute_sql operation). Do NOT end with a semicolon.',
      required: false,
      default: '',
      examples: [
        'SELECT * FROM EMPLOYEES WHERE EMPLOYEE_ID = :id',
        'BEGIN demo(:1, :2); END',
        '{{$json.sql}}',
      ],
    },
    bindParams: {
      type: 'object',
      description: 'Named or positional bind values for SQL execution.',
      required: false,
      default: {},
    },
    // ── Batching / Commit ────────────────────────────────────────────────────
    statementBatching: {
      type: 'string',
      description: 'How incoming items should be executed against the database.',
      required: false,
      default: 'single_statement',
      ui: {
        options: [
          { label: 'Single Statement', value: 'single_statement' },
          { label: 'Independently', value: 'independently' },
          { label: 'Transaction', value: 'transaction' },
        ],
      },
    },
    autoCommit: {
      type: 'boolean',
      description: 'Whether to automatically commit after statement execution.',
      required: false,
      default: true,
    },
    // ── Output options ───────────────────────────────────────────────────────
    outputColumns: {
      type: 'array',
      description:
        'Which columns to include in the output for insert, update, and upsert operations.',
      required: false,
      default: [],
    },
    outputNumbersAsString: {
      type: 'boolean',
      description: 'Whether numeric values should be returned as strings in select operations.',
      required: false,
      default: false,
    },
    // ── Performance tuning ───────────────────────────────────────────────────
    fetchArraySize: {
      type: 'number',
      description: 'Internal Oracle fetch buffer size for query performance tuning.',
      required: false,
      default: 100,
    },
    prefetchRows: {
      type: 'number',
      description: 'Number of rows the driver should prefetch for query tuning.',
      required: false,
      default: 100,
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Oracle Database operation result',
    },
  },

  requiredInputs: ['user', 'password', 'connectionString', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.user?.trim()) errors.push('user is required');
    if (!inputs.password) errors.push('password is required');
    if (!inputs.connectionString?.trim()) errors.push('connectionString is required');
    if (!inputs.operation) errors.push('operation is required');

    const validOps = ['select', 'insert', 'update', 'insert_or_update', 'delete', 'execute_sql'];
    if (inputs.operation && !validOps.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOps.join(', ')}`);
    }

    if (inputs.operation !== 'execute_sql') {
      if (!inputs.schema?.trim()) errors.push('schema is required for this operation');
      if (!inputs.table?.trim()) errors.push('table is required for this operation');
    }

    if (inputs.operation === 'execute_sql') {
      if (!inputs.statement?.trim()) errors.push('statement is required for execute_sql');
      if (inputs.statement && String(inputs.statement).trimEnd().endsWith(';')) {
        errors.push('SQL statement must not end with a semicolon (node-oracledb requirement)');
      }
    }

    if (inputs.limit !== undefined && inputs.limit !== null) {
      if (!Number.isInteger(inputs.limit) || inputs.limit < 1) {
        errors.push('limit must be a positive integer');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    user: '',
    password: '',
    connectionString: '',
    operation: 'select',
    schema: '',
    table: '',
    mappingColumnMode: 'manual',
    columnMappings: [],
    selectRows: [],
    combineConditions: 'AND',
    sort: [],
    returnAll: false,
    limit: 50,
    deleteCommand: 'delete',
    statement: '',
    bindParams: {},
    statementBatching: 'single_statement',
    autoCommit: true,
    outputColumns: [],
    outputNumbersAsString: false,
    fetchArraySize: 100,
    prefetchRows: 100,
  }),

  run: runOracleNode,
};
