/**
 * REGISTRY-BASED NODE HYDRATOR
 * 
 * This replaces all hardcoded node defaults in workflow builders.
 * 
 * Architecture:
 * - Fetches default config from UnifiedNodeRegistry
 * - Hydrates node configs from registry
 * - Enriches nodes with structural properties (outgoingPorts, isBranching)
 * - NO hardcoded defaults
 * 
 * This ensures:
 * - All defaults come from registry
 * - Permanent fixes apply to all workflows
 * - Consistent defaults across system
 * - IF-ELSE and other branching nodes have correct output plugs
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { WorkflowNode } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

/**
 * Hydrate node config with defaults from registry AND enrich with structural properties
 * 
 * This replaces all hardcoded node defaults in workflow builders.
 * 
 * CRITICAL: For IF-ELSE nodes, this ensures they have TWO output plugs ('true' and 'false')
 * from the registry, not just one plug like regular nodes.
 */
export function hydrateNodeConfigFromRegistry(node: WorkflowNode): WorkflowNode {
  const normalizedType = unifiedNormalizeNodeType(node);
  const nodeType = normalizedType || node.data?.type || node.type;
  
  // Get node definition from registry (SINGLE SOURCE OF TRUTH)
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  
  // Get default config from registry
  const defaultConfig = unifiedNodeRegistry.getDefaultConfig(nodeType);
  
  // Merge defaults with existing config (existing config takes precedence)
  const currentConfig = node.data?.config || {};
  const hydratedConfig = defaultConfig && Object.keys(defaultConfig).length > 0
    ? {
        ...defaultConfig,
        ...currentConfig, // User-provided config overrides defaults
      }
    : currentConfig;
  
  // Migrate config to current schema version (backward compatibility)
  const migratedConfig = unifiedNodeRegistry.migrateConfig(nodeType, hydratedConfig);
  
  // ✅ CRITICAL FIX: Enrich node with structural properties from registry
  // This ensures IF-ELSE nodes have TWO output plugs ('true' and 'false')
  // instead of just one plug like regular nodes
  const enrichedData: any = {
    ...node.data,
    config: migratedConfig,
  };
  
  // If node definition exists, enrich with structural properties
  if (nodeDef) {
    // Store outgoingPorts in node data so UI and edge creation can use them
    if (nodeDef.outgoingPorts && nodeDef.outgoingPorts.length > 0) {
      enrichedData.outgoingPorts = nodeDef.outgoingPorts;
    }
    
    // Store isBranching flag
    enrichedData.isBranching = nodeDef.isBranching || false;
    
    // Store incomingPorts for completeness
    if (nodeDef.incomingPorts && nodeDef.incomingPorts.length > 0) {
      enrichedData.incomingPorts = nodeDef.incomingPorts;
    }
    
    // Log for IF-ELSE nodes to verify they get two plugs
    if (nodeType === 'if_else' || nodeType === 'if-else') {
      console.log(
        `[RegistryHydrator] ✅ Enriched IF-ELSE node ${node.id} with output plugs: ${nodeDef.outgoingPorts.join(', ')}`
      );
    }
  }
  
  return {
    ...node,
    data: enrichedData,
  };
}

/**
 * Hydrate all nodes in workflow with defaults from registry AND enrich with structural properties
 * 
 * This ensures:
 * - All nodes get correct config defaults
 * - IF-ELSE nodes get TWO output plugs ('true' and 'false')
 * - Branching nodes are properly marked
 * - Structural properties are available for UI and edge creation
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
  
  // Log IF-ELSE nodes to verify they have two plugs
  const ifElseNodes = hydratedNodes.filter(n => {
    const nodeType = unifiedNormalizeNodeType(n);
    return nodeType === 'if_else' || nodeType === 'if-else';
  });
  
  if (ifElseNodes.length > 0) {
    console.log(
      `[RegistryHydrator] ✅ Hydrated ${ifElseNodes.length} IF-ELSE node(s) with structural properties:`,
      ifElseNodes.map(n => ({
        id: n.id,
        outgoingPorts: (n.data as any)?.outgoingPorts || 'MISSING',
        isBranching: (n.data as any)?.isBranching || false,
      }))
    );
  }
  
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

/**
 * Get outgoing ports for a node type from registry
 * 
 * CRITICAL: For IF-ELSE nodes, this returns ['true', 'false']
 * For regular nodes, this returns ['default']
 */
export function getOutgoingPortsFromRegistry(nodeType: string): string[] {
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef && nodeDef.outgoingPorts && nodeDef.outgoingPorts.length > 0) {
    return nodeDef.outgoingPorts;
  }
  // Default fallback
  return ['default'];
}

/**
 * Check if a node type is a branching node (can have multiple output paths)
 * 
 * Examples: if_else, switch, merge
 */
export function isBranchingNode(nodeType: string): boolean {
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  return nodeDef?.isBranching || false;
}
