/**
 * LangChain Node Definition
 *
 * LangChain AI orchestration integration.
 * Supports two execution modes: run_chain (sequential LLM pipeline) and
 * run_agent (tool-using reasoning agent).
 *
 * Supported LLM providers: openai, anthropic.
 * Output shape: { success, response, steps, error }
 *
 * Note: The `run` field is intentionally omitted — execution is handled
 * entirely by the registry override via executeViaLegacyExecutor.
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['run_chain', 'run_agent'] as const;
const VALID_PROVIDERS = ['openai', 'anthropic'] as const;

export const langchainNodeDefinition: NodeDefinition = {
  type: 'langchain',
  label: 'LangChain',
  category: 'ai',
  description: 'Orchestrate AI chains and agents using LangChain with configurable LLM providers, prompts, tools, and memory within your workflows.',
  icon: 'Bot',
  version: 1,

  inputSchema: {
    // ── Operation ─────────────────────────────────────────────────────────────
    operation: {
      type: 'string',
      description: 'LangChain execution mode: run_chain for sequential LLM pipeline, run_agent for tool-using reasoning agent',
      required: true,
      default: 'run_chain',
      examples: ['run_chain', 'run_agent'],
      ui: {
        options: [
          { label: 'Run Chain', value: 'run_chain' },
          { label: 'Run Agent', value: 'run_agent' },
        ],
      },
    },
    // ── Provider ──────────────────────────────────────────────────────────────
    provider: {
      type: 'string',
      description: 'LLM provider to use for chain or agent execution',
      required: false,
      default: 'openai',
      examples: ['openai', 'anthropic'],
      ui: {
        options: [
          { label: 'OpenAI',             value: 'openai' },
          { label: 'Anthropic / Claude', value: 'anthropic' },
        ],
      },
    },
    // ── Prompt ────────────────────────────────────────────────────────────────
    prompt: {
      type: 'string',
      description: 'Input prompt or task description for the chain or agent',
      required: true,
      default: '',
      examples: ['Summarize the following text: {{$json.text}}'],
    },
    // ── Tools ─────────────────────────────────────────────────────────────────
    tools: {
      type: 'array',
      description: 'JSON array of tool definitions available to the agent (run_agent mode)',
      required: false,
      default: [],
      examples: ['[{"name": "search", "description": "Search the web"}]'],
    },
    // ── Memory ────────────────────────────────────────────────────────────────
    memory: {
      type: 'boolean',
      description: 'Enable memory to retain conversation context across chain steps',
      required: false,
      default: false,
    },
    // ── Auth ──────────────────────────────────────────────────────────────────
    apiKey: {
      type: 'string',
      description: 'API key for the selected LLM provider',
      required: false,
      default: '',
      examples: ['{{$credentials.openai.apiKey}}', '{{$credentials.anthropic.apiKey}}'],
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'True if the chain or agent execution succeeded',
    },
    response: {
      type: 'string',
      description: 'Final text output from the chain or agent',
    },
    steps: {
      type: 'array',
      description: 'Intermediate reasoning steps (populated in run_agent mode)',
    },
    error: {
      type: 'object',
      description: 'Error details if success is false',
    },
  },

  requiredInputs: ['operation', 'prompt'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // operation validation
    if (!inputs.operation) {
      errors.push('operation is required');
    } else if (!VALID_OPERATIONS.includes(inputs.operation as typeof VALID_OPERATIONS[number])) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
    }

    // prompt validation
    if (!inputs.prompt || !inputs.prompt.trim()) {
      errors.push('prompt is required and must not be empty or whitespace');
    }

    // provider validation (optional — only checked when provided)
    if (inputs.provider !== undefined && inputs.provider !== null && inputs.provider !== '') {
      if (!VALID_PROVIDERS.includes(inputs.provider as typeof VALID_PROVIDERS[number])) {
        errors.push(`provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
      }
    }

    // tools validation (optional — only checked when provided)
    if (inputs.tools !== undefined && inputs.tools !== null) {
      if (!Array.isArray(inputs.tools)) {
        errors.push('tools must be a valid JSON array');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'run_chain',
    provider: 'openai',
    prompt: '',
    tools: [],
    memory: false,
    apiKey: '',
  }),
};
