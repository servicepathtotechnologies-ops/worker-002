import { NodeDefinition } from '../../core/types/node-definition';

export const intervalTriggerNodeDefinition: NodeDefinition = {
  type: 'interval',
  label: 'Interval',
  category: 'triggers',
  description: 'Trigger workflow at intervals',
  icon: 'Timer',
  version: 1,

  inputSchema: {
    interval: {
      type: 'string',
      description: 'Interval in seconds (s), minutes (m), or hours (h)',
      required: true,
      default: '10m',
      validation: (value) => {
        if (!value || typeof value !== 'string') {
          return 'Interval is required';
        }
        const intervalRegex = /^(\d+)(s|m|h)$/;
        if (!intervalRegex.test(value)) {
          return 'Interval must be in format: <number><unit> (e.g., 30s, 5m, 1h)';
        }
        return true;
      },
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Interval trigger output',
    },
  },

  requiredInputs: ['interval'],
  outgoingPorts: ['default'],
  incomingPorts: [],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.interval || typeof inputs.interval !== 'string') {
      errors.push('interval field is required');
    } else {
      const intervalRegex = /^(\d+)(s|m|h)$/;
      if (!intervalRegex.test(inputs.interval)) {
        errors.push('interval must be in format: <number><unit> (e.g., 30s, 5m, 1h)');
      }
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    interval: '10m',
  }),
};
