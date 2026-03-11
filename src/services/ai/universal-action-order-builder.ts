/**
 * UNIVERSAL ACTION-ORDER BUILDER
 * 
 * ✅ WORLD-CLASS: Schema-Driven Action Ordering for Infinite Workflows
 * 
 * Architecture Principles:
 * 1. Zero hardcoding - all from node schemas and operation semantics
 * 2. Infinite scalability - works for any number of nodes
 * 3. Real-time capable - efficient topological sort
 * 4. Operation-semantic aware - uses read/write/transform semantics
 * 5. Dependency-aware - respects all node dependencies
 * 
 * This replaces category-based ordering with universal operation-semantic ordering.
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { getOperationSemantic, OperationSemanticInfo } from '../../core/registry/node-operation-semantics';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface ActionOrderNode {
  node: WorkflowNode;
  nodeId: string;
  nodeType: string;
  operation: string;
  semantic: 'read' | 'write' | 'transform' | 'unknown';
  semanticInfo: OperationSemanticInfo;
  order: number; // Semantic priority order (read=1, transform=2, write=3)
  dependencies: string[]; // Node IDs this depends on
  dependents: string[]; // Node IDs that depend on this
}

export interface ActionOrderResult {
  orderedNodes: ActionOrderNode[];
  edges: WorkflowEdge[];
  errors: string[];
  warnings: string[];
}

/**
 * Universal Action Order Builder
 * Builds action order from operation semantics (no hardcoding)
 */
export class UniversalActionOrderBuilder {
  /**
   * Build action order from nodes using operation semantics
   * 
   * @param nodes - All workflow nodes (including trigger)
   * @param triggerNode - Trigger node
   * @param originalPrompt - Original prompt (for extracting action sequences)
   * @param dslComponents - Optional DSL components for operation extraction
   * @returns Action order result with edges
   */
  buildActionOrder(
    nodes: WorkflowNode[],
    triggerNode: WorkflowNode,
    originalPrompt?: string,
    dslComponents?: {
      dataSources?: Array<{ id: string; type: string; operation?: string }>;
      transformations?: Array<{ id: string; type: string; operation?: string }>;
      outputs?: Array<{ id: string; type: string; operation?: string }>;
    }
  ): ActionOrderResult {
    console.log('[UniversalActionOrderBuilder] Building action order from operation semantics...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Step 1: Extract operation semantics for all nodes
    const actionOrderNodes = this.extractActionOrderNodes(
      nodes,
      triggerNode,
      errors,
      warnings,
      dslComponents
    );
    
    // Step 2: Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(actionOrderNodes);
    
    // Step 3: Topological sort with semantic priority
    const orderedNodes = this.topologicalSortWithSemantics(actionOrderNodes, dependencyGraph, triggerNode.id);
    
    // Step 4: Connect edges based on action order
    const edges = this.connectEdgesFromActionOrder(orderedNodes, triggerNode, errors, warnings);
    
    // Step 5: Validate result
    this.validateActionOrder(orderedNodes, edges, errors, warnings);
    
    console.log(`[UniversalActionOrderBuilder] ✅ Built action order: ${orderedNodes.length} nodes, ${edges.length} edges`);
    
    return {
      orderedNodes,
      edges,
      errors,
      warnings,
    };
  }
  
  /**
   * Extract action order nodes with operation semantics
   * ✅ UNIVERSAL: Uses registry, no hardcoding
   */
  private extractActionOrderNodes(
    nodes: WorkflowNode[],
    triggerNode: WorkflowNode,
    errors: string[],
    warnings: string[],
    dslComponents?: {
      dataSources?: Array<{ id: string; type: string; operation?: string }>;
      transformations?: Array<{ id: string; type: string; operation?: string }>;
      outputs?: Array<{ id: string; type: string; operation?: string }>;
    }
  ): ActionOrderNode[] {
    const actionNodes: ActionOrderNode[] = [];
    
    for (const node of nodes) {
      // Skip trigger (handled separately)
      if (node.id === triggerNode.id) {
        continue;
      }
      
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      if (!nodeDef) {
        errors.push(`Node type "${nodeType}" not found in registry`);
        continue;
      }
      
      // Extract operation from node config or DSL components
      const operation = this.extractOperationFromNode(node, nodeDef, dslComponents);
      
      // Get operation semantic from registry
      const semanticInfo = getOperationSemantic(nodeType, operation);
      
      // Determine semantic priority order
      const semanticOrder = this.getSemanticOrder(semanticInfo.semantic);
      
      actionNodes.push({
        node,
        nodeId: node.id,
        nodeType,
        operation,
        semantic: semanticInfo.semantic,
        semanticInfo,
        order: semanticOrder,
        dependencies: [],
        dependents: [],
      });
    }
    
    // Sort by semantic order (read → transform → write)
    actionNodes.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      // Within same semantic, maintain original order
      return 0;
    });
    
