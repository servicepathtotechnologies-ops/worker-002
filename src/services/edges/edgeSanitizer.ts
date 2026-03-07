/**
 * ✅ EDGE SANITIZER - Production-Grade Edge Cleanup Service
 * 
 * Scans all edges and fixes:
 * - Node ID mismatches
 * - Invalid handle names
 * - Removes only unrecoverable edges
 * - Logs all repairs for audit
 * 
 * Architecture:
 * - Scans all edges in workflow
 * - Fixes node ID mismatches using NodeIdResolver
 * - Normalizes handles using registry
 * - Removes only edges that cannot be repaired
 * - Logs all repairs for debugging
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeIdResolver } from '../../core/utils/nodeIdResolver';
import { edgeCreationService, EdgeRepair } from './edgeCreationService';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface EdgeSanitizationResult {
  edges: WorkflowEdge[];
  removed: WorkflowEdge[];
  repaired: Array<{
    edge: WorkflowEdge;
    repairs: EdgeRepair[];
  }>;
  stats: {
    total: number;
    valid: number;
    repaired: number;
    removed: number;
  };
}

/**
 * ✅ Edge Sanitizer
 * 
 * Sanitizes edges by fixing ID mismatches and invalid handles
 */
export class EdgeSanitizer {
  /**
   * Sanitize all edges in a workflow
   */
  sanitize(
    edges: WorkflowEdge[],
    nodes: WorkflowNode[]
  ): EdgeSanitizationResult {
    const sanitized: WorkflowEdge[] = [];
    const removed: WorkflowEdge[] = [];
    const repaired: Array<{ edge: WorkflowEdge; repairs: EdgeRepair[] }> = [];

    const nodeMap = new Map<string, WorkflowNode>();
    nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

    console.log(`[EdgeSanitizer] 🔍 Sanitizing ${edges.length} edges...`);

    for (const edge of edges) {
      // ✅ STEP 1: Check if source node exists
      let sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) {
        // Try to resolve logical ID
        const resolvedSource = nodeIdResolver.resolve(edge.source);
        if (resolvedSource) {
          sourceNode = nodeMap.get(resolvedSource);
          if (sourceNode) {
            console.log(
              `[EdgeSanitizer] ✅ Resolved source ID: ${edge.source} → ${resolvedSource}`
            );
            edge.source = resolvedSource;
          }
        }
      }

      // ✅ STEP 2: Check if target node exists
      let targetNode = nodeMap.get(edge.target);
      if (!targetNode) {
        // Try to resolve logical ID
        const resolvedTarget = nodeIdResolver.resolve(edge.target);
        if (resolvedTarget) {
          targetNode = nodeMap.get(resolvedTarget);
          if (targetNode) {
            console.log(
              `[EdgeSanitizer] ✅ Resolved target ID: ${edge.target} → ${resolvedTarget}`
            );
            edge.target = resolvedTarget;
          }
        }
      }

      // ✅ STEP 3: Validate nodes exist
      if (!sourceNode || !targetNode) {
        console.warn(
          `[EdgeSanitizer] ❌ Removing unrecoverable edge: ` +
          `${edge.source} → ${edge.target} (node missing)`
        );
        removed.push(edge);
        continue;
      }

      // ✅ STEP 4: Repair edge using EdgeCreationService
      const repairResult = edgeCreationService.createEdge({
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        sourceNode,
        targetNode,
        nodes,
        edgeType: edge.type,
        allowRepair: true,
        strict: false,
      });

      if (repairResult.success && repairResult.edge) {
        if (repairResult.repairs.length > 0) {
          repaired.push({
            edge: repairResult.edge,
            repairs: repairResult.repairs,
          });
          console.log(
            `[EdgeSanitizer] 🔧 Repaired edge: ${edge.source} → ${edge.target} ` +
            `(${repairResult.repairs.length} repair(s))`
          );
        }
        sanitized.push(repairResult.edge);
      } else {
        console.warn(
          `[EdgeSanitizer] ❌ Removing unrecoverable edge: ` +
          `${edge.source} → ${edge.target} (${repairResult.error})`
        );
        removed.push(edge);
      }
    }

    const stats = {
      total: edges.length,
      valid: sanitized.length - repaired.length,
      repaired: repaired.length,
      removed: removed.length,
    };

    console.log(
      `[EdgeSanitizer] ✅ Sanitization complete: ` +
      `${stats.valid} valid, ${stats.repaired} repaired, ${stats.removed} removed`
    );

    return {
      edges: sanitized,
      removed,
      repaired,
      stats,
    };
  }

  /**
   * Quick validation check (doesn't repair, just validates)
   */
  validate(
    edges: WorkflowEdge[],
    nodes: WorkflowNode[]
  ): {
    valid: WorkflowEdge[];
    invalid: Array<{ edge: WorkflowEdge; reason: string }>;
  } {
    const valid: WorkflowEdge[] = [];
    const invalid: Array<{ edge: WorkflowEdge; reason: string }> = [];

    const nodeMap = new Map<string, WorkflowNode>();
    nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode) {
        invalid.push({
          edge,
          reason: `Source node not found: ${edge.source}`,
        });
        continue;
      }

      if (!targetNode) {
        invalid.push({
          edge,
          reason: `Target node not found: ${edge.target}`,
        });
        continue;
      }

      valid.push(edge);
    }

    return { valid, invalid };
  }
}

// Export singleton instance
export const edgeSanitizer = new EdgeSanitizer();
