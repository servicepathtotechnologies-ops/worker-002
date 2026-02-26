import { NodeDefinition } from '../../core/types/node-definition';

export const httpRequestNodeDefinition: NodeDefinition = {
  type: 'http_request',
  label: 'HTTP Request',
  category: 'http_api',
  description: 'Make HTTP request',
  icon: 'Globe',
  version: 1,

  inputSchema: {
    url: {
      type: 'string',
      description: 'Request URL',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'URL must be a string';
        }
        if (value.trim() === '') {
          return 'URL is required';
        }
        try {
          new URL(value);
        } catch {
          return 'URL must be a valid URL format';
        }
        return true;
      },
    },
    method: {
      type: 'string',
      description: 'HTTP method',
      required: true,
      default: 'GET',
      validation: (value) => {
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(value)) {
          return 'Method must be one of: GET, POST, PUT, DELETE, PATCH';
        }
        return true;
      },
    },
    headers: {
      type: 'object',
      description: 'HTTP headers (JSON object)',
      required: false,
      default: {},
      validation: (value) => {
        if (value && typeof value !== 'object') {
          return 'Headers must be an object';
        }
        return true;
      },
    },
    body: {
      type: 'json',
      description: 'Request body (JSON)',
      required: false,
      default: null,
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'HTTP response (status, data, headers)',
    },
  },

  requiredInputs: ['url', 'method'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.url || typeof inputs.url !== 'string' || inputs.url.trim() === '') {
      errors.push('url field is required');
    } else {
      try {
        new URL(inputs.url);
      } catch {
        errors.push('url must be a valid URL format');
      }
    }
    if (!inputs.method || !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(inputs.method)) {
      errors.push('method must be one of: GET, POST, PUT, DELETE, PATCH');
    }
    if (inputs.headers && typeof inputs.headers !== 'object') {
      errors.push('headers must be an object');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    url: '',
    method: 'GET',
    headers: {},
    body: null,
  }),
};
