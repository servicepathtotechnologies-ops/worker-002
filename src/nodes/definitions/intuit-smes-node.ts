import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Intuit SME Node Definition
 *
 * Integration with Intuit APIs for SME financial and customer operations:
 * - getCustomers: Fetch customer list
 * - createCustomer: Create a new customer record
 * - updateCustomer: Update an existing customer record
 * - getInvoices: Fetch invoice list
 * - createInvoice: Create a new invoice
 *
 * Execution is delegated to the legacy executor via the registry override
 * (see worker/src/core/registry/overrides/intuit-smes.ts).
 */
export const intuitSmesNodeDefinition: NodeDefinition = {
  type: 'intuit_smes',
  label: "Intuit - SME'S",
  category: 'crm',
  description: 'Manage SME customer data and financial operations via Intuit APIs',
  icon: 'Building2',
  version: 1,

  inputSchema: {
    apiKey: {
      type: 'string',
      description: 'Intuit API Key or OAuth2 Access Token (required for authentication)',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') return 'API Key must be a string';
        if (value.trim() === '') return 'API Key is required';
        return true;
      },
    },
    accessToken: {
      type: 'string',
      description: 'Intuit OAuth2 Access Token (alternative to API key)',
      required: false,
      default: '',
    },
    credentialId: {
      type: 'string',
      description: 'Credential ID reference to stored Intuit credentials',
      required: false,
      default: '',
    },
    operation: {
      type: 'string',
      description: 'Intuit SME operation to perform',
      required: true,
      default: 'getCustomers',
      examples: ['getCustomers', 'createCustomer', 'updateCustomer', 'getInvoices', 'createInvoice'],
      validation: (value) => {
        const valid = ['getCustomers', 'createCustomer', 'updateCustomer', 'getInvoices', 'createInvoice'];
        if (!valid.includes(value)) {
          return `Operation must be one of: ${valid.join(', ')}`;
        }
        return true;
      },
    },
    customerId: {
      type: 'string',
      description: 'Customer ID (required for customer-specific operations)',
      required: false,
      default: '',
    },
    name: {
      type: 'string',
      description: 'Customer name (for createCustomer operation)',
      required: false,
      default: '',
    },
    email: {
      type: 'string',
      description: 'Customer email address (for createCustomer operation)',
      required: false,
      default: '',
    },
    amount: {
      type: 'number',
      description: 'Invoice amount (for createInvoice operation)',
      required: false,
      default: 0,
    },
    data: {
      type: 'json',
      description: 'Additional data for create/update operations (JSON object)',
      required: false,
      default: null,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Intuit SME operation result (varies by operation)',
    },
  },

  requiredInputs: ['apiKey', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.apiKey && !inputs.accessToken && !inputs.credentialId) {
      errors.push('apiKey, accessToken, or credentialId is required for authentication');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }

    const op = inputs.operation;
    if (op === 'updateCustomer' && !inputs.customerId) {
      errors.push('customerId is required for updateCustomer operation');
    }
    if (op === 'createCustomer' && !inputs.name) {
      errors.push('name is required for createCustomer operation');
    }
    if (op === 'createInvoice' && (!inputs.amount && inputs.amount !== 0)) {
      errors.push('amount is required for createInvoice operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiKey: '',
    accessToken: '',
    credentialId: '',
    operation: 'getCustomers',
    customerId: '',
    name: '',
    email: '',
    amount: 0,
    data: null,
  }),
};
