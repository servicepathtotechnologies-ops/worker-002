import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

/**
 * ✅ UNIVERSAL FIX: Log Output Node Override
 * 
 * Ensures log_output node:
 * 1. Has proper default config (level: 'info', message: AI-generated)
 * 2. Executes via legacy executor (simple logging logic)
 * 3. Is properly registered in registry
 */
export function overrideLogOutput(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  // ✅ CRITICAL: Ensure default config includes level
  const originalDefaultConfig = def.defaultConfig;
  const enhancedDefaultConfig = () => {
    const config = originalDefaultConfig();
    // Ensure level defaults to 'info' if not set
    if (!config.level) {
      config.level = 'info';
    }
    // Message will be AI-generated at runtime by AI Input Resolver
    // Leave empty so AI can generate it from previous node output
    if (!config.message) {
      config.message = ''; // AI Input Resolver will fill this
    }
    return config;
  };

  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'output', 'sink', 'terminal', 'logging'])),
    defaultConfig: enhancedDefaultConfig,
    // ✅ UNIVERSAL: Define workflow-level behavior in registry (single source of truth)
    // This ensures log_output is always included and always terminal for ALL workflows
    workflowBehavior: {
      alwaysRequired: true,        // Always include in workflows (auto-included even if not in intent)
      alwaysTerminal: true,         // Must be last node (no outgoing edges)
      exemptFromRemoval: true,      // Minimal policy can't remove it
      autoInject: true,             // Auto-inject if missing
      injectionPriority: 0,        // Highest priority (inject first)
    },
    // ✅ CRITICAL: Use legacy executor for log_output (simple logging logic)
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}

