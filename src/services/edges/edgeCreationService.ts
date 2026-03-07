/**
 * ✅ EDGE CREATION SERVICE - Production-Grade Edge Creation with Repair
 * 
 * This service ensures edges are created correctly with:
 * - Node ID resolution (logical → physical)
 * - Handle normalization using alias registry
 * - Validation with fallback repair
 * - Audit logging for all repairs
 * 
 * Architecture:
 * - Resolves node IDs using NodeIdResolver
 * - Normalizes handles using registry
 * - Validates handles
 * - Attempts fallback normalization if validation fails
 * - Logs audit record for repairs
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeIdResolver } from '../../core/utils/nodeIdResolver';
import {
  validateAndFixEdgeHandles,
  normalizeSourceHandle,
  normalizeTargetHandle,
  getNodeHandleContract,
  isValidHandle,
} from '../../core/utils/node-handle-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { randomUUID } from 'crypto';

export interface EdgeCreationResult {
  success: boolean;
  edge?: WorkflowEdge;
  repairs: EdgeRepair[];
  error?: string;
}

export interface EdgeRepair {
  type: 'node_id_resolution' | 'handle_normalization' | 'handle_fallback' | 'validation_repair';
  description: string;
  original?: string;
  repaired?: string;
  timestamp: number;
}

export interface EdgeCreationOptions {
  sourceNodeId: string;        // Logical or physical ID
  targetNodeId: string;        // Logical or physical ID
  sourceHandle?: string;        // Optional handle name
  targetHandle?: string;        // Optional handle name
  sourceNode?: WorkflowNode;    // Optional source node (for validation)
  targetNode?: WorkflowNode;    // Optional target node (for validation)
  nodes?: WorkflowNode[];       // All nodes (for ID resolution)
  edgeType?: string;            // Edge type (default: 'default')
  allowRepair?: boolean;        // Allow repair if validation fails (default: true)
  strict?: boolean;             // Strict validation mode (default: false)
}

/**
 * ✅ Edge Creation Service
 * 
 * Creates edges with automatic repair and validation
 */
