/**
 * Workflow Deduplicator
 * 
 * Enterprise-grade service for removing duplicate nodes from workflows while preserving
 * the main execution path and maintaining workflow integrity.
 * 
 * Features:
 * - Universal: Works for ALL node types (no hardcoding)
 * - Safe: Preserves main execution path from trigger to output
 * - Smart: Prioritizes DSL-added nodes (source of truth)
 * - Validated: Comprehensive validation after removal
 * - Production-ready: Error handling, logging, metrics
 * 
 * @module workflow-deduplicator
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { WorkflowDSL } from './workflow-dsl';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { buildExecutionPlan } from '../../core/execution/unified-execution-engine';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { nodeReplacementTracker } from './node-replacement-tracker';

/**
 * Result of deduplication operation
 */
export interface DeduplicationResult {
  /** Deduplicated workflow */
  workflow: Workflow;
  /** IDs of removed nodes */
  removedNodes: string[];
  /** Number of edges rewired */
  rewiredEdges: number;
  /** Warnings generated during deduplication */
  warnings: string[];
  /** Detailed information about each duplicate removal */
  details: DuplicateRemovalDetail[];
  /** Metrics for monitoring */
  metrics: DeduplicationMetrics;
}

/**
 * Detailed information about a duplicate removal
 */
export interface DuplicateRemovalDetail {
  /** Node type that had duplicates */
  nodeType: string;
  /** ID of node kept */
  keptNode: string;
  /** IDs of nodes removed */
  removedNodes: string[];
  /** Reason for keeping this node */
  reason: string;
  /** Priority used for decision */
  priority: number;
}

/**
 * Metrics for monitoring and observability
 */
export interface DeduplicationMetrics {
  /** Total duplicate groups found */
  duplicateGroups: number;
  /** Total nodes removed */
  nodesRemoved: number;
  /** Total edges rewired */
  edgesRewired: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Whether main path was preserved */
  mainPathPreserved: boolean;
}

/**
 * Enterprise-grade Workflow Deduplicator
 * 
 * Removes duplicate nodes while preserving workflow integrity.
 * Uses universal algorithms that work for ALL node types.
 */
export class WorkflowDeduplicator {
  private readonly logger = {
    log: (message: string, ...args: any[]) => {
      console.log(`[WorkflowDeduplicator] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.warn(`[WorkflowDeduplicator] ⚠️  ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      console.error(`[WorkflowDeduplicator] ❌ ${message}`, ...args);
    },
  };

  /**
   * Remove duplicate nodes from workflow
   * 
   * @param workflow - Workflow to deduplicate
   * @param dsl - Optional DSL metadata (used to identify DSL-added nodes)
   * @returns Deduplication result with cleaned workflow
   */
  deduplicate(
    workflow: Workflow,
    dsl?: WorkflowDSL,
    confidenceScore?: number
  ): DeduplicationResult {
    const startTime = Date.now();
    this.logger.log('Starting duplicate removal...');
    this.logger.log(`Input: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    try {
      // Step 1: Find main execution path
      const mainPathResult = this.findMainExecutionPath(workflow, dsl);
      this.logger.log(`Main execution path: ${mainPathResult.mainPath.length} nodes`);
      
      // Step 2: Identify duplicates with context
      const duplicates = this.identifyDuplicatesWithContext(
        workflow,
        mainPathResult.mainPath,
        dsl
      );
      this.logger.log(`Found ${duplicates.length} duplicate node type(s)`);
      
      if (duplicates.length === 0) {
        // No duplicates found - return workflow as-is
        return {
          workflow,
          removedNodes: [],
          rewiredEdges: 0,
          warnings: [],
          details: [],
          metrics: {
            duplicateGroups: 0,
            nodesRemoved: 0,
            edgesRewired: 0,
            processingTimeMs: Date.now() - startTime,
            mainPathPreserved: true,
          },
        };
      }
      
      // Step 3: Remove duplicates safely
      const removalResult = this.removeDuplicatesSafely(workflow, duplicates, confidenceScore);
      
      // Step 4: Validate result
      const validationResult = this.validateDeduplicationResult(
        removalResult.workflow,
        mainPathResult.mainPath,
        removalResult.removedNodes
      );
      
      if (!validationResult.valid) {
        this.logger.warn(`Validation warnings: ${validationResult.warnings.join(', ')}`);
      }
      
      const metrics: DeduplicationMetrics = {
        duplicateGroups: duplicates.length,
        nodesRemoved: removalResult.removedNodes.length,
        edgesRewired: removalResult.rewiredEdges,
        processingTimeMs: Date.now() - startTime,
        mainPathPreserved: validationResult.mainPathIntact,
      };
      
      this.logger.log(`✅ Deduplication complete: Removed ${metrics.nodesRemoved} node(s), rewired ${metrics.edgesRewired} edge(s)`);
      
      return {
        ...removalResult,
        details: duplicates.map(d => ({
          nodeType: d.nodeType,
          keptNode: d.keepNode.id,
          removedNodes: d.removeNodes.map(n => n.id),
          reason: d.reason,
          priority: d.priority,
        })),
        metrics,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Deduplication failed: ${errorMessage}`);
      
      // Return original workflow on error (fail-safe)
      return {
        workflow,
        removedNodes: [],
        rewiredEdges: 0,
        warnings: [`Deduplication failed: ${errorMessage}`],
        details: [],
        metrics: {
          duplicateGroups: 0,
          nodesRemoved: 0,
          edgesRewired: 0,
          processingTimeMs: Date.now() - startTime,
          mainPathPreserved: false,
        },
      };
    }
  }

