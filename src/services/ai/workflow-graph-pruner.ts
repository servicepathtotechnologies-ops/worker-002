/**
 * Workflow Graph Pruner
 * 
 * Prunes workflow graph to minimal DAG after workflow builder and repair phase.
 * 
 * Behavior:
 * - Remove nodes not required by intent
 * - Remove loops if no iteration intent detected
 * - Remove duplicate processing nodes
 * - Remove disconnected nodes
 * - Ensure single path from trigger to output
 * - Keep minimal DAG
 * 
 * Run this after workflow builder and repair phase.
 */

import { StructuredIntent } from './intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { getRequiredNodes } from './intent-constraint-engine';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';
import { transformationDetector, detectTransformations } from './transformation-detector';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { nodeReplacementTracker } from './node-replacement-tracker';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';

export interface PruningResult {
  workflow: Workflow;
  removedNodes: string[];
  removedEdges: string[];
  statistics: {
    originalNodeCount: number;
    prunedNodeCount: number;
    originalEdgeCount: number;
    prunedEdgeCount: number;
    disconnectedNodesRemoved: number;
    duplicateNodesRemoved: number;
    loopNodesRemoved: number;
  };
  violations: PruningViolation[];
}

export interface PruningViolation {
  type: 'unrequired_node' | 'duplicate_processing' | 'unnecessary_loop' | 'disconnected_node' | 'non_minimal_path';
  nodeId?: string;
  nodeType?: string;
  reason: string;
}

/**
 * Workflow Graph Pruner
 * Prunes workflow graph to minimal DAG after workflow builder and repair phase
 */
