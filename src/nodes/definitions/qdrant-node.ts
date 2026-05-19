/**
 * Qdrant Node Definition
 *
 * Qdrant vector database integration.
 * Supports upsert, query, and delete operations via the Qdrant REST API.
 *
 * Authentication: api-key header.
 * Works with Qdrant Cloud (hosted) and self-hosted instances.
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['upsert', 'query', 'delete'] as const;

export const qdrantNodeDefinition: NodeDefinition = {
  type: 'qdrant',
  label: 'Qdrant',
  category: 'database',
  description: 'Upsert, query, and delete vectors in a Qdrant vector database collection.',
  icon: 'Database',
  version: 1,

  inputSchema: {
    operation: {
      type: 'string',
      description: 'Action to perform on the Qdrant collection',
      required: true,
      default: 'query',
      examples: ['upsert', 'query', 'delete'],
      ui: {
        options: [
          { label: 'Upsert', value: 'upsert' },
          { label: 'Query',  value: 'query' },
          { label: 'Delete', value: 'delete' },
        ],
      },
    },
    url: {
      type: 'string',
      description: 'Qdrant cluster endpoint URL (e.g. https://xyz.aws.cloud.qdrant.io)',
      required: true,
      default: '',
      examples: ['https://xyz.sa-east-1-0.aws.cloud.qdrant.io'],
    },
    collection: {
      type: 'string',
      description: 'Qdrant collection name',
      required: true,
      default: '',
      examples: ['my-collection'],
    },
    apiKey: {
      type: 'string',
      description: 'Qdrant API key',
      required: false,
      default: '',
      examples: ['{{$credentials.qdrant.apiKey}}'],
    },
    vector: {
      type: 'json',
      description: 'Embedding array of floats; used by upsert and query operations',
      required: false,
      default: null,
      examples: ['[0.1, 0.2, 0.3]'],
    },
    id: {
      type: 'string',
      description: 'Point ID (integer or UUID string); used by upsert and delete',
      required: false,
      default: '',
      examples: ['1', 'vec-001'],
    },
    payload: {
      type: 'object',
      description: 'Arbitrary key-value metadata to store alongside the vector (upsert only)',
      required: false,
      default: {},
    },
    limit: {
      type: 'number',
      description: 'Number of nearest-neighbor results to return for a query operation',
      required: false,
      default: 5,
    },
    withPayload: {
      type: 'boolean',
      description: 'Include payload in query results',
      required: false,
      default: true,
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'True if the API call succeeded',
    },
    operation: {
      type: 'string',
      description: 'Echoed operation name',
    },
    matches: {
      type: 'array',
      description: 'Nearest-neighbor results from a query operation',
    },
    upsertedCount: {
      type: 'number',
      description: 'Number of vectors upserted',
    },
    error: {
      type: 'string',
      description: 'Error message if success is false',
    },
  },

  requiredInputs: ['operation', 'url', 'collection'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.operation) errors.push('operation is required');
    else if (!VALID_OPERATIONS.includes(inputs.operation as typeof VALID_OPERATIONS[number])) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
    }
    if (!inputs.url || !String(inputs.url).trim()) errors.push('url is required');
    if (!inputs.collection || !String(inputs.collection).trim()) errors.push('collection is required');
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'query',
    url: '',
    collection: '',
    apiKey: '',
    vector: null,
    id: '',
    payload: {},
    limit: 5,
    withPayload: true,
  }),
};
