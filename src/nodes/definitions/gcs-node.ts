/**
 * Google Cloud Storage Node Definition
 *
 * Supports operations:
 * - upload:   Upload a file to a GCS bucket
 * - download: Download a file from a GCS bucket
 * - delete:   Delete a file from a GCS bucket
 * - list:     List files in a GCS bucket with optional prefix filtering
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runGCSNode } from '../../services/database/gcsNode';

const VALID_OPERATIONS = ['upload', 'download', 'delete', 'list'] as const;

export const gcsNodeDefinition: NodeDefinition = {
  type: 'google_cloud_storage',
  label: 'Google Cloud Storage',
  category: 'database',
  description: 'Connect to Google Cloud Storage for file operations',
  icon: 'Database',
  version: 1,

  inputSchema: {
    // Required credential fields
    projectId: {
      type: 'string',
      description: 'GCP Project ID (from service account)',
      required: true,
      default: '',
    },
    clientEmail: {
      type: 'string',
      description: 'Service account email (from service account)',
      required: true,
      default: '',
    },
    privateKey: {
      type: 'string',
      description: 'Service account private key (from service account)',
      required: true,
      default: '',
    },
    // Required operation selector
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'upload',
      examples: ['upload', 'download', 'delete', 'list'],
    },
    // Required bucket
    bucket: {
      type: 'string',
      description: 'GCS bucket name',
      required: true,
      default: '',
    },
    // Optional operation-specific fields
    fileName: {
      type: 'string',
      description: 'File name/path in bucket (required for upload, download, delete)',
      required: false,
      default: '',
    },
    fileContent: {
      type: 'string',
      description: 'File content for upload operation',
      required: false,
      default: '',
    },
    filter: {
      type: 'string',
      description: 'Prefix filter for list operations',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'GCS operation result',
    },
  },

  requiredInputs: ['projectId', 'clientEmail', 'privateKey', 'operation', 'bucket'],
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
    if (!inputs.bucket || typeof inputs.bucket !== 'string' || inputs.bucket.trim() === '') {
      errors.push('bucket is required');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    projectId: '',
    clientEmail: '',
    privateKey: '',
    operation: 'upload',
    bucket: '',
    fileName: '',
    fileContent: '',
    filter: '',
  }),

  run: runGCSNode,
};