export class WorkflowGraphPruner {
  /**
   * Prune workflow graph
   * ✅ FIXED: Computes required nodes from multiple sources
   * 
   * @param workflow - Workflow graph to prune
   * @param intent - Structured intent to validate against
   * @param originalPrompt - Original user prompt (for transformation detection)
   * @param confidenceScore - Confidence score for pruning decisions
   * @param mandatoryNodeTypes - Optional mandatory node types from keyword extraction (Stage 1)
   * @returns Pruned workflow with statistics
   */
  prune(workflow: Workflow, intent: StructuredIntent, originalPrompt?: string, confidenceScore?: number, mandatoryNodeTypes?: string[]): PruningResult {
    console.log('[WorkflowGraphPruner] Starting workflow graph pruning...');
    console.log(`[WorkflowGraphPruner] Original: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    const originalNodeCount = workflow.nodes.length;
    const originalEdgeCount = workflow.edges.length;
    const violations: PruningViolation[] = [];
    const removedNodeIds = new Set<string>();

    // ✅ FIXED: STEP 1: Identify execution chain (trigger → output paths)
    // This is the CRITICAL step - all nodes in execution chain must be preserved
    const executionChainNodeIds = this.getExecutionChainNodeIds(workflow);
    console.log(`[WorkflowGraphPruner] Execution chain nodes: ${executionChainNodeIds.size} nodes (protected from removal)`);
    console.log(`[WorkflowGraphPruner] Execution chain node IDs: ${Array.from(executionChainNodeIds).join(', ')}`);

    // ✅ FIXED: STEP 2: Compute required nodes from multiple sources
    let requiredNodeTypesSet = this.computeRequiredNodes(workflow, intent, originalPrompt);
    
    // ✅ NEW: Include mandatory nodes from keyword extraction (Stage 1)
    if (mandatoryNodeTypes && mandatoryNodeTypes.length > 0) {
      console.log(`[WorkflowGraphPruner] 🔒 Including ${mandatoryNodeTypes.length} mandatory node(s) from Stage 1: ${mandatoryNodeTypes.join(', ')}`);
      for (const mandatoryNode of mandatoryNodeTypes) {
        const mandatoryLower = mandatoryNode.toLowerCase();
        if (!Array.from(requiredNodeTypesSet).some(required => required.toLowerCase() === mandatoryLower)) {
          requiredNodeTypesSet.add(mandatoryLower);
          console.log(`[WorkflowGraphPruner] ✅ Added mandatory node to required set: ${mandatoryNode}`);
        } else {
          console.log(`[WorkflowGraphPruner] ✅ Mandatory node already in required set: ${mandatoryNode}`);
        }
      }
    }
    
    console.log(`[WorkflowGraphPruner] Required node types: ${Array.from(requiredNodeTypesSet).join(', ')}`);

    // ✅ FIXED: STEP 3: Remove nodes not required by intent (but NEVER remove nodes in execution chain)
    const { filteredNodes: nodesAfterUnrequired, unrequiredViolations } = this.removeUnrequiredNodes(
      workflow.nodes,
      requiredNodeTypesSet,
      executionChainNodeIds,
      confidenceScore
    );
    violations.push(...unrequiredViolations);
    unrequiredViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // ✅ FIXED: STEP 4: Remove loops if no iteration intent detected (but NEVER remove nodes in execution chain OR required)
    const { filteredNodes: nodesAfterLoops, loopViolations } = this.removeLoops(
      nodesAfterUnrequired,
      intent,
      executionChainNodeIds,
      requiredNodeTypesSet
    );
    violations.push(...loopViolations);
    loopViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // ✅ FIXED: STEP 5: Remove duplicate processing nodes (but NEVER remove nodes in execution chain OR required)
    const { filteredNodes: nodesAfterDedup, duplicateViolations } = this.removeDuplicateProcessingNodes(
      nodesAfterLoops,
      executionChainNodeIds,
      requiredNodeTypesSet,
      confidenceScore
    );
    violations.push(...duplicateViolations);
    duplicateViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // ✅ FIXED: STEP 6: Remove disconnected nodes (only nodes NOT in execution chain AND NOT required)
    const { filteredNodes: nodesAfterDisconnected, disconnectedViolations } = this.removeDisconnectedNodes(
      nodesAfterDedup,
      workflow.edges,
      removedNodeIds,
      executionChainNodeIds,
      requiredNodeTypesSet
    );
    violations.push(...disconnectedViolations);
    disconnectedViolations.forEach(v => {
      if (v.nodeId) removedNodeIds.add(v.nodeId);
    });

    // STEP 7: Ensure single path from trigger to output
    const { filteredEdges: minimalEdges, pathViolations } = this.ensureSinglePath(
      nodesAfterDisconnected,
      workflow.edges,
      removedNodeIds
    );
    violations.push(...pathViolations);

    // STEP 8: Remove edges connected to removed nodes
    const finalEdges = minimalEdges.filter(edge => {
      const sourceRemoved = removedNodeIds.has(edge.source);
      const targetRemoved = removedNodeIds.has(edge.target);
      
      if (sourceRemoved || targetRemoved) {
        return false;
      }
      return true;
    });

    // STEP 8: Build pruned workflow
    const prunedWorkflow: Workflow = {
      nodes: nodesAfterDisconnected,
      edges: finalEdges,
      metadata: {
        ...workflow.metadata,
        pruned: true,
        originalNodeCount,
        originalEdgeCount,
        pruningStatistics: {
          disconnectedNodesRemoved: disconnectedViolations.length,
          duplicateNodesRemoved: duplicateViolations.length,
          loopNodesRemoved: loopViolations.length,
        },
      },
    };

    const removedEdgeIds = workflow.edges
      .filter(e => removedNodeIds.has(e.source) || removedNodeIds.has(e.target) || !finalEdges.includes(e))
      .map(e => e.id);

    const statistics = {
      originalNodeCount,
      prunedNodeCount: nodesAfterDisconnected.length,
      originalEdgeCount,
      prunedEdgeCount: finalEdges.length,
      disconnectedNodesRemoved: disconnectedViolations.length,
      duplicateNodesRemoved: duplicateViolations.length,
      loopNodesRemoved: loopViolations.length,
    };

    console.log(`[WorkflowGraphPruner] ✅ Pruning complete:`);
    console.log(`[WorkflowGraphPruner]   Nodes: ${originalNodeCount} → ${nodesAfterDisconnected.length} (removed ${removedNodeIds.size})`);
    console.log(`[WorkflowGraphPruner]   Edges: ${originalEdgeCount} → ${finalEdges.length} (removed ${removedEdgeIds.length})`);
    console.log(`[WorkflowGraphPruner]   Violations: ${violations.length}`);

    return {
      workflow: prunedWorkflow,
      removedNodes: Array.from(removedNodeIds),
      removedEdges: removedEdgeIds,
      statistics,
      violations,
    };
  }

  /**
   * Remove nodes not required by intent
   * ✅ FIXED: Never remove nodes in execution chain (trigger → output path)
   * ✅ FIXED: Never remove transformer nodes if transformation verbs detected
   * ✅ FIXED: Never remove output nodes connected to execution graph
   */
  private removeUnrequiredNodes(
    nodes: WorkflowNode[],
    requiredNodeTypes: Set<string>,
    executionChainNodeIds: Set<string>,
    confidenceScore?: number
  ): { filteredNodes: WorkflowNode[]; unrequiredViolations: PruningViolation[] } {
    const filteredNodes: WorkflowNode[] = [];
    const violations: PruningViolation[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);

      // ✅ FIXED: CRITICAL RULE - Never remove nodes in execution chain
      if (executionChainNodeIds.has(node.id)) {
        filteredNodes.push(node);
        console.log(`[WorkflowGraphPruner] ✅ Protected execution chain node: ${node.id} (${nodeType})`);
        continue;
      }

      // Always keep trigger nodes
      if (this.isTriggerNode(nodeType)) {
        filteredNodes.push(node);
        continue;
      }

      // ✅ FIXED: Always keep output nodes (they're in requiredNodeTypes from getOutputNodes)
      if (this.isOutputNode(nodeType)) {
        filteredNodes.push(node);
        continue;
      }

      // ✅ FIXED: Always keep transformer nodes if they're in requiredNodeTypes (from TransformationDetector)
      // Also check if any required type is a transformer variant
      const isRequiredTransformer = requiredNodeTypes.has(nodeType) || 
        Array.from(requiredNodeTypes).some(requiredType => 
          this.isTransformerNode(requiredType) && this.isNodeTypeVariant(nodeType, requiredType)
        );
      
      if (this.isTransformerNode(nodeType) && isRequiredTransformer) {
        filteredNodes.push(node);
        console.log(`[WorkflowGraphPruner] ✅ Protected required transformation node: ${node.id} (${nodeType})`);
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

      // Node is not required and not in execution chain - remove it
      const reason = `Node "${nodeType}" not required by intent, transformation, or execution chain`;
      violations.push({
        type: 'unrequired_node',
        nodeId: node.id,
        nodeType,
        reason,
      });
      
      // ✅ TRACK REPLACEMENT
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      let category: 'dataSource' | 'transformation' | 'output' = 'transformation';
      if (nodeDef?.category === 'data') {
        category = 'dataSource';
      } else if (nodeDef?.category === 'communication') {
        category = 'output';
      }
      
      const isProtected = (node.data as any)?.origin?.source === 'user' || 
                         (node.data as any)?.protected === true;
      
      nodeReplacementTracker.trackReplacement({
        nodeId: node.id,
        nodeType,
        operation: typeof node.data?.config?.operation === 'string' ? node.data.config.operation : '',
        category,
        reason,
        stage: 'workflow_graph_pruner.removeUnrequiredNodes',
        wasRemoved: true,
        isProtected,
        confidence: confidenceScore,
        metadata: {
          requiredNodeTypes: Array.from(requiredNodeTypes),
          inExecutionChain: false,
        },
      });
      
      console.log(`[WorkflowGraphPruner] ⚠️  Removed unrequired node: ${node.id} (${nodeType})`);
    }

    return { filteredNodes, unrequiredViolations: violations };
  }

  /**
   * Check if node is a transformer node
   */
  private isTransformerNode(nodeType: string): boolean {
    const transformerTypes = [
      'text_summarizer',
      'summarizer',
      'text_classifier',
      'classifier',
      'ollama',
      'ollama_llm',
      'openai_gpt',
      'openai',
      'anthropic_claude',
      'claude',
      'google_gemini',
      'gemini',
      'ai_agent',
      'transform',
    ];

    return transformerTypes.some(type => nodeType.includes(type) || nodeType === type);
  }

  /**
   * Remove loops if no iteration intent detected
   * ✅ CRITICAL FIX: Never remove loop nodes in execution chain OR required nodes
   */
  private removeLoops(
    nodes: WorkflowNode[],
    intent: StructuredIntent,
    executionChainNodeIds: Set<string>,
    requiredNodeTypesSet: Set<string>
  ): { filteredNodes: WorkflowNode[]; loopViolations: PruningViolation[] } {
    const intentText = JSON.stringify(intent).toLowerCase();
    const hasIterationIntent = intentText.includes('loop') ||
                              intentText.includes('iterate') ||
                              intentText.includes('repeat') ||
                              intentText.includes('for each') ||
                              intentText.includes('foreach') ||
                              intentText.includes('each');

    const filteredNodes: WorkflowNode[] = [];
    const violations: PruningViolation[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const isLoopNode = this.isLoopNode(nodeType);

      // ✅ CRITICAL FIX: Never remove loop nodes in execution chain OR required nodes
      if (isLoopNode && !hasIterationIntent && !executionChainNodeIds.has(node.id) && !requiredNodeTypesSet.has(nodeType)) {
        violations.push({
          type: 'unnecessary_loop',
          nodeId: node.id,
          nodeType,
          reason: 'Loop node present but user did not request iteration',
        });
        console.log(`[WorkflowGraphPruner] ⚠️  Removed loop node (no iteration intent): ${node.id} (${nodeType})`);
        continue;
      }

      filteredNodes.push(node);
    }

    return { filteredNodes, loopViolations: violations };
  }

  /**
   * Remove duplicate processing nodes
   * Keeps only the first occurrence of each processing node type
   * ✅ CRITICAL FIX: Never remove duplicate processing nodes in execution chain OR required nodes
   */
  private removeDuplicateProcessingNodes(
    nodes: WorkflowNode[],
    executionChainNodeIds: Set<string>,
    requiredNodeTypesSet: Set<string>,
    confidenceScore?: number
  ): { filteredNodes: WorkflowNode[]; duplicateViolations: PruningViolation[] } {
    const processingNodeTypes = new Set([
      'transform',
      'set_variable',
      'format',
      'parse',
      'filter',
      'map',
      'reduce',
      'text_summarizer',
      'ollama',
      'openai_gpt',
      'anthropic_claude',
      'google_gemini',
    ]);

    const seenProcessingNodes = new Map<string, string>(); // type -> first node id
    const filteredNodes: WorkflowNode[] = [];
    const violations: PruningViolation[] = [];

    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);

      if (processingNodeTypes.has(nodeType)) {
        // ✅ CRITICAL FIX: Never remove duplicate processing nodes in execution chain OR required nodes
        if (executionChainNodeIds.has(node.id)) {
          filteredNodes.push(node);
          console.log(`[WorkflowGraphPruner] ✅ Protected execution chain processing node: ${node.id} (${nodeType})`);
          continue;
        }

        // ✅ CRITICAL FIX: Never remove required nodes, even if duplicate
        if (requiredNodeTypesSet.has(nodeType)) {
          filteredNodes.push(node);
          console.log(`[WorkflowGraphPruner] ✅ Protected required processing node: ${node.id} (${nodeType})`);
          // Still track it as seen to avoid keeping multiple duplicates
          if (!seenProcessingNodes.has(nodeType)) {
            seenProcessingNodes.set(nodeType, node.id);
          }
          continue;
        }

        // Check if we've seen this processing node type before
        if (seenProcessingNodes.has(nodeType)) {
          // Duplicate processing node - remove it (only if not in execution chain or required)
          const reason = `Duplicate processing node "${nodeType}" found`;
          violations.push({
            type: 'duplicate_processing',
            nodeId: node.id,
            nodeType,
            reason,
          });
          
          // ✅ TRACK REPLACEMENT
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          let category: 'dataSource' | 'transformation' | 'output' = 'transformation';
          if (nodeDef?.category === 'data') {
            category = 'dataSource';
          } else if (nodeDef?.category === 'communication') {
            category = 'output';
          }
          
          const isProtected = (node.data as any)?.origin?.source === 'user' || 
                             (node.data as any)?.protected === true;
          
          const firstNodeId = seenProcessingNodes.get(nodeType);
          const firstNode = nodes.find(n => n.id === firstNodeId);
          const firstNodeType = firstNode ? unifiedNormalizeNodeTypeString(firstNode.type || firstNode.data?.type || '') : '';
          
          nodeReplacementTracker.trackReplacement({
            nodeId: node.id,
            nodeType,
            operation: typeof node.data?.config?.operation === 'string' ? node.data.config.operation : '',
            category,
            reason,
            stage: 'workflow_graph_pruner.removeDuplicateProcessingNodes',
            replacedBy: firstNodeType || '',
            wasRemoved: true,
            isProtected,
            confidence: confidenceScore,
            metadata: {
              firstNodeId: firstNodeId || '',
            },
          });
          
          console.log(`[WorkflowGraphPruner] ⚠️  Removed duplicate processing node: ${node.id} (${nodeType})`);
          continue;
        }

        // First occurrence - keep it
        seenProcessingNodes.set(nodeType, node.id);
      }

      filteredNodes.push(node);
    }

    return { filteredNodes, duplicateViolations: violations };
  }

  /**
   * Remove disconnected nodes (not reachable from trigger)
   * ✅ CRITICAL FIX: Never remove nodes in execution chain OR required nodes
   * Required nodes must ALWAYS be preserved, even if they appear disconnected
   */
  private removeDisconnectedNodes(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    alreadyRemoved: Set<string>,
    executionChainNodeIds: Set<string>,
    requiredNodeTypesSet: Set<string>
  ): { filteredNodes: WorkflowNode[]; disconnectedViolations: PruningViolation[] } {
    // Find trigger node
    const triggerNode = nodes.find(node => {
      if (alreadyRemoved.has(node.id)) return false;
      const nodeType = unifiedNormalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      console.warn('[WorkflowGraphPruner] ⚠️  No trigger node found, skipping disconnected node removal');
      return { filteredNodes: nodes.filter(n => !alreadyRemoved.has(n.id)), disconnectedViolations: [] };
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
      if (alreadyRemoved.has(edge.source) || alreadyRemoved.has(edge.target)) {
        continue;
      }

      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // BFS from trigger to find all reachable nodes
    const reachable = new Set<string>();
    const queue: string[] = [triggerNode.id];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) {
        continue;
      }

      reachable.add(nodeId);
      const neighbors = outgoing.get(nodeId) || [];
      queue.push(...neighbors);
    }

    // Precompute execution chain node types (normalized) for semantic requirement checks
    const executionChainTypes: string[] = [];
    for (const node of nodes) {
      if (alreadyRemoved.has(node.id)) continue;
      if (executionChainNodeIds.has(node.id)) {
        executionChainTypes.push(unifiedNormalizeNodeType(node));
      }
    }

    // Find disconnected nodes (only nodes NOT in execution chain)
    const filteredNodes: WorkflowNode[] = [];
    const violations: PruningViolation[] = [];

    for (const node of nodes) {
      if (alreadyRemoved.has(node.id)) {
        continue;
      }

      const nodeType = unifiedNormalizeNodeType(node);

      // ✅ CRITICAL FIX: Never remove nodes in execution chain (they're always "connected")
      if (executionChainNodeIds.has(node.id)) {
        filteredNodes.push(node);
        console.log(`[WorkflowGraphPruner] ✅ Protected execution chain node from disconnected removal: ${node.id}`);
        continue;
      }

      // ✅ CRITICAL FIX (UNIVERSAL): Handle required / variant node types semantically
      // Required nodes must ALWAYS be preserved UNLESS their requirement is already satisfied
      // by a node in the execution chain (semantic equivalence via UnifiedNodeTypeMatcher).
      const isRequiredCanonical = requiredNodeTypesSet.has(nodeType);
      const isRequiredVariant = !isRequiredCanonical && Array.from(requiredNodeTypesSet).some(requiredType => {
        const match = unifiedNodeTypeMatcher.matches(requiredType, nodeType, { strict: false });
        return match.matches;
      });
      const isRequiredLike = isRequiredCanonical || isRequiredVariant;

      if (isRequiredLike) {
        // Determine the canonical required type this node belongs to (for logging + matching)
        const requiredCanonical =
          Array.from(requiredNodeTypesSet).find(requiredType => {
            const match = unifiedNodeTypeMatcher.matches(requiredType, nodeType, { strict: false });
            return match.matches;
          }) || nodeType;

        // Check if the execution chain already satisfies this requirement semantically
        const requirementSatisfiedInChain = unifiedNodeTypeMatcher.isRequirementSatisfied(
          requiredCanonical,
          executionChainTypes,
          { strict: false }
        );

        if (!reachable.has(node.id) && requirementSatisfiedInChain.matches) {
          // ✅ UNIVERSAL: This node is disconnected AND its requirement is already fulfilled by another node
          // in the execution chain (semantic equivalence detected via UnifiedNodeTypeMatcher).
          // Safe to remove as dead code - works for ANY node type variants (not just specific examples).
          violations.push({
            type: 'disconnected_node',
            nodeId: node.id,
            nodeType,
            reason: `Node "${nodeType}" is not reachable from trigger and its requirement is already satisfied by execution chain (canonical: "${requiredCanonical}")`,
          });
          console.log(
            `[WorkflowGraphPruner] ⚠️  Removed disconnected variant node: ${node.id} (${nodeType}) ` +
            `(requirement "${requiredCanonical}" satisfied in execution chain)`
          );
          continue;
        }

        // Requirement not satisfied elsewhere → preserve node (will be reconnected by auto-repair)
        filteredNodes.push(node);
        console.log(
          `[WorkflowGraphPruner] ✅ Protected required node from disconnected removal: ${node.id} (${nodeType})` +
          (isRequiredVariant ? ' (variant of required type)' : '')
        );
        continue;
      }

      if (!reachable.has(node.id)) {
        violations.push({
          type: 'disconnected_node',
          nodeId: node.id,
          nodeType,
          reason: `Node "${nodeType}" is not reachable from trigger and not required`,
        });
        console.log(`[WorkflowGraphPruner] ⚠️  Removed disconnected node: ${node.id} (${nodeType})`);
        continue;
      }

      filteredNodes.push(node);
    }

    return { filteredNodes, disconnectedViolations: violations };
  }

  /**
   * Ensure single path from trigger to output
   */
  private ensureSinglePath(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    removedNodeIds: Set<string>
  ): { filteredEdges: WorkflowEdge[]; pathViolations: PruningViolation[] } {
    const violations: PruningViolation[] = [];

    // Find trigger node
    const triggerNode = nodes.find(node => {
      if (removedNodeIds.has(node.id)) return false;
      const nodeType = unifiedNormalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      console.warn('[WorkflowGraphPruner] ⚠️  No trigger node found, skipping single path enforcement');
      return { filteredEdges: edges.filter(e => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target)), pathViolations: [] };
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    for (const edge of edges) {
      if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
        continue;
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
      console.warn('[WorkflowGraphPruner] ⚠️  No output nodes found, skipping single path enforcement');
      return { filteredEdges: edges.filter(e => !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target)), pathViolations: [] };
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
        continue;
      }

      if (pathEdgeIds.has(edge.id)) {
        // Edge is in shortest path - keep it
        filteredEdges.push(edge);
      } else {
        // Edge not in shortest path - check if it creates parallel path
        const sourceIncoming = incoming.get(edge.source) || [];
        const targetOutgoing = outgoing.get(edge.target) || [];

        if (sourceIncoming.length > 1 || targetOutgoing.length > 1) {
          violations.push({
            type: 'non_minimal_path',
            reason: `Parallel path edge: ${edge.source} → ${edge.target}`,
          });
          console.log(`[WorkflowGraphPruner] ⚠️  Removed parallel path edge: ${edge.id}`);
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
   * Check if node is a loop node
   */
  private isLoopNode(nodeType: string): boolean {
    return nodeType.includes('loop') ||
           nodeType === 'for' ||
           nodeType === 'while' ||
           nodeType === 'foreach';
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

  /**
   * ✅ FIXED: Compute required nodes from multiple sources
   * Required nodes = intent required + transformation required + execution dependency nodes
   */
  private computeRequiredNodes(
    workflow: Workflow,
    intent: StructuredIntent,
    originalPrompt?: string
  ): Set<string> {
    const requiredNodeTypes = new Set<string>();

    // STEP 1: Get required nodes from intent (includes transformation nodes if originalPrompt provided)
    const intentRequiredNodes = getRequiredNodes(intent, originalPrompt);
    intentRequiredNodes.forEach(nodeType => requiredNodeTypes.add(nodeType));
    console.log(`[WorkflowGraphPruner] Intent required nodes: ${intentRequiredNodes.join(', ')}`);

    // STEP 2: Get transformation required nodes
    if (originalPrompt) {
      const transformationDetection = detectTransformations(originalPrompt);
      if (transformationDetection.detected) {
        transformationDetection.requiredNodeTypes.forEach(nodeType => {
          requiredNodeTypes.add(nodeType);
        });
        console.log(`[WorkflowGraphPruner] Transformation required nodes: ${transformationDetection.requiredNodeTypes.join(', ')}`);
      }
    }

    // STEP 3: Get execution dependency nodes (nodes in path from trigger to output)
    const executionDependencyNodes = this.getExecutionDependencyNodes(workflow);
    executionDependencyNodes.forEach(nodeType => requiredNodeTypes.add(nodeType));
    console.log(`[WorkflowGraphPruner] Execution dependency nodes: ${executionDependencyNodes.join(', ')}`);

    // STEP 4: Get output nodes referenced in pipeline
    const outputNodes = this.getOutputNodes(workflow);
    outputNodes.forEach(nodeType => requiredNodeTypes.add(nodeType));
    console.log(`[WorkflowGraphPruner] Output nodes: ${outputNodes.join(', ')}`);

    return requiredNodeTypes;
  }

  /**
   * Get execution dependency nodes (nodes in path from trigger to output)
   * Uses graph reachability to find all nodes in dependency path
   */
  private getExecutionDependencyNodes(workflow: Workflow): string[] {
    const dependencyNodes = new Set<string>();

    // Find trigger node
    const triggerNode = workflow.nodes.find(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      console.warn('[WorkflowGraphPruner] ⚠️  No trigger node found, cannot compute execution dependencies');
      return [];
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // Find all nodes reachable from trigger (BFS)
    const reachable = new Set<string>();
    const queue: string[] = [triggerNode.id];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) {
        continue;
      }

      reachable.add(nodeId);
      const neighbors = outgoing.get(nodeId) || [];
      queue.push(...neighbors);
    }

    // Get node types for all reachable nodes
    for (const nodeId of reachable) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (node) {
        const nodeType = unifiedNormalizeNodeType(node);
        dependencyNodes.add(nodeType);
      }
    }

    return Array.from(dependencyNodes);
  }

  /**
   * ✅ FIXED: Get execution chain node IDs (all nodes in paths from trigger to output)
   * This is the CRITICAL method that identifies which nodes must NEVER be removed
   * 
   * Rules:
   * 1. Find trigger node
   * 2. Find final output nodes (nodes with no outgoing edges or explicitly marked as output)
   * 3. Find all nodes in paths from trigger to each output node
   * 4. Return set of node IDs that are in the execution chain
   */
  private getExecutionChainNodeIds(workflow: Workflow): Set<string> {
    const executionChainNodeIds = new Set<string>();

    // STEP 1: Find trigger node
    const triggerNode = workflow.nodes.find(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      console.warn('[WorkflowGraphPruner] ⚠️  No trigger node found, cannot identify execution chain');
      return executionChainNodeIds;
    }

    // STEP 2: Find final output nodes (nodes with no outgoing edges or explicitly marked as output)
    const outputNodes = this.getOutputNodeIds(workflow);
    console.log(`[WorkflowGraphPruner] Found ${outputNodes.size} output node(s): ${Array.from(outputNodes).join(', ')}`);

    if (outputNodes.size === 0) {
      console.warn('[WorkflowGraphPruner] ⚠️  No output nodes found, using all reachable nodes from trigger');
      // Fallback: use all nodes reachable from trigger
      return this.getAllReachableNodeIds(workflow, triggerNode.id);
    }

    // STEP 3: Find all nodes in paths from trigger to each output node
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // For each output node, find all nodes in paths from trigger to that output
    for (const outputNodeId of outputNodes) {
      const pathNodeIds = this.findPathNodeIds(triggerNode.id, outputNodeId, outgoing);
      pathNodeIds.forEach(nodeId => executionChainNodeIds.add(nodeId));
    }

    // Always include trigger node
    executionChainNodeIds.add(triggerNode.id);

    console.log(`[WorkflowGraphPruner] Execution chain contains ${executionChainNodeIds.size} node(s)`);
    return executionChainNodeIds;
  }

  /**
   * Get output node IDs (nodes with no outgoing edges or explicitly marked as output)
   */
  private getOutputNodeIds(workflow: Workflow): Set<string> {
    const outputNodeIds = new Set<string>();

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // Find nodes with no outgoing edges (terminal nodes) or explicitly marked as output
    for (const node of workflow.nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const hasOutgoing = outgoing.has(node.id) && (outgoing.get(node.id) || []).length > 0;
      const isOutputType = this.isOutputNode(nodeType);

      if (!hasOutgoing || isOutputType) {
        outputNodeIds.add(node.id);
      }
    }

    return outputNodeIds;
  }

  /**
   * Find all node IDs in paths from source to target using BFS
   */
  private findPathNodeIds(sourceId: string, targetId: string, outgoing: Map<string, string[]>): Set<string> {
    const pathNodeIds = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: sourceId, path: [sourceId] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === targetId) {
        // Found path to target - add all nodes in path
        path.forEach(id => pathNodeIds.add(id));
        continue;
      }

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);
      const neighbors = outgoing.get(nodeId) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ nodeId: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return pathNodeIds;
  }

  /**
   * Get all node IDs reachable from a source node (BFS)
   */
  private getAllReachableNodeIds(workflow: Workflow, sourceId: string): Set<string> {
    const reachable = new Set<string>();

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // BFS from source
    const queue: string[] = [sourceId];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) {
        continue;
      }

      reachable.add(nodeId);
      const neighbors = outgoing.get(nodeId) || [];
      queue.push(...neighbors);
    }

    return reachable;
  }

  /**
   * Get output nodes (nodes with no outgoing edges or explicitly marked as output)
   */
  private getOutputNodes(workflow: Workflow): string[] {
    const outputNodes = new Set<string>();

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // Find nodes with no outgoing edges (terminal nodes)
    for (const node of workflow.nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const hasOutgoing = outgoing.has(node.id) && (outgoing.get(node.id) || []).length > 0;

      // Check if it's an output node type
      const isOutputType = this.isOutputNode(nodeType);

      if (!hasOutgoing || isOutputType) {
        outputNodes.add(nodeType);
      }
    }

    return Array.from(outputNodes);
  }

  /**
   * Check if node is an output node
   */
  private isOutputNode(nodeType: string): boolean {
    const outputTypes = [
      'google_gmail',
      'gmail',
      'slack_message',
      'slack',
      'discord',
      'telegram',
      'email',
      'webhook_response',
      'http_request',
      'storage',
      's3',
      'database_write',
      'google_sheets', // Can be output if writing
    ];

    return outputTypes.some(type => nodeType.includes(type) || nodeType === type);
  }
}

// Export singleton instance
export const workflowGraphPruner = new WorkflowGraphPruner();

// Export convenience function
export function pruneWorkflowGraph(workflow: Workflow, intent: StructuredIntent, originalPrompt?: string): PruningResult {
  return workflowGraphPruner.prune(workflow, intent, originalPrompt);
}
