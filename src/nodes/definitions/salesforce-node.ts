import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Salesforce Node Definition
 *
 * Comprehensive integration with Salesforce CRM via OAuth 2.0.
 * Supports multiple resources (Account, Contact, Lead, Opportunity, Case, Task, Note,
 * Campaign, Event, Contract, Product, User, Custom Object) and operations
 * (Create, Get, Update, Delete, Search, Query/SOQL, Search/SOSL, Convert).
 *
 * Execution is delegated to salesforce-executor.ts via the registry override.
 */
export const salesforceNodeDefinition: NodeDefinition = {
  type: 'salesforce',
  label: 'Salesforce',
  category: 'crm',
  description:
    'Interact with Salesforce CRM — Accounts, Contacts, Leads, Opportunities, Cases, Tasks, Notes, Campaigns, and more via OAuth 2.0',
  icon: 'Cloud',
  version: 1,

  inputSchema: {
    resource: {
      type: 'string',
      description: 'Salesforce object type to operate on',
      required: true,
      default: 'account',
      examples: [
        'account',
        'contact',
        'lead',
        'opportunity',
        'case',
        'task',
        'note',
        'campaign',
        'event',
        'contract',
        'product',
        'user',
        'custom',
      ],
      validation: (value) => {
        const valid = [
          'account',
          'contact',
          'lead',
          'opportunity',
          'case',
          'task',
          'note',
          'campaign',
          'event',
          'contract',
          'product',
          'user',
          'custom',
        ];
        if (!valid.includes(value)) {
          return `resource must be one of: ${valid.join(', ')}`;
        }
        return true;
      },
      ui: {
        options: [
          { label: 'Account', value: 'account' },
          { label: 'Contact', value: 'contact' },
          { label: 'Lead', value: 'lead' },
          { label: 'Opportunity', value: 'opportunity' },
          { label: 'Case', value: 'case' },
          { label: 'Task', value: 'task' },
          { label: 'Note', value: 'note' },
          { label: 'Campaign', value: 'campaign' },
          { label: 'Event', value: 'event' },
          { label: 'Contract', value: 'contract' },
          { label: 'Product', value: 'product' },
          { label: 'User', value: 'user' },
          { label: 'Custom Object', value: 'custom' },
        ],
      },
    },

    operation: {
      type: 'string',
      description: 'Operation to perform on the resource',
      required: true,
      default: 'get',
      examples: ['create', 'get', 'update', 'delete', 'search', 'query', 'sosl', 'convert'],
      validation: () => true, // resource-dependent; validated in validateInputs
      ui: {
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Get', value: 'get' },
          { label: 'Update', value: 'update' },
          { label: 'Delete', value: 'delete' },
          { label: 'Search', value: 'search' },
          { label: 'Query (SOQL)', value: 'query' },
          { label: 'Search (SOSL)', value: 'sosl' },
          { label: 'Convert (Lead)', value: 'convert' },
        ],
      },
    },

    recordId: {
      type: 'string',
      description: 'Salesforce record ID (required for get, update, delete, convert operations)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'operation', equals: ['get', 'update', 'delete', 'convert'] },
        requiredIf: { field: 'operation', equals: ['get', 'update', 'delete', 'convert'] },
      },
    },

    soqlQuery: {
      type: 'string',
      description: 'SOQL query string (required for query operation)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'operation', equals: 'query' },
        requiredIf: { field: 'operation', equals: 'query' },
        widget: 'textarea',
      },
    },

    soslQuery: {
      type: 'string',
      description: 'SOSL search string (required for sosl operation)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'operation', equals: 'sosl' },
        requiredIf: { field: 'operation', equals: 'sosl' },
        widget: 'textarea',
      },
    },

    customObject: {
      type: 'string',
      description:
        'Salesforce sObject API name for custom/non-standard objects (required when resource is custom)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'custom' },
        requiredIf: { field: 'resource', equals: 'custom' },
      },
    },

    lastName: {
      type: 'string',
      description: 'Last name (required for contact and lead create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['contact', 'lead'] },
      },
    },

    firstName: {
      type: 'string',
      description: 'First name',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['contact', 'lead', 'user'] },
      },
    },

    company: {
      type: 'string',
      description: 'Company name (required for lead create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'lead' },
      },
    },

    name: {
      type: 'string',
      description: 'Record name (required for account, opportunity, campaign, product create)',
      required: false,
      default: '',
      ui: {
        visibleIf: {
          field: 'resource',
          equals: ['account', 'opportunity', 'campaign', 'product'],
        },
      },
    },

    email: {
      type: 'string',
      description: 'Email address',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['contact', 'lead', 'user'] },
      },
    },

    phone: {
      type: 'string',
      description: 'Phone number',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['account', 'contact', 'lead', 'user'] },
      },
    },

    subject: {
      type: 'string',
      description: 'Subject (required for case, task, event create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['case', 'task', 'event'] },
      },
    },

    stageName: {
      type: 'string',
      description: 'Opportunity stage name (required for opportunity create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'opportunity' },
      },
    },

    closeDate: {
      type: 'string',
      description: 'Opportunity close date in YYYY-MM-DD format (required for opportunity create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'opportunity' },
      },
    },

    title: {
      type: 'string',
      description: 'Note title (required for note create) or contact/lead job title',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['note', 'contact', 'lead', 'user'] },
      },
    },

    parentId: {
      type: 'string',
      description: 'Parent record ID (required for note create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'note' },
      },
    },

    startDateTime: {
      type: 'string',
      description: 'Event start date/time in ISO 8601 format (required for event create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'event' },
      },
    },

    endDateTime: {
      type: 'string',
      description: 'Event end date/time in ISO 8601 format (required for event create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'event' },
      },
    },

    accountId: {
      type: 'string',
      description: 'Account ID (required for contract create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['contract', 'contact', 'opportunity', 'case'] },
      },
    },

    contractTerm: {
      type: 'string',
      description: 'Contract term in months (required for contract create)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'contract' },
      },
    },

    status: {
      type: 'string',
      description: 'Record status (e.g., Open, Closed, New)',
      required: false,
      default: '',
      ui: {
        visibleIf: {
          field: 'resource',
          equals: ['lead', 'case', 'task', 'campaign', 'contract'],
        },
      },
    },

    priority: {
      type: 'string',
      description: 'Task/case priority (e.g., High, Normal, Low)',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['case', 'task'] },
      },
    },

    description: {
      type: 'string',
      description: 'Record description or body text',
      required: false,
      default: '',
      ui: {
        widget: 'textarea',
      },
    },

    website: {
      type: 'string',
      description: 'Website URL',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: ['account', 'lead'] },
      },
    },

    activityDate: {
      type: 'string',
      description: 'Task due date in YYYY-MM-DD format',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'task' },
      },
    },

    body: {
      type: 'string',
      description: 'Note body text',
      required: false,
      default: '',
      ui: {
        visibleIf: { field: 'resource', equals: 'note' },
        widget: 'textarea',
      },
    },

    returnAll: {
      type: 'boolean',
      description:
        'Return all records (follows pagination). When false, returns up to the limit.',
      required: false,
      default: false,
    },

    limit: {
      type: 'number',
      description: 'Maximum number of records to return when returnAll is false',
      required: false,
      default: 50,
    },

    apiVersion: {
      type: 'string',
      description: 'Salesforce REST API version (e.g., v59.0)',
      required: false,
      default: 'v59.0',
    },

    additionalFields: {
      type: 'json',
      description:
        'Additional Salesforce field values as a JSON object (merged with explicit fields for create/update operations)',
      required: false,
      default: null,
      ui: {
        widget: 'json',
        visibleIf: { field: 'operation', equals: ['create', 'update'] },
      },
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description:
        'Salesforce operation result. Single-record ops return { id, success, record }. Multi-record ops return { records, totalSize, done }. Errors return { success: false, error: { message, statusCode, errorCode } }.',
    },
  },

  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.resource) {
      errors.push('resource field is required');
    }
    if (!inputs.operation) {
      errors.push('operation field is required');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const { resource, operation } = inputs;

    // Operations that require recordId
    if (['get', 'update', 'delete', 'convert'].includes(operation)) {
      if (!inputs.recordId) {
        errors.push('recordId is required for get, update, delete, and convert operations');
      }
    }

    // Resource + create validations
    if (operation === 'create') {
      if (resource === 'contact' || resource === 'lead') {
        if (!inputs.lastName) errors.push('lastName is required for contact and lead create');
      }
      if (resource === 'lead') {
        if (!inputs.company) errors.push('company is required for lead create');
      }
      if (resource === 'opportunity') {
        if (!inputs.name) errors.push('name is required for opportunity create');
        if (!inputs.stageName) errors.push('stageName is required for opportunity create');
        if (!inputs.closeDate) errors.push('closeDate is required for opportunity create');
      }
      if (resource === 'case') {
        if (!inputs.subject) errors.push('subject is required for case create');
      }
      if (resource === 'task') {
        if (!inputs.subject) errors.push('subject is required for task create');
      }
      if (resource === 'note') {
        if (!inputs.title) errors.push('title is required for note create');
        if (!inputs.parentId) errors.push('parentId is required for note create');
      }
      if (resource === 'campaign') {
        if (!inputs.name) errors.push('name is required for campaign create');
      }
      if (resource === 'event') {
        if (!inputs.subject) errors.push('subject is required for event create');
        if (!inputs.startDateTime) errors.push('startDateTime is required for event create');
        if (!inputs.endDateTime) errors.push('endDateTime is required for event create');
      }
      if (resource === 'contract') {
        if (!inputs.accountId) errors.push('accountId is required for contract create');
        if (inputs.contractTerm === undefined || inputs.contractTerm === '') {
          errors.push('contractTerm is required for contract create');
        }
      }
      if (resource === 'product') {
        if (!inputs.name) errors.push('name is required for product create');
      }
    }

    // Custom resource requires customObject
    if (resource === 'custom') {
      if (!inputs.customObject) errors.push('customObject is required when resource is custom');
    }

    // Query/SOSL operations
    if (operation === 'query') {
      if (!inputs.soqlQuery) errors.push('soqlQuery is required for query operation');
    }
    if (operation === 'sosl') {
      if (!inputs.soslQuery) errors.push('soslQuery is required for sosl operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'account',
    operation: 'get',
    recordId: '',
    soqlQuery: '',
    soslQuery: '',
    customObject: '',
    lastName: '',
    firstName: '',
    company: '',
    name: '',
    email: '',
    phone: '',
    subject: '',
    stageName: '',
    closeDate: '',
    title: '',
    parentId: '',
    startDateTime: '',
    endDateTime: '',
    accountId: '',
    contractTerm: '',
    status: '',
    priority: '',
    description: '',
    website: '',
    activityDate: '',
    body: '',
    returnAll: false,
    limit: 50,
    apiVersion: 'v59.0',
    additionalFields: null,
  }),
};
