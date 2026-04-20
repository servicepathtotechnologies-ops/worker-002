/**
 * Xero Node Definition
 *
 * Xero Accounting API integration.
 * Supports resources: Contacts, Invoices, Items, Payments, Accounts.
 * Operations: get_many, get_by_id, create, update.
 *
 * Authentication: OAuth 2.0 with multi-tenant support (tenantId required).
 */

import { NodeDefinition } from '../../core/types/node-definition';

export const xeroNodeDefinition: NodeDefinition = {
  type: 'xero',
  label: 'Xero',
  category: 'http_api',
  description: 'Create, fetch, update, and search Xero accounting records such as contacts, invoices, items, and payments.',
  icon: 'Database',
  version: 1,

  inputSchema: {
    // ── Auth ─────────────────────────────────────────────────────────────────
    accessToken: {
      type: 'string',
      description: 'Xero OAuth 2.0 access token',
      required: true,
      default: '',
    },
    tenantId: {
      type: 'string',
      description: 'Xero tenant ID / connected organisation ID',
      required: true,
      default: '',
      examples: ['{{$credentials.xero.tenantId}}'],
    },
    // ── Resource / Operation ─────────────────────────────────────────────────
    resource: {
      type: 'string',
      description: 'Xero Accounting API resource to target',
      required: true,
      default: 'invoices',
      examples: ['contacts', 'invoices', 'items', 'payments', 'accounts'],
      ui: {
        options: [
          { label: 'Contacts', value: 'contacts' },
          { label: 'Invoices', value: 'invoices' },
          { label: 'Items', value: 'items' },
          { label: 'Payments', value: 'payments' },
          { label: 'Accounts', value: 'accounts' },
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
      examples: ['{{$json.InvoiceID}}', '{{$json.ContactID}}'],
    },
    // ── Write payload ────────────────────────────────────────────────────────
    payload: {
      type: 'object',
      description: 'Request body for create or update operations',
      required: false,
      default: {},
    },
    // ── List / filter options ────────────────────────────────────────────────
    where: {
      type: 'string',
      description: 'Xero where filter expression for list operations',
      required: false,
      default: '',
      examples: ['Status=="AUTHORISED"', 'Name!=null'],
    },
    order: {
      type: 'string',
      description: 'Sort order for list operations',
      required: false,
      default: '',
      examples: ['Date DESC', 'Name ASC'],
    },
    page: {
      type: 'number',
      description: 'Page number for paginated resources',
      required: false,
      default: 1,
    },
    modifiedAfter: {
      type: 'string',
      description: 'ISO date/time — fetch only records modified after this time',
      required: false,
      default: '',
      examples: ['2026-04-01T00:00:00Z'],
    },
    // ── Advanced options ─────────────────────────────────────────────────────
    summarizeErrors: {
      type: 'boolean',
      description: 'Request summarized validation errors from Xero',
      required: false,
      default: true,
    },
    includeArchived: {
      type: 'boolean',
      description: 'Include archived/inactive records when supported',
      required: false,
      default: false,
    },
    unitdp: {
      type: 'number',
      description: 'Unit decimal places (2 or 4)',
      required: false,
      default: 2,
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Xero operation result',
    },
  },

  requiredInputs: ['accessToken', 'tenantId', 'resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.accessToken?.trim()) errors.push('accessToken is required');
    if (!inputs.tenantId?.trim()) errors.push('tenantId is required');
    if (!inputs.resource) errors.push('resource is required');
    if (!inputs.operation) errors.push('operation is required');

    const validResources = ['contacts', 'invoices', 'items', 'payments', 'accounts'];
    if (inputs.resource && !validResources.includes(inputs.resource)) {
      errors.push(`resource must be one of: ${validResources.join(', ')}`);
    }

    const validOps = ['get_many', 'get_by_id', 'create', 'update'];
    if (inputs.operation && !validOps.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOps.join(', ')}`);
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
    accessToken: '',
    tenantId: '',
    resource: 'invoices',
    operation: 'get_many',
    recordId: '',
    payload: {},
    where: '',
    order: '',
    page: 1,
    modifiedAfter: '',
    summarizeErrors: true,
    includeArchived: false,
    unitdp: 2,
  }),
};
