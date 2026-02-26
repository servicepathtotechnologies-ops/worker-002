/**
 * TimescaleDB Node Definition
 * 
 * TimescaleDB is a PostgreSQL extension, so it uses the same connection
 * and most operations as PostgreSQL, plus time-series specific operations.
 * 
 * Supports operations:
 * - executeQuery: Execute raw SQL queries with parameters
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 * - timeBucket: Time-bucket aggregation (TimescaleDB specific)
 * - first: Get first value in a time bucket (TimescaleDB specific)
 * - last: Get last value in a time bucket (TimescaleDB specific)
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runTimescaleDBNode } from '../../services/database/timescaleDBNode';

export const timescaleDBNodeDefinition: NodeDefinition = {
  type: 'timescaledb',
  label: 'TimescaleDB',
  category: 'database',
  description: 'Connect to and query TimescaleDB time-series databases',
  icon: 'Database',
  version: 1,

  inputSchema: {
    host: {
      type: 'string',
      description: 'TimescaleDB hostname or IP address',
      required: true,
      default: '',
    },
    port: {
      type: 'number',
      description: 'TimescaleDB port (default: 5432)',
      required: false,
      default: 5432,
    },
    username: {
      type: 'string',
      description: 'TimescaleDB username',
      required: true,
      default: '',
    },
    password: {
      type: 'string',
      description: 'TimescaleDB password',
      required: true,
      default: '',
    },
    database: {
      type: 'string',
      description: 'Database name',
      required: true,
      default: '',
    },
    ssl: {
      type: 'boolean',
      description: 'Enable SSL',
      required: false,
      default: false,
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'executeQuery',
      examples: ['executeQuery', 'insert', 'update', 'delete', 'timeBucket', 'first', 'last'],
    },
    query: {
      type: 'string',
      description: 'SQL query (for executeQuery operation)',
      required: false,
      default: '',
    },
    table: {
      type: 'string',
      description: 'Table name',
      required: false,
      default: '',
    },
    data: {
      type: 'json',
      description: 'Data object or array (for insert/update operations)',
      required: false,
      default: null,
    },
    where: {
      type: 'json',
      description: 'WHERE clause conditions as object (for update/delete operations)',
      required: false,
      default: null,
    },
    params: {
      type: 'json',
      description: 'Query parameters array',
      required: false,
      default: null,
    },
    timeColumn: {
      type: 'string',
      description: 'Time column name (for timeBucket/first/last operations)',
      required: false,
      default: '',
    },
    interval: {
      type: 'string',
      description: 'Time interval (e.g., "1 hour", "1 day") (for timeBucket/first/last operations)',
      required: false,
      default: '',
    },
    bucketColumn: {
      type: 'string',
      description: 'Column to group by in buckets (for timeBucket operation)',
      required: false,
      default: '',
    },
    valueColumn: {
      type: 'string',
      description: 'Value column name (for first/last operations)',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'TimescaleDB operation result',
    },
  },

  requiredInputs: ['host', 'username', 'password', 'database', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.host || typeof inputs.host !== 'string' || inputs.host.trim() === '') {
      errors.push('host is required');
    }
    if (!inputs.username || typeof inputs.username !== 'string' || inputs.username.trim() === '') {
      errors.push('username is required');
    }
    if (!inputs.password || typeof inputs.password !== 'string') {
      errors.push('password is required');
    }
    if (!inputs.database || typeof inputs.database !== 'string' || inputs.database.trim() === '') {
      errors.push('database is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }

    const validOperations = ['executeQuery', 'insert', 'update', 'delete', 'timeBucket', 'first', 'last'];
    if (inputs.operation && !validOperations.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOperations.join(', ')}`);
    }

    if (inputs.operation === 'executeQuery' && (!inputs.query || typeof inputs.query !== 'string' || inputs.query.trim() === '')) {
      errors.push('query is required for executeQuery operation');
    }

    if (['insert', 'update', 'delete', 'timeBucket', 'first', 'last'].includes(inputs.operation) && (!inputs.table || typeof inputs.table !== 'string' || inputs.table.trim() === '')) {
      errors.push('table is required for this operation');
    }

    if (['insert', 'update'].includes(inputs.operation) && !inputs.data) {
      errors.push('data is required for this operation');
    }

    if (['update', 'delete'].includes(inputs.operation) && !inputs.where) {
      errors.push('where is required for this operation');
    }

    if (['timeBucket', 'first', 'last'].includes(inputs.operation)) {
      if (!inputs.timeColumn || typeof inputs.timeColumn !== 'string' || inputs.timeColumn.trim() === '') {
        errors.push('timeColumn is required for this operation');
      }
      if (!inputs.interval || typeof inputs.interval !== 'string' || inputs.interval.trim() === '') {
        errors.push('interval is required for this operation');
      }
    }

    if (['first', 'last'].includes(inputs.operation) && (!inputs.valueColumn || typeof inputs.valueColumn !== 'string' || inputs.valueColumn.trim() === '')) {
      errors.push('valueColumn is required for this operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    host: '',
    port: 5432,
    username: '',
    password: '',
    database: '',
    ssl: false,
    operation: 'executeQuery',
    query: '',
    table: '',
    data: null,
    where: null,
    params: null,
    timeColumn: '',
    interval: '',
    bucketColumn: '',
    valueColumn: '',
  }),

  run: runTimescaleDBNode,
};
