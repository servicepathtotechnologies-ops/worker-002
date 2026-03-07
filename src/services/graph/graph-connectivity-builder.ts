/**
 * ✅ DETERMINISTIC GRAPH CONNECTIVITY BUILDER
 * 
 * This component ensures graph connectivity BEFORE validation runs.
 * It guarantees:
 * 1. Exactly one trigger (auto-created if missing)
 * 2. All nodes reachable from trigger
 * 3. Deterministic execution plan from intent
 * 4. No orphan nodes
 * 
 * Architecture:
 * - Builds execution plan from structured intent
 * - Creates edges deterministically from plan
 * - Attaches orphan nodes automatically
 * - Validates integrity before returning
 * 
 * This runs BEFORE GraphConnectivityValidationLayer to ensure
 * validation always passes for correctly generated workflows.
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { StructuredIntent } from '../ai/intent-structurer';
import { getRequiredNodes } from '../ai/intent-constraint-engine';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { randomUUID } from 'crypto';

export interface ExecutionPlan {
  nodeIds: string[];           // Ordered node IDs: [triggerId, node1Id, node2Id, ...]
  nodeTypes: string[];        // Corresponding node types
  triggerNodeId: string;       // ID of trigger node (always first)
}

export interface IntegrityResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    totalNodes: number;
    totalEdges: number;
    triggerNodes: number;
    reachableNodes: number;
    orphanNodes: number;
  };
}

/**
 * ✅ DETERMINISTIC: Graph Connectivity Builder
 * 
 * Builds connected graph from nodes and intent deterministically.
 */