export class EdgeCreationService {
  /**
   * Create an edge with automatic ID resolution and handle normalization
   */
  createEdge(options: EdgeCreationOptions): EdgeCreationResult {
    const repairs: EdgeRepair[] = [];
    const {
      sourceNodeId: sourceIdInput,
      targetNodeId: targetIdInput,
      sourceHandle: sourceHandleInput,
      targetHandle: targetHandleInput,
      sourceNode,
      targetNode,
      nodes = [],
      edgeType = 'default',
      allowRepair = true,
      strict = false,
    } = options;

    try {
      // ✅ STEP 1: Resolve node IDs (logical → physical)
      let sourceNodeId = sourceIdInput;
      let targetNodeId = targetIdInput;

      // Try to resolve logical IDs
      const resolvedSource = nodeIdResolver.resolve(sourceIdInput);
      const resolvedTarget = nodeIdResolver.resolve(targetIdInput);

      if (resolvedSource) {
        if (resolvedSource !== sourceIdInput) {
          repairs.push({
            type: 'node_id_resolution',
            description: `Resolved source node ID: ${sourceIdInput} → ${resolvedSource}`,
            original: sourceIdInput,
            repaired: resolvedSource,
            timestamp: Date.now(),
          });
        }
        sourceNodeId = resolvedSource;
      }

      if (resolvedTarget) {
        if (resolvedTarget !== targetIdInput) {
          repairs.push({
            type: 'node_id_resolution',
            description: `Resolved target node ID: ${targetIdInput} → ${resolvedTarget}`,
            original: targetIdInput,
            repaired: resolvedTarget,
            timestamp: Date.now(),
          });
        }
        targetNodeId = resolvedTarget;
      }

      // ✅ STEP 2: Find actual nodes if not provided
      let actualSourceNode = sourceNode;
      let actualTargetNode = targetNode;

      if (!actualSourceNode) {
        actualSourceNode = nodes.find(n => n.id === sourceNodeId);
      }

      if (!actualTargetNode) {
        actualTargetNode = nodes.find(n => n.id === targetNodeId);
      }

      // Validate nodes exist
      if (!actualSourceNode) {
        return {
          success: false,
          repairs,
          error: `Source node not found: ${sourceNodeId}`,
        };
      }

      if (!actualTargetNode) {
        return {
          success: false,
          repairs,
          error: `Target node not found: ${targetNodeId}`,
        };
      }

      // ✅ STEP 3: Get node types
      const sourceNodeType = unifiedNormalizeNodeType(actualSourceNode);
      const targetNodeType = unifiedNormalizeNodeType(actualTargetNode);

      // ✅ STEP 4: Normalize handles
      let sourceHandle = sourceHandleInput;
      let targetHandle = targetHandleInput;

      if (sourceHandle) {
        const normalized = normalizeSourceHandle(sourceNodeType, sourceHandle);
        if (normalized !== sourceHandle) {
          repairs.push({
            type: 'handle_normalization',
            description: `Normalized source handle: ${sourceHandle} → ${normalized}`,
            original: sourceHandle,
            repaired: normalized,
            timestamp: Date.now(),
          });
          sourceHandle = normalized;
        }
      } else {
        // Get default source handle
        const contract = getNodeHandleContract(sourceNodeType);
        sourceHandle = contract.outputs[0] || 'output';
        repairs.push({
          type: 'handle_normalization',
          description: `Using default source handle: ${sourceHandle}`,
          timestamp: Date.now(),
        });
      }

      if (targetHandle) {
        const normalized = normalizeTargetHandle(targetNodeType, targetHandle);
        if (normalized !== targetHandle) {
          repairs.push({
            type: 'handle_normalization',
            description: `Normalized target handle: ${targetHandle} → ${normalized}`,
            original: targetHandle,
            repaired: normalized,
            timestamp: Date.now(),
          });
          targetHandle = normalized;
        }
      } else {
        // Get default target handle
        const contract = getNodeHandleContract(targetNodeType);
        targetHandle = contract.inputs[0] || 'input';
        repairs.push({
          type: 'handle_normalization',
          description: `Using default target handle: ${targetHandle}`,
          timestamp: Date.now(),
        });
      }

      // ✅ STEP 5: Validate handles
      const sourceValid = isValidHandle(sourceNodeType, sourceHandle, true);
      const targetValid = isValidHandle(targetNodeType, targetHandle, false);

      if (!sourceValid || !targetValid) {
        if (!allowRepair) {
          return {
            success: false,
            repairs,
            error: `Invalid handles: source=${sourceHandle} (valid: ${sourceValid}), target=${targetHandle} (valid: ${targetValid})`,
          };
        }

        // ✅ STEP 6: Attempt repair with fallback
        const repairResult = this.repairHandles(
          sourceNodeType,
          targetNodeType,
          sourceHandle,
          targetHandle
        );

        if (repairResult.success) {
          if (repairResult.sourceHandle !== sourceHandle) {
            repairs.push({
              type: 'handle_fallback',
              description: `Repaired source handle: ${sourceHandle} → ${repairResult.sourceHandle}`,
              original: sourceHandle,
              repaired: repairResult.sourceHandle,
              timestamp: Date.now(),
            });
            sourceHandle = repairResult.sourceHandle;
          }

          if (repairResult.targetHandle !== targetHandle) {
            repairs.push({
              type: 'handle_fallback',
              description: `Repaired target handle: ${targetHandle} → ${repairResult.targetHandle}`,
              original: targetHandle,
              repaired: repairResult.targetHandle,
              timestamp: Date.now(),
            });
            targetHandle = repairResult.targetHandle;
          }
        } else {
          // Final validation: use validateAndFixEdgeHandles
          const fixed = validateAndFixEdgeHandles(
            sourceNodeType,
            targetNodeType,
            sourceHandle,
            targetHandle
          );

          if (fixed.sourceHandle !== sourceHandle || fixed.targetHandle !== targetHandle) {
            repairs.push({
              type: 'validation_repair',
              description: `Validation repair: source=${sourceHandle}→${fixed.sourceHandle}, target=${targetHandle}→${fixed.targetHandle}`,
              original: `${sourceHandle}→${targetHandle}`,
              repaired: `${fixed.sourceHandle}→${fixed.targetHandle}`,
              timestamp: Date.now(),
            });
            sourceHandle = fixed.sourceHandle;
            targetHandle = fixed.targetHandle;
          }
        }
      }

      // ✅ STEP 7: Final validation (strict mode)
      if (strict) {
        const finalSourceValid = isValidHandle(sourceNodeType, sourceHandle, true);
        const finalTargetValid = isValidHandle(targetNodeType, targetHandle, false);

        if (!finalSourceValid || !finalTargetValid) {
          return {
            success: false,
            repairs,
            error: `Strict validation failed: source=${sourceHandle}, target=${targetHandle}`,
          };
        }
      }

      // ✅ STEP 8: Create edge
      const edge: WorkflowEdge = {
        id: randomUUID(),
        source: sourceNodeId,
        target: targetNodeId,
        type: edgeType,
        sourceHandle,
        targetHandle,
      };

      // Log repairs if any
      if (repairs.length > 0) {
        console.log(
          `[EdgeCreationService] ✅ Created edge with ${repairs.length} repair(s): ` +
          `${sourceNodeType}(${sourceHandle}) → ${targetNodeType}(${targetHandle})`
        );
        repairs.forEach(repair => {
          console.log(`  - ${repair.type}: ${repair.description}`);
        });
      }

      return {
        success: true,
        edge,
        repairs,
      };
    } catch (error: any) {
      return {
        success: false,
        repairs,
        error: error.message || 'Unknown error during edge creation',
      };
    }
  }

