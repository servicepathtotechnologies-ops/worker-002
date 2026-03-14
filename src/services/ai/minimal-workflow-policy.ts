/**
 * Minimal Workflow Policy
 * 
 * Enforces minimal workflow generation rules:
 * 
 * Rules:
 * 1. Workflow must contain only nodes required to satisfy user intent.
 * 2. Remove nodes not explicitly required by normalized intent.
 * 3. Do not add:
 *    - loops unless user requests iteration
 *    - extra transformers
 *    - repair nodes unless execution failure occurs
 * 4. Workflow must follow minimal path: trigger → actions → output
 * 
 * Example:
 * User intent: "Get data from Google Sheets, summarize it, send to Gmail"
 * Allowed nodes: google_sheets, text_summarizer, gmail
 * Forbidden: loop, duplicate summarizer, extra processing nodes
 * 
 * Apply this policy after workflow generation.
 */

import { StructuredIntent } from './intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { getRequiredNodes } from './intent-constraint-engine';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { isTriggerNodeType } from '../../core/utils/node-role';
import { nodeLibrary } from '../nodes/node-library';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';
import { randomUUID } from 'crypto';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface PolicyEnforcementResult {
  workflow: Workflow;
  violations: PolicyViolation[];
  removedNodes: string[];
  removedEdges: string[];
  statistics: {
    originalNodeCount: number;
    minimalNodeCount: number;
    originalEdgeCount: number;
    minimalEdgeCount: number;
  };
}

export interface PolicyViolation {
  type: 'forbidden_node' | 'duplicate_transformer' | 'unnecessary_loop' | 'extra_processing' | 'non_minimal_path';
  nodeId?: string;
  nodeType?: string;
  reason: string;
  suggestion: string;
}

/**
 * Minimal Workflow Policy
 * Enforces minimal workflow generation rules
 */
