import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { overrideAiNodeWithIntentAwareSelection } from './ai-shared';

export function overrideAiChatModel(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const baseDef = overrideAiNodeWithIntentAwareSelection(def, schema);
  
  // ✅ CRITICAL FIX: Ensure provider is never set to node type
  // Fix provider if it's incorrectly set to "ai_chat_model" or invalid
  const validProviders = ['ollama', 'openai', 'claude', 'gemini', 'anthropic', 'azure'];
  
  const originalDefaultConfig = baseDef.defaultConfig;
  const fixedDefaultConfig = () => {
    const config = originalDefaultConfig();
    // If provider is missing, invalid, or set to node type, default to ollama
    if (!config.provider || 
        config.provider === 'ai_chat_model' || 
        !validProviders.includes(String(config.provider).toLowerCase())) {
      config.provider = 'ollama';
    }
    // Ensure model is set if missing
    if (!config.model) {
      config.model = 'qwen2.5:14b-instruct-q4_K_M';
    }
    return config;
  };
  
  // Also fix in validateConfig to catch this at validation time
  const originalValidateConfig = baseDef.validateConfig;
  const fixedValidateConfig = (config: Record<string, any>) => {
    // Fix provider before validation
    if (config.provider === 'ai_chat_model' || 
        (config.provider && !validProviders.includes(String(config.provider).toLowerCase()))) {
      console.warn(`[ai_chat_model] ⚠️  Invalid provider "${config.provider}" - fixing to "ollama"`);
      config.provider = 'ollama';
    }
    return originalValidateConfig(config);
  };
  
  return {
    ...baseDef,
    defaultConfig: fixedDefaultConfig,
    validateConfig: fixedValidateConfig,
  };
}

