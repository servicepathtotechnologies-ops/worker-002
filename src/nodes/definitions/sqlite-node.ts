/**
 * SQLite Node Definition
 * 
 * Supports operations:
 * - executeQuery: Execute raw SQL queries with parameters
 * - insert: Insert records into a table
 * - update: Update records in a table
 * - delete: Delete records from a table
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runSQLiteNode } from '../../services/database/sqliteNode';

export const sqliteNodeDefinition: NodeDefinition = {
  type: 'sqlite',
  label: 'SQLite',
  category: 'database',
  description: 'Connect to and query SQLite databases',
  icon: 'Database',
  version: 1,

  inputSchema: {
    filename: {
      type: 'string',
      description: 'Path to SQLite database file (absolute or relative to working directory)',
      required: true,
      default: '',
    },
    readonly: {
      type: 'boolean',
      description: 'Open database in read-only mode (default: false)',
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
      description: 'SQLite operation result',
    },
  },

  requiredInputs: ['filename', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.filename || typeof inputs.filename !== 'string' || inputs.filename.trim() === '') {
      errors.push('filename is required');
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
    filename: '',
    readonly: false,
    operation: 'executeQuery',
    query: '',
    table: '',
    data: null,
    where: null,
    params: null,
  }),

  run: runSQLiteNode,
};
