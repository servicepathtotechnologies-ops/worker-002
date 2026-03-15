/**
 * Workflow Operation Optimizer
 * 
 * ✅ ROOT-LEVEL: Analyzes generated workflows and removes nodes that perform duplicate operations
 * 
 * Problem:
 * - Workflow generation sometimes adds multiple nodes that perform the same operation
 * - Example: Both ai_agent and ai_chat_model doing "summarize" operation
 * - This creates redundant, unnecessary nodes in the workflow
 * 
 * Solution:
 * - Analyze all nodes in the workflow by their operation (config.operation)
 * - Detect nodes that perform the same operation
 * - Keep the most appropriate node and remove duplicates
 * - Preserve workflow connectivity by updating edges
 * 
 * Rules:
 * - Only remove nodes if they perform the EXACT same operation
 * - Prefer simpler nodes (ai_chat_model over ai_agent for simple operations)
 * - Preserve workflow structure and connectivity
 * - Never remove trigger nodes or required nodes
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { UnifiedNodeDefinition } from '../../core/types/unified-node-contract';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { semanticNodeEquivalenceRegistry } from '../../core/registry/semantic-node-equivalence-registry';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';
import { nodeReplacementTracker } from './node-replacement-tracker';

export interface OperationOptimizationResult {
  workflow: Workflow;
  removedNodes: string[];
  removedEdges: string[];
  optimizations: Array<{
    operation: string;
    duplicateNodes: Array<{ nodeId: string; nodeType: string }>;
    keptNode: { nodeId: string; nodeType: string; reason: string };
    removedNodes: Array<{ nodeId: string; nodeType: string; reason: string }>;
  }>;
  statistics: {
    originalNodeCount: number;
    optimizedNodeCount: number;
    originalEdgeCount: number;
    optimizedEdgeCount: number;
  };
}

export interface OptimizationOptions {
  requiredNodeTypes?: Set<string>; // Node types that must not be removed
  preserveRequiredNodes?: boolean; // If true, never remove required nodes
}

/**
 * Workflow Operation Optimizer
 * Removes nodes that perform duplicate operations
 */
export class WorkflowOperationOptimizer {
  /**
   * Optimize workflow by removing duplicate operations
   * 
   * @param workflow - Workflow to optimize
   * @param originalPrompt - Original user prompt (for context)
   * @param options - Optimization options (required nodes, etc.)
   * @returns Optimized workflow with duplicate operations removed
   */
  optimize(workflow: Workflow, originalPrompt?: string, options?: OptimizationOptions, confidenceScore?: number, dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>): OperationOptimizationResult {
    console.log('[WorkflowOperationOptimizer] 🔍 Analyzing workflow for duplicate operations...');
    
    const originalNodeCount = workflow.nodes.length;
    const originalEdgeCount = workflow.edges.length;
    
    // ✅ PHASE 1: Get current execution order (source of truth)
    const { executionOrderManager } = require('../../core/orchestration/execution-order-manager');
    const { unifiedGraphOrchestrator } = require('../../core/orchestration/unified-graph-orchestrator');
    
    const currentExecutionOrder = executionOrderManager.initialize(workflow, dslExecutionOrder);
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(currentExecutionOrder);
    
    // ✅ ROOT-LEVEL FIX: Group nodes by operation signature from REGISTRY (not just operation name)
    // This ensures we detect duplicates even if operation names differ
    const nodesByOperation = this.groupNodesByOperationCategory(workflow.nodes);
    
    // Find duplicate operations
    const duplicateOperations = this.findDuplicateOperations(nodesByOperation);
    
    // Remove duplicate nodes (respecting required nodes and execution order)
    // Use provided confidenceScore or fallback to metadata
    const effectiveConfidenceScore = confidenceScore ?? ((workflow.metadata as any)?.confidenceScore);
    const { optimizedNodes, removedNodeIds, optimizations } = this.removeDuplicateOperations(
      workflow.nodes,
      duplicateOperations,
      workflow.edges,
      options,
      effectiveConfidenceScore,
      orderedNodeIds // ✅ NEW: Pass execution order
    );
    
    // ✅ PHASE 1: Rebuild workflow using orchestrator (NOT manual edge rewiring)
    const optimizedWorkflow: Workflow = {
      ...workflow,
      nodes: optimizedNodes,
      edges: [], // Clear edges - orchestrator will rebuild
    };
    
    // ✅ CRITICAL: Use orchestrator to rebuild edges from execution order
    const { workflow: reconciledWorkflow, executionOrder: newExecutionOrder } = 
      unifiedGraphOrchestrator.initializeWorkflow(optimizedNodes, undefined, dslExecutionOrder);
    
    // ✅ PHASE 1: Validate the result
    const validation = unifiedGraphOrchestrator.validateWorkflow(reconciledWorkflow, newExecutionOrder);
    if (!validation.valid) {
      // Optimization broke the workflow - skip it
      console.warn(`[WorkflowOperationOptimizer] ⚠️  Optimization would break workflow, skipping: ${validation.errors.join(', ')}`);
      return {
        workflow, // Return original
        removedNodes: [],
        removedEdges: [],
        optimizations: [],
        statistics: {
          originalNodeCount,
          optimizedNodeCount: originalNodeCount,
          originalEdgeCount,
          optimizedEdgeCount: originalEdgeCount,
        },
      };
    }
    
    const statistics = {
      originalNodeCount,
      optimizedNodeCount: optimizedNodes.length,
      originalEdgeCount,
      optimizedEdgeCount: reconciledWorkflow.edges.length, // Use orchestrator's edge count
    };
    
    if (removedNodeIds.length > 0) {
      console.log(`[WorkflowOperationOptimizer] ✅ Optimized workflow: Removed ${removedNodeIds.length} duplicate operation node(s)`);
      optimizations.forEach(opt => {
        console.log(`[WorkflowOperationOptimizer]   Operation "${opt.operation}": Kept ${opt.keptNode.nodeType} (${opt.keptNode.nodeId}), removed ${opt.removedNodes.length} duplicate(s)`);
      });
    } else {
      console.log(`[WorkflowOperationOptimizer] ✅ No duplicate operations found - workflow already optimized`);
    }
    
    return {
      workflow: reconciledWorkflow, // Use orchestrator-reconciled workflow
      removedNodes: removedNodeIds,
      removedEdges: [], // Orchestrator handles edge changes
      optimizations,
      statistics,
    };
  }

