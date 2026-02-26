/**
 * REGISTRY-BASED NODE HYDRATOR
 * 
 * This replaces all hardcoded node defaults in workflow builders.
 * 
 * Architecture:
 * - Fetches default config from UnifiedNodeRegistry
 * - Hydrates node configs from registry
 * - NO hardcoded defaults
 * 
 * This ensures:
 * - All defaults come from registry
 * - Permanent fixes apply to all workflows
 * - Consistent defaults across system
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { WorkflowNode } from '../../core/types/ai-types';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';

/**
 * Hydrate node config with defaults from registry
 * 
 * This replaces all hardcoded node defaults in workflow builders.
 */
export function hydrateNodeConfigFromRegistry(node: WorkflowNode): WorkflowNode {
  const normalizedType = normalizeNodeType(node);
  const nodeType = normalizedType || node.data?.type || node.type;
  
  // Get default config from registry (SINGLE SOURCE OF TRUTH)
  const defaultConfig = unifiedNodeRegistry.getDefaultConfig(nodeType);
  
  if (!defaultConfig || Object.keys(defaultConfig).length === 0) {
    // No defaults in registry, return node as-is
    return node;
  }
  
  // Merge defaults with existing config (existing config takes precedence)
  const currentConfig = node.data?.config || {};
  const hydratedConfig = {
    ...defaultConfig,
    ...currentConfig, // User-provided config overrides defaults
  };
  
  // Migrate config to current schema version (backward compatibility)
  const migratedConfig = unifiedNodeRegistry.migrateConfig(nodeType, hydratedConfig);
  
  return {
    ...node,
    data: {
      ...node.data,
      config: migratedConfig,
    },
  };
}

/**
 * Hydrate all nodes in workflow with defaults from registry
 */
export function hydrateWorkflowFromRegistry(workflow: { nodes: WorkflowNode[] }): {
  nodes: WorkflowNode[];
  hydratedCount: number;
} {
  let hydratedCount = 0;
  
  const hydratedNodes = workflow.nodes.map(node => {
    const hydrated = hydrateNodeConfigFromRegistry(node);
    if (hydrated !== node) {
      hydratedCount++;
    }
    return hydrated;
  });
  
  return {
    nodes: hydratedNodes,
    hydratedCount,
  };
}

/**
 * Get required credentials for a node type from registry
 */
export function getRequiredCredentialsFromRegistry(nodeType: string) {
  return unifiedNodeRegistry.getRequiredCredentials(nodeType);
}

/**
 * Get input schema for a node type from registry
 */
export function getInputSchemaFromRegistry(nodeType: string) {
  return unifiedNodeRegistry.getInputSchema(nodeType);
}

/**
 * Get output schema for a node type from registry
 */
export function getOutputSchemaFromRegistry(nodeType: string) {
  return unifiedNodeRegistry.getOutputSchema(nodeType);
}
