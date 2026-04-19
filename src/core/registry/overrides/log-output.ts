import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';
import { resolveConfigTemplates } from '../../utils/universal-template-resolver';
import { filterPlaceholderValues, cleanOutputFromConfig } from '../../utils/placeholder-filter';
import { executeLogOutputWithCache } from '../../execution/nodes/log-output-executor';

/**
 * ✅ UNIVERSAL FIX: Log Output Node Override
 * 
 * Ensures log_output node:
 * 1. Has proper default config (level: 'info', message: AI-generated)
 * 2. Executes via legacy executor (simple logging logic)
 * 3. Is properly registered in registry
 */
export function overrideLogOutput(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
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
    // ✅ INTENT-DRIVEN: log_output is ONLY added when user explicitly requests logging.
    // Each branch that explicitly mentions logging gets its own log_output node.
    // No automatic injection - purely intent-driven based on user prompt analysis.
    workflowBehavior: {
      alwaysRequired: false,        // ✅ CHANGED: Only add when user requests logging
      alwaysTerminal: true,         // Must be last node (no outgoing edges)
      exemptFromRemoval: false,     // ✅ CHANGED: Can be removed if not in user intent
      autoInject: false,            // ✅ CHANGED: No automatic injection
      injectionPriority: 0,         // ✅ CHANGED: No priority (not auto-injected)
    },
    // ✅ TERMINAL NODE CAPABILITY FLAGS
    // These flags define log_output as a single-input terminal node:
    // - isTerminal: Enforces zero outgoing edges (terminal node)
    // - maxOutDegree: Explicitly sets maximum outgoing edges to 0
    // - allowsMultipleInputs: Explicitly set to false for single-input constraint
    // log_output is a single-input terminal node - each branch must have its own log_output instance
    isTerminal: true,
    maxOutDegree: 0,
    allowsMultipleInputs: false,    // ✅ SINGLE-INPUT: log_output must have exactly one incoming edge
    execute: async (context) => {
      try {
        const nodeOutputs = new LRUNodeOutputsCache(100, false);
        context.upstreamOutputs.forEach((output, nodeId) => {
          nodeOutputs.set(nodeId, output, true);
        });
        if (context.rawInput !== undefined && context.rawInput !== null) {
          nodeOutputs.set('input', context.rawInput, true);
          nodeOutputs.set('$json', context.rawInput, true);
          nodeOutputs.set('json', context.rawInput, true);
        }
        const resolvedConfig = resolveConfigTemplates(
          context.config || {},
          nodeOutputs,
          context.nodeType
        );
        const filteredConfig = filterPlaceholderValues(resolvedConfig);
        const filteredBaseConfig = filterPlaceholderValues(context.config || {});
        const mergedConfig = {
          ...(context.inputs || {}),
          ...filteredBaseConfig,
          ...filteredConfig,
        } as Record<string, unknown>;
        const rawOut = executeLogOutputWithCache(mergedConfig, context.rawInput ?? {}, nodeOutputs);
        const cleaned = cleanOutputFromConfig(rawOut, filteredConfig);
        return { success: true, output: cleaned };
      } catch (error: any) {
        return {
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: error?.message || 'log_output execution failed',
            details: error,
          },
        };
      }
    },
  };
}

