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
    // ✅ UNIVERSAL: log_output is REQUIRED on every branch path.
    // Each branch (true/false for if_else, case_N for switch) must terminate with its own
    // log_output so the execution console shows the correct output per branch.
    // An orphaned log_output means edge wiring failed — treat it as a hard error, not a warning.
    workflowBehavior: {
      alwaysRequired: true,         // Required: every branch needs its own log_output terminal
      alwaysTerminal: true,         // Must be last node (no outgoing edges)
      exemptFromRemoval: true,      // Never auto-remove — orphan = edge wiring bug, not surplus node
      autoInject: true,             // Auto-inject if missing
      injectionPriority: 10,
    },
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

