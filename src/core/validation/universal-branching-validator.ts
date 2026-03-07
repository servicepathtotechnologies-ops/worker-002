/**
 * Universal Branching Validator
 * 
 * ✅ CRITICAL: Prevents Error #3 - Multiple outgoing edges from non-branching nodes
 * 
 * This validator ensures:
 * 1. Only branching nodes (if_else, switch, merge) can have multiple outgoing edges
 * 2. Checks ALL edges (workflow.edges + injectedEdges) before validation
 * 3. Uses registry as single source of truth for branching rules
 * 4. Never allows invalid branching
 * 
 * Architecture Rule:
 * - ALL branching validation MUST use this validator
 * - NO hardcoded branching checks allowed
 * - Registry is the ONLY source of truth for branching rules
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../types/ai-types';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface BranchingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class UniversalBranchingValidator {
  private static instance: UniversalBranchingValidator;
  
  private constructor() {}
  
  static getInstance(): UniversalBranchingValidator {
    if (!UniversalBranchingValidator.instance) {
      UniversalBranchingValidator.instance = new UniversalBranchingValidator();
    }
    return UniversalBranchingValidator.instance;
  }
  
  /**
   * Check if node allows branching (multiple outgoing edges)
   * Uses registry as single source of truth
   * 
   * Prevents Error #3: Multiple outgoing edges from non-branching nodes
   * 
   * @param nodeType - Node type to check
   * @returns true if node allows branching
   */
  nodeAllowsBranching(nodeType: string): boolean {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      // Unknown node type - default to false (conservative)
      return false;
    }
    
    // ✅ UNIVERSAL: Check registry property first (single source of truth)
    if (nodeDef.isBranching === true) {
      return true;
    }
    
    // ✅ UNIVERSAL: Check if node has multiple outgoing ports (indicates branching capability)
    // This works for ANY node type with multiple ports, not just hardcoded types
    if (nodeDef.outgoingPorts && nodeDef.outgoingPorts.length > 1) {
      // Multiple ports suggest branching capability
      // Use registry category to determine if it's a logic node that should allow branching
      if (nodeDef.category === 'logic') {
        return true;
      }
      // If explicitly marked as branching in registry, allow it
      if (nodeDef.isBranching) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if node allows multiple inputs (merge nodes)
   * 
   * @param nodeType - Node type to check
   * @returns true if node allows multiple inputs
   */
  nodeAllowsMultipleInputs(nodeType: string): boolean {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      return false;
    }
    
    // ✅ UNIVERSAL: Check if node has multiple incoming ports (indicates merge capability)
    // This works for ANY node type with multiple incoming ports, not just hardcoded 'merge'
    if (nodeDef.incomingPorts && nodeDef.incomingPorts.length > 1) {
      // Multiple incoming ports suggest merge capability
      // Use registry category to determine if it's a logic node that should allow multiple inputs
      if (nodeDef.category === 'logic') {
        // Check if node type suggests merge functionality (semantic check via registry)
        // If registry has multiple incoming ports AND it's a logic node, it's likely a merge
        return true;
      }
    }
    
    // ✅ UNIVERSAL: Check registry for explicit merge capability
    // If registry marks node as allowing multiple inputs, respect it
    // This can be set in node definition for any node type
    if (nodeDef.category === 'logic' && nodeDef.incomingPorts && nodeDef.incomingPorts.length > 1) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Validate no invalid branching in workflow
   * Checks ALL edges (workflow.edges + injectedEdges)
   * 
   * Prevents Error #3: Multiple outgoing edges from non-branching nodes
   * 
   * @param workflow - Workflow to validate
   * @param allEdges - All edges including injected ones
   * @returns Validation result
   */
  validateNoInvalidBranching(
    workflow: Workflow,
    allEdges: WorkflowEdge[] = []
  ): BranchingValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // ✅ CRITICAL: Check ALL edges (workflow.edges + injectedEdges)
    const allEdgesToCheck = [...workflow.edges, ...allEdges];
    
    // Group edges by source node
    const edgesBySource = new Map<string, WorkflowEdge[]>();
    for (const edge of allEdgesToCheck) {
      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);
    }
    
    // Check each source node
    for (const [sourceId, edges] of edgesBySource.entries()) {
      if (edges.length > 1) {
        // Multiple outgoing edges - check if allowed
        const sourceNode = workflow.nodes.find(n => n.id === sourceId);
        if (sourceNode) {
          const nodeType = unifiedNormalizeNodeTypeString(sourceNode.data.type);
          const allowsBranching = this.nodeAllowsBranching(nodeType);
          
          if (!allowsBranching) {
            errors.push(
              `Node ${nodeType} (${sourceId}) has ${edges.length} outgoing edges but does not allow branching. ` +
              `Only nodes with isBranching=true in registry can have multiple outgoing edges.`
            );
          } else {
            // Valid branching - log for debugging
            warnings.push(
              `Node ${nodeType} (${sourceId}) has ${edges.length} outgoing edges (branching allowed)`
            );
          }
        } else {
          errors.push(
            `Source node ${sourceId} not found in workflow nodes but has ${edges.length} outgoing edges`
          );
        }
      }
    }
    
    // Group edges by target node
    const edgesByTarget = new Map<string, WorkflowEdge[]>();
    for (const edge of allEdgesToCheck) {
      if (!edgesByTarget.has(edge.target)) {
        edgesByTarget.set(edge.target, []);
      }
      edgesByTarget.get(edge.target)!.push(edge);
    }
    
    // Check each target node
    for (const [targetId, edges] of edgesByTarget.entries()) {
      if (edges.length > 1) {
        // Multiple incoming edges - check if allowed
        const targetNode = workflow.nodes.find(n => n.id === targetId);
        if (targetNode) {
          const nodeType = unifiedNormalizeNodeTypeString(targetNode.data.type);
          const allowsMultipleInputs = this.nodeAllowsMultipleInputs(nodeType);
          
          if (!allowsMultipleInputs) {
            errors.push(
              `Node ${nodeType} (${targetId}) has ${edges.length} incoming edges but does not allow multiple inputs. ` +
              `Only nodes with multiple incomingPorts in registry can have multiple incoming edges.`
            );
          }
        } else {
          errors.push(
            `Target node ${targetId} not found in workflow nodes but has ${edges.length} incoming edges`
          );
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Check if a specific edge creation would create invalid branching
   * 
   * @param sourceNode - Source node
   * @param targetNode - Target node
   * @param existingEdges - Existing edges in workflow
   * @param allEdgesBeingCreated - All edges being created in this pass
   * @returns true if edge creation is allowed
   */
  canCreateEdge(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    existingEdges: WorkflowEdge[],
    allEdgesBeingCreated: WorkflowEdge[] = []
  ): { allowed: boolean; reason?: string } {
    const allEdges = [...existingEdges, ...allEdgesBeingCreated];
    
    // Check source node
    const sourceOutgoingEdges = allEdges.filter(e => e.source === sourceNode.id);
    if (sourceOutgoingEdges.length > 0) {
      // Source already has outgoing edges
      const sourceType = unifiedNormalizeNodeTypeString(sourceNode.data.type);
      const allowsBranching = this.nodeAllowsBranching(sourceType);
      
      if (!allowsBranching) {
        return {
          allowed: false,
          reason: `Source node ${sourceType} already has ${sourceOutgoingEdges.length} outgoing edge(s) and does not allow branching`
        };
      }
    }
    
    // Check target node
    const targetIncomingEdges = allEdges.filter(e => e.target === targetNode.id);
    if (targetIncomingEdges.length > 0) {
      // Target already has incoming edges
      const targetType = unifiedNormalizeNodeTypeString(targetNode.data.type);
      const allowsMultipleInputs = this.nodeAllowsMultipleInputs(targetType);
      
      if (!allowsMultipleInputs) {
        return {
          allowed: false,
          reason: `Target node ${targetType} already has ${targetIncomingEdges.length} incoming edge(s) and does not allow multiple inputs`
        };
      }
    }
    
    return { allowed: true };
  }
}

// Export singleton instance
export const universalBranchingValidator = UniversalBranchingValidator.getInstance();
