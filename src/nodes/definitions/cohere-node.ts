/**
 * Cohere Node Definition
 *
 * Cohere AI API integration.
 * Sends prompts to the Cohere Chat API and returns generated text.
 *
 * Authentication: Bearer token (Authorization: Bearer <apiKey>)
 * Base URL: https://api.cohere.com/v1/chat
 * Supported models: command, command-light, command-r, command-r-plus
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_MODELS = [
  'command-r7b-12-2024',
  'command-r-08-2024',
  'command-r-plus-08-2024',
  'command-nightly',
] as const;

export const cohereNodeDefinition: NodeDefinition = {
  type: 'cohere',
  label: 'Cohere',
  category: 'ai',
  description: 'Send prompts to Cohere Command models and generate AI text responses within your workflows.',
  icon: 'MessageSquare',
  version: 1,

  inputSchema: {
    apiKey: {
      type: 'string',
      description: 'Cohere API key (Bearer token)',
      required: false,
      default: '',
      examples: ['{{$credentials.cohere.apiKey}}'],
    },
    model: {
      type: 'string',
      description: 'Cohere model to use for generation',
      required: true,
      default: 'command-r-08-2024',
      examples: VALID_MODELS as unknown as string[],
      ui: {
        options: [
          { label: 'Command R7B (fast)',    value: 'command-r7b-12-2024' },
          { label: 'Command R (balanced)',  value: 'command-r-08-2024' },
          { label: 'Command R+ (powerful)', value: 'command-r-plus-08-2024' },
          { label: 'Command Nightly (dev)', value: 'command-nightly' },
        ],
      },
    },
    prompt: {
      type: 'string',
      description: 'User message / prompt to send to Cohere',
      required: true,
      default: '',
      examples: ['Summarize the following: {{$json.text}}'],
    },
    preamble: {
      type: 'string',
      description: 'System-level instruction that sets the assistant persona (preamble)',
      required: false,
      default: '',
      examples: ['You are a helpful assistant that responds concisely.'],
    },
    temperature: {
      type: 'number',
      description: 'Sampling temperature [0, 2]. Lower = more deterministic. Default: 0.7',
      required: false,
      default: 0.7,
    },
    maxTokens: {
      type: 'number',
      description: 'Maximum tokens to generate in the response',
      required: false,
      default: 1024,
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'True if the API call succeeded',
    },
    response: {
      type: 'string',
      description: 'Generated text content from Cohere',
    },
    model: {
      type: 'string',
      description: 'Echoed model identifier used for the request',
    },
    finishReason: {
      type: 'string',
      description: 'Reason the generation stopped (COMPLETE, MAX_TOKENS, etc.)',
    },
    inputTokens: {
      type: 'number',
      description: 'Number of input tokens consumed',
    },
    outputTokens: {
      type: 'number',
      description: 'Number of output tokens generated',
    },
    error: {
      type: 'string',
      description: 'Error message if success is false',
    },
  },

  requiredInputs: ['model', 'prompt'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.model) {
      errors.push('model is required');
    } else if (!VALID_MODELS.includes(inputs.model as typeof VALID_MODELS[number])) {
      errors.push(`model must be one of: ${VALID_MODELS.join(', ')}`);
    }

    if (!inputs.prompt || !String(inputs.prompt).trim()) {
      errors.push('prompt is required and must not be empty');
    }

    if (inputs.temperature !== undefined && inputs.temperature !== null) {
      if (typeof inputs.temperature !== 'number' || inputs.temperature < 0 || inputs.temperature > 2) {
        errors.push('temperature must be between 0 and 2');
      }
    }

    if (inputs.maxTokens !== undefined && inputs.maxTokens !== null) {
      if (typeof inputs.maxTokens !== 'number' || inputs.maxTokens < 1) {
        errors.push('maxTokens must be at least 1');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiKey: '',
    model: 'command-r-08-2024',
    prompt: '',
    preamble: '',
    temperature: 0.7,
    maxTokens: 1024,
  }),
};