  /**
   * Repair handles with fallback strategies
   */
  private repairHandles(
    sourceNodeType: string,
    targetNodeType: string,
    sourceHandle: string,
    targetHandle: string
  ): { success: boolean; sourceHandle: string; targetHandle: string } {
    const sourceContract = getNodeHandleContract(sourceNodeType);
    const targetContract = getNodeHandleContract(targetNodeType);

    // Try to find valid handles
    let repairedSource = sourceHandle;
    let repairedTarget = targetHandle;

    // Repair source handle
    if (!sourceContract.outputs.includes(sourceHandle)) {
      // Try default
      if (sourceContract.outputs.length > 0) {
        repairedSource = sourceContract.outputs[0];
      } else {
        repairedSource = 'output'; // Ultimate fallback
      }
    }

    // Repair target handle
    if (!targetContract.inputs.includes(targetHandle)) {
      // Try default
      if (targetContract.inputs.length > 0) {
        repairedTarget = targetContract.inputs[0];
      } else {
        repairedTarget = 'input'; // Ultimate fallback
      }
    }

    return {
      success: true,
      sourceHandle: repairedSource,
      targetHandle: repairedTarget,
    };
  }

  /**
   * Create multiple edges at once
   */
  createEdges(
    connections: Array<{
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }>,
    nodes: WorkflowNode[],
    options?: {
      allowRepair?: boolean;
      strict?: boolean;
      edgeType?: string;
    }
  ): { edges: WorkflowEdge[]; repairs: EdgeRepair[]; errors: string[] } {
    const edges: WorkflowEdge[] = [];
    const allRepairs: EdgeRepair[] = [];
    const errors: string[] = [];

    for (const connection of connections) {
      const result = this.createEdge({
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        nodes,
        edgeType: options?.edgeType,
        allowRepair: options?.allowRepair ?? true,
        strict: options?.strict ?? false,
      });

      if (result.success && result.edge) {
        edges.push(result.edge);
        allRepairs.push(...result.repairs);
      } else {
        errors.push(result.error || 'Unknown error');
      }
    }

    return { edges, repairs: allRepairs, errors };
  }
}

// Export singleton instance
export const edgeCreationService = new EdgeCreationService();
