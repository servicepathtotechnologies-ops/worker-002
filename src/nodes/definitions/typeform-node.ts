/**
 * Typeform Node Definition
 *
 * Typeform REST API integration.
 * Supports operations: get_responses, create_form, get_form.
 *
 * Authentication: Bearer token — API key passed in Authorization header.
 * Base URL: https://api.typeform.com
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['get_responses', 'create_form', 'get_form'] as const;

export const typeformNodeDefinition: NodeDefinition = {
  type: 'typeform',
  label: 'Typeform',
  category: 'productivity',
  description: 'Retrieve form responses, create forms, and fetch form definitions using the Typeform REST API.',
  icon: 'FileText',
  version: 1,

  inputSchema: {
    operation: {
      type: 'string',
      description: 'Typeform operation to perform',
      required: true,
      default: 'get_responses',
      examples: ['get_responses', 'create_form', 'get_form'],
      ui: {
        options: [
          { label: 'Get Responses', value: 'get_responses' },
          { label: 'Create Form',   value: 'create_form'   },
          { label: 'Get Form',      value: 'get_form'      },
        ],
      },
    },
    apiKey: {
      type: 'string',
      description: 'Typeform personal access token (used as Bearer token)',
      required: true,
      default: '',
      examples: ['{{$credentials.typeform.apiKey}}'],
    },
    formId: {
      type: 'string',
      description: 'Typeform form ID — required for get_responses and get_form',
      required: false,
      default: '',
      examples: ['{{$json.formId}}', 'abc123'],
    },
    title: {
      type: 'string',
      description: 'Form title — required for create_form',
      required: false,
      default: '',
      examples: ['My New Form', '{{$json.title}}'],
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Typeform API response',
    },
  },

  requiredInputs: ['operation', 'apiKey'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.operation || !VALID_OPERATIONS.includes(inputs.operation as typeof VALID_OPERATIONS[number])) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
      return { valid: false, errors };
    }

    if ((inputs.operation === 'get_responses' || inputs.operation === 'get_form') && !inputs.formId?.trim()) {
      errors.push(`formId is required for ${inputs.operation}`);
    }

    if (inputs.operation === 'create_form' && !inputs.title?.trim()) {
      errors.push('title is required for create_form');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'get_responses',
    apiKey: '',
    formId: '',
    title: '',
  }),
};
