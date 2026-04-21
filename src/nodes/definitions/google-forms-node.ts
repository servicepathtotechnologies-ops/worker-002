/**
 * Google Forms Node Definition
 *
 * Google Forms API integration.
 * Supports operations: get_responses, create_form, get_form.
 *
 * Authentication: OAuth 2.0 access token passed in Authorization header.
 * Base URL: https://forms.googleapis.com/v1/forms
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['get_responses', 'create_form', 'get_form'] as const;

export const googleFormsNodeDefinition: NodeDefinition = {
  type: 'google_forms',
  label: 'Google Forms',
  category: 'google',
  description: 'Create Google Forms and fetch responses using the Google Forms API.',
  icon: 'FileText',
  version: 1,

  inputSchema: {
    operation: {
      type: 'string',
      description: 'Google Forms operation to perform',
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
    accessToken: {
      type: 'string',
      description: 'Google OAuth 2.0 access token',
      required: true,
      default: '',
      examples: ['{{$credentials.google.accessToken}}'],
    },
    formId: {
      type: 'string',
      description: 'Google Form ID — required for get_responses and get_form',
      required: false,
      default: '',
      examples: ['{{$json.formId}}', '1FAIpQLSe...'],
    },
    title: {
      type: 'string',
      description: 'Form title — required for create_form',
      required: false,
      default: '',
      examples: ['My Survey', '{{$json.title}}'],
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Google Forms API response',
    },
  },

  requiredInputs: ['operation', 'accessToken'],
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
    accessToken: '',
    formId: '',
    title: '',
  }),
};