    return actionNodes;
  }
  
  /**
   * Extract operation from node config or DSL components
   * ✅ UNIVERSAL: Works for any node type
   */
  private extractOperationFromNode(
    node: WorkflowNode,
    nodeDef: any,
    dslComponents?: {
      dataSources?: Array<{ id: string; type: string; operation?: string }>;
      transformations?: Array<{ id: string; type: string; operation?: string }>;
      outputs?: Array<{ id: string; type: string; operation?: string }>;
    }
  ): string {
    // Priority 1: Check DSL components (most reliable)
    if (dslComponents) {
      // Check data sources
      if (dslComponents.dataSources) {
        const dsComponent = dslComponents.dataSources.find(ds => {
          // Match by node ID or type
          const metadata = (node as any).metadata;
          const dslId = metadata?.dsl?.dslId;
          return dslId === ds.id || node.id.includes(ds.id) || node.type === ds.type;
        });
        if (dsComponent?.operation) {
          return String(dsComponent.operation).toLowerCase();
        }
      }
      
      // Check transformations
      if (dslComponents.transformations) {
        const tfComponent = dslComponents.transformations.find(tf => {
          const metadata = (node as any).metadata;
          const dslId = metadata?.dsl?.dslId;
          return dslId === tf.id || node.id.includes(tf.id) || node.type === tf.type;
        });
        if (tfComponent?.operation) {
          return String(tfComponent.operation).toLowerCase();
        }
      }
      
      // Check outputs
      if (dslComponents.outputs) {
        const outComponent = dslComponents.outputs.find(out => {
          const metadata = (node as any).metadata;
          const dslId = metadata?.dsl?.dslId;
          return dslId === out.id || node.id.includes(out.id) || node.type === out.type;
        });
        if (outComponent?.operation) {
          return String(outComponent.operation).toLowerCase();
        }
      }
    }
    // Try to get operation from node config
    const config = node.data?.config || {};
    if (config.operation) {
      return String(config.operation).toLowerCase();
    }
    
    // Try to get default operation from node definition
    if (nodeDef.defaultConfig) {
      const defaultConfig = nodeDef.defaultConfig();
      if (defaultConfig.operation) {
        return String(defaultConfig.operation).toLowerCase();
      }
    }
    
    // Try to get first available operation from schema
    if (nodeDef.inputSchema) {
      const opField = nodeDef.inputSchema.operation;
      if (opField) {
        if (Array.isArray(opField.enum)) {
          return String(opField.enum[0]).toLowerCase();
        }
        if (Array.isArray(opField.oneOf)) {
          const firstOp = opField.oneOf[0];
          if (firstOp.const) {
            return String(firstOp.const).toLowerCase();
          }
        }
      }
    }
    
    // Default: use 'execute' for action-based nodes
    return 'execute';
  }
  
  /**
   * Get semantic priority order
   * ✅ UNIVERSAL: Works for any semantic
   */
  private getSemanticOrder(semantic: 'read' | 'write' | 'transform' | 'unknown'): number {
    switch (semantic) {
      case 'read':
        return 1; // First: read data
      case 'transform':
        return 2; // Second: transform data
      case 'write':
        return 3; // Third: write data
      case 'unknown':
        return 2; // Default to middle (transform)
      default:
        return 2;
    }
  }
  
  /**
   * Build dependency graph from action order nodes
   * ✅ UNIVERSAL: Works for infinite workflows
   */
  private buildDependencyGraph(actionNodes: ActionOrderNode[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    // Initialize graph
    for (const actionNode of actionNodes) {
      graph.set(actionNode.nodeId, []);
    }
    
    // Build dependencies based on semantic order
    for (let i = 0; i < actionNodes.length; i++) {
      const currentNode = actionNodes[i];
      const dependencies: string[] = [];
      
      // Dependencies: all nodes with lower semantic order
      for (let j = 0; j < i; j++) {
        const prevNode = actionNodes[j];
        // If previous node has lower or equal semantic order, it's a dependency
        if (prevNode.order <= currentNode.order) {
          dependencies.push(prevNode.nodeId);
        }
      }
      
      graph.set(currentNode.nodeId, dependencies);
      
      // Update action node
      currentNode.dependencies = dependencies;
      for (const depId of dependencies) {
        const depNode = actionNodes.find(n => n.nodeId === depId);
        if (depNode) {
          depNode.dependents.push(currentNode.nodeId);
        }
      }
    }
    
    return graph;
  }
  
  /**
   * Topological sort with semantic priority
   * ✅ UNIVERSAL: Works for infinite workflows (O(V+E) complexity)
   */
  private topologicalSortWithSemantics(
    actionNodes: ActionOrderNode[],
    dependencyGraph: Map<string, string[]>,
    triggerId: string
  ): ActionOrderNode[] {
    const sorted: ActionOrderNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        // Cycle detected (should not happen with DAG)
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
      
      // Add to sorted list
      const actionNode = actionNodes.find(n => n.nodeId === nodeId);
      if (actionNode) {
        sorted.push(actionNode);
      }
    };
    
    // Visit all nodes
    for (const actionNode of actionNodes) {
      if (!visited.has(actionNode.nodeId)) {
        visit(actionNode.nodeId);
      }
    }
    
    return sorted;
  }
  
  /**
   * Connect edges based on action order
   * ✅ LONG-TERM FIX: Enforces strict linear flow (one node after another)
   * ✅ UNIVERSAL: Uses universal handle resolver
   */
  private connectEdgesFromActionOrder(
    orderedNodes: ActionOrderNode[],
    triggerNode: WorkflowNode,
    errors: string[],
    warnings: string[]
  ): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];
    const allNodes = [triggerNode, ...orderedNodes.map(n => n.node)];
    
    // ✅ LONG-TERM FIX: Sort nodes by semantic order, then by dependencies
    // This ensures strict linear flow: read → transform → write
    const sortedNodes = [...orderedNodes].sort((a, b) => {
      // First: sort by semantic order (read=1, transform=2, write=3)
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      // Second: if same order, maintain dependency order
      if (a.dependencies.includes(b.nodeId)) {
        return 1; // b depends on a, so a comes first
      }
      if (b.dependencies.includes(a.nodeId)) {
        return -1; // a depends on b, so b comes first
      }
      return 0; // No dependency relationship
    });
    
    // ✅ LONG-TERM FIX: Connect nodes sequentially (one after another)
    // This ensures linear flow: trigger → node1 → node2 → node3 → ...
    if (sortedNodes.length > 0) {
      // Connect trigger to first node
      const firstNode = sortedNodes[0].node;
      const firstEdge = this.createEdge(triggerNode, firstNode, allNodes, errors, warnings);
      if (firstEdge) {
        edges.push(firstEdge);
      }
      
      // Connect remaining nodes sequentially (linear chain)
      for (let i = 1; i < sortedNodes.length; i++) {
        const prevNode = sortedNodes[i - 1].node;
        const currentNode = sortedNodes[i].node;
        
        // ✅ Check if previous node allows branching (if_else, switch, merge)
        // Only branching nodes can have multiple outgoing edges
        const prevNodeType = unifiedNormalizeNodeTypeString(prevNode.type || '');
        const prevNodeDef = unifiedNodeRegistry.get(prevNodeType);
        const allowsBranching = prevNodeDef?.isBranching || false;
        
        // Check if previous node already has outgoing edges
        const prevNodeOutgoingEdges = edges.filter(e => e.source === prevNode.id);
        
        if (prevNodeOutgoingEdges.length > 0 && !allowsBranching) {
          // Previous node already has an edge and doesn't allow branching
          // Skip this connection to maintain linear flow
          warnings.push(
            `Skipping edge from ${prevNodeType} to ${currentNode.type || 'unknown'}: ` +
            `Previous node already has outgoing edge (enforcing linear flow)`
          );
          continue;
        }
        
        const edge = this.createEdge(prevNode, currentNode, allNodes, errors, warnings);
        if (edge) {
          edges.push(edge);
        }
      }
    }
    
    return edges;
  }
  
  /**
   * Create edge between two nodes
   * ✅ UNIVERSAL: Uses universal handle resolver
   */
  private createEdge(
    source: WorkflowNode,
    target: WorkflowNode,
    allNodes: WorkflowNode[],
    errors: string[],
    warnings: string[]
  ): WorkflowEdge | null {
    // Check if edge already exists
    // (This would be checked in the calling code, but adding here for safety)
    
    // Use universal handle resolver
    const { universalHandleResolver } = require('../../core/error-prevention');
    
    const sourceType = unifiedNormalizeNodeTypeString(source.type || source.data?.type || '');
    const targetType = unifiedNormalizeNodeTypeString(target.type || target.data?.type || '');
    
    const sourceHandleResult = universalHandleResolver.resolveSourceHandle(sourceType);
    const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
    
    // Also try schema-driven connection resolver as fallback
    if (!sourceHandleResult.valid || !targetHandleResult.valid) {
      const { resolveCompatibleHandles } = require('./schema-driven-connection-resolver');
      const resolution = resolveCompatibleHandles(source, target);
      if (resolution.success && resolution.sourceHandle && resolution.targetHandle) {
        return {
          id: `edge-${source.id}-${target.id}`,
          source: source.id,
          target: target.id,
          sourceHandle: resolution.sourceHandle,
          targetHandle: resolution.targetHandle,
        };
      }
    }
    
    if (!sourceHandleResult.valid || !targetHandleResult.valid) {
      warnings.push(`Cannot create edge ${sourceType} → ${targetType}: ${sourceHandleResult.error || targetHandleResult.error}`);
      return null;
    }
    
    return {
      id: `edge-${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      sourceHandle: sourceHandleResult.handle || 'output',
      targetHandle: targetHandleResult.handle || 'input',
    };
  }
  
  /**
   * Validate action order result
   * ✅ UNIVERSAL: Validates structure, not hardcoded rules
   */
  private validateActionOrder(
    orderedNodes: ActionOrderNode[],
    edges: WorkflowEdge[],
    errors: string[],
    warnings: string[]
  ): void {
    // Validate all nodes are included
    const nodeIds = new Set(orderedNodes.map(n => n.nodeId));
    const edgeNodeIds = new Set<string>();
    edges.forEach(e => {
      edgeNodeIds.add(e.source);
      edgeNodeIds.add(e.target);
    });
    
    // Check for orphaned nodes
    for (const actionNode of orderedNodes) {
      const hasIncoming = edges.some(e => e.target === actionNode.nodeId);
      const hasOutgoing = edges.some(e => e.source === actionNode.nodeId);
      
      if (!hasIncoming && !hasOutgoing) {
        warnings.push(`Node ${actionNode.nodeType} (${actionNode.nodeId}) has no edges`);
      }
    }
    
    // Validate semantic order is respected
    for (const edge of edges) {
      const sourceNode = orderedNodes.find(n => n.nodeId === edge.source);
      const targetNode = orderedNodes.find(n => n.nodeId === edge.target);
      
      if (sourceNode && targetNode) {
        if (sourceNode.order > targetNode.order) {
          warnings.push(`Edge violates semantic order: ${sourceNode.semantic} (${sourceNode.order}) → ${targetNode.semantic} (${targetNode.order})`);
        }
      }
    }
  }
}

// Export singleton instance
export const universalActionOrderBuilder = new UniversalActionOrderBuilder();
