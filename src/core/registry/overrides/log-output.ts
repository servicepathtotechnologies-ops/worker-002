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
    // ✅ FIX: Only auto-inject if no explicit output nodes exist (HubSpot, Gmail, etc.)
    // log_output is a fallback output node, not a required node
    workflowBehavior: {
      alwaysRequired: false,       // ✅ FIX: Not always required - only if no explicit outputs
      alwaysTerminal: true,         // Must be last node (no outgoing edges)
      exemptFromRemoval: false,     // ✅ FIX: Can be removed if explicit outputs exist
      autoInject: true,             // Auto-inject if missing AND no explicit outputs
      injectionPriority: 10,        // ✅ FIX: Lower priority - inject AFTER explicit outputs
    },
    // ✅ CRITICAL: Use legacy executor for log_output (simple logging logic)
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}