  /**
   * Find main execution path from trigger to output
   * 
   * Uses topological sort to identify the critical path that must be preserved.
   * 
   * @param workflow - Workflow to analyze
   * @param dsl - Optional DSL metadata (preferred path if available)
   * @returns Main execution path information
   */
  private findMainExecutionPath(
    workflow: Workflow,
    dsl?: WorkflowDSL
  ): {
    mainPath: string[];
    criticalNodes: Set<string>;
  } {
    // Step 1: Find trigger node
    const triggerNode = workflow.nodes.find(n => {
      const type = unifiedNormalizeNodeType(n);
      return this.isTriggerNode(type);
    });
    
    if (!triggerNode) {
      throw new Error('No trigger node found in workflow');
    }
    
    // Step 2: If DSL exists, use DSL execution order as primary path
    if (dsl && dsl.executionOrder && dsl.executionOrder.length > 0) {
      const dslPath: string[] = [];
      
      // Map DSL step references to actual node IDs
      for (const step of dsl.executionOrder) {
        const node = workflow.nodes.find(n => {
          // Try multiple matching strategies
          return n.id.includes(step.stepRef) ||
                 (n.data as any)?.dslRef === step.stepRef ||
                 n.id === step.stepRef;
        });
        
        if (node) {
          dslPath.push(node.id);
        }
      }
      
      if (dslPath.length > 0) {
        this.logger.log(`Using DSL execution order as main path (${dslPath.length} nodes)`);
        return {
          mainPath: dslPath,
          criticalNodes: new Set(dslPath),
        };
      }
    }
    
    // Step 3: Fallback: Use topological sort to find main path
    try {
      const executionPlan = buildExecutionPlan(workflow.nodes, workflow.edges);
      const mainPath = executionPlan.executionOrder.map(n => n.id);
      
      this.logger.log(`Using topological sort as main path (${mainPath.length} nodes)`);
      return {
        mainPath,
        criticalNodes: new Set(mainPath),
      };
    } catch (error) {
      this.logger.warn(`Topological sort failed, using all reachable nodes from trigger`);
      
      // Last resort: Find all nodes reachable from trigger
      const reachableNodes = this.findAllReachableNodes(workflow, triggerNode.id);
      return {
        mainPath: [triggerNode.id, ...reachableNodes],
        criticalNodes: new Set([triggerNode.id, ...reachableNodes]),
      };
    }
  }

