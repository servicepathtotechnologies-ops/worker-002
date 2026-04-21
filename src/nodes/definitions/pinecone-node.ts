/**
 * Pinecone Node Definition
 *
 * Pinecone vector database integration.
 * Supports upsert, query, and delete operations against the Pinecone REST API.
 *
 * Authentication: API key passed as Api-Key header.
 * Operations:
 *   - upsert: store a vector with metadata in a named index
 *   - query: retrieve top-K nearest neighbors for a query vector
 *   - delete: remove a vector by ID from an index
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['upsert', 'query', 'delete'] as const;

export const pineconeNodeDefinition: NodeDefinition = {
  type: 'pinecone',
  label: 'Pinecone',
  category: 'database',
  description: 'Upsert, query, and delete vectors in a Pinecone vector database index within your workflows.',
  icon: 'Database',
  version: 1,

  inputSchema: {
    // ── Operation ─────────────────────────────────────────────────────────────
    operation: {
      type: 'string',
      description: 'Action to perform on the Pinecone index',
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
    // ── Index ─────────────────────────────────────────────────────────────────
    index: {
      type: 'string',
      description: 'Pinecone index name (or full index host URL for serverless indexes)',
      required: true,
      default: '',
      examples: ['my-index', 'https://my-index-abc123.svc.us-east1-gcp.pinecone.io'],
    },
    // ── Auth ─────────────────────────────────────────────────────────────────
    apiKey: {
      type: 'string',
      description: 'Pinecone API key (Api-Key header)',
      required: false,
      default: '',
      examples: ['{{$credentials.pinecone.apiKey}}'],
    },
    // ── Vector ───────────────────────────────────────────────────────────────
    vector: {
      type: 'json',
      description: 'Embedding array of floating-point numbers; used by upsert and query operations',
      required: false,
      default: null,
      examples: ['[0.1, 0.2, 0.3]'],
    },
    // ── Query options ─────────────────────────────────────────────────────────
    topK: {
      type: 'number',
      description: 'Number of nearest-neighbor results to return for a query operation',
      required: false,
      default: 5,
    },
    // ── Vector ID ─────────────────────────────────────────────────────────────
    id: {
      type: 'string',
      description: 'Vector ID; used by upsert and delete operations',
      required: false,
      default: '',
      examples: ['vec-001', '{{$json.id}}'],
    },
    // ── Metadata ─────────────────────────────────────────────────────────────
    metadata: {
      type: 'object',
      description: 'Arbitrary key-value metadata to store alongside the vector (upsert only)',
      required: false,
      default: {},
    },
    // ── Namespace ─────────────────────────────────────────────────────────────
    namespace: {
      type: 'string',
      description: 'Pinecone namespace to scope the operation within the index',
      required: false,
      default: '',
      examples: ['production', 'user-{{$json.userId}}'],
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
      description: 'Nearest-neighbor results returned by a query operation; empty array for other operations',
    },
    upsertedCount: {
      type: 'number',
      description: 'Number of vectors upserted; populated for upsert operations',
    },
    error: {
      type: 'string',
      description: 'Error message if success is false',
    },
  },

  requiredInputs: ['operation', 'index'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // operation validation
    if (!inputs.operation) {
      errors.push('operation is required');
    } else if (!VALID_OPERATIONS.includes(inputs.operation as typeof VALID_OPERATIONS[number])) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
    }

    // index validation
    if (!inputs.index || !String(inputs.index).trim()) {
      errors.push('index is required');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'query',
    index: '',
    apiKey: '',
    vector: null,
    topK: 5,
    id: '',
    metadata: {},
    namespace: '',
  }),
};
