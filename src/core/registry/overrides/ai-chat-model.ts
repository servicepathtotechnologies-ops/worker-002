import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { overrideAiNodeWithIntentAwareSelection } from './ai-shared';

export function overrideAiChatModel(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const baseDef = overrideAiNodeWithIntentAwareSelection(def, schema);
  
  // ✅ MIGRATED: Always use Gemini 3.5 Flash (uses GEMINI_API_KEY)
  // Provider/model selection removed - no longer needed
  const originalDefaultConfig = baseDef.defaultConfig;
  const fixedDefaultConfig = () => {
    const config = originalDefaultConfig();
    // Always use Gemini 3.5 Flash
    config.provider = 'gemini';
    config.model = 'gemini-3.5-flash';
    return config;
  };
  
  // Remove provider/model validation - they're always set to Gemini
  const originalValidateConfig = baseDef.validateConfig;
  const fixedValidateConfig = (config: Record<string, any>) => {
    // Ensure provider/model are set to Gemini (for backward compatibility)
    config.provider = 'gemini';
    config.model = 'gemini-3.5-flash';
    return originalValidateConfig(config);
  };
  
  return {
    ...baseDef,
    defaultConfig: fixedDefaultConfig,
    validateConfig: fixedValidateConfig,
  };
}

