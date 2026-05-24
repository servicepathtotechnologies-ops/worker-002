import type { NodeExecutionContext, NodeExecutionResult } from '../types/unified-node-contract';
import type { NodeSchema } from '../../services/nodes/node-library';
import { stripSystemKeys } from '../execution/system-key-filter';

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

function isEmptyCredentialValue(value: any): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function parseStoredCredential(value: string): Record<string, any> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function pickScalarCredentialField(contractType: string): string {
  if (contractType === 'webhook') return 'webhookUrl';
  if (contractType === 'oauth') return 'accessToken';
  if (contractType === 'token') return 'token';
  return 'apiKey';
}

async function injectDashboardCredential(context: NodeExecutionContext, config: Record<string, any>): Promise<Record<string, any>> {
  const userIdsToTry: string[] = [];
  if (context.userId) userIdsToTry.push(context.userId);
  if (context.currentUserId && context.currentUserId !== context.userId) userIdsToTry.push(context.currentUserId);
  if (userIdsToTry.length === 0) return config;

  const { connectorRegistry } = await import('../../services/connectors/connector-registry');
  const connector = connectorRegistry.getConnectorByNodeType(context.nodeType);
  if (!connector?.credentialContract?.vaultKey) return config;

  const { retrieveCredential } = await import('../utils/credential-retriever');
  let stored: string | null = null;
  for (const uid of userIdsToTry) {
    stored = await retrieveCredential(
      {
        userId: uid,
        workflowId: context.workflowId,
        nodeId: context.nodeId,
        nodeType: context.nodeType,
      },
      connector.credentialContract.vaultKey,
    );
    if (stored) break;
  }
  if (!stored) return config;

  const nextConfig = { ...config };
  const parsed = parseStoredCredential(stored);
  if (parsed) {
    for (const [key, value] of Object.entries(parsed)) {
      if (!isEmptyCredentialValue(value) && isEmptyCredentialValue(nextConfig[key])) {
        nextConfig[key] = value;
      }
    }
  }

  const fieldName = connector.credentialContract.credentialFieldName || pickScalarCredentialField(connector.credentialContract.type);
  if (isEmptyCredentialValue(nextConfig[fieldName])) {
    const candidate = parsed
      ? parsed[fieldName] ||
        parsed.apiKey ||
        parsed.apiToken ||
        parsed.accessToken ||
        parsed.webhookUrl ||
        parsed.token ||
        parsed.value
      : stored;
    if (!isEmptyCredentialValue(candidate)) {
      nextConfig[fieldName] = candidate;
    }
  }

  return nextConfig;
}

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

    // Create nodeOutputs cache from upstream outputs.
    // Strip system/audit keys universally so NO override's beforeExecute hook can
    // accidentally merge observability metadata into downstream business data.
    const { LRUNodeOutputsCache } = await import('../cache/lru-node-outputs-cache');
    const nodeOutputs = new LRUNodeOutputsCache(100, false);
    context.upstreamOutputs.forEach((output, nodeId) => {
      const clean = typeof output === 'object' && output !== null && !Array.isArray(output)
        ? stripSystemKeys(output as Record<string, unknown>)
        : output;
      nodeOutputs.set(nodeId, clean, true);
    });

    // Store rawInput as 'input'/'$json'/'json' for template resolution.
    // Strip system keys here so ALL legacy-path nodes get clean upstream context
    // without needing to do it individually in their own beforeExecute hooks.
    if (context.rawInput !== undefined && context.rawInput !== null) {
      const cleanRaw = typeof context.rawInput === 'object' && !Array.isArray(context.rawInput)
        ? stripSystemKeys(context.rawInput as Record<string, unknown>)
        : context.rawInput;
      nodeOutputs.set('input', cleanRaw, true);
      nodeOutputs.set('$json', cleanRaw, true);
      nodeOutputs.set('json', cleanRaw, true);
    }

    // Universal template resolution (single source of truth)
    const { resolveConfigTemplates } = await import('../utils/universal-template-resolver');
    const resolvedConfig = resolveConfigTemplates(context.config || {}, nodeOutputs, context.nodeType);

    // Placeholder filtering (single source of truth)
    const { filterPlaceholderValues, cleanOutputFromConfig } = await import('../utils/placeholder-filter');
    const filteredConfig = filterPlaceholderValues(resolvedConfig);

    // Merge resolved inputs into config.
    // Runtime-owned fields must override config; static fields keep config precedence.
    const filteredBaseConfig = filterPlaceholderValues(context.config || {});
    const mergedConfig = { ...filteredBaseConfig, ...filteredConfig } as Record<string, any>;
    const inputSources =
      context && typeof (context as any).resolvedInputSources === 'object'
        ? ((context as any).resolvedInputSources as Record<string, 'static_config' | 'template' | 'deterministic_runtime' | 'runtime_ai'>)
        : {};
    for (const [fieldName, value] of Object.entries(context.inputs || {})) {
      if (inputSources[fieldName] === 'runtime_ai') {
        mergedConfig[fieldName] = value;
        continue;
      }
      const current = mergedConfig[fieldName];
      const isEmptyCurrent =
        current === undefined ||
        current === null ||
        (typeof current === 'string' && current.trim() === '');
      if (isEmptyCurrent) {
        mergedConfig[fieldName] = value;
      }
    }

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

    prepared = {
      ...prepared,
      mergedConfig: await injectDashboardCredential(context, prepared.mergedConfig),
    };

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
      context.db,
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
