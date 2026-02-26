import type { UnifiedNodeDefinition } from '../types/unified-node-contract';
import type { NodeSchema } from '../../services/nodes/node-library';

import { overrideGoogleGmail } from './overrides/google-gmail';
import { overrideIfElse } from './overrides/if-else';
import { overrideLogOutput } from './overrides/log-output';
import { overrideChatModel } from './overrides/chat-model';
import { overrideDatabaseRead } from './overrides/database-read';
import { overrideDatabaseWrite } from './overrides/database-write';
import { overrideAiAgent } from './overrides/ai-agent';
import { overrideAiChatModel } from './overrides/ai-chat-model';
import { overrideOllama } from './overrides/ollama';
import { overrideOpenAiGpt } from './overrides/openai-gpt';
import { overrideAnthropicClaude } from './overrides/anthropic-claude';
import { overrideGoogleGemini } from './overrides/google-gemini';

type OverrideFn = (def: UnifiedNodeDefinition, schema: NodeSchema) => UnifiedNodeDefinition;

const overridesByType: Record<string, OverrideFn> = {
  google_gmail: overrideGoogleGmail,
  if_else: overrideIfElse,
  log_output: overrideLogOutput,
  chat_model: overrideChatModel,
  database_read: overrideDatabaseRead,
  database_write: overrideDatabaseWrite,
  ai_agent: overrideAiAgent,
  ai_chat_model: overrideAiChatModel,
  ollama: overrideOllama,
  openai_gpt: overrideOpenAiGpt,
  anthropic_claude: overrideAnthropicClaude,
  google_gemini: overrideGoogleGemini,
};

/**
 * Apply per-node overrides to a base unified definition.
 * This keeps UnifiedNodeRegistry generic and pushes node-specific behavior into one file per node.
 */
export function applyNodeDefinitionOverrides(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const fn = overridesByType[schema.type];
  if (!fn) return def;
  return fn(def, schema);
}

