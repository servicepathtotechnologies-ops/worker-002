/**
 * MySQL Node Definition
 * 
 * Supports operations:
 * - executeQuery: Execute raw SQL queries with parameters
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runMySQLNode } from '../../services/database/mysqlNode';

export const mysqlNodeDefinition: NodeDefinition = {
  type: 'mysql',
  label: 'MySQL',
  category: 'database',
  description: 'Connect to and query MySQL databases',
  icon: 'Database',
  version: 1,

  inputSchema: {
    host: {
      type: 'string',
      description: 'MySQL hostname or IP address',
      required: true,
      default: '',
    },
    port: {
      type: 'number',
      description: 'MySQL port (default: 3306)',
      required: false,
      default: 3306,
    },
    username: {
      type: 'string',
      description: 'MySQL username',
      required: true,
      default: '',
    },
    password: {
      type: 'string',
      description: 'MySQL password',
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
      examples: ['executeQuery', 'insert', 'update', 'delete'],
    },
    query: {
      type: 'string',
      description: 'SQL query (for executeQuery operation)',
      required: false,
      default: '',
    },
    table: {
      type: 'string',
      description: 'Table name (for insert/update/delete operations)',
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
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'MySQL operation result',
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

    const validOperations = ['executeQuery', 'insert', 'update', 'delete'];
    if (inputs.operation && !validOperations.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOperations.join(', ')}`);
    }

    if (inputs.operation === 'executeQuery' && (!inputs.query || typeof inputs.query !== 'string' || inputs.query.trim() === '')) {
      errors.push('query is required for executeQuery operation');
    }

    if (['insert', 'update', 'delete'].includes(inputs.operation) && (!inputs.table || typeof inputs.table !== 'string' || inputs.table.trim() === '')) {
      errors.push('table is required for this operation');
    }

    if (['insert', 'update'].includes(inputs.operation) && !inputs.data) {
      errors.push('data is required for this operation');
    }

    if (['update', 'delete'].includes(inputs.operation) && !inputs.where) {
      errors.push('where is required for this operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    host: '',
    port: 3306,
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
  }),

  run: runMySQLNode,
};
