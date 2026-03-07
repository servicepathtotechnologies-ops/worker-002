/**
 * Edge Creation Validator
 * 
 * ✅ CRITICAL: Prevents Error #5 - Parallel branches from multiple sources
 * 
 * This validator ensures:
 * 1. Validates edge creation BEFORE adding to workflow
 * 2. Checks source node: existing outgoing edges + branching rules
 * 3. Checks target node: existing incoming edges + merge rules
 * 4. Validates handle compatibility
 * 5. Uses registry as single source of truth
 * 
 * Architecture Rule:
 * - ALL edge creation MUST use this validator
 * - NO edge creation without validation
 * - Registry is the ONLY source of truth for validation rules
 */

import { WorkflowNode, WorkflowEdge } from '../types/ai-types';
import { universalBranchingValidator } from './universal-branching-validator';
import { universalHandleResolver } from '../utils/universal-handle-resolver';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface EdgeCreationValidationResult {
  allowed: boolean;
  reason?: string;
  suggestedSourceHandle?: string;
  suggestedTargetHandle?: string;
}

export class EdgeCreationValidator {
  private static instance: EdgeCreationValidator;
  
  private constructor() {}
  
  static getInstance(): EdgeCreationValidator {
    if (!EdgeCreationValidator.instance) {
      EdgeCreationValidator.instance = new EdgeCreationValidator();
    }
    return EdgeCreationValidator.instance;
  }
  
  /**
   * Validate edge creation before adding to workflow
   * Prevents Error #5: Parallel branches from multiple sources
   * 
   * @param sourceNode - Source node
   * @param targetNode - Target node
   * @param existingEdges - Existing edges in workflow
   * @param allEdgesBeingCreated - All edges being created in this pass
   * @param explicitSourceHandle - Explicit source handle from structure
   * @param explicitTargetHandle - Explicit target handle from structure
   * @param connectionType - Connection type ('true', 'false', 'main', etc.)
   * @returns Validation result
   */
  canCreateEdge(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    existingEdges: WorkflowEdge[],
    allEdgesBeingCreated: WorkflowEdge[] = [],
    explicitSourceHandle?: string,
    explicitTargetHandle?: string,
    connectionType?: string
  ): EdgeCreationValidationResult {
    // ✅ CRITICAL: Check ALL edges (existing + being created)
    const allEdges = [...existingEdges, ...allEdgesBeingCreated];
    
    // ✅ CHECK 1: Source node validation
    const sourceOutgoingEdges = allEdges.filter(e => e.source === sourceNode.id);
    if (sourceOutgoingEdges.length > 0) {
      // Source already has outgoing edges
      const sourceType = unifiedNormalizeNodeTypeString(sourceNode.data.type);
      const allowsBranching = universalBranchingValidator.nodeAllowsBranching(sourceType);
      
      if (!allowsBranching) {
        return {
          allowed: false,
          reason: `Source node ${sourceType} (${sourceNode.id}) already has ${sourceOutgoingEdges.length} outgoing edge(s) and does not allow branching. ` +
                  `Only branching nodes (if_else, switch) can have multiple outgoing edges.`
        };
      }
    }
    
    // ✅ CHECK 2: Target node validation
    const targetIncomingEdges = allEdges.filter(e => e.target === targetNode.id);
    if (targetIncomingEdges.length > 0) {
      // Target already has incoming edges
      const targetType = unifiedNormalizeNodeTypeString(targetNode.data.type);
      const allowsMultipleInputs = universalBranchingValidator.nodeAllowsMultipleInputs(targetType);
      
      if (!allowsMultipleInputs) {
        return {
          allowed: false,
          reason: `Target node ${targetType} (${targetNode.id}) already has ${targetIncomingEdges.length} incoming edge(s) and does not allow multiple inputs. ` +
                  `Only merge nodes can have multiple incoming edges.`
        };
      }
    }
    
    // ✅ CHECK 3: Handle compatibility
    const sourceHandleResult = universalHandleResolver.resolveSourceHandle(
      sourceNode.data.type,
      explicitSourceHandle,
      connectionType as any
    );
    
    const targetHandleResult = universalHandleResolver.resolveTargetHandle(
      targetNode.data.type,
      explicitTargetHandle
    );
    
    if (!sourceHandleResult.valid || !targetHandleResult.valid) {
      return {
        allowed: false,
        reason: `Handle resolution failed: ${sourceHandleResult.reason || targetHandleResult.reason}`,
        suggestedSourceHandle: sourceHandleResult.handle,
        suggestedTargetHandle: targetHandleResult.handle
      };
    }
    
    const handleCompatible = universalHandleResolver.validateHandleCompatibility(
      sourceNode.data.type,
      sourceHandleResult.handle,
      targetNode.data.type,
      targetHandleResult.handle
    );
    
    if (!handleCompatible) {
      return {
        allowed: false,
        reason: `Handle incompatibility: ${sourceNode.data.type}.${sourceHandleResult.handle} → ${targetNode.data.type}.${targetHandleResult.handle}`,
        suggestedSourceHandle: sourceHandleResult.handle,
        suggestedTargetHandle: targetHandleResult.handle
      };
    }
    
    // ✅ All checks passed
    return {
      allowed: true,
      suggestedSourceHandle: sourceHandleResult.handle,
      suggestedTargetHandle: targetHandleResult.handle
    };
  }
  
  /**
   * Validate multiple edges at once
   * Useful when creating multiple edges in a batch
   * 
   * @param edgesToCreate - Array of edges to validate
   * @param existingEdges - Existing edges in workflow
   * @param nodes - All nodes in workflow
   * @returns Validation result for each edge
   */
  validateMultipleEdges(
    edgesToCreate: Array<{
      sourceId: string;
      targetId: string;
      explicitSourceHandle?: string;
      explicitTargetHandle?: string;
      connectionType?: string;
    }>,
    existingEdges: WorkflowEdge[],
    nodes: WorkflowNode[]
  ): Map<string, EdgeCreationValidationResult> {
    const results = new Map<string, EdgeCreationValidationResult>();
    const allEdgesBeingCreated: WorkflowEdge[] = [];
    
    // Validate each edge in sequence
    for (const edgeSpec of edgesToCreate) {
      const sourceNode = nodes.find(n => n.id === edgeSpec.sourceId);
      const targetNode = nodes.find(n => n.id === edgeSpec.targetId);
      
      if (!sourceNode || !targetNode) {
        results.set(`${edgeSpec.sourceId}->${edgeSpec.targetId}`, {
          allowed: false,
          reason: `Source or target node not found`
        });
        continue;
      }
      
      const validation = this.canCreateEdge(
        sourceNode,
        targetNode,
        existingEdges,
        allEdgesBeingCreated,
        edgeSpec.explicitSourceHandle,
        edgeSpec.explicitTargetHandle,
        edgeSpec.connectionType
      );
      
      results.set(`${edgeSpec.sourceId}->${edgeSpec.targetId}`, validation);
      
      // If allowed, add to allEdgesBeingCreated for next iteration
      if (validation.allowed) {
        allEdgesBeingCreated.push({
          id: `${edgeSpec.sourceId}->${edgeSpec.targetId}`,
          source: edgeSpec.sourceId,
          target: edgeSpec.targetId,
          sourceHandle: validation.suggestedSourceHandle,
          targetHandle: validation.suggestedTargetHandle,
        } as WorkflowEdge);
      }
    }
    
    return results;
  }
}

// Export singleton instance
export const edgeCreationValidator = EdgeCreationValidator.getInstance();
