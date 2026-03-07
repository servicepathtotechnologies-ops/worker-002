/**
 * ✅ PRODUCTION-READY: Centralized Graph Branching Validator
 * 
 * Single source of truth for branching validation rules.
 * Eliminates duplication across:
 * - convertStructureToWorkflow
 * - injectMissingNodes
 * - StructuralDAGValidationLayer
 * 
 * Uses registry as authoritative source - no hardcoded fallbacks.
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../types/ai-types';

export interface BranchingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nodesWithInvalidBranching: string[];
}

/**
 * ✅ PRODUCTION-READY: Centralized branching validator
 * 
 * Validates that only nodes that allow branching have multiple outgoing edges.
 * Uses registry as single source of truth.
 */
export class GraphBranchingValidator {
  /**
   * Validate branching rules for entire workflow
   */
  validateWorkflow(workflow: Workflow): BranchingValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const nodesWithInvalidBranching: string[] = [];
    
    const nodeOutgoingCount = new Map<string, number>();
    
    // Count outgoing edges per node
    workflow.edges.forEach(edge => {
      const count = nodeOutgoingCount.get(edge.source) || 0;
      nodeOutgoingCount.set(edge.source, count + 1);
    });
    
    // Validate each node
    workflow.nodes.forEach(node => {
      const nodeId = node.id;
      const outgoingCount = nodeOutgoingCount.get(nodeId) || 0;
      
      // Nodes with multiple outgoing edges must allow branching
      if (outgoingCount > 1) {
        const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
        const allowsBranching = this.nodeAllowsBranching(nodeType);
        
        if (!allowsBranching) {
          nodesWithInvalidBranching.push(nodeId);
          errors.push(
            `Node ${nodeType} (${nodeId}) has ${outgoingCount} outgoing edges but does not allow branching. ` +
            `Only nodes with isBranching=true or category='logic' with conditional tags can have multiple outgoing edges.`
          );
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      nodesWithInvalidBranching,
    };
  }
  
  /**
   * ✅ PHASE 1 FIX: Use registry helper method as single source of truth
   * 
   * @param nodeType - Node type to check (normalized)
   * @returns true if node allows branching, false otherwise
   */
  nodeAllowsBranching(nodeType: string): boolean {
    // ✅ PHASE 1 FIX: Use registry helper method
    return unifiedNodeRegistry.allowsBranching(nodeType);
  }
  
  /**
   * Check if a node allows multiple incoming edges (merge nodes)
   */
  allowsMultipleInputs(nodeType: string): boolean {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    
    if (!nodeDef) {
      return false;
    }
    
    // Merge nodes allow multiple inputs
    return nodeDef.category === 'logic' && 
           nodeDef.isBranching &&
           (nodeDef.tags || []).some(tag => tag.toLowerCase() === 'merge');
  }
  
  /**
   * Validate edge creation would not violate branching rules
   */
  canCreateEdge(
    workflow: Workflow,
    sourceNodeId: string,
    targetNodeId: string
  ): { allowed: boolean; reason?: string } {
    const sourceNode = workflow.nodes.find(n => n.id === sourceNodeId);
    const targetNode = workflow.nodes.find(n => n.id === targetNodeId);
    
    if (!sourceNode || !targetNode) {
      return { allowed: false, reason: 'Source or target node not found' };
    }
    
    const sourceType = unifiedNormalizeNodeType(sourceNode);
    const targetType = unifiedNormalizeNodeType(targetNode);
    
    // Check if source already has outgoing edges
    const existingOutgoingEdges = workflow.edges.filter(e => e.source === sourceNodeId);
    if (existingOutgoingEdges.length > 0) {
      const allowsBranching = this.nodeAllowsBranching(sourceType);
      if (!allowsBranching) {
        return {
          allowed: false,
          reason: `Source node ${sourceType} already has ${existingOutgoingEdges.length} outgoing edge(s) and does not allow branching`
        };
      }
    }
    
    // Check if target already has incoming edges
    const existingIncomingEdges = workflow.edges.filter(e => e.target === targetNodeId);
    if (existingIncomingEdges.length > 0) {
      const allowsMultipleInputs = this.allowsMultipleInputs(targetType);
      if (!allowsMultipleInputs) {
        return {
          allowed: false,
          reason: `Target node ${targetType} already has ${existingIncomingEdges.length} incoming edge(s) and does not allow multiple inputs`
        };
      }
    }
    
    return { allowed: true };
  }
}

// Export singleton instance
export const graphBranchingValidator = new GraphBranchingValidator();
