import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Tally Solutions Node Definition
 *
 * Integration with Tally ERP / TallyPrime via XML API.
 * Supports:
 * - get_ledger: Fetch ledger details from Tally
 * - get_voucher: Fetch voucher data from Tally
 * - create_voucher: Push a new voucher to Tally
 * - get_stock_items: Fetch stock item list
 * - get_company_info: Fetch company information
 *
 * Tally runs locally (default port 9000) and exposes an XML-based API.
 * Ensure Tally is running and ODBC/XML gateway is enabled before use.
 *
 * Execution is delegated to the legacy executor via the registry override
 * (see worker/src/core/registry/overrides/tally.ts).
 */
export const tallyNodeDefinition: NodeDefinition = {
  type: 'tally',
  label: 'Tally Solutions',
  category: 'crm',
  description: 'Interact with Tally ERP / TallyPrime via XML API to fetch or push accounting data',
  icon: 'Database',
  version: 1,

  inputSchema: {
    endpoint: {
      type: 'string',
      description: 'Tally XML API server URL (e.g. http://localhost:9000)',
      required: true,
      default: 'http://localhost:9000',
      validation: (value) => {
        if (typeof value !== 'string') return 'Endpoint must be a string';
        if (value.trim() === '') return 'Endpoint is required';
        return true;
      },
    },
    operation: {
      type: 'string',
      description: 'Tally operation to perform',
      required: true,
      default: 'get_ledger',
      examples: ['get_ledger', 'get_voucher', 'create_voucher', 'get_stock_items', 'get_company_info'],
      validation: (value) => {
        const valid = ['get_ledger', 'get_voucher', 'create_voucher', 'get_stock_items', 'get_company_info'];
        if (!valid.includes(value)) {
          return `Operation must be one of: ${valid.join(', ')}`;
        }
        return true;
      },
    },
    payload: {
      type: 'string',
      description: 'Custom XML request body (overrides the default template for the selected operation)',
      required: false,
      default: '',
    },
    companyName: {
      type: 'string',
      description: 'Tally company name (used to scope requests to a specific company)',
      required: false,
      default: '',
    },
    ledgerName: {
      type: 'string',
      description: 'Ledger name (required for get_ledger operation)',
      required: false,
      default: '',
    },
    voucherId: {
      type: 'string',
      description: 'Voucher ID or number (required for get_voucher operation)',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Tally API response (XML parsed to object, or raw XML string)',
    },
  },

  requiredInputs: ['endpoint', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.endpoint) {
      errors.push('endpoint is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }

    const op = inputs.operation;
    if (op === 'get_ledger' && !inputs.ledgerName && !inputs.payload) {
      errors.push('ledgerName or a custom payload is required for get_ledger operation');
    }
    if (op === 'get_voucher' && !inputs.voucherId && !inputs.payload) {
      errors.push('voucherId or a custom payload is required for get_voucher operation');
    }
    if (op === 'create_voucher' && !inputs.payload) {
      errors.push('payload (XML body) is required for create_voucher operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    endpoint: 'http://localhost:9000',
    operation: 'get_ledger',
    payload: '',
    companyName: '',
    ledgerName: '',
    voucherId: '',
  }),
};