export class MinimalWorkflowPolicy {
  /**
   * Enforce minimal workflow policy
   * 
   * @param workflow - Workflow to enforce policy on
   * @param intent - Structured intent to validate against
   * @returns Policy enforcement result with minimal workflow
   */
  enforce(workflow: Workflow, intent: StructuredIntent, originalPrompt?: string): PolicyEnforcementResult {
    console.log('[MinimalWorkflowPolicy] Enforcing minimal workflow policy...');
    console.log(`[MinimalWorkflowPolicy] Original: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    const originalNodeCount = workflow.nodes.length;
    const originalEdgeCount = workflow.edges.length;
    const violations: PolicyViolation[] = [];
    const removedNodeIds = new Set<string>();
    const removedEdgeIds = new Set<string>();

    // STEP 1: Get required nodes from intent
    const requiredNodeTypes = getRequiredNodes(intent, originalPrompt);
    const requiredNodeTypesSet = new Set(requiredNodeTypes);
    console.log(`[MinimalWorkflowPolicy] Required node types: ${requiredNodeTypes.join(', ')}`);

    // ✅ CRITICAL: Preserve auto-injected nodes from DSL metadata (e.g., guaranteed ai_chat_model)
    // The DSL compiler stores `dsl.metadata` into `workflow.metadata`, so we can trust it here.
    const autoInjectedNodes = (workflow as any)?.metadata?.autoInjectedNodes;
    if (Array.isArray(autoInjectedNodes) && autoInjectedNodes.length > 0) {
      autoInjectedNodes.forEach((t: any) => {
        if (typeof t === 'string' && t.trim()) requiredNodeTypesSet.add(t.trim());
      });
      console.log(`[MinimalWorkflowPolicy] ✅ Preserving auto-injected node types from metadata: ${autoInjectedNodes.join(', ')}`);
    }

    // ✅ UNIVERSAL: Preserve always-required nodes from registry (registry-driven)
    // These nodes are defined in the registry as alwaysRequired, so they must be included
    const alwaysRequiredNodes = unifiedNodeRegistry.getAlwaysRequiredNodes();
    for (const nodeDef of alwaysRequiredNodes) {
      requiredNodeTypesSet.add(nodeDef.type);
      console.log(`[MinimalWorkflowPolicy] ✅ Preserving ${nodeDef.type} (always required per registry)`);
    }

    // STEP 2: Check for forbidden nodes
    const { filteredNodes: nodesAfterForbidden, forbiddenViolations } = this.removeForbiddenNodes(
      workflow.nodes,
      intent,
      requiredNodeTypesSet
    );
    violations.push(...forbiddenViolations);
    forbiddenViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // STEP 3: Remove duplicate transformers
    const { filteredNodes: nodesAfterDedup, duplicateViolations } = this.removeDuplicateTransformers(nodesAfterForbidden);
    violations.push(...duplicateViolations);
    duplicateViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // STEP 4: Remove nodes not required by intent
    const { filteredNodes: minimalNodes, extraViolations } = this.removeUnrequiredNodes(
      nodesAfterDedup,
      requiredNodeTypesSet
    );
    violations.push(...extraViolations);
    extraViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // STEP 4.5: Rewire edges around removed nodes (preserve end-to-end connectivity)
    // This prevents "broken chains" when we remove an intermediate processing node like text_summarizer.
    const rewiredEdges = this.rewireEdgesAroundRemovedNodes(
      workflow.nodes,
      workflow.edges,
      removedNodeIds
    );

    // STEP 5: Ensure minimal path (trigger → actions → output)
    const { filteredEdges: minimalEdges, pathViolations } = this.ensureMinimalPath(
      minimalNodes,
      rewiredEdges,
      removedNodeIds
    );
    violations.push(...pathViolations);
    pathViolations.forEach(v => {
      // Path violations don't have node IDs, but may have edge IDs
      // We'll track removed edges separately
    });

    // STEP 6: Remove edges connected to removed nodes
    const finalEdges = minimalEdges.filter(edge => {
      const sourceRemoved = removedNodeIds.has(edge.source);
      const targetRemoved = removedNodeIds.has(edge.target);
      
      if (sourceRemoved || targetRemoved) {
        removedEdgeIds.add(edge.id);
        return false;
      }
      return true;
    });

    // STEP 7: Build minimal workflow
    const minimalWorkflow: Workflow = {
      nodes: minimalNodes,
      edges: finalEdges,
      metadata: {
        ...workflow.metadata,
        minimalPolicyEnforced: true,
        originalNodeCount,
        originalEdgeCount,
        violations: violations.length,
      },
    };

    const statistics = {
      originalNodeCount,
      minimalNodeCount: minimalNodes.length,
      originalEdgeCount,
      minimalEdgeCount: finalEdges.length,
    };

    console.log(`[MinimalWorkflowPolicy] ✅ Policy enforcement complete:`);
    console.log(`[MinimalWorkflowPolicy]   Nodes: ${originalNodeCount} → ${minimalNodes.length} (removed ${removedNodeIds.size})`);
    console.log(`[MinimalWorkflowPolicy]   Edges: ${originalEdgeCount} → ${finalEdges.length} (removed ${removedEdgeIds.size})`);
    console.log(`[MinimalWorkflowPolicy]   Violations: ${violations.length}`);

    return {
      workflow: minimalWorkflow,
      violations,
      removedNodes: Array.from(removedNodeIds),
      removedEdges: Array.from(removedEdgeIds),
      statistics,
    };
  }

  /**
   * Rewire edges around removed nodes by bypassing them.
   *
   * Example:
   *   A -> (removed X) -> B
   * becomes:
   *   A -> B
   *
   * This keeps the workflow executable after pruning extra processing nodes.
   */
  private rewireEdgesAroundRemovedNodes(
    allNodes: WorkflowNode[],
    allEdges: WorkflowEdge[],
    removedNodeIds: Set<string>
  ): WorkflowEdge[] {
    // Start with edges that don't touch removed nodes
    const survivingEdges = allEdges.filter(
      (e) => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target)
    );

    const nodeById = new Map(allNodes.map((n) => [n.id, n]));

    const existingEdgeKey = new Set(
      survivingEdges.map((e) => `${e.source}::${e.target}`)
    );

    const bypassEdges: WorkflowEdge[] = [];

    for (const removedId of removedNodeIds) {
      const incoming = allEdges.filter(
        (e) => e.target === removedId && !removedNodeIds.has(e.source)
      );
      const outgoing = allEdges.filter(
        (e) => e.source === removedId && !removedNodeIds.has(e.target)
      );

      if (incoming.length === 0 || outgoing.length === 0) continue;

      for (const inEdge of incoming) {
        for (const outEdge of outgoing) {
          const sourceId = inEdge.source;
          const targetId = outEdge.target;

          if (!sourceId || !targetId || sourceId === targetId) continue;
          const key = `${sourceId}::${targetId}`;
          if (existingEdgeKey.has(key)) continue;

          const sourceNode = nodeById.get(sourceId);
          const targetNode = nodeById.get(targetId);
          if (!sourceNode || !targetNode) continue;

          const resolution = resolveCompatibleHandles(sourceNode, targetNode);
          if (!resolution.success || !resolution.sourceHandle || !resolution.targetHandle) {
            continue;
          }

          bypassEdges.push({
            id: randomUUID(),
            source: sourceId,
            target: targetId,
            sourceHandle: resolution.sourceHandle,
            targetHandle: resolution.targetHandle,
            type: 'default',
          });
          existingEdgeKey.add(key);
        }
      }
    }

    return [...survivingEdges, ...bypassEdges];
  }

  /**
   * Remove forbidden nodes (loops, repair nodes, extra processing)
   */
  private removeForbiddenNodes(
    nodes: WorkflowNode[],
    intent: StructuredIntent,
    requiredNodeTypes: Set<string>
  ): { filteredNodes: WorkflowNode[]; forbiddenViolations: PolicyViolation[] } {
    const filteredNodes: WorkflowNode[] = [];
    const violations: PolicyViolation[] = [];
    // ✅ FIXED: Use safe JSON stringify to prevent circular reference errors
    const { safeJsonStringify } = require('../../core/utils/safe-json-stringify');
    const intentText = safeJsonStringify(intent).toLowerCase();

    // Check for iteration intent
    const hasIterationIntent = intentText.includes('loop') ||
                              intentText.includes('iterate') ||
                              intentText.includes('repeat') ||
                              intentText.includes('for each') ||
                              intentText.includes('foreach') ||
                              intentText.includes('each');

    // Check for failure handling intent
    const hasFailureHandling = intentText.includes('error') ||
                              intentText.includes('failure') ||
                              intentText.includes('retry') ||
                              intentText.includes('handle') ||
                              intentText.includes('catch');

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      let shouldRemove = false;
      let violation: PolicyViolation | null = null;

      // Rule 1: Remove loops unless iteration requested
      if (this.isLoopNode(nodeType) && !hasIterationIntent) {
        shouldRemove = true;
        violation = {
          type: 'unnecessary_loop',
          nodeId: node.id,
          nodeType,
          reason: 'Loop node present but user did not request iteration',
          suggestion: 'Remove loop node or add iteration intent to user prompt',
        };
      }

      // Rule 2: Remove repair nodes unless failure handling requested
      if (this.isRepairNode(nodeType) && !hasFailureHandling) {
        shouldRemove = true;
        violation = {
          type: 'forbidden_node',
          nodeId: node.id,
          nodeType,
          reason: 'Repair node present but user did not request failure handling',
          suggestion: 'Remove repair node or add failure handling intent to user prompt',
        };
      }

      // Rule 3: Remove extra processing nodes not in required set
      if (this.isExtraProcessingNode(nodeType) && !requiredNodeTypes.has(nodeType)) {
        shouldRemove = true;
        violation = {
          type: 'extra_processing',
          nodeId: node.id,
          nodeType,
          reason: 'Extra processing node not required by intent',
          suggestion: 'Remove extra processing node to maintain minimal workflow',
        };
      }

      if (shouldRemove && violation) {
        violations.push(violation);
        console.log(`[MinimalWorkflowPolicy] ⚠️  Removed forbidden node: ${node.id} (${nodeType}) - ${violation.reason}`);
      } else {
        filteredNodes.push(node);
      }
    }

    return { filteredNodes, forbiddenViolations: violations };
  }

  /**
   * Remove duplicate transformers
   */
  private removeDuplicateTransformers(
    nodes: WorkflowNode[]
  ): { filteredNodes: WorkflowNode[]; duplicateViolations: PolicyViolation[] } {
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
    const filteredNodes: WorkflowNode[] = [];
    const violations: PolicyViolation[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);

      if (transformerTypes.has(nodeType)) {
        if (seenTransformers.has(nodeType)) {
          // Duplicate transformer - remove it
          violations.push({
            type: 'duplicate_transformer',
            nodeId: node.id,
            nodeType,
            reason: `Duplicate transformer "${nodeType}" found`,
            suggestion: `Remove duplicate transformer, keeping first occurrence (${seenTransformers.get(nodeType)})`,
          });
          console.log(`[MinimalWorkflowPolicy] ⚠️  Removed duplicate transformer: ${node.id} (${nodeType})`);
          continue;
        }

        // First occurrence - keep it
        seenTransformers.set(nodeType, node.id);
      }

      filteredNodes.push(node);
    }

    return { filteredNodes, duplicateViolations: violations };
  }

  /**
   * Remove nodes not required by intent
   */
  private removeUnrequiredNodes(
    nodes: WorkflowNode[],
    requiredNodeTypes: Set<string>
  ): { filteredNodes: WorkflowNode[]; extraViolations: PolicyViolation[] } {
    const filteredNodes: WorkflowNode[] = [];
    const violations: PolicyViolation[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);

      // Always keep trigger nodes
      if (this.isTriggerNode(nodeType)) {
        filteredNodes.push(node);
        continue;
      }

      // ✅ UNIVERSAL: Check registry for exempt-from-removal behavior (registry-driven)
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef?.workflowBehavior?.exemptFromRemoval) {
        // Registry says this node should never be removed
        console.log(`[MinimalWorkflowPolicy] ✅ Preserving ${nodeType} (exempt from removal per registry)`);
        filteredNodes.push(node);
        // Also add to required set so it's preserved in future checks
        requiredNodeTypes.add(nodeType);
        continue;
      }

      // ✅ UNIVERSAL: Check if node is always-required (per registry)
      if (nodeDef?.workflowBehavior?.alwaysRequired) {
        // Registry says this node is always required
        console.log(`[MinimalWorkflowPolicy] ✅ Preserving ${nodeType} (always required per registry)`);
        requiredNodeTypes.add(nodeType);
        filteredNodes.push(node);
        continue;
      }

      // Check if node type is required
      if (requiredNodeTypes.has(nodeType)) {
        filteredNodes.push(node);
        continue;
      }

      // Check if node type is a variant of required type
      const isVariant = Array.from(requiredNodeTypes).some(requiredType => {
        return this.isNodeTypeVariant(nodeType, requiredType);
      });

      if (isVariant) {
        filteredNodes.push(node);
        continue;
      }

      // Node is not required - remove it
      violations.push({
        type: 'forbidden_node',
        nodeId: node.id,
        nodeType,
        reason: `Node "${nodeType}" not required by intent`,
        suggestion: 'Remove node to maintain minimal workflow',
      });
      console.log(`[MinimalWorkflowPolicy] ⚠️  Removed unrequired node: ${node.id} (${nodeType})`);
    }

    return { filteredNodes, extraViolations: violations };
  }

  /**
   * Ensure minimal path: trigger → actions → output
   */
  private ensureMinimalPath(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    removedNodeIds: Set<string>
  ): { filteredEdges: WorkflowEdge[]; pathViolations: PolicyViolation[] } {
    const violations: PolicyViolation[] = [];

    // Find trigger node
    const triggerNode = nodes.find(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      console.warn('[MinimalWorkflowPolicy] ⚠️  No trigger node found, skipping minimal path enforcement');
      return { filteredEdges: edges, pathViolations: [] };
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    for (const edge of edges) {
      if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
        continue; // Skip edges to/from removed nodes
      }

      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);

      if (!incoming.has(edge.target)) {
        incoming.set(edge.target, []);
      }
      incoming.get(edge.target)!.push(edge.source);
    }

    // Find output nodes (nodes with no outgoing edges)
    const outputNodes = nodes.filter(node => {
      if (removedNodeIds.has(node.id)) return false;
      const hasOutgoing = outgoing.has(node.id) && (outgoing.get(node.id) || []).length > 0;
      return !hasOutgoing;
    });

    if (outputNodes.length === 0) {
      console.warn('[MinimalWorkflowPolicy] ⚠️  No output nodes found, skipping minimal path enforcement');
      return { filteredEdges: edges, pathViolations: [] };
    }

    // Find shortest path from trigger to each output
    const pathEdgeIds = new Set<string>();
    const edgeMap = new Map<string, WorkflowEdge>();
    edges.forEach(edge => {
      if (!removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)) {
        edgeMap.set(edge.id, edge);
      }
    });

    for (const outputNode of outputNodes) {
      const path = this.findShortestPath(triggerNode.id, outputNode.id, outgoing, edgeMap);
      path.forEach(edgeId => pathEdgeIds.add(edgeId));
    }

    // Remove edges not in shortest paths
    const filteredEdges: WorkflowEdge[] = [];
    for (const edge of edges) {
      if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
        continue; // Already filtered
      }

      if (pathEdgeIds.has(edge.id)) {
        filteredEdges.push(edge);
      } else {
        // Edge not in shortest path - check if it creates parallel path
        const sourceIncoming = incoming.get(edge.source) || [];
        const targetOutgoing = outgoing.get(edge.target) || [];

        if (sourceIncoming.length > 1 || targetOutgoing.length > 1) {
          violations.push({
            type: 'non_minimal_path',
            reason: `Parallel path edge: ${edge.source} → ${edge.target}`,
            suggestion: 'Remove parallel path to ensure minimal workflow',
          });
          console.log(`[MinimalWorkflowPolicy] ⚠️  Removed parallel path edge: ${edge.id}`);
        } else {
          // Keep edge if it's part of a valid linear chain
          filteredEdges.push(edge);
        }
      }
    }

    return { filteredEdges, pathViolations: violations };
  }

  /**
   * Find shortest path from source to target using BFS
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
    return isTriggerNodeType(nodeType);
  }

  /**
   * Check if node is a loop node
   */
  private isLoopNode(nodeType: string): boolean {
    return nodeType.includes('loop') ||
           nodeType === 'for' ||
           nodeType === 'while' ||
           nodeType === 'foreach';
  }

  /**
   * Check if node is a repair node
   */
  private isRepairNode(nodeType: string): boolean {
    return nodeType.includes('repair') ||
           nodeType.includes('error_handler') ||
           nodeType.includes('retry') ||
           nodeType.includes('fallback');
  }

  /**
   * Check if node is an extra processing node
   */
  private isExtraProcessingNode(nodeType: string): boolean {
    const extraProcessingTypes = [
      'set_variable',
      'format',
      'parse',
      'transform',
      'filter',
      'map',
      'reduce',
    ];

    return extraProcessingTypes.includes(nodeType);
  }

  /**
   * Check if node type is a variant of another type
   */
  private isNodeTypeVariant(nodeType: string, requiredType: string): boolean {
    if (nodeType === requiredType) {
      return true;
    }

    // Check aliases
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
export const minimalWorkflowPolicy = new MinimalWorkflowPolicy();

// Export convenience function
export function enforceMinimalWorkflowPolicy(workflow: Workflow, intent: StructuredIntent, originalPrompt?: string): PolicyEnforcementResult {
  return minimalWorkflowPolicy.enforce(workflow, intent, originalPrompt);
}
