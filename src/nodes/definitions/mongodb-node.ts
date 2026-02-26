/**
 * MongoDB Node Definition
 * 
 * Supports operations:
 * - find: Query documents with filter, projection, limit, skip, sort
 * - insertOne: Insert a single document
 * - insertMany: Insert multiple documents
 * - updateOne: Update a single document
 * - updateMany: Update multiple documents
 * - deleteOne: Delete a single document
 * - deleteMany: Delete multiple documents
 * - aggregate: Run aggregation pipeline
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runMongoDBNode } from '../../services/database/mongoDBNode';

export const mongoDBNodeDefinition: NodeDefinition = {
  type: 'mongodb',
  label: 'MongoDB',
  category: 'database',
  description: 'Connect to and query MongoDB databases',
  icon: 'Database',
  version: 1,

  inputSchema: {
    connectionString: {
      type: 'string',
      description: 'MongoDB connection string (optional if using individual fields)',
      required: false,
      default: '',
    },
    host: {
      type: 'string',
      description: 'MongoDB hostname (required if connectionString not provided)',
      required: false,
      default: 'localhost',
    },
    port: {
      type: 'number',
      description: 'MongoDB port (default: 27017)',
      required: false,
      default: 27017,
    },
    username: {
      type: 'string',
      description: 'MongoDB username',
      required: false,
      default: '',
    },
    password: {
      type: 'string',
      description: 'MongoDB password',
      required: false,
      default: '',
    },
    database: {
      type: 'string',
      description: 'Database name',
      required: true,
      default: '',
    },
    authSource: {
      type: 'string',
      description: 'Authentication database (default: admin)',
      required: false,
      default: 'admin',
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
      default: 'find',
      examples: ['find', 'insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'aggregate'],
    },
    collection: {
      type: 'string',
      description: 'Collection name',
      required: true,
      default: '',
    },
    filter: {
      type: 'json',
      description: 'Filter object (for find/update/delete operations)',
      required: false,
      default: null,
    },
    projection: {
      type: 'json',
      description: 'Projection object (for find operation)',
      required: false,
      default: null,
    },
    limit: {
      type: 'number',
      description: 'Limit number of results',
      required: false,
      default: null,
    },
    skip: {
      type: 'number',
      description: 'Skip number of results',
      required: false,
      default: null,
    },
    sort: {
      type: 'json',
      description: 'Sort specification',
      required: false,
      default: null,
    },
    document: {
      type: 'json',
      description: 'Document to insert (for insertOne)',
      required: false,
      default: null,
    },
    documents: {
      type: 'json',
      description: 'Array of documents to insert (for insertMany)',
      required: false,
      default: null,
    },
    update: {
      type: 'json',
      description: 'Update specification (for update operations)',
      required: false,
      default: null,
    },
    pipeline: {
      type: 'json',
      description: 'Aggregation pipeline (for aggregate operation)',
      required: false,
      default: null,
    },
    options: {
      type: 'json',
      description: 'Additional options',
      required: false,
      default: null,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'MongoDB operation result',
    },
  },

  requiredInputs: ['database', 'operation', 'collection'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.connectionString && (!inputs.host || typeof inputs.host !== 'string' || inputs.host.trim() === '')) {
      errors.push('Either connectionString or host is required');
    }
    if (!inputs.database || typeof inputs.database !== 'string' || inputs.database.trim() === '') {
      errors.push('database is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }
    if (!inputs.collection || typeof inputs.collection !== 'string' || inputs.collection.trim() === '') {
      errors.push('collection is required');
    }

    const validOperations = ['find', 'insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'aggregate'];
    if (inputs.operation && !validOperations.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOperations.join(', ')}`);
    }

    if (inputs.operation === 'insertOne' && !inputs.document) {
      errors.push('document is required for insertOne operation');
    }
    if (inputs.operation === 'insertMany' && (!inputs.documents || !Array.isArray(inputs.documents))) {
      errors.push('documents array is required for insertMany operation');
    }
    if (['updateOne', 'updateMany'].includes(inputs.operation)) {
      if (!inputs.filter) errors.push('filter is required for update operations');
      if (!inputs.update) errors.push('update is required for update operations');
    }
    if (['deleteOne', 'deleteMany'].includes(inputs.operation) && !inputs.filter) {
      errors.push('filter is required for delete operations');
    }
    if (inputs.operation === 'aggregate' && (!inputs.pipeline || !Array.isArray(inputs.pipeline))) {
      errors.push('pipeline array is required for aggregate operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    connectionString: '',
    host: 'localhost',
    port: 27017,
    username: '',
    password: '',
    database: '',
    authSource: 'admin',
    ssl: false,
    operation: 'find',
    collection: '',
    filter: null,
    projection: null,
    limit: null,
    skip: null,
    sort: null,
    document: null,
    documents: null,
    update: null,
    pipeline: null,
    options: null,
  }),

  run: runMongoDBNode,
};
