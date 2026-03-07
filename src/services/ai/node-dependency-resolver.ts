/**
 * Node Dependency Resolver
 * 
 * ✅ PHASE 3: Resolves node dependencies using registry
 * 
 * This resolver:
 * - Determines which nodes depend on which other nodes
 * - Uses registry to understand node capabilities
 * - Understands data flow dependencies
 * - Prevents Error #2 (incorrect execution order)
 * 
 * Architecture Rule:
 * - Uses registry as single source of truth
 * - Understands dependencies based on capabilities, not hardcoded rules
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export class NodeDependencyResolver {
  private static instance: NodeDependencyResolver;
  
  private constructor() {}
  
  static getInstance(): NodeDependencyResolver {
    if (!NodeDependencyResolver.instance) {
      NodeDependencyResolver.instance = new NodeDependencyResolver();
    }
    return NodeDependencyResolver.instance;
  }
  
  /**
   * Resolve dependencies for a node type
   * 
   * @param nodeType - Node type to resolve dependencies for
   * @param availableNodeTypes - Available node types in workflow
   * @returns Array of node types this node depends on
   */
  resolveDependencies(
    nodeType: string,
    availableNodeTypes: string[]
  ): string[] {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      return [];
    }
    
    const dependencies: string[] = [];
    
    // ✅ DEPENDENCY 1: Category-based dependencies
    // Transformations depend on data sources
    if (nodeCapabilityRegistryDSL.isTransformation(normalizedType)) {
      const dataSources = availableNodeTypes.filter(type => 
        nodeCapabilityRegistryDSL.isDataSource(unifiedNormalizeNodeTypeString(type))
      );
      dependencies.push(...dataSources);
    }
    
    // Outputs depend on transformations or data sources
    if (nodeCapabilityRegistryDSL.isOutput(normalizedType)) {
      const transformations = availableNodeTypes.filter(type => 
        nodeCapabilityRegistryDSL.isTransformation(unifiedNormalizeNodeTypeString(type))
      );
      const dataSources = availableNodeTypes.filter(type => 
        nodeCapabilityRegistryDSL.isDataSource(unifiedNormalizeNodeTypeString(type))
      );
      
      // Prefer transformations, fallback to data sources
      if (transformations.length > 0) {
        dependencies.push(...transformations);
      } else if (dataSources.length > 0) {
        dependencies.push(...dataSources);
      }
    }
    
    // ✅ DEPENDENCY 2: Registry-based dependencies
    // Check if node definition specifies dependencies
    if (nodeDef.tags) {
      // Look for dependency hints in tags
      const dependencyTags = nodeDef.tags.filter(tag => 
        tag.toLowerCase().includes('requires') || 
        tag.toLowerCase().includes('depends') ||
        tag.toLowerCase().includes('needs')
      );
      
      // Extract dependency node types from tags
      for (const tag of dependencyTags) {
        const tagLower = tag.toLowerCase();
        for (const availableType of availableNodeTypes) {
          const availableTypeLower = unifiedNormalizeNodeTypeString(availableType).toLowerCase();
          if (tagLower.includes(availableTypeLower)) {
            dependencies.push(availableType);
          }
        }
      }
    }
    
    // ✅ DEPENDENCY 3: Input/output compatibility
    // Check if node needs specific input types
    if (nodeDef.inputSchema) {
      // Find nodes that produce compatible output
      for (const availableType of availableNodeTypes) {
        if (availableType === normalizedType) continue;
        
        const availableDef = unifiedNodeRegistry.get(unifiedNormalizeNodeTypeString(availableType));
        if (!availableDef) continue;
        
        // Check if output is compatible with input
        if (this.isCompatibleOutput(availableDef, nodeDef)) {
          if (!dependencies.includes(availableType)) {
            dependencies.push(availableType);
          }
        }
      }
    }
    
    return dependencies;
  }
  
  /**
   * Check if source node output is compatible with target node input
   */
  private isCompatibleOutput(
    sourceDef: any,
    targetDef: any
  ): boolean {
    // ✅ UNIVERSAL: Use registry properties to determine compatibility
    // For now, use category-based compatibility
    // Data sources → Transformations → Outputs
    
    const sourceIsDataSource = nodeCapabilityRegistryDSL.isDataSource(sourceDef.type);
    const sourceIsTransformation = nodeCapabilityRegistryDSL.isTransformation(sourceDef.type);
    const targetIsTransformation = nodeCapabilityRegistryDSL.isTransformation(targetDef.type);
    const targetIsOutput = nodeCapabilityRegistryDSL.isOutput(targetDef.type);
    
    // Data source → Transformation
    if (sourceIsDataSource && targetIsTransformation) {
      return true;
    }
    
    // Data source → Output
    if (sourceIsDataSource && targetIsOutput) {
      return true;
    }
    
    // Transformation → Output
    if (sourceIsTransformation && targetIsOutput) {
      return true;
    }
    
    // Transformation → Transformation (chaining)
    if (sourceIsTransformation && targetIsTransformation) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get execution order based on dependencies
   */
  getExecutionOrder(
    nodeTypes: string[],
    dependencyGraph: Map<string, string[]>
  ): string[] {
    // Use topological sort
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        // Circular dependency - skip
        return;
      }
      if (visited.has(nodeId)) {
        return;
      }
      
      visiting.add(nodeId);
      
      // Visit dependencies first
      const dependencies = dependencyGraph.get(nodeId) || [];
      for (const depId of dependencies) {
        visit(depId);
      }
      
      visiting.delete(nodeId);
      visited.add(nodeId);
      order.push(nodeId);
    };
    
    // Visit all nodes
    for (const nodeType of nodeTypes) {
      if (!visited.has(nodeType)) {
        visit(nodeType);
      }
    }
    
    return order;
  }
}

// Export singleton instance
export const nodeDependencyResolver = NodeDependencyResolver.getInstance();
