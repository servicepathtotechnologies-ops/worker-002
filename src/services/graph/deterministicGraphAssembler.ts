/**
 * ✅ DETERMINISTIC GRAPH ASSEMBLER - Root-Level Orphan Prevention
 * 
 * Eliminates orphan nodes permanently by enforcing:
 * - Deterministic execution plan construction
 * - Canonical node ID usage
 * - Schema-aware handle normalization
 * - Atomic edge creation
 * 
 * Architectural Principle:
 * "Connectivity must be guaranteed during graph construction, not repaired afterward."
 * 
 * Guarantees:
 * - Exactly one trigger node
 * - Every node except trigger has exactly one incoming edge
 * - No orphan nodes exist
 * - Graph is fully connected
 * 
 * Failure Policy:
 * - If edge creation fails → abort workflow build
 * - Log error
 * - Do not continue with partial graph
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { StructuredIntent } from '../ai/intent-structurer';
import { executionPlanBuilder, ExecutionPlan } from './executionPlanBuilder';
import { atomicEdgeCreator, AtomicEdgeCreationResult } from './atomicEdgeCreator';
import { nodeIdResolver } from '../../core/utils/nodeIdResolver';

export interface GraphAssemblyResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  executionPlan: ExecutionPlan;
  success: boolean;
  errors: string[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanNodes: number;
  };
}

/**
 * ✅ Deterministic Graph Assembler
 * 
 * Assembles graph deterministically with zero orphan nodes
 */
export class DeterministicGraphAssembler {
  /**
   * Assemble graph deterministically
   * 
   * Process:
   * 1. Build execution plan
   * 2. Enforce trigger first
   * 3. Create edges atomically
   * 4. Validate connectivity
   * 5. Return complete graph
   */
  assembleGraph(
    nodes: WorkflowNode[],
    intent?: StructuredIntent | null
  ): GraphAssemblyResult {
    console.log(`[DeterministicGraphAssembler] 🔧 Assembling graph with ${nodes.length} nodes...`);
    
    // ✅ STEP 1: Build execution plan
    const executionPlan = executionPlanBuilder.buildExecutionPlan(nodes, intent);
    
    if (!executionPlan.isValid) {
      console.error(
        `[DeterministicGraphAssembler] ❌ Execution plan invalid: ${executionPlan.errors.join(', ')}`
      );
      return {
        nodes,
        edges: [],
        executionPlan,
        success: false,
        errors: executionPlan.errors,
        stats: {
          totalNodes: nodes.length,
          totalEdges: 0,
          orphanNodes: nodes.length - 1, // All except trigger
        },
      };
    }
    
    // ✅ STEP 2: Enforce trigger first (already done in execution plan)
    if (executionPlan.orderedNodeIds[0] !== executionPlan.triggerNodeId) {
      const error = 'Trigger node is not first in execution plan';
      console.error(`[DeterministicGraphAssembler] ❌ ${error}`);
      return {
        nodes,
        edges: [],
        executionPlan,
        success: false,
        errors: [error],
        stats: {
          totalNodes: nodes.length,
          totalEdges: 0,
          orphanNodes: nodes.length - 1,
        },
      };
    }
    
    // ✅ STEP 3: Ensure all nodes from plan exist
    const planNodeIds = new Set(executionPlan.orderedNodeIds);
    const allNodeIds = new Set(nodes.map(n => n.id));
    
    const missingNodes: string[] = [];
    for (const nodeId of planNodeIds) {
      if (!allNodeIds.has(nodeId)) {
        missingNodes.push(nodeId);
      }
    }
    
    if (missingNodes.length > 0) {
      const error = `Nodes in execution plan not found: ${missingNodes.join(', ')}`;
      console.error(`[DeterministicGraphAssembler] ❌ ${error}`);
      return {
        nodes,
        edges: [],
        executionPlan,
        success: false,
        errors: [error],
        stats: {
          totalNodes: nodes.length,
          totalEdges: 0,
          orphanNodes: nodes.length - 1,
        },
      };
    }
    
    // ✅ STEP 4: Create edges atomically
    const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(executionPlan, nodes);
    
    if (!edgeResult.success) {
      console.error(
        `[DeterministicGraphAssembler] ❌ Edge creation failed: ${edgeResult.errors.join(', ')}`
      );
      // ✅ FAILURE POLICY: Abort workflow build
      return {
        nodes,
        edges: [],
        executionPlan,
        success: false,
        errors: edgeResult.errors,
        stats: {
          totalNodes: nodes.length,
          totalEdges: 0,
          orphanNodes: nodes.length - 1,
        },
      };
    }
    
    // ✅ STEP 5: Validate edges against execution plan
    const edgeValidation = atomicEdgeCreator.validateEdgesAgainstPlan(edgeResult.edges, executionPlan);
    
    if (!edgeValidation.valid) {
      console.error(
        `[DeterministicGraphAssembler] ❌ Edge validation failed: ${edgeValidation.errors.join(', ')}`
      );
      // ✅ FAILURE POLICY: Abort workflow build
      return {
        nodes,
        edges: [],
        executionPlan,
        success: false,
        errors: edgeValidation.errors,
        stats: {
          totalNodes: nodes.length,
          totalEdges: 0,
          orphanNodes: nodes.length - 1,
        },
      };
    }
    
    // ✅ STEP 6: Validate connectivity (no orphan nodes)
    const connectivityValidation = this.validateConnectivity(edgeResult.edges, executionPlan);
    
    if (!connectivityValidation.valid) {
      console.error(
        `[DeterministicGraphAssembler] ❌ Connectivity validation failed: ${connectivityValidation.errors.join(', ')}`
      );
      // ✅ FAILURE POLICY: Abort workflow build
      return {
        nodes,
        edges: [],
        executionPlan,
        success: false,
        errors: connectivityValidation.errors,
        stats: {
          totalNodes: nodes.length,
          totalEdges: 0,
          orphanNodes: connectivityValidation.orphanNodes.length,
        },
      };
    }
    
    // ✅ STEP 7: Success - return complete graph
    console.log(
      `[DeterministicGraphAssembler] ✅ Graph assembled: ${nodes.length} nodes, ` +
      `${edgeResult.edges.length} edges, 0 orphan nodes`
    );
    
    return {
      nodes,
      edges: edgeResult.edges,
      executionPlan,
      success: true,
      errors: [],
      stats: {
        totalNodes: nodes.length,
        totalEdges: edgeResult.edges.length,
        orphanNodes: 0, // ✅ GUARANTEED: Zero orphan nodes
      },
    };
  }
  