  /**
   * Identify duplicate nodes with execution context
   * 
   * Groups nodes by type and identifies which duplicates to keep/remove
   * based on priority rules.
   * 
   * @param workflow - Workflow to analyze
   * @param mainPath - Main execution path node IDs
   * @param dsl - Optional DSL metadata
   * @returns Array of duplicate groups with keep/remove decisions
   */
  private identifyDuplicatesWithContext(
    workflow: Workflow,
    mainPath: string[],
    dsl?: WorkflowDSL
  ): Array<{
    nodeType: string;
    duplicates: WorkflowNode[];
    keepNode: WorkflowNode;
    removeNodes: WorkflowNode[];
    reason: string;
    priority: number;
  }> {
    const nodeTypeMap = new Map<string, WorkflowNode[]>();
    
    // ✅ UNIVERSAL: Group nodes by type (works for ANY node type)
    workflow.nodes.forEach(node => {
      const type = unifiedNormalizeNodeType(node);
      if (!type) {
        this.logger.warn(`Node ${node.id} has no type, skipping`);
        return;
      }
      
      if (!nodeTypeMap.has(type)) {
        nodeTypeMap.set(type, []);
      }
      nodeTypeMap.get(type)!.push(node);
    });
    
    const duplicates: Array<{
      nodeType: string;
      duplicates: WorkflowNode[];
      keepNode: WorkflowNode;
      removeNodes: WorkflowNode[];
      reason: string;
      priority: number;
    }> = [];
    
    // ✅ UNIVERSAL: Find duplicates for ANY node type
    nodeTypeMap.forEach((nodes, type) => {
      if (nodes.length > 1) {
        // Multiple nodes of same type - need to deduplicate
        this.logger.log(`Found ${nodes.length} duplicate(s) of type: ${type}`);
        
        // Priority 1: Keep node in main execution path
        const inMainPath = nodes.filter(n => mainPath.includes(n.id));
        
        // Priority 2: Keep node added by DSL (if DSL metadata exists)
        const dslNodes = nodes.filter(n => {
          const config = (n.data?.config as any) || {};
          const isFromDSL = config._fromDSL === true;
          const isInDSLMetadata = dsl?.metadata?.autoInjectedNodes?.includes(type);
          return isFromDSL || isInDSLMetadata;
        });
        
        // Priority 3: Keep node with most connections (better integrated)
        const nodeConnections = nodes.map(n => ({
          node: n,
          connections: workflow.edges.filter(e => 
            e.source === n.id || e.target === n.id
          ).length,
        }));
        const sortedByConnections = nodeConnections.sort((a, b) => 
          b.connections - a.connections
        );
        const mostConnected = sortedByConnections[0];
        
        // Decision logic with priority
        let keepNode: WorkflowNode;
        let reason: string;
        let priority: number;
        
        if (inMainPath.length > 0) {
          // Priority 1: Keep the one in main path
          keepNode = inMainPath[0];
          reason = 'Node is in main execution path';
          priority = 1;
        } else if (dslNodes.length > 0) {
          // Priority 2: Keep DSL-added node
          keepNode = dslNodes[0];
          reason = 'Node was added by DSL layer (source of truth)';
          priority = 2;
        } else if (mostConnected.connections > 0) {
          // Priority 3: Keep most connected node
          keepNode = mostConnected.node;
          reason = `Node has most connections (${mostConnected.connections} connections)`;
          priority = 3;
        } else {
          // Priority 4: Keep first occurrence (fallback)
          keepNode = nodes[0];
          reason = 'First occurrence in workflow (fallback)';
          priority = 4;
        }
        
        const removeNodes = nodes.filter(n => n.id !== keepNode.id);
        
        this.logger.log(`  Keeping: ${keepNode.id} (${reason})`);
        this.logger.log(`  Removing: ${removeNodes.map(n => n.id).join(', ')}`);
        
        duplicates.push({
          nodeType: type,
          duplicates: nodes,
          keepNode,
          removeNodes,
          reason,
          priority,
        });
      }
    });
    
    return duplicates;
  }

