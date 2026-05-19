import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { overrideAiNodeWithIntentAwareSelection } from './ai-shared';

export function overrideOpenAiGpt(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const inputSchema = { ...def.inputSchema };
  delete inputSchema.apiKey;
  delete inputSchema.token;
  delete inputSchema.messages;

  inputSchema.model = {
    ...(inputSchema.model || {
      type: 'string',
      description: 'OpenAI model to use',
      required: true,
    }),
    required: true,
    default: inputSchema.model?.default || 'gpt-4o-mini',
    examples: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    ui: {
      ...(inputSchema.model?.ui || {}),
      options: [
        { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
        { label: 'GPT-4o', value: 'gpt-4o' },
        { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
        { label: 'GPT-4', value: 'gpt-4' },
        { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
      ],
    },
    ownership: 'value',
  };

  inputSchema.prompt = {
    ...(inputSchema.prompt || {
      type: 'string',
      description: 'User message or prompt to send to OpenAI',
      required: true,
    }),
    required: true,
    default: inputSchema.prompt?.default || '',
    role: 'prompt',
    ownership: 'value',
    fillMode: inputSchema.prompt?.fillMode || {
      default: 'manual_static',
      supportsRuntimeAI: true,
      supportsBuildtimeAI: true,
    },
    helpCategory: inputSchema.prompt?.helpCategory || 'prompt_text',
    ui: {
      ...(inputSchema.prompt?.ui || {}),
      widget: 'textarea',
    },
  };

  const next = overrideAiNodeWithIntentAwareSelection({
    ...def,
    inputSchema,
    requiredInputs: ['model', 'prompt'],
    defaultConfig: () => ({
      model: 'gpt-4o-mini',
      prompt: '',
    }),
    credentialSchema: {
      requirements: [
        {
          provider: 'openai',
          category: 'api_key',
          required: true,
          description: 'OpenAI API key connection',
          scopes: [],
        },
      ],
      credentialFields: [],
    },
    validateConfig: (config) => {
      const errors: string[] = [];
      if (!String(config.model || '').trim()) errors.push("Required field 'model' is missing or empty");
      const legacyMessages = Array.isArray(config.messages) && config.messages.length > 0
        ? JSON.stringify(config.messages)
        : String(config.messages || '');
      if (!String(config.prompt || legacyMessages || '').trim()) {
        errors.push("Required field 'prompt' is missing or empty");
      }
      return { valid: errors.length === 0, errors };
    },
  }, schema);

  return next;
}