  /**
   * Group nodes by their operation
   */
  /**
   * ✅ ROOT-LEVEL FIX: Group nodes by operation signature from REGISTRY
   * 
   * Uses registry properties (category, tags) to determine operation signature.
   * Works for ANY node type - no hardcoded lists.
   * 
   * This ensures we detect duplicates even if operation names differ:
   * - "summarize" and "process" both → "ai_processing" category
   * - "create_opportunity" and "add_contact" both → "crm_route" category
   */
  private groupNodesByOperationCategory(nodes: WorkflowNode[]): Map<string, WorkflowNode[]> {
    const groups = new Map<string, WorkflowNode[]>();
    
    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      if (!nodeDef) {
        // Node not in registry → use operation name as fallback
        const operation = this.extractOperation(node);
        if (operation) {
          const key = operation;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(node);
        }
        continue;
      }
      
      // ✅ Get operation signature from registry (same logic as Phase 2)
      const operation = this.extractOperation(node);
      const category = this.mapRegistryCategoryToDSLCategory(nodeDef.category);
      
      if (category) {
        const operationSignature = this.getOperationSignatureFromRegistry(nodeDef, operation, category);
        const key = operationSignature || operation || nodeType;
        
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(node);
      } else {
        // Fallback: use operation name
        const key = operation || nodeType;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(node);
      }
    }
    