  /**
   * Remove duplicate nodes and rewire edges safely
   * 
   * @param workflow - Workflow to modify
   * @param duplicates - Duplicate groups with keep/remove decisions
   * @returns Modified workflow with duplicates removed
   */
  private removeDuplicatesSafely(
    workflow: Workflow,
    duplicates: Array<{
      nodeType: string;
      keepNode: WorkflowNode;
      removeNodes: WorkflowNode[];
      reason: string;
    }>,
    confidenceScore?: number
  ): {
    workflow: Workflow;
    removedNodes: string[];
    rewiredEdges: number;
    warnings: string[];
  } {
    const removedNodeIds = new Set<string>();
    const warnings: string[] = [];
    let rewiredEdges = 0;
    
    // Collect all nodes to remove and track replacements
    duplicates.forEach(dup => {
      dup.removeNodes.forEach(node => {
        removedNodeIds.add(node.id);
        
        // ✅ TRACK REPLACEMENT
        const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
        const keptNodeType = unifiedNormalizeNodeTypeString(dup.keepNode.type || dup.keepNode.data?.type || '');
        const operation = typeof node.data?.config?.operation === 'string' ? node.data.config.operation : '';
        
        // Determine category from node type
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        let category: 'dataSource' | 'transformation' | 'output' = 'transformation';
        if (nodeDef?.category === 'data') {
          category = 'dataSource';
        } else if (nodeDef?.category === 'communication') {
          category = 'output';
        }
        
        // Check if node is protected (user-explicit)
        const isProtected = (node.data as any)?.origin?.source === 'user' || 
                           (node.data as any)?.protected === true;
        
        nodeReplacementTracker.trackReplacement({
          nodeId: node.id,
          nodeType,
          operation: operation || '',
          category,
          reason: dup.reason,
          stage: 'workflow_deduplicator.removeDuplicatesSafely',
            replacedBy: keptNodeType || '',
            wasRemoved: true,
            isProtected,
            confidence: confidenceScore,
            metadata: {
              keptNodeId: dup.keepNode.id,
              duplicateGroup: dup.nodeType,
            },
          });
      });
    });
    
    // Build map of removed node → kept node for rewiring
    const nodeReplacementMap = new Map<string, string>();
    duplicates.forEach(dup => {
      dup.removeNodes.forEach(removedNode => {
        nodeReplacementMap.set(removedNode.id, dup.keepNode.id);
      });
    });
    
    // Rewire edges: redirect edges FROM removed nodes TO kept nodes
    const newEdges: WorkflowEdge[] = [];
    const processedEdgeIds = new Set<string>();
    
    for (const edge of workflow.edges) {
      const sourceRemoved = removedNodeIds.has(edge.source);
      const targetRemoved = removedNodeIds.has(edge.target);
      
      if (sourceRemoved && targetRemoved) {
        // Both source and target are removed - skip edge
        continue;
      }
      
      if (sourceRemoved) {
        // Source is removed - rewire to kept node
        const keptNodeId = nodeReplacementMap.get(edge.source);
        if (keptNodeId) {
          const newEdge: WorkflowEdge = {
            ...edge,
            id: `${edge.id}_rewired_${Date.now()}`,
            source: keptNodeId,
          };
          newEdges.push(newEdge);
          rewiredEdges++;
        }
      } else if (targetRemoved) {
        // Target is removed - rewire to kept node
        const keptNodeId = nodeReplacementMap.get(edge.target);
        if (keptNodeId) {
          const newEdge: WorkflowEdge = {
            ...edge,
            id: `${edge.id}_rewired_${Date.now()}`,
            target: keptNodeId,
          };
          newEdges.push(newEdge);
          rewiredEdges++;
        }
      } else {
        // Neither removed - keep edge as-is
        newEdges.push(edge);
      }
    }
    
    // Remove duplicate nodes
    const newNodes = workflow.nodes.filter(n => !removedNodeIds.has(n.id));
    
    // Validate: Ensure no orphaned nodes
    const nodeIds = new Set(newNodes.map(n => n.id));
    const validEdges = newEdges.filter(e => 
      nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    
    // Check for orphaned nodes (nodes with no connections)
    const connectedNodeIds = new Set<string>();
    validEdges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    
    const orphanedNodes = newNodes.filter(n => {
      const type = unifiedNormalizeNodeType(n);
      return !connectedNodeIds.has(n.id) && !this.isTriggerNode(type);
    });
    
    if (orphanedNodes.length > 0) {
      warnings.push(
        `${orphanedNodes.length} node(s) became orphaned after duplicate removal: ${orphanedNodes.map(n => n.id).join(', ')}`
      );
    }
    
    // Remove duplicate edges (same source → target)
    const edgeKeySet = new Set<string>();
    const finalEdges: WorkflowEdge[] = [];
    
    for (const edge of validEdges) {
      const edgeKey = `${edge.source}→${edge.target}`;
      if (!edgeKeySet.has(edgeKey)) {
        edgeKeySet.add(edgeKey);
        finalEdges.push(edge);
      }
    }
    
    if (finalEdges.length < validEdges.length) {
      warnings.push(`Removed ${validEdges.length - finalEdges.length} duplicate edge(s)`);
    }
    
    return {
      workflow: {
        ...workflow,
        nodes: newNodes,
        edges: finalEdges,
        metadata: {
          ...workflow.metadata,
          deduplicated: true,
          deduplicatedAt: Date.now(),
        },
      },
      removedNodes: Array.from(removedNodeIds),
      rewiredEdges,
      warnings,
    };
  }

  /**
   * Validate deduplication result
   * 
   * @param workflow - Deduplicated workflow
   * @param originalMainPath - Original main path node IDs
   * @param removedNodes - IDs of removed nodes
   * @returns Validation result
   */
  private validateDeduplicationResult(
    workflow: Workflow,
    originalMainPath: string[],
    removedNodes: string[]
  ): {
    valid: boolean;
    mainPathIntact: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    
    // Check if main path nodes were removed
    const removedFromMainPath = originalMainPath.filter(id => removedNodes.includes(id));
    if (removedFromMainPath.length > 0) {
      warnings.push(`Warning: ${removedFromMainPath.length} node(s) from main path were removed: ${removedFromMainPath.join(', ')}`);
    }
    
    // Check if trigger still exists
    const hasTrigger = workflow.nodes.some(n => {
      const type = unifiedNormalizeNodeType(n);
      return this.isTriggerNode(type);
    });
    
    if (!hasTrigger) {
      warnings.push('ERROR: Trigger node was removed!');
      return {
        valid: false,
        mainPathIntact: false,
        warnings,
      };
    }
    
    // Check if workflow is still connected
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    const invalidEdges = workflow.edges.filter(e => 
      !nodeIds.has(e.source) || !nodeIds.has(e.target)
    );
    
    if (invalidEdges.length > 0) {
      warnings.push(`ERROR: ${invalidEdges.length} invalid edge(s) found`);
      return {
        valid: false,
        mainPathIntact: false,
        warnings,
      };
    }
    
    // Check if main path is still intact (at least trigger and some path exists)
    const remainingMainPathNodes = originalMainPath.filter(id => !removedNodes.includes(id));
    const mainPathIntact = remainingMainPathNodes.length > 0;
    
    if (!mainPathIntact) {
      warnings.push('Warning: Main execution path may be broken');
    }
    
    return {
      valid: warnings.length === 0 || warnings.every(w => !w.startsWith('ERROR')),
      mainPathIntact,
      warnings,
    };
  }

  /**
   * Check if node type is a trigger
   * 
   * @param nodeType - Normalized node type
   * @returns True if trigger node
   */
  private isTriggerNode(nodeType: string): boolean {
    return nodeType.includes('trigger') || 
           nodeType === 'manual_trigger' ||
           nodeType === 'schedule' ||
           nodeType === 'webhook' ||
           nodeType === 'form' ||
           nodeType === 'chat_trigger';
  }

  /**
   * Find all nodes reachable from a starting node (BFS)
   * 
   * @param workflow - Workflow to traverse
   * @param startNodeId - Starting node ID
   * @returns Array of reachable node IDs
   */
  private findAllReachableNodes(
    workflow: Workflow,
    startNodeId: string
  ): string[] {
    const reachable: string[] = [];
    const visited = new Set<string>([startNodeId]);
    const queue: string[] = [startNodeId];
    
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    workflow.edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    // BFS traversal
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const neighbors = outgoing.get(currentNodeId) || [];
      
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          reachable.push(neighborId);
          queue.push(neighborId);
        }
      }
    }
    
    return reachable;
  }
}

/**
 * Singleton instance for global use
 */
export const workflowDeduplicator = new WorkflowDeduplicator();
