/**
 * ✅ LANGCHAIN NODE - Migrated to Registry
 *
 * LangChain AI orchestration integration — chains, agents, LLM pipelines via OpenAI or Anthropic.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideLangchain(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(
      new Set([
        ...(def.tags || []),
        'langchain',
        'ai',
        'llm',
        'chain',
        'agent',
        'openai',
        'anthropic',
        'api',
      ])
    ),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
