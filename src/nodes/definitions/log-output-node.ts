import { NodeDefinition } from '../../core/types/node-definition';

export const logOutputNodeDefinition: NodeDefinition = {
  type: 'log_output',
  label: 'Log Output',
  category: 'utility',
  description: 'Log output to console',
  icon: 'FileText',
  version: 1,

  inputSchema: {
    message: {
      type: 'string',
      description: 'Message to log',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'Message must be a string';
        }
        if (value.trim() === '') {
          return 'Message cannot be empty';
        }
        return true;
      },
    },
    level: {
      type: 'string',
      description: 'Log level',
      required: false,
      default: 'info',
      validation: (value) => {
        if (value && !['info', 'warn', 'error', 'debug'].includes(value)) {
          return 'level must be one of: info, warn, error, debug';
        }
        return true;
      },
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Logging result',
    },
  },

  requiredInputs: ['message'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.message || typeof inputs.message !== 'string' || inputs.message.trim() === '') {
      errors.push('message field is required');
    }
    if (inputs.level && !['info', 'warn', 'error', 'debug'].includes(inputs.level)) {
      errors.push('level must be one of: info, warn, error, debug');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    message: '',
    level: 'info',
  }),
};