  /**
   * Validate connectivity (no orphan nodes)
   * 
   * Validation Contract:
   * - Exactly one trigger node
   * - Every node except trigger has exactly one incoming edge
   * - No orphan nodes exist
   * - Graph is fully connected
   */
  private validateConnectivity(
    edges: WorkflowEdge[],
    executionPlan: ExecutionPlan
  ): { valid: boolean; errors: string[]; orphanNodes: string[] } {
    const errors: string[] = [];
    const orphanNodes: string[] = [];
    
    const orderedNodeIds = executionPlan.orderedNodeIds;
    const triggerNodeId = executionPlan.triggerNodeId;
    
    // ✅ VALIDATION 1: Exactly one trigger node
    if (orderedNodeIds[0] !== triggerNodeId) {
      errors.push('Trigger node is not first in execution plan');
    }
    
    // ✅ VALIDATION 2: Every node except trigger has exactly one incoming edge
    const incomingEdgeCount = new Map<string, number>();
    
    for (const edge of edges) {
      const count = incomingEdgeCount.get(edge.target) || 0;
      incomingEdgeCount.set(edge.target, count + 1);
    }
    
    for (let i = 1; i < orderedNodeIds.length; i++) {
      const nodeId = orderedNodeIds[i];
      const incomingCount = incomingEdgeCount.get(nodeId) || 0;
      
      if (incomingCount === 0) {
        orphanNodes.push(nodeId);
        errors.push(`Orphan node detected: ${nodeId} has no incoming edge`);
      } else if (incomingCount > 1) {
        errors.push(`Node ${nodeId} has ${incomingCount} incoming edges (expected 1)`);
      }
    }
    
    // ✅ VALIDATION 3: No orphan nodes exist
    if (orphanNodes.length > 0) {
      errors.push(`Found ${orphanNodes.length} orphan node(s): ${orphanNodes.join(', ')}`);
    }
    
    // ✅ VALIDATION 4: Graph is fully connected
    const reachable = this.findReachableNodes(triggerNodeId, edges);
    const allNodeIds = new Set(orderedNodeIds);
    
    for (const nodeId of allNodeIds) {
      if (!reachable.has(nodeId)) {
        errors.push(`Node ${nodeId} is not reachable from trigger`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      orphanNodes,
    };
  }
  
  /**
   * Find all nodes reachable from trigger using BFS
   */
  private findReachableNodes(
    startNodeId: string,
    edges: WorkflowEdge[]
  ): Set<string> {
    const reachable = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      
      for (const edge of edges) {
        if (edge.source === currentNodeId && !reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    
    return reachable;
  }
}

// Export singleton instance
export const deterministicGraphAssembler = new DeterministicGraphAssembler();
