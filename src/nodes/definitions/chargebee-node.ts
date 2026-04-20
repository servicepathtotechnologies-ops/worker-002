/**
 * Chargebee Node Definition
 *
 * Chargebee subscription billing API integration.
 * Supports operations: create_customer, create_subscription, get_customer, cancel_subscription.
 *
 * Authentication: HTTP Basic Auth — API key as username, empty password.
 * Base URL: https://{site}.chargebee.com/api/v2
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['create_customer', 'create_subscription', 'get_customer', 'cancel_subscription'] as const;

export const chargebeeNodeDefinition: NodeDefinition = {
  type: 'chargebee',
  label: 'Chargebee',
  category: 'payment',
  description: 'Create customers, manage subscriptions, and automate billing workflows using the Chargebee subscription billing API.',
  icon: 'CreditCard',
  version: 1,

  inputSchema: {
    operation: {
      type: 'string',
      description: 'Billing operation to perform',
      required: true,
      default: 'create_customer',
      examples: ['create_customer', 'create_subscription', 'get_customer', 'cancel_subscription'],
      ui: {
        options: [
          { label: 'Create Customer', value: 'create_customer' },
          { label: 'Create Subscription', value: 'create_subscription' },
          { label: 'Get Customer', value: 'get_customer' },
          { label: 'Cancel Subscription', value: 'cancel_subscription' },
        ],
      },
    },
    apiKey: {
      type: 'string',
      description: 'Chargebee API key (used as Basic Auth username)',
      required: true,
      default: '',
      examples: ['{{$credentials.chargebee.apiKey}}'],
    },
    site: {
      type: 'string',
      description: 'Chargebee site name (subdomain), e.g. your-company',
      required: true,
      default: '',
      examples: ['your-company', '{{$credentials.chargebee.site}}'],
    },
    customerId: {
      type: 'string',
      description: 'Customer ID — required for create_subscription, get_customer, cancel_subscription',
      required: false,
      default: '',
      examples: ['{{$json.customerId}}'],
    },
    email: {
      type: 'string',
      description: 'Customer email address — required for create_customer',
      required: false,
      default: '',
      examples: ['{{$json.email}}'],
    },
    planId: {
      type: 'string',
      description: 'Plan / item price ID — required for create_subscription',
      required: false,
      default: '',
      examples: ['{{$json.planId}}'],
    },
    subscriptionId: {
      type: 'string',
      description: 'Subscription ID — required for cancel_subscription',
      required: false,
      default: '',
      examples: ['{{$json.subscriptionId}}'],
    },
  },

  outputSchema: {
    success: { type: 'boolean', description: 'True if the API call succeeded' },
    operation: { type: 'string', description: 'Echoed operation name' },
    customer: { type: 'object', description: 'Customer object returned by Chargebee' },
    subscription: { type: 'object', description: 'Subscription object returned by Chargebee' },
    customerId: { type: 'string', description: 'ID of the created or retrieved customer' },
    subscriptionId: { type: 'string', description: 'ID of the created or cancelled subscription' },
    error: { type: 'string', description: 'Error message if success is false' },
  },

  requiredInputs: ['operation', 'apiKey', 'site'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.operation || !VALID_OPERATIONS.includes(inputs.operation as typeof VALID_OPERATIONS[number])) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
      return { valid: false, errors };
    }

    if (inputs.operation === 'create_customer' && !inputs.email?.trim()) {
      errors.push('email is required for create_customer');
    }

    if (inputs.operation === 'create_subscription' && !inputs.customerId?.trim()) {
      errors.push('customerId is required for create_subscription');
    }

    if (inputs.operation === 'create_subscription' && !inputs.planId?.trim()) {
      errors.push('planId is required for create_subscription');
    }

    if (inputs.operation === 'get_customer' && !inputs.customerId?.trim()) {
      errors.push('customerId is required for get_customer');
    }

    if (inputs.operation === 'cancel_subscription' && !inputs.subscriptionId?.trim()) {
      errors.push('subscriptionId is required for cancel_subscription');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'create_customer',
    apiKey: '',
    site: '',
    customerId: '',
    email: '',
    planId: '',
    subscriptionId: '',
  }),
};