    return groups;
  }

  /**
   * ✅ UNIVERSAL: Get operation signature from registry properties
   * 
   * Uses registry category and tags to determine operation signature.
   * Works for ANY node type.
   * 
   * This is the same logic as Phase 2 for consistency.
   */
  private getOperationSignatureFromRegistry(
    nodeDef: UnifiedNodeDefinition,
    operation: string | null,
    dslCategory: 'data_source' | 'transformation' | 'output'
  ): string {
    const category = nodeDef.category;
    const tags = nodeDef.tags || [];
    
    // ✅ Build operation signature from registry properties (same as Phase 2)
    // This ensures consistency across the system
    
    // AI processing operations
    if (category === 'ai' || tags.some(tag => ['ai', 'llm', 'chat', 'agent'].includes(tag.toLowerCase()))) {
      return 'ai_processing';
    }
    
    // CRM/route operations
    if (category === 'data' && tags.some(tag => ['crm', 'route', 'sales'].includes(tag.toLowerCase()))) {
      return 'crm_route';
    }
    
    // Database/storage operations
    if (category === 'data' && tags.some(tag => ['database', 'storage', 'write'].includes(tag.toLowerCase()))) {
      return 'data_storage';
    }
    
    // Email operations
    if (category === 'communication' && tags.some(tag => ['email', 'gmail', 'mail'].includes(tag.toLowerCase()))) {
      return 'email_notify';
    }
    
    // Messaging operations
    if (category === 'communication' && tags.some(tag => ['slack', 'discord', 'message', 'chat'].includes(tag.toLowerCase()))) {
      return 'messaging';
    }
    
    // Data source operations
    if (dslCategory === 'data_source') {
      // Check operation type from tags or category
      if (tags.some(tag => ['read', 'fetch', 'get'].includes(tag.toLowerCase()))) {
        return 'data_read';
      }
      if (tags.some(tag => ['write', 'create', 'update'].includes(tag.toLowerCase()))) {
        return 'data_write';
      }
      return 'data_source'; // Generic data source
    }
    
    // Transformation operations
    if (dslCategory === 'transformation') {
      return 'transformation'; // Generic transformation
    }
    
    // Output operations
    if (dslCategory === 'output') {
      // Use category + tags to determine specific operation
      if (category === 'communication') {
        return 'communication_output';
      }
      if (category === 'data') {
        return 'data_output';
      }
      return 'output'; // Generic output
    }
    
    // Use operation name as fallback, or node type
    return operation || nodeDef.type;
  }

  /**
   * ✅ UNIVERSAL: Map registry category to DSL category
   * 
   * Uses registry as single source of truth for category mapping.
   */
  private mapRegistryCategoryToDSLCategory(
    registryCategory: string
  ): 'data_source' | 'transformation' | 'output' | null {
    // ✅ Universal mapping based on registry category definitions
    const mapping: Record<string, 'data_source' | 'transformation' | 'output'> = {
      'data': 'data_source',
      'transformation': 'transformation',
      'ai': 'transformation', // AI nodes are transformations
      'logic': 'transformation', // Logic nodes are transformations
      'communication': 'output',
      'utility': 'output',
    };
    
    return mapping[registryCategory.toLowerCase()] || null;
  }

  /**
   * Extract operation from node config
   */
  private extractOperation(node: WorkflowNode): string | null {
    const config = node.data?.config || {};
    
    // Check for operation field
    if (config.operation) {
      return String(config.operation).toLowerCase().trim();
    }
    
    // Check for verb field (used in transformations)
    if (config.verb) {
      return String(config.verb).toLowerCase().trim();
    }
    
    // ✅ ROOT-LEVEL FIX: Use registry to detect AI nodes (not hardcoded types)
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    
    if (nodeDef && (nodeDef.category === 'ai' || (nodeDef.tags || []).some(tag => ['ai', 'llm', 'chat', 'agent'].includes(tag.toLowerCase())))) {
      // Check if prompt suggests summarization
      const prompt = String(config.prompt || config.userInput || '');
      if (prompt.toLowerCase().includes('summar') || 
          config.operation === 'summarize' ||
          config.verb === 'summarize') {
        return 'summarize';
      }
      // Check if prompt suggests analysis
      if (prompt.toLowerCase().includes('analyz') ||
          config.operation === 'analyze' ||
          config.verb === 'analyze') {
        return 'analyze';
      }
      // Default: generic AI processing
      return 'ai_process';
    }
    
    return null;
  }

  /**
   * ✅ ENHANCED: Find operations that have duplicate nodes (including semantic duplicates)
   * 
   * Now checks both:
   * 1. Operation duplicates (same operation signature)
   * 2. Semantic duplicates (semantically equivalent node types)
   */
  private findDuplicateOperations(
    nodesByOperation: Map<string, WorkflowNode[]>
  ): Map<string, WorkflowNode[]> {
    const duplicates = new Map<string, WorkflowNode[]>();
    
    // First, find operation-based duplicates (existing logic)
    for (const [operation, nodes] of nodesByOperation.entries()) {
      // Only consider it a duplicate if there are 2+ nodes performing the same operation
      if (nodes.length >= 2) {
        // ✅ ROOT-LEVEL FIX: Filter out trigger nodes using registry (not string matching)
        const nonTriggerNodes = nodes.filter(n => {
          const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          // Use registry category to determine if it's a trigger
          return !nodeDef || nodeDef.category !== 'trigger';
        });
        
        if (nonTriggerNodes.length >= 2) {
          duplicates.set(operation, nonTriggerNodes);
        }
      }
    }
    
    // ✅ SEMANTIC EQUIVALENCE: Also check for semantic duplicates across different operations
    // This catches cases like: instagram (operation: create) + instagram_post (operation: create_post)
    // They're semantically equivalent even if operation names differ
    const allNodes = Array.from(nodesByOperation.values()).flat();
    const semanticDuplicates = this.findSemanticDuplicates(allNodes);
    
    // Merge semantic duplicates into duplicates map
    for (const [canonical, equivalentNodes] of semanticDuplicates.entries()) {
      if (equivalentNodes.length >= 2) {
        // Use canonical type as operation key
        const operationKey = `semantic_${canonical}`;
        if (!duplicates.has(operationKey)) {
          duplicates.set(operationKey, equivalentNodes);
        } else {
          // Merge with existing duplicates
          const existing = duplicates.get(operationKey)!;
          const merged = [...new Set([...existing, ...equivalentNodes])];
          duplicates.set(operationKey, merged);
        }
      }
    }
    
    return duplicates;
  }

  /**
   * ✅ SEMANTIC EQUIVALENCE: Find semantically equivalent nodes
   */
  private findSemanticDuplicates(nodes: WorkflowNode[]): Map<string, WorkflowNode[]> {
    const semanticGroups = new Map<string, WorkflowNode[]>();
    
    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const operation = this.extractOperation(node);
      
      // Get category from node definition
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const category = nodeDef?.category?.toLowerCase();
      
      // ✅ WORLD-CLASS ARCHITECTURE: Get canonical type using unified matcher
      const canonical = unifiedNodeTypeMatcher.getCanonicalType(nodeType, {
        operation: operation || undefined,
        category: category,
      });
      
      // Group by canonical type
      if (!semanticGroups.has(canonical.toLowerCase())) {
        semanticGroups.set(canonical.toLowerCase(), []);
      }
      semanticGroups.get(canonical.toLowerCase())!.push(node);
    }
    
    // Return only groups with 2+ nodes (duplicates)
    const duplicates = new Map<string, WorkflowNode[]>();
    for (const [canonical, nodes] of semanticGroups.entries()) {
      if (nodes.length >= 2) {
        duplicates.set(canonical, nodes);
      }
    }
    
    return duplicates;
  }

  /**
   * Remove duplicate operations, keeping the most appropriate node
   * 
   * ✅ FIXED: Respects required nodes and prevents invalid branching
   * ✅ PHASE 1: Respects execution order - only removes non-adjacent duplicates
   */
  private removeDuplicateOperations(
    nodes: WorkflowNode[],
    duplicateOperations: Map<string, WorkflowNode[]>,
    edges: WorkflowEdge[],
    options?: OptimizationOptions,
    confidenceScore?: number,
    executionOrder?: string[] // ✅ NEW: Execution order from orchestrator
  ): {
    optimizedNodes: WorkflowNode[];
    removedNodeIds: string[];
    optimizations: OperationOptimizationResult['optimizations'];
  } {
    const nodesToKeep = new Set<string>();
    const nodesToRemove = new Set<string>();
    const optimizations: OperationOptimizationResult['optimizations'] = [];
    
    // Build edge map for connectivity analysis
    const edgeMap = new Map<string, Set<string>>(); // nodeId -> Set of connected nodeIds
    for (const edge of edges) {
      if (!edgeMap.has(edge.source)) {
        edgeMap.set(edge.source, new Set());
      }
      if (!edgeMap.has(edge.target)) {
        edgeMap.set(edge.target, new Set());
      }
      edgeMap.get(edge.source)!.add(edge.target);
      edgeMap.get(edge.target)!.add(edge.source);
    }
    
    // Build required node types set (normalized to lowercase)
    const requiredNodeTypes = options?.requiredNodeTypes 
      ? new Set(Array.from(options.requiredNodeTypes).map(t => t.toLowerCase()))
      : new Set<string>();
    
    // Build edge maps for branching detection
    const outgoingEdgesMap = new Map<string, WorkflowEdge[]>();
    edges.forEach(edge => {
      if (!outgoingEdgesMap.has(edge.source)) {
        outgoingEdgesMap.set(edge.source, []);
      }
      outgoingEdgesMap.get(edge.source)!.push(edge);
    });
    
    // Process each duplicate operation
    for (const [operation, duplicateNodes] of duplicateOperations.entries()) {
      // ✅ PHASE 1: Sort duplicates by execution order position (if available)
      let sortedDuplicates = duplicateNodes;
      if (executionOrder && executionOrder.length > 0) {
        sortedDuplicates = [...duplicateNodes].sort((a, b) => {
          const posA = executionOrder.indexOf(a.id);
          const posB = executionOrder.indexOf(b.id);
          // If not in execution order, put at end
          if (posA === -1 && posB === -1) return 0;
          if (posA === -1) return 1;
          if (posB === -1) return -1;
          return posA - posB; // Earlier in order = higher priority
        });
      }
      
      // Determine which node to keep (prefer earlier in execution order)
      const keptNode = executionOrder && executionOrder.length > 0
        ? sortedDuplicates[0] // Keep first in execution order
        : this.selectBestNode(duplicateNodes, edgeMap); // Fallback to existing logic
      const removedNodes = sortedDuplicates.filter(n => n.id !== keptNode.id);
      
      // ✅ FIXED: Check if any removed node is required
      const requiredRemovedNodes = removedNodes.filter(n => {
        const nodeType = (n.type || n.data?.type || '').toLowerCase();
        return requiredNodeTypes.has(nodeType);
      });
      
      // ✅ PHASE 1: Check if removing would break execution order chain
      // If nodes are adjacent in execution order, removing one breaks the chain
      let wouldBreakChain = false;
      if (executionOrder && executionOrder.length > 0) {
        const keptPos = executionOrder.indexOf(keptNode.id);
        wouldBreakChain = removedNodes.some(removed => {
          const removedPos = executionOrder.indexOf(removed.id);
          if (removedPos === -1 || keptPos === -1) return false; // Not in order, skip check
          return Math.abs(removedPos - keptPos) <= 1; // Adjacent nodes
        });
        
        if (wouldBreakChain) {
          console.log(
            `[WorkflowOperationOptimizer] ⚠️  Skipping removal of duplicate operation "${operation}": ` +
            `Would break execution order chain (adjacent nodes)`
          );
          // Keep all nodes to avoid breaking chain
          duplicateNodes.forEach(n => nodesToKeep.add(n.id));
          continue;
        }
      }
      
      // ✅ FIXED: Check if removing nodes would create invalid branching
      // If keptNode has multiple outputs and we remove a node that connects to it,
      // we might create invalid branching
      const keptNodeOutgoing = outgoingEdgesMap.get(keptNode.id) || [];
      const wouldCreateBranching = keptNodeOutgoing.length > 1;
      
      // ✅ FIXED: Don't remove if:
      // 1. Any removed node is required
      // 2. Removing would create invalid branching (multiple outputs from non-branching node)
      if (options?.preserveRequiredNodes !== false && requiredRemovedNodes.length > 0) {
        console.log(
          `[WorkflowOperationOptimizer] ⚠️  Skipping removal of duplicate operation "${operation}": ` +
          `Required node(s) would be removed: ${requiredRemovedNodes.map(n => n.type || n.data?.type || n.id).join(', ')}`
        );
        // Keep all nodes if any is required
        duplicateNodes.forEach(n => nodesToKeep.add(n.id));
        continue;
      }
      
      // Check if removing would create invalid branching
      // If keptNode already has multiple outputs, removing other nodes is OK (they're duplicates)
      // But if keptNode would get multiple outputs AFTER removal, that's a problem
      // ✅ PHASE 1 FIX: Use registry instead of hardcoded list
      const keptNodeType = unifiedNormalizeNodeTypeString(keptNode.type || keptNode.data?.type || '');
      const isAllowedBranchingNode = unifiedNodeRegistry.allowsBranching(keptNodeType);
      
      if (wouldCreateBranching && !isAllowedBranchingNode) {
        // Check if the branching is from the kept node itself (already exists) or would be created
        // If keptNode already has multiple outputs, it's fine to remove duplicates
        // But we need to be careful - if removing a node would cause keptNode to have multiple outputs
        // when it currently has one, that's invalid
        
        // Count how many edges would remain after removal
        const edgesAfterRemoval = keptNodeOutgoing.filter(e => {
          const targetNode = nodes.find(n => n.id === e.target);
          return targetNode && !removedNodes.some(rn => rn.id === targetNode.id);
        });
        
        // If keptNode would have multiple outputs after removal, and it's not an allowed branching node,
        // we should keep both nodes or restructure
        if (edgesAfterRemoval.length > 1 && !isAllowedBranchingNode) {
          console.log(
            `[WorkflowOperationOptimizer] ⚠️  Skipping removal of duplicate operation "${operation}": ` +
            `Would create invalid branching from ${keptNodeType} (${edgesAfterRemoval.length} outputs). ` +
            `Keeping all nodes to preserve linear flow.`
          );
          // Keep all nodes to avoid branching
          duplicateNodes.forEach(n => nodesToKeep.add(n.id));
          continue;
        }
      }
      
      nodesToKeep.add(keptNode.id);
      removedNodes.forEach(n => {
        nodesToRemove.add(n.id);
        
        // ✅ TRACK REPLACEMENT
        const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
        const keptNodeType = unifiedNormalizeNodeTypeString(keptNode.type || keptNode.data?.type || '');
        const nodeOperation = this.extractOperation(n);
        
        // Determine category from node type
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        let category: 'dataSource' | 'transformation' | 'output' = 'transformation';
        if (nodeDef?.category === 'data') {
          category = 'dataSource';
        } else if (nodeDef?.category === 'communication') {
          category = 'output';
        }
        
        // Check if node is protected (user-explicit)
        const isProtected = (n.data as any)?.origin?.source === 'user' || 
                           (n.data as any)?.protected === true;
        
        const reason = this.getRemoveReason(n, keptNode);
        
        nodeReplacementTracker.trackReplacement({
          nodeId: n.id,
          nodeType,
          operation: nodeOperation || '',
          category,
          reason,
          stage: 'workflow_operation_optimizer.removeDuplicateOperations',
          replacedBy: keptNodeType,
          wasRemoved: true,
          isProtected,
          confidence: confidenceScore,
          metadata: {
            operation,
            keptNodeId: keptNode.id,
            duplicateCount: duplicateNodes.length,
          },
        });
      });
      
      optimizations.push({
        operation,
        duplicateNodes: duplicateNodes.map(n => ({ nodeId: n.id, nodeType: n.type || n.data?.type || 'unknown' })),
        keptNode: {
          nodeId: keptNode.id,
          nodeType: keptNode.type || keptNode.data?.type || 'unknown',
          reason: this.getKeepReason(keptNode, removedNodes),
        },
        removedNodes: removedNodes.map(n => ({
          nodeId: n.id,
          nodeType: n.type || n.data?.type || 'unknown',
          reason: this.getRemoveReason(n, keptNode),
        })),
      });
      
      console.log(
        `[WorkflowOperationOptimizer] 🔄 Operation "${operation}": ` +
        `Keeping ${keptNode.type || keptNode.data?.type} (${keptNode.id}), ` +
        `removing ${removedNodes.length} duplicate(s)`
      );
    }
    
    // Keep all non-duplicate nodes
    for (const node of nodes) {
      if (!nodesToRemove.has(node.id)) {
        nodesToKeep.add(node.id);
      }
    }
    
    const optimizedNodes = nodes.filter(n => nodesToKeep.has(n.id));
    
    return {
      optimizedNodes,
      removedNodeIds: Array.from(nodesToRemove),
      optimizations,
    };
  }

  /**
   * Select the best node to keep from duplicate nodes
   */
  private selectBestNode(
    nodes: WorkflowNode[],
    edgeMap: Map<string, Set<string>>
  ): WorkflowNode {
    // Priority rules:
    // 1. Prefer simpler nodes (ai_chat_model over ai_agent for simple operations)
    // 2. Prefer nodes with more connections (more integrated)
    // 3. Prefer nodes that appear earlier in workflow (first occurrence)
    
    // Rule 1: Prefer ai_chat_model over ai_agent for simple AI operations
    const aiChatModel = nodes.find(n => (n.type || n.data?.type) === 'ai_chat_model');
    const aiAgent = nodes.find(n => (n.type || n.data?.type) === 'ai_agent');
    
    if (aiChatModel && aiAgent) {
      // Check if ai_agent has tools/memory (more complex) - if not, prefer ai_chat_model
      const aiAgentConfig = aiAgent.data?.config || {};
      const hasTools = aiAgentConfig.tool && Object.keys(aiAgentConfig.tool).length > 0;
      const hasMemory = aiAgentConfig.memory && Object.keys(aiAgentConfig.memory).length > 0;
      
      if (!hasTools && !hasMemory) {
        // ai_agent is simple (no tools/memory) - prefer ai_chat_model
        return aiChatModel;
      }
      // ai_agent has tools/memory - keep it (more capable)
      return aiAgent;
    }
    
    if (aiChatModel) {
      return aiChatModel;
    }
    
    if (aiAgent) {
      return aiAgent;
    }
    
    // Rule 2: Prefer nodes with more connections (more integrated into workflow)
    let bestNode = nodes[0];
    let maxConnections = (edgeMap.get(nodes[0].id)?.size || 0);
    
    for (let i = 1; i < nodes.length; i++) {
      const connections = edgeMap.get(nodes[i].id)?.size || 0;
      if (connections > maxConnections) {
        maxConnections = connections;
        bestNode = nodes[i];
      }
    }
    
    return bestNode;
  }

  /**
   * Get reason for keeping a node
   */
  private getKeepReason(keptNode: WorkflowNode, removedNodes: WorkflowNode[]): string {
    const nodeType = keptNode.type || keptNode.data?.type || 'unknown';
    
    // ✅ ROOT-LEVEL FIX: Use registry to determine node complexity (not hardcoded types)
    const keptNodeDef = unifiedNodeRegistry.get(nodeType);
    const isSimpleAI = keptNodeDef && (
      keptNodeDef.category === 'ai' && 
      (keptNodeDef.tags || []).some(tag => ['simple', 'chat_model', 'direct'].includes(tag.toLowerCase()))
    );
    
    if (isSimpleAI) {
      const removedTypes = removedNodes.map(n => unifiedNormalizeNodeTypeString(n.type || n.data?.type || 'unknown'));
      const hasComplexAI = removedTypes.some(removedType => {
        const removedDef = unifiedNodeRegistry.get(removedType);
        return removedDef && removedDef.category === 'ai' && 
               (removedDef.tags || []).some(tag => ['complex', 'agent', 'tool'].includes(tag.toLowerCase()));
      });
      if (hasComplexAI) {
        return 'Simpler, more direct node for AI operations (preferred over complex AI nodes for simple operations)';
      }
    }
    
    const isComplexAI = keptNodeDef && (
      keptNodeDef.category === 'ai' && 
      (keptNodeDef.tags || []).some(tag => ['complex', 'agent', 'tool'].includes(tag.toLowerCase()))
    );
    
    if (isComplexAI) {
      const config = keptNode.data?.config || {};
      if (config.tool || config.memory) {
        return 'Has tools/memory capabilities required for operation';
      }
    }
    
    return 'Most appropriate node for operation';
  }

  /**
   * Get reason for removing a node
   */
  private getRemoveReason(removedNode: WorkflowNode, keptNode: WorkflowNode): string {
    const removedType = removedNode.type || removedNode.data?.type || 'unknown';
    const keptType = keptNode.type || keptNode.data?.type || 'unknown';
    
    if (removedType === 'ai_agent' && keptType === 'ai_chat_model') {
      return 'Duplicate operation - ai_chat_model is simpler and more direct for this operation';
    }
    
    if (removedType === 'ai_chat_model' && keptType === 'ai_agent') {
      const config = keptNode.data?.config || {};
      if (config.tool || config.memory) {
        return 'Duplicate operation - ai_agent has required tools/memory capabilities';
      }
    }
    
    return `Duplicate operation - ${keptType} is more appropriate`;
  }

  /**
   * ✅ UNIVERSAL: Update edges to remove connections to removed nodes
   * ✅ CRITICAL FIX: Reconnect edges to bridge gaps when nodes are removed
   * 
   * When a node is removed:
   * - Find all incoming edges (edges TO the removed node)
   * - Find all outgoing edges (edges FROM the removed node)
   * - Reconnect: incoming.source → outgoing.target (bridge the gap)
   * - Use Universal Edge Creation Service to ensure proper rules
   */
  private updateEdgesForRemovedNodes(
    edges: WorkflowEdge[],
    removedNodeIds: Set<string>,
    keptNodes: WorkflowNode[]
  ): {
    optimizedEdges: WorkflowEdge[];
    removedEdgeIds: string[];
  } {
    if (removedNodeIds.size === 0) {
      return { optimizedEdges: edges, removedEdgeIds: [] };
    }
    
    const keptNodeIds = new Set(keptNodes.map(n => n.id));
    const keptNodeMap = new Map(keptNodes.map(n => [n.id, n]));
    const removedEdgeIds: string[] = [];
    const optimizedEdges: WorkflowEdge[] = [];
    
    // ✅ STEP 1: Collect edges that need reconnection
    // Map: removedNodeId → { incoming: WorkflowEdge[], outgoing: WorkflowEdge[] }
    const edgesByRemovedNode = new Map<string, { incoming: WorkflowEdge[]; outgoing: WorkflowEdge[] }>();
    
    for (const edge of edges) {
      const sourceRemoved = removedNodeIds.has(edge.source);
      const targetRemoved = removedNodeIds.has(edge.target);
      
      if (sourceRemoved && targetRemoved) {
        // Both source and target removed - just remove the edge
        removedEdgeIds.push(edge.id || `${edge.source}-${edge.target}`);
        console.log(
          `[WorkflowOperationOptimizer] 🔗 Removing edge: ${edge.source} → ${edge.target} (both nodes removed)`
        );
      } else if (sourceRemoved) {
        // Source removed, target kept - track as outgoing from removed node
        if (!edgesByRemovedNode.has(edge.source)) {
          edgesByRemovedNode.set(edge.source, { incoming: [], outgoing: [] });
        }
        edgesByRemovedNode.get(edge.source)!.outgoing.push(edge);
      } else if (targetRemoved) {
        // Target removed, source kept - track as incoming to removed node
        if (!edgesByRemovedNode.has(edge.target)) {
          edgesByRemovedNode.set(edge.target, { incoming: [], outgoing: [] });
        }
        edgesByRemovedNode.get(edge.target)!.incoming.push(edge);
      } else if (keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)) {
        // Edge connects two kept nodes - keep it
        optimizedEdges.push(edge);
      }
    }
    
    // ✅ STEP 2: Reconnect edges to bridge gaps
    // For each removed node, reconnect: incoming.source → outgoing.target
    const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
    
    for (const [removedNodeId, edgeGroups] of edgesByRemovedNode.entries()) {
      // Remove edges connected to this removed node
      for (const edge of [...edgeGroups.incoming, ...edgeGroups.outgoing]) {
        removedEdgeIds.push(edge.id || `${edge.source}-${edge.target}`);
        console.log(
          `[WorkflowOperationOptimizer] 🔗 Removing edge: ${edge.source} → ${edge.target} (connected to removed node)`
        );
      }
      
      // ✅ CRITICAL: Reconnect incoming → outgoing to bridge the gap
      // For each incoming edge, reconnect to each outgoing edge's target
      for (const incomingEdge of edgeGroups.incoming) {
        const sourceNode = keptNodeMap.get(incomingEdge.source);
        if (!sourceNode) continue; // Source node was also removed (shouldn't happen, but safety check)
        
        for (const outgoingEdge of edgeGroups.outgoing) {
          const targetNode = keptNodeMap.get(outgoingEdge.target);
          if (!targetNode) continue; // Target node was also removed (shouldn't happen, but safety check)
          
          // ✅ UNIVERSAL: Use Universal Edge Creation Service to reconnect
          const reconnectResult = universalEdgeCreationService.createEdge({
            sourceNode,
            targetNode,
            existingEdges: optimizedEdges,
            allNodes: keptNodes,
          });
          
          if (reconnectResult.success && reconnectResult.edge) {
            optimizedEdges.push(reconnectResult.edge);
            console.log(
              `[WorkflowOperationOptimizer] ✅ Reconnected edge: ${sourceNode.type || sourceNode.data?.type} → ${targetNode.type || targetNode.data?.type} (bridged removed node)`
            );
          } else {
            console.warn(
              `[WorkflowOperationOptimizer] ⚠️  Failed to reconnect edge: ${sourceNode.type || sourceNode.data?.type} → ${targetNode.type || targetNode.data?.type}: ${reconnectResult.error || reconnectResult.reason}`
            );
          }
        }
      }
      
      // ✅ FALLBACK: If no outgoing edges, keep incoming edges but mark target as orphan
      // (This shouldn't happen often, but handles edge cases)
      if (edgeGroups.outgoing.length === 0 && edgeGroups.incoming.length > 0) {
        console.warn(
          `[WorkflowOperationOptimizer] ⚠️  Removed node ${removedNodeId} had incoming edges but no outgoing edges - incoming nodes may be orphaned`
        );
      }
      
      // ✅ FALLBACK: If no incoming edges, remove outgoing edges
      // (These edges will be orphaned anyway)
      if (edgeGroups.incoming.length === 0 && edgeGroups.outgoing.length > 0) {
        console.warn(
          `[WorkflowOperationOptimizer] ⚠️  Removed node ${removedNodeId} had outgoing edges but no incoming edges - outgoing nodes may be orphaned`
        );
      }
    }
    
    return {
      optimizedEdges,
      removedEdgeIds,
    };
  }
}

// Export singleton instance
export const workflowOperationOptimizer = new WorkflowOperationOptimizer();

// Export convenience function
export function optimizeWorkflowOperations(
  workflow: Workflow,
  originalPrompt?: string,
  options?: OptimizationOptions,
  confidenceScore?: number,
  dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>
): OperationOptimizationResult {
  return workflowOperationOptimizer.optimize(workflow, originalPrompt, options, confidenceScore, dslExecutionOrder);
}
