import type { NodeExecutionContext, NodeExecutionResult } from '../types/unified-node-contract';
import type { NodeSchema } from '../../services/nodes/node-library';

export type LegacyAdapterPrepared = {
  nodeOutputs: any;
  resolvedConfig: Record<string, any>;
  filteredBaseConfig: Record<string, any>;
  filteredConfig: Record<string, any>;
  mergedConfig: Record<string, any>;
  executionInput: any;
};

export type LegacyAdapterHooks = {
  /**
   * Runs after templates/placeholders are resolved and inputs are merged into config,
   * but before calling the legacy executor.
   */
  beforeExecute?: (prepared: LegacyAdapterPrepared) => Promise<Partial<LegacyAdapterPrepared> | void> | Partial<LegacyAdapterPrepared> | void;
};

/**
 * Execute a node via the legacy executor, but with the unified runtime guarantees:
 * - Universal template resolution
 * - Placeholder filtering
 * - Deterministic merge of resolved inputs into config (inputs as fallback only)
 * - Output cleaned from config values
 *
 * Node-specific behavior MUST be implemented via overrides (hooks or execute replacement).
 */
export async function executeViaLegacyExecutor(args: {
  context: NodeExecutionContext;
  schema: NodeSchema;
  hooks?: LegacyAdapterHooks;
}): Promise<NodeExecutionResult> {
  const { context, schema, hooks } = args;

  try {
    // Import legacy executor directly (bypasses dynamic executor to avoid loop).
    const { executeNodeLegacy } = await import('../../api/execute-workflow');

    // Create nodeOutputs cache from upstream outputs
    const { LRUNodeOutputsCache } = await import('../cache/lru-node-outputs-cache');
    const nodeOutputs = new LRUNodeOutputsCache(100, false);
    context.upstreamOutputs.forEach((output, nodeId) => {
      nodeOutputs.set(nodeId, output, true);
    });

    // ✅ CRITICAL FIX: Store rawInput as 'input' in cache for {{input.*}} template resolution
    // This ensures templates like {{input.response.subject}} resolve correctly for ALL nodes
    if (context.rawInput !== undefined && context.rawInput !== null) {
      nodeOutputs.set('input', context.rawInput, true);
      // Also set as $json for backward compatibility
      nodeOutputs.set('$json', context.rawInput, true);
      nodeOutputs.set('json', context.rawInput, true);
    }

    // Universal template resolution (single source of truth)
    const { resolveConfigTemplates } = await import('../utils/universal-template-resolver');
    const resolvedConfig = resolveConfigTemplates(context.config || {}, nodeOutputs);

    // Placeholder filtering (single source of truth)
    const { filterPlaceholderValues, cleanOutputFromConfig } = await import('../utils/placeholder-filter');
    const filteredConfig = filterPlaceholderValues(resolvedConfig);

    // Merge resolved inputs into config (inputs are fallback only; config wins)
    const filteredBaseConfig = filterPlaceholderValues(context.config || {});
    const mergedConfig = { ...(context.inputs || {}), ...filteredBaseConfig, ...filteredConfig };

    // Default execution input is resolved inputs
    let prepared: LegacyAdapterPrepared = {
      nodeOutputs,
      resolvedConfig,
      filteredBaseConfig,
      filteredConfig,
      mergedConfig,
      executionInput: context.inputs || {},
    };

    if (hooks?.beforeExecute) {
      const patch = await hooks.beforeExecute(prepared);
      if (patch && typeof patch === 'object') {
        prepared = { ...prepared, ...patch };
      }
    }

    // Convert context to legacy node shape
    const node = {
      id: context.nodeId,
      type: context.nodeType,
      data: {
        label: context.nodeType,
        type: context.nodeType,
        category: schema.category,
        config: prepared.mergedConfig,
      },
    };

    const output = await executeNodeLegacy(
      node as any,
      prepared.executionInput,
      nodeOutputs,
      context.supabase,
      context.workflowId,
      context.userId,
      context.currentUserId
    );

    const cleanedOutput = cleanOutputFromConfig(output, prepared.filteredConfig);

    return { success: true, output: cleanedOutput };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error?.message || 'Node execution failed',
        details: error,
      },
    };
  }
}

