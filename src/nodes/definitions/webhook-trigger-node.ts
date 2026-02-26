import { NodeDefinition } from '../../core/types/node-definition';

export const webhookTriggerNodeDefinition: NodeDefinition = {
  type: 'webhook',
  label: 'Webhook',
  category: 'triggers',
  description: 'Trigger workflow via webhook',
  icon: 'Webhook',
  version: 1,

  inputSchema: {
    method: {
      type: 'string',
      description: 'HTTP method',
      required: false,
      default: 'POST',
      validation: (value) => {
        if (value && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(value)) {
          return 'Method must be one of: GET, POST, PUT, DELETE, PATCH';
        }
        return true;
      },
    },
    path: {
      type: 'string',
      description: 'Webhook path (auto-generated if not provided)',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Webhook payload (body, headers, query)',
    },
  },

  requiredInputs: [],
  outgoingPorts: ['default'],
  incomingPorts: [],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (inputs.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(inputs.method)) {
      errors.push('method must be one of: GET, POST, PUT, DELETE, PATCH');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    method: 'POST',
    path: '',
  }),
};
