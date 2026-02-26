import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Airtable Node Definition
 * 
 * Supports all Airtable record operations:
 * - List: Fetch multiple records with filtering, sorting, pagination
 * - Get: Fetch a single record by ID
 * - Create: Insert one or multiple records
 * - Update: Update one or multiple existing records
 * - Upsert: Update existing records or create new ones based on a matching field
 * - Delete: Delete one or multiple records
 * 
 * Uses Airtable.js SDK for reliable API interaction with automatic pagination,
 * rate limiting, and error handling.
 */
export const airtableNodeDefinition: NodeDefinition = {
  type: 'airtable',
  label: 'Airtable',
  category: 'database',
  description: 'Interact with Airtable bases and tables using the Airtable API',
  icon: 'Database',
  version: 1,

  inputSchema: {
    apiKey: {
      type: 'string',
      description: 'Airtable Personal Access Token (API Key)',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'API Key must be a string';
        }
        if (value.trim() === '') {
          return 'API Key is required';
        }
        return true;
      },
    },
    baseId: {
      type: 'string',
      description: 'Airtable Base ID (e.g., app1234567890)',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'Base ID must be a string';
        }
        if (value.trim() === '') {
          return 'Base ID is required';
        }
        return true;
      },
    },
    table: {
      type: 'string',
      description: 'Table name or ID',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'Table name must be a string';
        }
        if (value.trim() === '') {
          return 'Table name is required';
        }
        return true;
      },
    },
    resource: {
      type: 'string',
      description: 'Resource type (Record or Table)',
      required: true,
      default: 'Record',
      examples: ['Record', 'Table'],
      validation: (value) => {
        if (!['Record', 'Table'].includes(value)) {
          return 'Resource must be either "Record" or "Table"';
        }
        return true;
      },
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'list',
      examples: ['list', 'get', 'create', 'update', 'upsert', 'delete'],
      validation: (value) => {
        const validOperations = ['list', 'get', 'create', 'update', 'upsert', 'delete'];
        if (!validOperations.includes(value)) {
          return `Operation must be one of: ${validOperations.join(', ')}`;
        }
        return true;
      },
    },
    // List operation parameters
    filterByFormula: {
      type: 'string',
      description: 'Airtable formula to filter records (e.g., "{Status} = \'Active\'")',
      required: false,
      default: '',
    },
    maxRecords: {
      type: 'number',
      description: 'Maximum number of records to return (0 = all records)',
      required: false,
      default: 0,
    },
    pageSize: {
      type: 'number',
      description: 'Number of records per page (default: 100, max: 100)',
      required: false,
      default: 100,
      validation: (value) => {
        if (value && (value < 1 || value > 100)) {
          return 'Page size must be between 1 and 100';
        }
        return true;
      },
    },
    sort: {
      type: 'json',
      description: 'Sort configuration (JSON array, e.g., [{"field": "Name", "direction": "asc"}])',
      required: false,
      default: null,
    },
    view: {
      type: 'string',
      description: 'View name or ID to use',
      required: false,
      default: '',
    },
    fields: {
      type: 'json',
      description: 'Array of field names to include (projection)',
      required: false,
      default: null,
    },
    // Get operation parameters
    recordId: {
      type: 'string',
      description: 'Record ID to fetch (for get operation)',
      required: false,
      default: '',
    },
    // Create/Update/Upsert operation parameters
    records: {
      type: 'json',
      description: 'Records to create/update/upsert (JSON array or single object)',
      required: false,
      default: null,
    },
    // Upsert operation parameters
    matchField: {
      type: 'string',
      description: 'Field name to match on for upsert operation',
      required: false,
      default: '',
    },
    // Delete operation parameters
    recordIds: {
      type: 'json',
      description: 'Record ID(s) to delete (string or array of strings)',
      required: false,
      default: null,
    },
    // Common parameters
    typecast: {
      type: 'boolean',
      description: 'Automatically convert values to the correct field type',
      required: false,
      default: false,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Airtable operation result (records, record, or operation status)',
    },
  },

  requiredInputs: ['apiKey', 'baseId', 'table', 'resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.apiKey || typeof inputs.apiKey !== 'string' || inputs.apiKey.trim() === '') {
      errors.push('apiKey field is required');
    }
    if (!inputs.baseId || typeof inputs.baseId !== 'string' || inputs.baseId.trim() === '') {
      errors.push('baseId field is required');
    }
    if (!inputs.table || typeof inputs.table !== 'string' || inputs.table.trim() === '') {
      errors.push('table field is required');
    }
    if (!inputs.resource || !['Record', 'Table'].includes(inputs.resource)) {
      errors.push('resource must be either "Record" or "Table"');
    }
    if (!inputs.operation) {
      errors.push('operation field is required');
    }

    // Operation-specific validation
    if (inputs.operation === 'get') {
      if (!inputs.recordId || typeof inputs.recordId !== 'string' || inputs.recordId.trim() === '') {
        errors.push('recordId is required for get operation');
      }
    }

    if (inputs.operation === 'create' || inputs.operation === 'update') {
      if (!inputs.records) {
        errors.push('records field is required for create/update operations');
      }
    }

    if (inputs.operation === 'upsert') {
      if (!inputs.records) {
        errors.push('records field is required for upsert operation');
      }
      if (!inputs.matchField || typeof inputs.matchField !== 'string' || inputs.matchField.trim() === '') {
        errors.push('matchField is required for upsert operation');
      }
    }

    if (inputs.operation === 'delete') {
      if (!inputs.recordIds) {
        errors.push('recordIds field is required for delete operation');
      }
    }

    // Validate pageSize
    if (inputs.pageSize && (typeof inputs.pageSize !== 'number' || inputs.pageSize < 1 || inputs.pageSize > 100)) {
      errors.push('pageSize must be a number between 1 and 100');
    }

    // Validate maxRecords
    if (inputs.maxRecords && (typeof inputs.maxRecords !== 'number' || inputs.maxRecords < 0)) {
      errors.push('maxRecords must be a non-negative number');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiKey: '',
    baseId: '',
    table: '',
    resource: 'Record',
    operation: 'list',
    filterByFormula: '',
    maxRecords: 0,
    pageSize: 100,
    sort: null,
    view: '',
    fields: null,
    recordId: '',
    records: null,
    matchField: '',
    recordIds: null,
    typecast: false,
  }),
};
