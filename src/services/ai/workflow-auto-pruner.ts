/**
 * Workflow Auto Pruner
 * 
 * Removes unnecessary nodes and edges to create minimal DAG.
 * 
 * Behavior:
 * - Remove nodes not required by intent
 * - Remove loops if no iteration intent detected
 * - Remove duplicate transformers
 * - Ensure single path from trigger → output
 * - Keep minimal DAG
 * 
 * Input: workflow graph (nodes + edges)
 * Output: pruned workflow graph
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { StructuredIntent } from './intent-structurer';
import { getRequiredNodes } from './intent-constraint-engine';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';

export interface PruningResult {
  workflow: Workflow;
  removedNodes: string[];
  removedEdges: string[];
  statistics: {
    originalNodeCount: number;
    prunedNodeCount: number;
    originalEdgeCount: number;
    prunedEdgeCount: number;
  };
}

/**
 * Workflow Auto Pruner
 * Prunes workflow graph to minimal DAG based on intent
 */
export class WorkflowAutoPruner {
  /**
   * Prune workflow graph
   * 
   * @param workflow - Workflow graph to prune
   * @param intent - Structured intent (for determining required nodes)
   * @returns Pruned workflow with statistics
   */
  prune(workflow: Workflow, intent: StructuredIntent): PruningResult {
    console.log('[WorkflowAutoPruner] Starting workflow pruning...');
    console.log(`[WorkflowAutoPruner] Original: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    const originalNodeCount = workflow.nodes.length;
    const originalEdgeCount = workflow.edges.length;

    // STEP 1: Get required nodes from intent
    const requiredNodeTypes = getRequiredNodes(intent);
    const requiredNodeTypesSet = new Set(requiredNodeTypes);
    console.log(`[WorkflowAutoPruner] Required node types: ${requiredNodeTypes.join(', ')}`);

    // STEP 2: Create node map for quick lookup
    const nodeMap = new Map<string, WorkflowNode>();
    workflow.nodes.forEach(node => nodeMap.set(node.id, node));

    // STEP 3: Prune nodes not required by intent
    const { prunedNodes, removedNodeIds } = this.pruneUnrequiredNodes(
      workflow.nodes,
      requiredNodeTypesSet,
      intent
    );

    // STEP 4: Prune loops if no iteration intent
    const { finalNodes, removedLoopNodes } = this.pruneLoops(prunedNodes, intent);

    // STEP 5: Prune duplicate transformers
    const { deduplicatedNodes, removedTransformers } = this.pruneDuplicateTransformers(finalNodes);

    // STEP 6: Update edges to match pruned nodes
    const removedNodeIdsSet = new Set([
      ...removedNodeIds,
      ...removedLoopNodes,
      ...removedTransformers,
    ]);

    const prunedEdges = this.pruneEdges(workflow.edges, removedNodeIdsSet);

    // STEP 7: Ensure single path from trigger → output
    const { finalEdges, removedPathEdges } = this.ensureSinglePath(deduplicatedNodes, prunedEdges);

    // STEP 8: Build final workflow
    const prunedWorkflow: Workflow = {
      nodes: deduplicatedNodes,
      edges: finalEdges,
      metadata: {
        ...workflow.metadata,
        pruned: true,
        originalNodeCount,
        originalEdgeCount,
      },
    };

    const removedEdgeIds = [
      ...workflow.edges
        .filter(e => removedNodeIdsSet.has(e.source) || removedNodeIdsSet.has(e.target))
        .map(e => e.id),
      ...removedPathEdges,
    ];

    const statistics = {
      originalNodeCount,
      prunedNodeCount: deduplicatedNodes.length,
      originalEdgeCount,
      prunedEdgeCount: finalEdges.length,
    };

    console.log(`[WorkflowAutoPruner] ✅ Pruning complete:`);
    console.log(`[WorkflowAutoPruner]   Nodes: ${originalNodeCount} → ${deduplicatedNodes.length} (removed ${removedNodeIds.length + removedLoopNodes.length + removedTransformers.length})`);
    console.log(`[WorkflowAutoPruner]   Edges: ${originalEdgeCount} → ${finalEdges.length} (removed ${removedEdgeIds.length})`);

    return {
      workflow: prunedWorkflow,
      removedNodes: Array.from(removedNodeIdsSet),
      removedEdges: removedEdgeIds,
      statistics,
    };
  }

  /**
   * Prune nodes not required by intent
   */
  private pruneUnrequiredNodes(
    nodes: WorkflowNode[],
    requiredNodeTypes: Set<string>,
    intent: StructuredIntent
  ): { prunedNodes: WorkflowNode[]; removedNodeIds: string[] } {
    const prunedNodes: WorkflowNode[] = [];
    const removedNodeIds: string[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      
      // Always keep trigger nodes
      if (this.isTriggerNode(nodeType)) {
        prunedNodes.push(node);
        continue;
      }

      // Check if node type is required
      if (requiredNodeTypes.has(nodeType)) {
        prunedNodes.push(node);
        continue;
      }

      // Check if node type is an alias/variant of required type
      const isVariant = Array.from(requiredNodeTypes).some(requiredType => {
        return this.isNodeTypeVariant(nodeType, requiredType);
      });

      if (isVariant) {
        prunedNodes.push(node);
        continue;
      }

      // Node is not required - remove it
      removedNodeIds.push(node.id);
      console.log(`[WorkflowAutoPruner] ⚠️  Removed unrequired node: ${node.id} (${nodeType})`);
    }

    return { prunedNodes, removedNodeIds };
  }

  /**
   * Prune loops if no iteration intent detected
   */
  private pruneLoops(
    nodes: WorkflowNode[],
    intent: StructuredIntent
  ): { finalNodes: WorkflowNode[]; removedLoopNodes: string[] } {
    // ✅ FIXED: Use safe JSON stringify to prevent circular reference errors
    const { safeJsonStringify } = require('../../core/utils/safe-json-stringify');
    const intentText = safeJsonStringify(intent).toLowerCase();
    const hasLoopIntent = intentText.includes('loop') ||
                         intentText.includes('iterate') ||
                         intentText.includes('repeat') ||
                         intentText.includes('for each') ||
                         intentText.includes('foreach') ||
                         intentText.includes('each');

    const finalNodes: WorkflowNode[] = [];
    const removedLoopNodes: string[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const isLoopNode = nodeType.includes('loop') ||
                        nodeType === 'for' ||
                        nodeType === 'while' ||
                        nodeType === 'foreach';

      if (isLoopNode && !hasLoopIntent) {
        removedLoopNodes.push(node.id);
        console.log(`[WorkflowAutoPruner] ⚠️  Removed loop node (no iteration intent): ${node.id} (${nodeType})`);
        continue;
      }

      finalNodes.push(node);
    }

    return { finalNodes, removedLoopNodes };
  }

  /**
   * Prune duplicate transformers
   * Keeps only the first occurrence of each transformer type
   */
  private pruneDuplicateTransformers(
    nodes: WorkflowNode[]
  ): { deduplicatedNodes: WorkflowNode[]; removedTransformers: string[] } {
    const transformerTypes = new Set([
      'transform',
      'set_variable',
      'format',
      'parse',
      'filter',
      'map',
      'reduce',
    ]);

    const seenTransformers = new Map<string, string>(); // type -> first node id
    const deduplicatedNodes: WorkflowNode[] = [];
    const removedTransformers: string[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      
      if (transformerTypes.has(nodeType)) {
        // Check if we've seen this transformer type before
        if (seenTransformers.has(nodeType)) {
          // Duplicate transformer - remove it
          removedTransformers.push(node.id);
          console.log(`[WorkflowAutoPruner] ⚠️  Removed duplicate transformer: ${node.id} (${nodeType})`);
          continue;
        }

        // First occurrence - keep it
        seenTransformers.set(nodeType, node.id);
      }

      deduplicatedNodes.push(node);
    }

    return { deduplicatedNodes, removedTransformers };
  }

  /**
   * Prune edges connected to removed nodes
   */
  private pruneEdges(
    edges: WorkflowEdge[],
    removedNodeIds: Set<string>
  ): WorkflowEdge[] {
    return edges.filter(edge => {
      const sourceRemoved = removedNodeIds.has(edge.source);
      const targetRemoved = removedNodeIds.has(edge.target);

      if (sourceRemoved || targetRemoved) {
        console.log(`[WorkflowAutoPruner] ⚠️  Removed edge: ${edge.id} (${sourceRemoved ? 'source' : 'target'} node removed)`);
        return false;
      }

      return true;
    });
  }

  /**
   * Ensure single path from trigger → output
   * Removes edges that create multiple paths, keeping only the shortest path
   */
  private ensureSinglePath(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { finalEdges: WorkflowEdge[]; removedPathEdges: string[] } {
    // Find trigger node
    const triggerNode = nodes.find(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      console.warn('[WorkflowAutoPruner] ⚠️  No trigger node found, skipping single path enforcement');
      return { finalEdges: edges, removedPathEdges: [] };
    }

    // Find output nodes (nodes with no outgoing edges)
    const outputNodes = nodes.filter(node => {
      const hasOutgoing = edges.some(edge => edge.source === node.id);
      return !hasOutgoing;
    });

    if (outputNodes.length === 0) {
      console.warn('[WorkflowAutoPruner] ⚠️  No output nodes found, skipping single path enforcement');
      return { finalEdges: edges, removedPathEdges: [] };
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    for (const edge of edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);

      if (!incoming.has(edge.target)) {
        incoming.set(edge.target, []);
      }
      incoming.get(edge.target)!.push(edge.source);
    }

    // Find shortest path from trigger to each output
    const paths = new Map<string, string[]>(); // output node id -> path edge ids
    const edgeMap = new Map<string, WorkflowEdge>();
    edges.forEach(edge => edgeMap.set(edge.id, edge));

    for (const outputNode of outputNodes) {
      const path = this.findShortestPath(triggerNode.id, outputNode.id, outgoing, edgeMap);
      if (path.length > 0) {
        paths.set(outputNode.id, path);
      }
    }

    // Collect all edges in shortest paths
    const pathEdgeIds = new Set<string>();
    for (const pathEdgeIdList of paths.values()) {
      pathEdgeIdList.forEach(id => pathEdgeIds.add(id));
    }

    // Keep only edges in shortest paths
    // For multiple outputs, keep shortest path to each output
    const finalEdges: WorkflowEdge[] = [];
    const removedPathEdges: string[] = [];

    for (const edge of edges) {
      if (pathEdgeIds.has(edge.id)) {
        // Edge is in shortest path - keep it
        finalEdges.push(edge);
      } else {
        // Edge is not in shortest path - remove it
        removedPathEdges.push(edge.id);
        console.log(`[WorkflowAutoPruner] ⚠️  Removed edge not in shortest path: ${edge.id} (${edge.source} → ${edge.target})`);
      }
    }

    return { finalEdges, removedPathEdges };
  }

  /**
   * Find shortest path from source to target using BFS (returns edge IDs)
   */
  private findShortestPath(
    source: string,
    target: string,
    outgoing: Map<string, string[]>,
    edgeMap: Map<string, WorkflowEdge>
  ): string[] {
    const queue: Array<{ node: string; path: string[] }> = [{ node: source, path: [] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === target) {
        return path;
      }

      if (visited.has(node)) {
        continue;
      }

      visited.add(node);

      const neighbors = outgoing.get(node) || [];
      for (const neighbor of neighbors) {
        const edge = Array.from(edgeMap.values()).find(
          e => e.source === node && e.target === neighbor
        );

        if (edge) {
          queue.push({
            node: neighbor,
            path: [...path, edge.id],
          });
        }
      }
    }

    return [];
  }

  /**
   * Check if node is a trigger node
   */
  private isTriggerNode(nodeType: string): boolean {
    const triggerTypes = [
      'manual_trigger',
      'schedule',
      'webhook',
      'form',
      'chat_trigger',
      'interval',
      'error_trigger',
    ];

    return triggerTypes.includes(nodeType) || nodeType.includes('trigger');
  }

  /**
   * Check if node type is a variant of required type
   */
  private isNodeTypeVariant(nodeType: string, requiredType: string): boolean {
    // Exact match
    if (nodeType === requiredType) {
      return true;
    }

    // Check aliases (e.g., 'gmail' is variant of 'google_gmail')
    const aliases: Record<string, string[]> = {
      'google_gmail': ['gmail', 'google_mail'],
      'google_sheets': ['sheets', 'spreadsheet'],
      'slack_message': ['slack'],
      'text_summarizer': ['summarizer', 'summarize'],
    };

    for (const [canonical, variants] of Object.entries(aliases)) {
      if (canonical === requiredType && variants.includes(nodeType)) {
        return true;
      }
      if (canonical === nodeType && variants.includes(requiredType)) {
        return true;
      }
    }

    return false;
  }
}

// Export singleton instance
export const workflowAutoPruner = new WorkflowAutoPruner();

// Export convenience function
export function pruneWorkflow(workflow: Workflow, intent: StructuredIntent): PruningResult {
  return workflowAutoPruner.prune(workflow, intent);
}
