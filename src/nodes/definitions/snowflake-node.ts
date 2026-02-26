/**
 * Snowflake Node Definition
 * 
 * Supports operations:
 * - executeQuery: Execute SQL queries
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 * - copyInto: Bulk load data
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runSnowflakeNode } from '../../services/database/snowflakeNode';

export const snowflakeNodeDefinition: NodeDefinition = {
  type: 'snowflake',
  label: 'Snowflake',
  category: 'database',
  description: 'Connect to and query Snowflake data warehouses',
  icon: 'Database',
  version: 1,

  inputSchema: {
    account: {
      type: 'string',
      description: 'Snowflake account identifier',
      required: true,
      default: '',
    },
    username: {
      type: 'string',
      description: 'Snowflake username',
      required: true,
      default: '',
    },
    password: {
      type: 'string',
      description: 'Snowflake password',
      required: true,
      default: '',
    },
    database: {
      type: 'string',
      description: 'Database name',
      required: true,
      default: '',
    },
    schema: {
      type: 'string',
      description: 'Schema name',
      required: true,
      default: '',
    },
    warehouse: {
      type: 'string',
      description: 'Warehouse name',
      required: true,
      default: '',
    },
    role: {
      type: 'string',
      description: 'Role name (optional)',
      required: false,
      default: '',
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'executeQuery',
      examples: ['executeQuery', 'insert', 'update', 'delete', 'copyInto'],
    },
    query: {
      type: 'string',
      description: 'SQL query (for executeQuery operation)',
      required: false,
      default: '',
    },
    table: {
      type: 'string',
      description: 'Table name (for insert/update/delete/copyInto operations)',
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
    stage: {
      type: 'string',
      description: 'Stage name (for copyInto operation)',
      required: false,
      default: '',
    },
    file: {
      type: 'string',
      description: 'File name (for copyInto operation)',
      required: false,
      default: '',
    },
    format: {
      type: 'string',
      description: 'File format (for copyInto operation, default: CSV)',
      required: false,
      default: 'CSV',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Snowflake operation result',
    },
  },

  requiredInputs: ['account', 'username', 'password', 'database', 'schema', 'warehouse', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.account || typeof inputs.account !== 'string' || inputs.account.trim() === '') {
      errors.push('account is required');
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
    if (!inputs.schema || typeof inputs.schema !== 'string' || inputs.schema.trim() === '') {
      errors.push('schema is required');
    }
    if (!inputs.warehouse || typeof inputs.warehouse !== 'string' || inputs.warehouse.trim() === '') {
      errors.push('warehouse is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }

    const validOperations = ['executeQuery', 'insert', 'update', 'delete', 'copyInto'];
    if (inputs.operation && !validOperations.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOperations.join(', ')}`);
    }

    if (inputs.operation === 'executeQuery' && (!inputs.query || typeof inputs.query !== 'string' || inputs.query.trim() === '')) {
      errors.push('query is required for executeQuery operation');
    }

    if (['insert', 'update', 'delete', 'copyInto'].includes(inputs.operation) && (!inputs.table || typeof inputs.table !== 'string' || inputs.table.trim() === '')) {
      errors.push('table is required for this operation');
    }

    if (['insert', 'update'].includes(inputs.operation) && !inputs.data) {
      errors.push('data is required for this operation');
    }

    if (['update', 'delete'].includes(inputs.operation) && !inputs.where) {
      errors.push('where is required for this operation');
    }

    if (inputs.operation === 'copyInto') {
      if (!inputs.stage || typeof inputs.stage !== 'string' || inputs.stage.trim() === '') {
        errors.push('stage is required for copyInto operation');
      }
      if (!inputs.file || typeof inputs.file !== 'string' || inputs.file.trim() === '') {
        errors.push('file is required for copyInto operation');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    account: '',
    username: '',
    password: '',
    database: '',
    schema: '',
    warehouse: '',
    role: '',
    operation: 'executeQuery',
    query: '',
    table: '',
    data: null,
    where: null,
    stage: '',
    file: '',
    format: 'CSV',
  }),

  run: runSnowflakeNode,
};