export class GraphConnectivityBuilder {
  /**
   * ✅ STEP 1: Build execution plan from intent
   * 
   * Converts structured intent into deterministic execution order.
   * Always ensures trigger is first.
   * 
   * @param intent - Structured intent (optional, can be null)
   * @param nodes - Workflow nodes
   */
  buildExecutionPlan(
    intent: StructuredIntent | null,
    nodes: WorkflowNode[]
  ): ExecutionPlan {
    // ✅ STEP 1.1: Get required node types from intent (if available)
    let requiredNodeTypes: string[] = [];
    let triggerType = 'manual_trigger';
    
    if (intent) {
      requiredNodeTypes = getRequiredNodes(intent, '');
      triggerType = intent.trigger || 'manual_trigger';
    } else {
      // Fallback: Infer from nodes
      const triggerNodes = nodes.filter(node => {
        const nodeType = unifiedNormalizeNodeType(node);
        return nodeType.includes('trigger');
      });
      if (triggerNodes.length > 0) {
        triggerType = unifiedNormalizeNodeType(triggerNodes[0]);
      }
    }
    
    // ✅ STEP 1.2: Find or create trigger node
    const triggerNode = this.findOrCreateTrigger(nodes, triggerType);
    
    // ✅ STEP 1.3: Build ordered node list (trigger first, then actions)
    const orderedNodes: WorkflowNode[] = [triggerNode];
    const nodeTypeById = new Map<string, string>();
    
    // Map nodes by type for quick lookup
    nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      nodeTypeById.set(node.id, nodeType);
    });
    
    // ✅ STEP 1.4: Add nodes in execution order based on intent (if available)
    // Order: trigger → dataSources → transformations → actions
    const executionOrder: string[] = [];
    
    if (!intent) {
      // Fallback: Use node order as-is (already ordered by workflow builder)
      for (const node of nodes) {
        if (!orderedNodes.includes(node)) {
          orderedNodes.push(node);
          executionOrder.push(unifiedNormalizeNodeType(node));
        }
      }
    } else {
      // Add data sources first (if any)
      if (intent.dataSources && intent.dataSources.length > 0) {
      for (const dataSource of intent.dataSources) {
        const matchingNode = nodes.find(node => {
          const nodeType = unifiedNormalizeNodeType(node);
          return nodeType === dataSource.type && !orderedNodes.includes(node);
        });
        if (matchingNode) {
          orderedNodes.push(matchingNode);
          executionOrder.push(dataSource.type);
        }
      }
    }
    
    // Add transformations (if any)
    if (intent.transformations && intent.transformations.length > 0) {
      for (const transformation of intent.transformations) {
        const matchingNode = nodes.find(node => {
          const nodeType = unifiedNormalizeNodeType(node);
          return nodeType === transformation.type && !orderedNodes.includes(node);
        });
        if (matchingNode) {
          orderedNodes.push(matchingNode);
          executionOrder.push(transformation.type);
        }
      }
    }
    
    // Add actions
    if (intent.actions && intent.actions.length > 0) {
      for (const action of intent.actions) {
        const matchingNode = nodes.find(node => {
          const nodeType = unifiedNormalizeNodeType(node);
          return nodeType === action.type && !orderedNodes.includes(node);
        });
        if (matchingNode) {
          orderedNodes.push(matchingNode);
          executionOrder.push(action.type);
        }
      }
      
      // ✅ STEP 1.5: Add any remaining nodes (not in intent but in nodes array)
      for (const node of nodes) {
        if (!orderedNodes.includes(node)) {
          orderedNodes.push(node);
          executionOrder.push(unifiedNormalizeNodeType(node));
        }
      }
    }
    }
    
    // ✅ STEP 1.6: Build execution plan
    const nodeIds = orderedNodes.map(n => n.id);
    const nodeTypes = orderedNodes.map(n => unifiedNormalizeNodeType(n));
    
    return {
      nodeIds,
      nodeTypes,
      triggerNodeId: triggerNode.id,
    };
  }
  
  /**
   * ✅ STEP 2: Build edges from execution plan
   * 
   * Creates edges deterministically: plan[i] → plan[i+1]
   */
  buildEdgesFromPlan(executionPlan: ExecutionPlan): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];
    
    // Create edges: plan[i] → plan[i+1]
    for (let i = 0; i < executionPlan.nodeIds.length - 1; i++) {
      const sourceId = executionPlan.nodeIds[i];
      const targetId = executionPlan.nodeIds[i + 1];
      
      const edge: WorkflowEdge = {
        id: randomUUID(),
        source: sourceId,
        target: targetId,
        type: 'default',
      };
      
      edges.push(edge);
    }
    
    console.log(
      `[GraphConnectivityBuilder] ✅ Created ${edges.length} edges from execution plan ` +
      `(${executionPlan.nodeIds.length} nodes)`
    );
    
    return edges;
  }
  
  /**
   * ❌ REMOVED: attachOrphanNodes()
   * 
   * Reason: Orphan nodes must never exist in the first place.
   * Use DeterministicGraphAssembler instead, which guarantees
   * zero orphan nodes during graph construction.
   * 
   * This method is deprecated and should not be used.
   * If orphan nodes are detected, it indicates a failure in
   * the graph assembly process, not a condition to repair.
   */
  attachOrphanNodes(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    triggerNodeId: string
  ): WorkflowEdge[] {
    // ✅ DEPRECATED: Orphan nodes should never exist
    // If this is called, it indicates a failure in graph assembly
    console.warn(
      `[GraphConnectivityBuilder] ⚠️  DEPRECATED: attachOrphanNodes() called. ` +
      `Orphan nodes should never exist. Use DeterministicGraphAssembler instead.`
    );
    
    // Return edges as-is (do not attempt repair)
    return edges;
  }
  
  /**
   * ✅ STEP 4: Validate graph integrity
   * 
   * Runs internal BFS to ensure:
   * - All nodes reachable from trigger
   * - Exactly one trigger
   * - No cycles (basic check)
   * 
   * This runs BEFORE GraphConnectivityValidationLayer to ensure
   * validation always passes for correctly generated workflows.
   * 
   * @param nodes - All workflow nodes
   * @param edges - All workflow edges
   * @param triggerNodeId - ID of trigger node
   * @returns Integrity validation result
   */
  validateGraphIntegrity(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    triggerNodeId: string
  ): IntegrityResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // ✅ CHECK 1: Exactly one trigger
    const triggerNodes = nodes.filter(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return nodeType.includes('trigger') || 
             (node.data?.type || node.type || '').includes('trigger');
    });
    
    if (triggerNodes.length === 0) {
      errors.push('No trigger node found');
    } else if (triggerNodes.length > 1) {
      errors.push(`Multiple trigger nodes found: ${triggerNodes.length} (expected 1)`);
    }
    
    // ✅ CHECK 2: All nodes reachable from trigger
    const reachable = this.findReachableNodes(triggerNodeId, edges);
    const unreachableNodes = nodes.filter(node => !reachable.has(node.id));
    
    if (unreachableNodes.length > 0) {
      errors.push(
        `${unreachableNodes.length} node(s) not reachable from trigger: ` +
        unreachableNodes.map(n => n.id).join(', ')
      );
    }
    
    // ✅ CHECK 3: Basic cycle detection (simple check)
    const hasCycle = this.detectCycles(triggerNodeId, edges);
    if (hasCycle) {
      warnings.push('Workflow may contain cycles (basic detection)');
    }
    
    const details = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      triggerNodes: triggerNodes.length,
      reachableNodes: reachable.size,
      orphanNodes: unreachableNodes.length,
    };
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  /**
   * Find or create trigger node
   * 
   * @param nodes - Node array (will be modified if trigger created)
   * @param triggerType - Type of trigger to find or create
   * @returns Trigger node (existing or newly created)
   */
  private findOrCreateTrigger(
    nodes: WorkflowNode[],
    triggerType: string
  ): WorkflowNode {
    // Try to find existing trigger
    const existingTrigger = nodes.find(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return nodeType === triggerType || 
             nodeType.includes('trigger');
    });
    
    if (existingTrigger) {
      return existingTrigger;
    }
    
    // Create trigger if not found
    console.log(
      `[GraphConnectivityBuilder] ⚠️  No trigger found, creating ${triggerType}`
    );
    
    const triggerNode: WorkflowNode = {
      id: randomUUID(),
      type: triggerType,
      data: {
        label: triggerType.replace('_', ' '),
        type: triggerType,
        category: 'trigger',
        config: {},
      },
      position: { x: 0, y: 0 },
    };
    
    // Add to nodes array
    nodes.unshift(triggerNode); // Add at beginning
    
    return triggerNode;
  }
  
  /**
   * Find all nodes reachable from start node (BFS)
   */
  private findReachableNodes(
    startNodeId: string,
    edges: WorkflowEdge[]
  ): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];
    reachable.add(startNodeId);
    
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    // BFS
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const neighbors = outgoing.get(currentNodeId) || [];
      
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    return reachable;
  }
  
  /**
   * Calculate distances from start node (for finding furthest node)
   */
  private calculateDistances(
    startNodeId: string,
    edges: WorkflowEdge[]
  ): Map<string, number> {
    const distances = new Map<string, number>();
    const queue = [startNodeId];
    distances.set(startNodeId, 0);
    
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    // BFS with distance tracking
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const currentDistance = distances.get(currentNodeId) || 0;
      const neighbors = outgoing.get(currentNodeId) || [];
      
      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDistance + 1);
          queue.push(neighbor);
        }
      }
    }
    
    return distances;
  }
  
  /**
   * Basic cycle detection (DFS)
   */
  private detectCycles(startNodeId: string, edges: WorkflowEdge[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const neighbors = outgoing.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true; // Cycle found
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    return dfs(startNodeId);
  }
}
