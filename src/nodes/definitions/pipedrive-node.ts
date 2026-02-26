import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Pipedrive Node Definition
 * 
 * Comprehensive integration with Pipedrive REST API v1.
 * Supports multiple resources (Deal, Person, Organization, Activity, Note, Pipeline, Stage, Product, Lead, File, Webhook)
 * and operations (Get, List, Create, Update, Delete, Search, etc.) similar to n8n's Pipedrive node.
 * 
 * Uses axios for HTTP requests with Bearer token authentication.
 * Supports automatic pagination for list operations.
 */
export const pipedriveNodeDefinition: NodeDefinition = {
  type: 'pipedrive',
  label: 'Pipedrive',
  category: 'crm',
  description: 'Interact with Pipedrive CRM using the Pipedrive REST API v1',
  icon: 'Database',
  version: 1,

  inputSchema: {
    apiToken: {
      type: 'string',
      description: 'Pipedrive API token or OAuth access token',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'API Token must be a string';
        }
        if (value.trim() === '') {
          return 'API Token is required';
        }
        return true;
      },
    },
    resource: {
      type: 'string',
      description: 'Resource type to operate on',
      required: true,
      default: 'deal',
      examples: ['deal', 'person', 'organization', 'activity', 'note', 'pipeline', 'stage', 'product', 'lead', 'file', 'webhook'],
      validation: (value) => {
        const validResources = ['deal', 'person', 'organization', 'activity', 'note', 'pipeline', 'stage', 'product', 'lead', 'file', 'webhook'];
        if (!validResources.includes(value)) {
          return `Resource must be one of: ${validResources.join(', ')}`;
        }
        return true;
      },
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'list',
      examples: ['get', 'list', 'create', 'update', 'delete', 'search', 'duplicate', 'getActivities', 'getDeals', 'getPersons', 'getProducts', 'addProduct', 'getStages', 'upload', 'download'],
      validation: (value) => {
        // Operation validation is resource-dependent, so we'll validate in validateInputs
        return true;
      },
    },
    // Deal operations
    dealId: {
      type: 'string',
      description: 'Deal ID (required for get, update, delete, duplicate, getActivities, getProducts, addProduct)',
      required: false,
      default: '',
    },
    dealTitle: {
      type: 'string',
      description: 'Deal title (required for create)',
      required: false,
      default: '',
    },
    dealValue: {
      type: 'number',
      description: 'Deal value',
      required: false,
      default: 0,
    },
    dealCurrency: {
      type: 'string',
      description: 'Deal currency (e.g., USD, EUR)',
      required: false,
      default: 'USD',
    },
    personId: {
      type: 'number',
      description: 'Person ID (for deal, activity, note associations)',
      required: false,
      default: null,
    },
    orgId: {
      type: 'number',
      description: 'Organization ID (for deal, activity, note associations)',
      required: false,
      default: null,
    },
    stageId: {
      type: 'number',
      description: 'Stage ID (for deal)',
      required: false,
      default: null,
    },
    pipelineId: {
      type: 'number',
      description: 'Pipeline ID (for deal, pipeline operations)',
      required: false,
      default: null,
    },
    status: {
      type: 'string',
      description: 'Deal status (open, won, lost)',
      required: false,
      default: 'open',
    },
    expectedCloseDate: {
      type: 'string',
      description: 'Expected close date (YYYY-MM-DD)',
      required: false,
      default: '',
    },
    filterId: {
      type: 'number',
      description: 'Filter ID (for list operations)',
      required: false,
      default: null,
    },
    sort: {
      type: 'string',
      description: 'Sort field and direction (e.g., "add_time DESC")',
      required: false,
      default: '',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of records to return (0 = all records, paginated)',
      required: false,
      default: 0,
    },
    start: {
      type: 'number',
      description: 'Pagination start offset',
      required: false,
      default: 0,
    },
    // Person operations
    personName: {
      type: 'string',
      description: 'Person name (required for create)',
      required: false,
      default: '',
    },
    personEmail: {
      type: 'string',
      description: 'Person email',
      required: false,
      default: '',
    },
    personPhone: {
      type: 'string',
      description: 'Person phone',
      required: false,
      default: '',
    },
    // Organization operations
    orgName: {
      type: 'string',
      description: 'Organization name (required for create)',
      required: false,
      default: '',
    },
    orgAddress: {
      type: 'string',
      description: 'Organization address',
      required: false,
      default: '',
    },
    // Activity operations
    activityId: {
      type: 'number',
      description: 'Activity ID (required for get, update, delete)',
      required: false,
      default: null,
    },
    activitySubject: {
      type: 'string',
      description: 'Activity subject (required for create)',
      required: false,
      default: '',
    },
    activityType: {
      type: 'string',
      description: 'Activity type (call, meeting, task, deadline, email, lunch)',
      required: false,
      default: 'task',
    },
    dueDate: {
      type: 'string',
      description: 'Activity due date (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss)',
      required: false,
      default: '',
    },
    startDate: {
      type: 'string',
      description: 'Start date for filtering (YYYY-MM-DD)',
      required: false,
      default: '',
    },
    endDate: {
      type: 'string',
      description: 'End date for filtering (YYYY-MM-DD)',
      required: false,
      default: '',
    },
    userId: {
      type: 'number',
      description: 'User ID (for filtering activities)',
      required: false,
      default: null,
    },
    // Note operations
    noteId: {
      type: 'number',
      description: 'Note ID (required for get, update, delete)',
      required: false,
      default: null,
    },
    noteContent: {
      type: 'string',
      description: 'Note content (required for create, update)',
      required: false,
      default: '',
    },
    pinnedToDealFlag: {
      type: 'boolean',
      description: 'Pin note to deal',
      required: false,
      default: false,
    },
    // Stage operations
    stageName: {
      type: 'string',
      description: 'Stage name (for update)',
      required: false,
      default: '',
    },
    dealProbability: {
      type: 'number',
      description: 'Deal probability (0-100)',
      required: false,
      default: null,
    },
    // Product operations
    productId: {
      type: 'number',
      description: 'Product ID (required for get, update, delete, addProduct)',
      required: false,
      default: null,
    },
    productName: {
      type: 'string',
      description: 'Product name (required for create)',
      required: false,
      default: '',
    },
    productCode: {
      type: 'string',
      description: 'Product code (required for create)',
      required: false,
      default: '',
    },
    productUnit: {
      type: 'string',
      description: 'Product unit (e.g., "pcs", "kg")',
      required: false,
      default: '',
    },
    productTax: {
      type: 'number',
      description: 'Product tax percentage',
      required: false,
      default: 0,
    },
    itemPrice: {
      type: 'number',
      description: 'Item price (required for addProduct)',
      required: false,
      default: 0,
    },
    quantity: {
      type: 'number',
      description: 'Quantity (required for addProduct)',
      required: false,
      default: 1,
    },
    discount: {
      type: 'number',
      description: 'Discount percentage',
      required: false,
      default: 0,
    },
    duration: {
      type: 'number',
      description: 'Duration (for addProduct)',
      required: false,
      default: 1,
    },
    // Lead operations
    leadId: {
      type: 'number',
      description: 'Lead ID (required for get, update, delete)',
      required: false,
      default: null,
    },
    leadTitle: {
      type: 'string',
      description: 'Lead title (required for create)',
      required: false,
      default: '',
    },
    // File operations
    fileId: {
      type: 'string',
      description: 'File ID (required for download, delete)',
      required: false,
      default: '',
    },
    fileUrl: {
      type: 'string',
      description: 'File URL or base64 content (required for upload)',
      required: false,
      default: '',
    },
    fileName: {
      type: 'string',
      description: 'File name (for upload)',
      required: false,
      default: '',
    },
    // Webhook operations
    webhookId: {
      type: 'number',
      description: 'Webhook ID (required for delete)',
      required: false,
      default: null,
    },
    event: {
      type: 'string',
      description: 'Webhook event (required for create, e.g., "deal.added", "person.updated")',
      required: false,
      default: '',
    },
    subscriptionUrl: {
      type: 'string',
      description: 'Webhook subscription URL (required for create)',
      required: false,
      default: '',
    },
    // Search operations
    searchTerm: {
      type: 'string',
      description: 'Search term (required for search operations)',
      required: false,
      default: '',
    },
    searchFields: {
      type: 'json',
      description: 'Fields to search in (JSON array, e.g., ["title", "value"])',
      required: false,
      default: null,
    },
    exactMatch: {
      type: 'boolean',
      description: 'Exact match for search',
      required: false,
      default: false,
    },
    // Additional fields (for create/update operations)
    additionalFields: {
      type: 'json',
      description: 'Additional fields as JSON object (for create/update operations)',
      required: false,
      default: null,
    },
    // Duplicate operation
    newTitle: {
      type: 'string',
      description: 'New title for duplicated deal',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Pipedrive operation result (varies by operation)',
    },
  },

  requiredInputs: ['apiToken', 'resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.apiToken || typeof inputs.apiToken !== 'string' || inputs.apiToken.trim() === '') {
      errors.push('apiToken field is required');
    }
    if (!inputs.resource) {
      errors.push('resource field is required');
    }
    if (!inputs.operation) {
      errors.push('operation field is required');
    }

    const resource = inputs.resource;
    const operation = inputs.operation;

    // Resource-specific validation
    if (resource === 'deal') {
      if (['get', 'update', 'delete', 'duplicate', 'getActivities', 'getProducts', 'addProduct'].includes(operation)) {
        if (!inputs.dealId) {
          errors.push('dealId is required for this operation');
        }
      }
      if (operation === 'create' && !inputs.dealTitle) {
        errors.push('dealTitle is required for create operation');
      }
      if (operation === 'addProduct') {
        if (!inputs.productId) {
          errors.push('productId is required for addProduct operation');
        }
        if (!inputs.itemPrice && inputs.itemPrice !== 0) {
          errors.push('itemPrice is required for addProduct operation');
        }
        if (!inputs.quantity && inputs.quantity !== 0) {
          errors.push('quantity is required for addProduct operation');
        }
      }
    } else if (resource === 'person') {
      if (['get', 'update', 'delete', 'getDeals', 'getActivities'].includes(operation)) {
        if (!inputs.personId) {
          errors.push('personId is required for this operation');
        }
      }
      if (operation === 'create' && !inputs.personName) {
        errors.push('personName is required for create operation');
      }
    } else if (resource === 'organization') {
      if (['get', 'update', 'delete', 'getDeals', 'getPersons', 'getActivities'].includes(operation)) {
        if (!inputs.orgId) {
          errors.push('orgId is required for this operation');
        }
      }
      if (operation === 'create' && !inputs.orgName) {
        errors.push('orgName is required for create operation');
      }
    } else if (resource === 'activity') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.activityId) {
          errors.push('activityId is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.activitySubject) {
          errors.push('activitySubject is required for create operation');
        }
        if (!inputs.dueDate) {
          errors.push('dueDate is required for create operation');
        }
      }
    } else if (resource === 'note') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.noteId) {
          errors.push('noteId is required for this operation');
        }
      }
      if (['create', 'update'].includes(operation) && !inputs.noteContent) {
        errors.push('noteContent is required for create/update operation');
      }
    } else if (resource === 'pipeline') {
      if (['get', 'getStages'].includes(operation)) {
        if (!inputs.pipelineId) {
          errors.push('pipelineId is required for this operation');
        }
      }
    } else if (resource === 'stage') {
      if (['get', 'update'].includes(operation)) {
        if (!inputs.stageId) {
          errors.push('stageId is required for this operation');
        }
      }
    } else if (resource === 'product') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.productId) {
          errors.push('productId is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.productName) {
          errors.push('productName is required for create operation');
        }
        if (!inputs.productCode) {
          errors.push('productCode is required for create operation');
        }
      }
    } else if (resource === 'lead') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.leadId) {
          errors.push('leadId is required for this operation');
        }
      }
      if (operation === 'create' && !inputs.leadTitle) {
        errors.push('leadTitle is required for create operation');
      }
    } else if (resource === 'file') {
      if (['download', 'delete'].includes(operation)) {
        if (!inputs.fileId) {
          errors.push('fileId is required for this operation');
        }
      }
      if (operation === 'upload') {
        if (!inputs.fileUrl) {
          errors.push('fileUrl is required for upload operation');
        }
        // Must have at least one association
        if (!inputs.dealId && !inputs.personId && !inputs.orgId && !inputs.activityId) {
          errors.push('At least one association (dealId, personId, orgId, or activityId) is required for upload operation');
        }
      }
    } else if (resource === 'webhook') {
      if (operation === 'create') {
        if (!inputs.event) {
          errors.push('event is required for create operation');
        }
        if (!inputs.subscriptionUrl) {
          errors.push('subscriptionUrl is required for create operation');
        }
      }
      if (operation === 'delete' && !inputs.webhookId) {
        errors.push('webhookId is required for delete operation');
      }
    }

    // Search operations
    if (operation === 'search' && !inputs.searchTerm) {
      errors.push('searchTerm is required for search operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiToken: '',
    resource: 'deal',
    operation: 'list',
    dealId: '',
    dealTitle: '',
    dealValue: 0,
    dealCurrency: 'USD',
    personId: null,
    orgId: null,
    stageId: null,
    pipelineId: null,
    status: 'open',
    expectedCloseDate: '',
    filterId: null,
    sort: '',
    limit: 0,
    start: 0,
    personName: '',
    personEmail: '',
    personPhone: '',
    orgName: '',
    orgAddress: '',
    activityId: null,
    activitySubject: '',
    activityType: 'task',
    dueDate: '',
    startDate: '',
    endDate: '',
    userId: null,
    noteId: null,
    noteContent: '',
    pinnedToDealFlag: false,
    stageName: '',
    dealProbability: null,
    productId: null,
    productName: '',
    productCode: '',
    productUnit: '',
    productTax: 0,
    itemPrice: 0,
    quantity: 1,
    discount: 0,
    duration: 1,
    leadId: null,
    leadTitle: '',
    fileId: '',
    fileUrl: '',
    fileName: '',
    webhookId: null,
    event: '',
    subscriptionUrl: '',
    searchTerm: '',
    searchFields: null,
    exactMatch: false,
    additionalFields: null,
    newTitle: '',
  }),
};
