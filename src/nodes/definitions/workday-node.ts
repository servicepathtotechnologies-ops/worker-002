/**
 * Workday Node Definition
 *
 * Workday REST API integration.
 * Supports resources: workers, jobs, organizations, supervisoryOrganizations, positions.
 * Operations: get_many, get_by_id, create, update.
 *
 * Authentication: OAuth 2.0 (default) or Basic Auth (username/password).
 * Tenant-scoped base URLs of the form: https://{hostname}/ccx/api/{version}/{tenant}/
 */

import { NodeDefinition } from '../../core/types/node-definition';

export const workdayNodeDefinition: NodeDefinition = {
  type: 'workday',
  label: 'Workday',
  category: 'http_api',
  description: 'Read and manage Workday HR, staffing, and organizational data through the Workday REST APIs.',
  icon: 'Database',
  version: 1,

  inputSchema: {
    // ── Connection ────────────────────────────────────────────────────────────
    baseUrl: {
      type: 'string',
      description: 'Workday REST API base URL (e.g. https://wd2-impl-services1.workday.com/ccx/api/v1/)',
      required: false,
      default: '',
      examples: ['https://wd2-impl-services1.workday.com/ccx/api/v1/'],
    },
    tenant: {
      type: 'string',
      description: 'Workday tenant identifier',
      required: false,
      default: '',
      examples: ['{{$credentials.workday.tenant}}'],
    },
    // ── Auth ─────────────────────────────────────────────────────────────────
    authType: {
      type: 'string',
      description: 'Authentication method: oauth2 (default) or basic',
      required: false,
      default: 'oauth2',
      examples: ['oauth2', 'basic'],
      ui: {
        options: [
          { label: 'OAuth 2.0', value: 'oauth2' },
          { label: 'Basic Auth', value: 'basic' },
        ],
      },
    },
    accessToken: {
      type: 'string',
      description: 'OAuth 2.0 Bearer token (required when authType is oauth2)',
      required: false,
      default: '',
      examples: ['{{$credentials.workday.accessToken}}'],
    },
    username: {
      type: 'string',
      description: 'Basic auth username (required when authType is basic)',
      required: false,
      default: '',
      examples: ['{{$credentials.workday.username}}'],
    },
    password: {
      type: 'string',
      description: 'Basic auth password (required when authType is basic)',
      required: false,
      default: '',
      examples: ['{{$credentials.workday.password}}'],
    },
    // ── Resource / Operation ─────────────────────────────────────────────────
    resource: {
      type: 'string',
      description: 'Workday API resource to target',
      required: true,
      default: 'workers',
      examples: ['workers', 'jobs', 'organizations', 'supervisoryOrganizations', 'positions'],
      ui: {
        options: [
          { label: 'Workers', value: 'workers' },
          { label: 'Jobs', value: 'jobs' },
          { label: 'Organizations', value: 'organizations' },
          { label: 'Supervisory Organizations', value: 'supervisoryOrganizations' },
          { label: 'Positions', value: 'positions' },
        ],
      },
    },
    operation: {
      type: 'string',
      description: 'Action to perform on the selected resource',
      required: true,
      default: 'get_many',
      examples: ['get_many', 'get_by_id', 'create', 'update'],
      ui: {
        options: [
          { label: 'Get Many', value: 'get_many' },
          { label: 'Get By ID', value: 'get_by_id' },
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
        ],
      },
    },
    // ── Record targeting ─────────────────────────────────────────────────────
    recordId: {
      type: 'string',
      description: 'Record ID for get_by_id or update operations',
      required: false,
      default: '',
      examples: ['{{$json.id}}', '{{$json.workerId}}'],
    },
    // ── Write payload ────────────────────────────────────────────────────────
    payload: {
      type: 'object',
      description: 'Request body for create or update operations',
      required: false,
      default: {},
    },
    // ── Pagination ───────────────────────────────────────────────────────────
    limit: {
      type: 'number',
      description: 'Maximum number of records to return',
      required: false,
      default: 50,
    },
    offset: {
      type: 'number',
      description: 'Number of records to skip (for pagination)',
      required: false,
      default: 0,
    },
    // ── Advanced ─────────────────────────────────────────────────────────────
    rawPath: {
      type: 'string',
      description: 'Override: arbitrary Workday API path (bypasses resource/operation abstraction)',
      required: false,
      default: '',
      examples: ['/workers/{{$json.id}}/contracts'],
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'True if the API call succeeded',
    },
    resource: {
      type: 'string',
      description: 'Echoed resource name',
    },
    operation: {
      type: 'string',
      description: 'Echoed operation name',
    },
    tenant: {
      type: 'string',
      description: 'Echoed tenant identifier',
    },
    record: {
      type: 'object',
      description: 'Single record result (get_by_id, create, update)',
    },
    records: {
      type: 'array',
      description: 'List of records (get_many)',
    },
    count: {
      type: 'number',
      description: 'Total count from API response',
    },
    pagination: {
      type: 'object',
      description: 'Pagination metadata: { limit, offset, total }',
    },
    meta: {
      type: 'object',
      description: 'Raw API response metadata',
    },
    error: {
      type: 'string',
      description: 'Error message if success is false',
    },
  },

  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    const validResources = ['workers', 'jobs', 'organizations', 'supervisoryOrganizations', 'positions'];
    if (!inputs.resource) {
      errors.push('resource is required');
    } else if (!validResources.includes(inputs.resource)) {
      errors.push(`resource must be one of: ${validResources.join(', ')}`);
    }

    const validOps = ['get_many', 'get_by_id', 'create', 'update'];
    if (!inputs.operation) {
      errors.push('operation is required');
    } else if (!validOps.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOps.join(', ')}`);
    }

    const authType = inputs.authType ?? 'oauth2';
    if (authType === 'oauth2') {
      if (!inputs.accessToken?.trim()) {
        errors.push('accessToken is required for oauth2 authentication');
      }
    } else if (authType === 'basic') {
      if (!inputs.username?.trim()) {
        errors.push('username is required for basic authentication');
      }
      if (!inputs.password?.trim()) {
        errors.push('password is required for basic authentication');
      }
    }

    if (['get_by_id', 'update'].includes(inputs.operation) && !inputs.recordId?.trim()) {
      errors.push('recordId is required for get_by_id and update operations');
    }

    if (['create', 'update'].includes(inputs.operation)) {
      if (!inputs.payload || typeof inputs.payload !== 'object') {
        errors.push('payload must be a non-null object for create/update operations');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    authType: 'oauth2',
    resource: 'workers',
    operation: 'get_many',
    limit: 50,
    offset: 0,
    baseUrl: '',
    tenant: '',
    accessToken: '',
    username: '',
    password: '',
    recordId: '',
    payload: {},
    rawPath: '',
  }),
};
