import { NodeDefinition } from '../../core/types/node-definition';

export const javascriptNodeDefinition: NodeDefinition = {
  type: 'javascript',
  label: 'JavaScript',
  category: 'logic',
  description: 'Execute JavaScript code',
  icon: 'Code',
  version: 1,

  inputSchema: {
    code: {
      type: 'string',
      description: 'JavaScript code to execute',
      required: true,
      default: '',
      validation: (value) => {
        if (typeof value !== 'string') {
          return 'Code must be a string';
        }
        if (value.trim() === '') {
          return 'Code cannot be empty';
        }
        return true;
      },
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Result of JavaScript execution',
    },
  },

  requiredInputs: ['code'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.code || typeof inputs.code !== 'string' || inputs.code.trim() === '') {
      errors.push('code field is required and cannot be empty');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    code: '',
  }),
};
