/**
 * Calendly Node Definition
 *
 * Calendly scheduling API integration.
 * Supports: Get Events, Get Event Types, Get Scheduled Events, Get User.
 *
 * Authentication: Personal Access Token (Bearer).
 */

import { NodeDefinition } from '../../core/types/node-definition';

export const calendlyNodeDefinition: NodeDefinition = {
  type: 'calendly',
  label: 'Calendly',
  category: 'productivity',
  description: 'Fetch events, event types, scheduled meetings, and user info from Calendly.',
  icon: 'Calendar',
  version: 1,

  inputSchema: {
    accessToken: {
      type: 'string',
      description: 'Calendly personal access token',
      required: true,
      default: '',
    },
    operation: {
      type: 'string',
      description: 'Action to perform',
      required: true,
      default: 'get_events',
      ui: {
        options: [
          { label: 'Get Events', value: 'get_events' },
          { label: 'Get Event Types', value: 'get_event_types' },
          { label: 'Get Scheduled Events', value: 'get_scheduled_events' },
          { label: 'Get User', value: 'get_user' },
        ],
      },
    },
    userUri: {
      type: 'string',
      description: 'Calendly user URI (required for get_event_types and get_scheduled_events)',
      required: false,
      default: '',
      examples: ['https://api.calendly.com/users/XXXXX'],
    },
    eventTypeUri: {
      type: 'string',
      description: 'Calendly event type URI (optional filter)',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Calendly operation result',
    },
  },

  requiredInputs: ['accessToken', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.accessToken?.trim()) errors.push('accessToken is required');
    if (!inputs.operation) errors.push('operation is required');
    const validOps = ['get_events', 'get_event_types', 'get_scheduled_events', 'get_user'];
    if (inputs.operation && !validOps.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOps.join(', ')}`);
    }
    if (['get_event_types', 'get_scheduled_events'].includes(inputs.operation) && !inputs.userUri?.trim()) {
      errors.push('userUri is required for get_event_types and get_scheduled_events');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    accessToken: '',
    operation: 'get_events',
    userUri: '',
    eventTypeUri: '',
  }),
};
