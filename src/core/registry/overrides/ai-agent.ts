import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideAiAgent(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const nextInputSchema = { ...def.inputSchema };
  const userInputDef = nextInputSchema.userInput || {
    type: 'string',
    description: 'User input or prompt for the AI agent',
    required: false,
  };
  const chatModelDef = nextInputSchema.chat_model || {
    type: 'object',
    description: 'Optional chat model configuration',
    required: false,
  };
  const memoryDef = nextInputSchema.memory || {
    type: 'object',
    description: 'Optional memory context',
    required: false,
  };
  const toolDef = nextInputSchema.tool || {
    type: 'object',
    description: 'Optional tool context',
    required: false,
  };

  nextInputSchema.userInput = { ...userInputDef, required: false };
  nextInputSchema.chat_model = {
    ...chatModelDef,
    required: false,
    default: (chatModelDef as any).default || { provider: 'gemini', model: 'gemini-2.5-flash' },
  };
  nextInputSchema.memory = { ...memoryDef, required: false };
  nextInputSchema.tool = { ...toolDef, required: false };

  return {
    ...def,
    inputSchema: nextInputSchema,
    // Make AI Agent work as a normal AI service node: only text input is needed at runtime.
    requiredInputs: [],
    execute: async (context) => {
      const raw = context.rawInput;
      const rawObj = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};

      const resolvedUserInput =
        (typeof context.inputs?.userInput === 'string' && context.inputs.userInput) ||
        (typeof rawObj.message === 'string' && rawObj.message) ||
        (typeof rawObj.text === 'string' && rawObj.text) ||
        (typeof rawObj.input === 'string' && rawObj.input) ||
        (typeof raw === 'string' ? raw : '') ||
        '';

      const mergedInputs = {
        ...context.inputs,
        userInput: resolvedUserInput,
        chat_model: context.inputs?.chat_model || context.config?.chat_model || { provider: 'gemini', model: 'gemini-2.5-flash' },
      };

      // Keep memory/tool optional and disabled by default to avoid missing-field failures.
      const mergedConfig = {
        ...context.config,
        enableMemory: context.config?.enableMemory ?? false,
        enableTools: context.config?.enableTools ?? false,
      };

      return await executeViaLegacyExecutor({
        context: {
          ...context,
          config: mergedConfig,
          inputs: mergedInputs,
        },
        schema,
      });
    },
  };
}

