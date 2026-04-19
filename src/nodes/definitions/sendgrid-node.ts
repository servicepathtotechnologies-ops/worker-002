import { NodeDefinition } from '../../core/types/node-definition';

export const sendgridNodeDefinition: NodeDefinition = {
  type: 'sendgrid',
  label: 'SendGrid',
  category: 'output',
  description: 'Send transactional emails using the SendGrid API.',
  icon: 'Mail',
  version: 1,

  inputSchema: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'SendGrid API key',
      default: '',
    },
    from: {
      type: 'string',
      required: true,
      description: 'Sender email address (must be verified in SendGrid)',
      default: '',
    },
    to: {
      type: 'string',
      required: true,
      description: 'Recipient email address(es)',
      default: '',
    },
    subject: {
      type: 'string',
      required: false,
      description: 'Email subject line',
      default: '',
    },
    text: {
      type: 'string',
      required: false,
      description: 'Plain text body of the email',
      default: '',
    },
    html: {
      type: 'string',
      required: false,
      description: 'HTML body of the email',
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'SendGrid send response',
    },
  },

  requiredInputs: ['apiKey', 'from', 'to'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.apiKey || typeof inputs.apiKey !== 'string' || inputs.apiKey.trim() === '') {
      errors.push('apiKey is required');
    }
    if (!inputs.from || typeof inputs.from !== 'string' || inputs.from.trim() === '') {
      errors.push('from email is required');
    }
    if (!inputs.to || typeof inputs.to !== 'string' || inputs.to.trim() === '') {
      errors.push('to email is required');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiKey: '',
    from: '',
    to: '',
    subject: '',
    text: '',
    html: '',
  }),
};
