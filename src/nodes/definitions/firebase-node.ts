/**
 * Firebase Node Definition
 *
 * Supports operations:
 * - get:          Retrieve a Firestore document by collection + documentId
 * - add:          Add a new document to a Firestore collection
 * - update:       Merge-update a Firestore document
 * - delete:       Delete a Firestore document
 * - query:        Query a Firestore collection with optional filter and limit
 * - realtime_get: Read a value from Firebase Realtime Database
 * - realtime_set: Write a value to Firebase Realtime Database
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runFirebaseNode } from '../../services/database/firebaseNode';

const VALID_OPERATIONS = ['get', 'add', 'update', 'delete', 'query', 'realtime_get', 'realtime_set'] as const;

export const firebaseNodeDefinition: NodeDefinition = {
  type: 'firebase',
  label: 'Firebase',
  category: 'database',
  description: 'Connect to Firebase Firestore and Realtime Database',
  icon: 'Database',
  version: 1,

  inputSchema: {
    // Required credential fields
    projectId: {
      type: 'string',
      description: 'Firebase project ID (from service account)',
      required: true,
      default: '',
    },
    clientEmail: {
      type: 'string',
      description: 'Firebase client email (from service account)',
      required: true,
      default: '',
    },
    privateKey: {
      type: 'string',
      description: 'Firebase private key (from service account)',
      required: true,
      default: '',
    },
    // Required operation selector
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'get',
      examples: ['get', 'add', 'update', 'delete', 'query', 'realtime_get', 'realtime_set'],
    },
    // Optional Firestore / Realtime DB fields
    collection: {
      type: 'string',
      description: 'Firestore collection name (or Realtime Database path)',
      required: false,
      default: '',
    },
    documentId: {
      type: 'string',
      description: 'Document ID for get/update/delete operations',
      required: false,
      default: '',
    },
    data: {
      type: 'object',
      description: 'Data object for add/update/realtime_set operations',
      required: false,
      default: null,
    },
    filter: {
      type: 'object',
      description: 'Query filter conditions (for query operation)',
      required: false,
      default: null,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of documents to return (for query operation)',
      required: false,
      default: null,
    },
    databaseUrl: {
      type: 'string',
      description: 'Firebase Realtime Database URL (required for realtime_get and realtime_set)',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Firebase operation result',
    },
  },

  requiredInputs: ['projectId', 'clientEmail', 'privateKey', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.projectId || typeof inputs.projectId !== 'string' || inputs.projectId.trim() === '') {
      errors.push('projectId is required');
    }
    if (!inputs.clientEmail || typeof inputs.clientEmail !== 'string' || inputs.clientEmail.trim() === '') {
      errors.push('clientEmail is required');
    }
    if (!inputs.privateKey || typeof inputs.privateKey !== 'string' || inputs.privateKey.trim() === '') {
      errors.push('privateKey is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    } else if (!VALID_OPERATIONS.includes(inputs.operation as any)) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    projectId: '',
    clientEmail: '',
    privateKey: '',
    operation: 'get',
    collection: '',
    documentId: '',
    data: null,
    filter: null,
    limit: null,
    databaseUrl: '',
  }),

  run: runFirebaseNode,
};
