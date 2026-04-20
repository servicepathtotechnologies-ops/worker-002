/**
 * Claude Node Definition
 *
 * Anthropic Claude AI API integration.
 * Sends prompts to the Claude Messages API and returns generated text.
 *
 * Authentication: API key passed as x-api-key header.
 * Base URL: https://api.anthropic.com/v1/messages
 * Supported models: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5,
 *   claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
] as const;

export const claudeNodeDefinition: NodeDefinition = {
  type: 'claude',
  label: 'Claude',
  category: 'ai',
  description: 'Send prompts to Anthropic Claude and generate AI text responses within your workflows.',
  icon: 'Bot',
  version: 1,

  inputSchema: {
    // ── Auth ─────────────────────────────────────────────────────────────────
    apiKey: {
      type: 'string',
      description: 'Anthropic API key (x-api-key header)',
      required: false,
      default: '',
      examples: ['{{$credentials.anthropic.apiKey}}'],
    },
    // ── Model ────────────────────────────────────────────────────────────────
    model: {
      type: 'string',
      description: 'Claude model identifier to use for inference',
      required: true,
      default: 'claude-sonnet-4-5',
      examples: VALID_MODELS as unknown as string[],
      ui: {
        options: [
          { label: 'Claude Opus 4.5',    value: 'claude-opus-4-5' },
          { label: 'Claude Sonnet 4.5',  value: 'claude-sonnet-4-5' },
          { label: 'Claude Haiku 4.5',   value: 'claude-haiku-4-5' },
          { label: 'Claude 3.5 Sonnet',  value: 'claude-3-5-sonnet-20241022' },
          { label: 'Claude 3.5 Haiku',   value: 'claude-3-5-haiku-20241022' },
          { label: 'Claude 3 Opus',      value: 'claude-3-opus-20240229' },
        ],
      },
    },
    // ── Prompt ───────────────────────────────────────────────────────────────
    prompt: {
      type: 'string',
      description: 'User message / prompt to send to Claude',
      required: true,
      default: '',
      examples: ['Summarize the following text: {{$json.text}}'],
    },
    systemPrompt: {
      type: 'string',
      description: 'Optional system prompt that sets the assistant behavior and persona',
      required: false,
      default: '',
      examples: ['You are a helpful assistant that responds concisely.'],
    },
    // ── Generation parameters ─────────────────────────────────────────────────
    maxTokens: {
      type: 'number',
      description: 'Maximum number of tokens to generate in the response (must be ≥ 1)',
      required: false,
      default: 1024,
    },
    temperature: {
      type: 'number',
      description: 'Sampling temperature in the range [0, 1]. Lower values are more deterministic.',
      required: false,
      default: 1,
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'True if the API call succeeded',
    },
    model: {
      type: 'string',
      description: 'Echoed model identifier used for the request',
    },
    content: {
      type: 'string',
      description: 'Generated text content from Claude',
    },
    inputTokens: {
      type: 'number',
      description: 'Number of input tokens consumed (usage.input_tokens)',
    },
    outputTokens: {
      type: 'number',
      description: 'Number of output tokens generated (usage.output_tokens)',
    },
    stopReason: {
      type: 'string',
      description: 'Reason the generation stopped (e.g. end_turn, max_tokens)',
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

    // model validation
    if (!inputs.model) {
      errors.push('model is required');
    } else if (!VALID_MODELS.includes(inputs.model as typeof VALID_MODELS[number])) {
      errors.push(`model must be one of: ${VALID_MODELS.join(', ')}`);
    }

    // prompt validation
    if (!inputs.prompt || !inputs.prompt.trim()) {
      errors.push('prompt is required and must not be empty or whitespace');
    }

    // temperature validation (optional — only checked when provided)
    if (inputs.temperature !== undefined && inputs.temperature !== null) {
      if (typeof inputs.temperature !== 'number' || inputs.temperature < 0 || inputs.temperature > 1) {
        errors.push('temperature must be between 0 and 1');
      }
    }

    // maxTokens validation (optional — only checked when provided)
    if (inputs.maxTokens !== undefined && inputs.maxTokens !== null) {
      if (typeof inputs.maxTokens !== 'number' || inputs.maxTokens < 1) {
        errors.push('maxTokens must be at least 1');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiKey: '',
    model: 'claude-sonnet-4-5',
    prompt: '',
    systemPrompt: '',
    maxTokens: 1024,
    temperature: 1,
  }),
};
