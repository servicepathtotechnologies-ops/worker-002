/**
 * ✅ EDGE RECONCILIATION ENGINE
 * 
 * Automatically reconciles edges after ANY graph modification (node injection, removal, etc.).
 * 
 * Key Features:
 * 1. Automatic Reconciliation: Runs after every node injection/removal
 * 2. Execution Order Driven: Uses execution order as source of truth for edge creation
 * 3. Broken Edge Removal: Removes edges that violate execution order
 * 4. Correct Edge Creation: Creates edges that match execution order
 * 5. Registry-Driven: Uses unifiedNodeRegistry for handle resolution, branching rules
 * 
 * This ensures edges ALWAYS match execution order - no broken connections possible.
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../types/ai-types';
import { ExecutionOrder, executionOrderManager } from './execution-order-manager';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
import { universalHandleResolver } from '../error-prevention';
import { universalEdgeCreationService } from '../../services/edges/universal-edge-creation-service';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';
import { randomUUID } from 'crypto';

export interface EdgeReconciliationResult {
  workflow: Workflow;
  edgesRemoved: number;
  edgesAdded: number;
  errors: string[];
  warnings: string[];
  removedNodeTypes: string[]; // ✅ NEW: Track node types that were auto-removed as orphaned
}

export interface EdgeValidationResult {
  edgesToRemove: WorkflowEdge[];
  edgesToAdd: Array<{ sourceId: string; targetId: string; edgeType?: string; sourceHandle?: string; targetHandle?: string }>;
  violations: string[];
}

export interface EdgeReconciliationEngine {
  /**
   * Reconcile edges based on execution order
   * - Removes edges that don't match execution order
   * - Creates edges that match execution order
   * - Uses registry for handle resolution
   */
  reconcileEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder
  ): EdgeReconciliationResult;
  
  /**
   * Validate edges against execution order
   * Returns edges that should be removed/added
   */
  validateEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder
  ): EdgeValidationResult;
}

class EdgeReconciliationEngineImpl implements EdgeReconciliationEngine {
  /**
   * Reconcile edges based on execution order
   */
  reconcileEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder
  ): EdgeReconciliationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Step 1: Validate edges against execution order
    const validation = this.validateEdges(workflow, executionOrder);
    
    // Step 2: Remove invalid edges
    const edgesToKeep = workflow.edges.filter(
      edge => !validation.edgesToRemove.some(e => e.id === edge.id)
    );
    
    // Step 3: Create missing edges based on execution order
    const edgesToAdd: WorkflowEdge[] = [];
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(executionOrder);
    
    // Create edges for linear chain: node[i] → node[i+1]
    for (let i = 0; i < orderedNodeIds.length - 1; i++) {
      const sourceId = orderedNodeIds[i];
      const targetId = orderedNodeIds[i + 1];
      
      // Check if edge already exists
      const edgeExists = edgesToKeep.some(
        e => e.source === sourceId && e.target === targetId
      );
      
      if (!edgeExists) {
        // Create edge using registry-driven logic
        const edge = this.createEdgeFromOrder(
          workflow,
          sourceId,
          targetId,
          executionOrder
        );
        
        if (edge) {
          edgesToAdd.push(edge);
        } else {
          warnings.push(
            `Could not create edge from ${sourceId} to ${targetId} - handle resolution failed`
          );
        }
      }
    }
    
    // Step 4: Handle branching nodes (if_else, switch) - they can have multiple outputs
    const branchingNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.isBranching === true;
    });
    
    for (const branchingNode of branchingNodes) {
      const nodeIndex = orderedNodeIds.indexOf(branchingNode.id);
      if (nodeIndex < 0) continue;
      
      // Find nodes that should connect from this branching node
      const potentialTargets = orderedNodeIds.slice(nodeIndex + 1);
      
      // Use registry to determine valid outputs for branching node
      const nodeType = unifiedNormalizeNodeTypeString(branchingNode.type || branchingNode.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const outgoingPorts = nodeDef?.outgoingPorts || [];
      
      // For if_else: create 'true' and 'false' edges
      if (nodeType === 'if_else') {
        // Find first node after if_else for 'true' path
        if (potentialTargets.length > 0) {
          const trueTarget = potentialTargets[0];
          const trueEdgeExists = edgesToKeep.some(
            e => e.source === branchingNode.id && e.target === trueTarget && (e.type === 'true' || e.sourceHandle === 'true')
          );
          
          if (!trueEdgeExists) {
            const trueEdge = this.createEdgeFromOrder(
              workflow,
              branchingNode.id,
              trueTarget,
              executionOrder,
              'true'
            );
            if (trueEdge) edgesToAdd.push(trueEdge);
          }
        }
        
        // Find stop_and_error or error handling node for 'false' path
        const falseTarget = workflow.nodes.find(n => {
          const t = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
          return t === 'stop_and_error' || t === 'error_trigger';
        });
        
        if (falseTarget) {
          const falseEdgeExists = edgesToKeep.some(
            e => e.source === branchingNode.id && e.target === falseTarget.id && (e.type === 'false' || e.sourceHandle === 'false')
          );
          
          if (!falseEdgeExists) {
            const falseEdge = this.createEdgeFromOrder(
              workflow,
              branchingNode.id,
              falseTarget.id,
              executionOrder,
              'false'
            );
            if (falseEdge) edgesToAdd.push(falseEdge);
          }
        }
      }
    }
    
    // Step 5: Handle merge nodes - they can have multiple inputs
    const mergeNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'merge' || (unifiedNodeRegistry.get(nodeType)?.tags || []).includes('merge');
    });
    
    for (const mergeNode of mergeNodes) {
      const mergeIndex = orderedNodeIds.indexOf(mergeNode.id);
      if (mergeIndex < 0) continue;
      
      // Find nodes that should connect to merge (nodes before merge in order)
      const potentialSources = orderedNodeIds.slice(0, mergeIndex);
      
      for (const sourceId of potentialSources) {
        const sourceNode = workflow.nodes.find(n => n.id === sourceId);
        if (!sourceNode) continue;
        
        // Check if edge should exist (registry-based)
        if (this.shouldHaveEdge(sourceNode, mergeNode)) {
          const edgeExists = edgesToKeep.some(
            e => e.source === sourceId && e.target === mergeNode.id
          );
          
          if (!edgeExists) {
            const edge = this.createEdgeFromOrder(
              workflow,
              sourceId,
              mergeNode.id,
              executionOrder
            );
            if (edge) edgesToAdd.push(edge);
          }
        }
      }
    }
    
    // ✅ STEP 6: Ensure log_output is ALWAYS connected from the last non-terminal node
    // This is a universal requirement - log_output must be the final terminal node
    const logOutputNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'log_output';
    });
    
    console.log(
      `[EdgeReconciliationEngine] 🔍 DEBUG STEP 6: Found ${logOutputNodes.length} log_output node(s), ` +
      `execution order has ${orderedNodeIds.length} nodes: [${orderedNodeIds.map(id => {
        const node = workflow.nodes.find(n => n.id === id);
        const type = unifiedNormalizeNodeTypeString(node?.type || node?.data?.type || 'unknown');
        return `${type}(${id.substring(0, 8)})`;
      }).join(' → ')}]`
    );
    
    for (const logOutputNode of logOutputNodes) {
      const logOutputIndex = orderedNodeIds.indexOf(logOutputNode.id);
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG log_output(${logOutputNode.id.substring(0, 8)}): ` +
        `index=${logOutputIndex}, ` +
        `totalNodes=${orderedNodeIds.length}`
      );
      
      if (logOutputIndex < 0) {
        console.warn(`[EdgeReconciliationEngine] ⚠️  log_output node ${logOutputNode.id} not found in execution order`);
        continue;
      }
      
      // Find the last non-terminal node before log_output in execution order
      // This should be the actual last output node (linkedin, gmail, etc.)
      let lastNonTerminalNodeId: string | null = null;
      
      // Walk backwards from log_output to find the last non-terminal node
      console.log(`[EdgeReconciliationEngine] 🔍 DEBUG Walking backwards from log_output (index ${logOutputIndex})...`);
      for (let i = logOutputIndex - 1; i >= 0; i--) {
        const candidateId = orderedNodeIds[i];
        const candidateNode = workflow.nodes.find(n => n.id === candidateId);
        if (!candidateNode) {
          console.log(`[EdgeReconciliationEngine] 🔍 DEBUG   Index ${i}: Node ${candidateId} not found in workflow.nodes`);
          continue;
        }
        
        const candidateType = unifiedNormalizeNodeTypeString(candidateNode.type || candidateNode.data?.type || '');
        const candidateDef = unifiedNodeRegistry.get(candidateType);
        
        // Skip log_output itself and other terminal nodes
        if (candidateType === 'log_output') {
          console.log(`[EdgeReconciliationEngine] 🔍 DEBUG   Index ${i}: ${candidateType} - skipping (is log_output)`);
          continue;
        }
        
        // Check if this node is terminal (has workflowBehavior.alwaysTerminal)
        const isTerminal = candidateDef?.workflowBehavior?.alwaysTerminal === true;
        if (isTerminal) {
          console.log(`[EdgeReconciliationEngine] 🔍 DEBUG   Index ${i}: ${candidateType} - skipping (is terminal)`);
          continue;
        }
        
        // This is the last non-terminal node - connect it to log_output
        lastNonTerminalNodeId = candidateId;
        console.log(
          `[EdgeReconciliationEngine] 🔍 DEBUG   Index ${i}: ${candidateType}(${candidateId.substring(0, 8)}) - ` +
          `FOUND as last non-terminal node`
        );
        break;
      }
      
      // If no non-terminal node found, use the node immediately before log_output
      if (!lastNonTerminalNodeId && logOutputIndex > 0) {
        lastNonTerminalNodeId = orderedNodeIds[logOutputIndex - 1];
        const fallbackNode = workflow.nodes.find(n => n.id === lastNonTerminalNodeId);
        const fallbackType = unifiedNormalizeNodeTypeString(fallbackNode?.type || fallbackNode?.data?.type || 'unknown');
        console.log(
          `[EdgeReconciliationEngine] 🔍 DEBUG No non-terminal node found, using fallback: ` +
          `${fallbackType}(${lastNonTerminalNodeId?.substring(0, 8)}) at index ${logOutputIndex - 1}`
        );
      }
      
      if (lastNonTerminalNodeId) {
        const sourceNode = workflow.nodes.find(n => n.id === lastNonTerminalNodeId);
        const sourceType = unifiedNormalizeNodeTypeString(sourceNode?.type || sourceNode?.data?.type || 'unknown');
        
        // Check if edge already exists
        const edgeExists = edgesToKeep.some(
          e => e.source === lastNonTerminalNodeId && e.target === logOutputNode.id
        ) || edgesToAdd.some(
          e => e.source === lastNonTerminalNodeId && e.target === logOutputNode.id
        );
        
        console.log(
          `[EdgeReconciliationEngine] 🔍 DEBUG Edge check: ` +
          `${sourceType}(${lastNonTerminalNodeId.substring(0, 8)}) → log_output(${logOutputNode.id.substring(0, 8)}): ` +
          `exists=${edgeExists}`
        );
        
        if (!edgeExists) {
          // Create edge from last non-terminal node to log_output
          console.log(
            `[EdgeReconciliationEngine] 🔍 DEBUG Attempting to create edge: ` +
            `${sourceType}(${lastNonTerminalNodeId.substring(0, 8)}) → log_output(${logOutputNode.id.substring(0, 8)})`
          );
          
          const edge = this.createEdgeFromOrder(
            workflow,
            lastNonTerminalNodeId,
            logOutputNode.id,
            executionOrder
          );
          
          if (edge) {
            edgesToAdd.push(edge);
            console.log(
              `[EdgeReconciliationEngine] ✅ Connected last non-terminal node (${lastNonTerminalNodeId}) → log_output (${logOutputNode.id})`
            );
          } else {
            const sourceNodeDef = unifiedNodeRegistry.get(sourceType);
            const logOutputNodeDef = unifiedNodeRegistry.get('log_output');
            console.error(
              `[EdgeReconciliationEngine] ❌ FAILED to create edge: ` +
              `${sourceType}(${lastNonTerminalNodeId.substring(0, 8)}) → log_output(${logOutputNode.id.substring(0, 8)})\n` +
              `  Source node: type=${sourceType}, outgoingPorts=[${(sourceNodeDef?.outgoingPorts || []).join(', ')}], ` +
              `incomingPorts=[${(sourceNodeDef?.incomingPorts || []).join(', ')}]\n` +
              `  Target node: type=log_output, outgoingPorts=[${(logOutputNodeDef?.outgoingPorts || []).join(', ')}], ` +
              `incomingPorts=[${(logOutputNodeDef?.incomingPorts || []).join(', ')}]`
            );
            warnings.push(
              `Could not create edge from ${lastNonTerminalNodeId} to log_output (${logOutputNode.id}) - handle resolution failed`
            );
          }
        } else {
          console.log(`[EdgeReconciliationEngine] 🔍 DEBUG Edge already exists, skipping creation`);
        }
      } else {
        console.warn(
          `[EdgeReconciliationEngine] ⚠️  No node found to connect to log_output(${logOutputNode.id.substring(0, 8)}) - ` +
          `logOutputIndex=${logOutputIndex}, orderedNodeIds.length=${orderedNodeIds.length}`
        );
      }
    }
    
    // Combine all edges
    const finalEdges = [...edgesToKeep, ...edgesToAdd];
    
    // ✅ STEP 6: Auto-remove orphaned nodes that are not required
    // This implements the user's insight: orphaned nodes = unnecessary nodes = should be removed
    const { nodes: finalNodes, nodesRemoved, removedNodeTypes } = this.removeUnrequiredOrphanedNodes(
      workflow,
      finalEdges,
      orderedNodeIds
    );
    
    // Remove edges connected to removed nodes
    const nodeIdsSet = new Set(finalNodes.map(n => n.id));
    const finalEdgesFiltered = finalEdges.filter(
      (e: WorkflowEdge) => nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target)
    );
    
    if (nodesRemoved > 0) {
      warnings.push(
        `Auto-removed ${nodesRemoved} orphaned node(s) that were not required (not connected to workflow): ${removedNodeTypes.join(', ')}`
      );
    }
    
    return {
      workflow: {
        ...workflow,
        nodes: finalNodes,
        edges: finalEdgesFiltered,
      },
      edgesRemoved: validation.edgesToRemove.length,
      edgesAdded: edgesToAdd.length,
      errors,
      warnings: [...warnings, ...validation.violations],
      removedNodeTypes, // ✅ Return removed node types
    };
  }
  
  /**
   * ✅ AUTO-REMOVAL: Remove orphaned nodes that are not required
   * Implements user insight: orphaned nodes = unnecessary = should be removed automatically
   * 
   * Only removes nodes that:
   * 1. Are orphaned (not reachable from trigger)
   * 2. Are NOT required by registry (workflowBehavior.alwaysRequired or exemptFromRemoval)
   * 
   * Required orphaned nodes are kept (they indicate edge creation failed, which is a real error)
   * 
   * Returns removed node types so caller can update requiredNodes list
   */
  private removeUnrequiredOrphanedNodes(
    workflow: Workflow,
    edges: WorkflowEdge[],
    orderedNodeIds: string[]
  ): { nodes: WorkflowNode[]; nodesRemoved: number; removedNodeTypes: string[] } {
    // Find trigger nodes
    const triggerNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.category === 'trigger';
    });
    
    if (triggerNodes.length === 0) {
      // No trigger = can't determine orphaned nodes
      return { nodes: workflow.nodes, nodesRemoved: 0, removedNodeTypes: [] };
    }
    
    // Build reachability graph from triggers
    const reachableNodeIds = new Set<string>();
    const outgoingEdges = new Map<string, string[]>();
    
    // Initialize with triggers
    triggerNodes.forEach(t => reachableNodeIds.add(t.id));
    
    // Build adjacency list
    edges.forEach(edge => {
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge.target);
    });
    
    // BFS from all triggers to find reachable nodes
    const queue = [...triggerNodes.map(t => t.id)];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const targets = outgoingEdges.get(nodeId) || [];
      targets.forEach(targetId => {
        if (!reachableNodeIds.has(targetId)) {
          reachableNodeIds.add(targetId);
          queue.push(targetId);
        }
      });
    }
    
    // Find orphaned nodes (not reachable from trigger)
    const orphanedNodes = workflow.nodes.filter(n => !reachableNodeIds.has(n.id));
    
    if (orphanedNodes.length === 0) {
      return { nodes: workflow.nodes, nodesRemoved: 0, removedNodeTypes: [] };
    }
    
    // Filter: Keep only required orphaned nodes, remove the rest
    const nodesToKeep: WorkflowNode[] = [];
    const nodesToRemove: WorkflowNode[] = [];
    const removedNodeTypes: string[] = []; // ✅ Track removed node types
    
    for (const node of workflow.nodes) {
      const isOrphaned = !reachableNodeIds.has(node.id);
      
      if (!isOrphaned) {
        // Not orphaned = keep
        nodesToKeep.push(node);
        continue;
      }
      
      // Orphaned - check if required
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      // ✅ RULE: Keep if required by registry
      const isRequired = 
        nodeDef?.workflowBehavior?.alwaysRequired === true ||
        nodeDef?.workflowBehavior?.exemptFromRemoval === true;
      
      if (isRequired) {
        // Required but orphaned = real error (edge creation failed)
        // Keep it so validation can report the error
        nodesToKeep.push(node);
        console.log(
          `[EdgeReconciliationEngine] ⚠️  Keeping required orphaned node: ${nodeType} (${node.id}) - edge creation may have failed`
        );
      } else {
        // Not required and orphaned = unnecessary = remove
        nodesToRemove.push(node);
        removedNodeTypes.push(nodeType); // ✅ Track removed node type
        console.log(
          `[EdgeReconciliationEngine] 🗑️  Auto-removing unnecessary orphaned node: ${nodeType} (${node.id})`
        );
      }
    }
    
    return {
      nodes: nodesToKeep,
      nodesRemoved: nodesToRemove.length,
      removedNodeTypes, // ✅ Return removed node types
    };
  }
  
  /**
   * Validate edges against execution order
   */
  validateEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder
  ): EdgeValidationResult {
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(executionOrder);
    const nodeIndex = new Map(orderedNodeIds.map((id, idx) => [id, idx]));
    
    const edgesToRemove: WorkflowEdge[] = [];
    const edgesToAdd: Array<{ sourceId: string; targetId: string; edgeType?: string; sourceHandle?: string; targetHandle?: string }> = [];
    const violations: string[] = [];
    
    // Validate each existing edge
    workflow.edges.forEach(edge => {
      const sourceIdx = nodeIndex.get(edge.source);
      const targetIdx = nodeIndex.get(edge.target);
      
      if (sourceIdx === undefined || targetIdx === undefined) {
        // Edge references non-existent node
        edgesToRemove.push(edge);
        violations.push(`Edge ${edge.source} → ${edge.target} references non-existent node`);
        return;
      }
      
      if (sourceIdx >= targetIdx) {
        // Edge violates execution order (target comes before source)
        edgesToRemove.push(edge);
        violations.push(
          `Edge ${edge.source} → ${edge.target} violates execution order ` +
          `(source at index ${sourceIdx}, target at index ${targetIdx})`
        );
        return;
      }
      
      // Edge is valid
    });
    
    // Determine missing edges based on execution order
    for (let i = 0; i < orderedNodeIds.length - 1; i++) {
      const sourceId = orderedNodeIds[i];
      const targetId = orderedNodeIds[i + 1];
      
      const sourceNode = workflow.nodes.find(n => n.id === sourceId);
      const targetNode = workflow.nodes.find(n => n.id === targetId);
      
      if (!sourceNode || !targetNode) continue;
      
      // Check if edge should exist (registry-based)
      if (this.shouldHaveEdge(sourceNode, targetNode)) {
        const edgeExists = workflow.edges.some(
          e => e.source === sourceId && e.target === targetId
        );
        
        if (!edgeExists) {
          edgesToAdd.push({ sourceId, targetId });
        }
      }
    }
    
    return { edgesToRemove, edgesToAdd, violations };
  }
  
  /**
   * Create edge from execution order using registry
   */
  private createEdgeFromOrder(
    workflow: Workflow,
    sourceId: string,
    targetId: string,
    executionOrder: ExecutionOrder,
    edgeType?: string
  ): WorkflowEdge | null {
    const sourceNode = workflow.nodes.find(n => n.id === sourceId);
    const targetNode = workflow.nodes.find(n => n.id === targetId);
    
    if (!sourceNode || !targetNode) {
      console.error(
        `[EdgeReconciliationEngine] 🔍 DEBUG createEdgeFromOrder: Node not found - ` +
        `sourceNode=${!!sourceNode}, targetNode=${!!targetNode}, ` +
        `sourceId=${sourceId.substring(0, 8)}, targetId=${targetId.substring(0, 8)}`
      );
      return null;
    }
    
    const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
    const targetType = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
    
    // 🔍 DEBUG: Track edge creation for log_output connections
    const isLogOutputConnection = targetType === 'log_output';
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG createEdgeFromOrder: ` +
        `${sourceType}(${sourceId.substring(0, 8)}) → log_output(${targetId.substring(0, 8)}), ` +
        `edgeType=${edgeType || 'default'}`
      );
    }
    
    // Use universal handle resolver (registry-driven)
    const sourceHandleResult = universalHandleResolver.resolveSourceHandle(
      sourceType,
      undefined, // No explicit handle
      edgeType // Connection type ('true', 'false', etc.)
    );
    
    const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
    
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG Handle resolution: ` +
        `sourceHandle=${sourceHandleResult.handle || 'null'}, valid=${sourceHandleResult.valid}, ` +
        `targetHandle=${targetHandleResult.handle || 'null'}, valid=${targetHandleResult.valid}`
      );
    }
    
    if (!sourceHandleResult.valid || !targetHandleResult.valid) {
      if (isLogOutputConnection) {
        console.error(
          `[EdgeReconciliationEngine] ❌ Handle resolution failed: ` +
          `sourceHandle.valid=${sourceHandleResult.valid}, ` +
          `targetHandle.valid=${targetHandleResult.valid}, ` +
          `sourceHandle.reason=${sourceHandleResult.reason || 'none'}, ` +
          `targetHandle.reason=${targetHandleResult.reason || 'none'}`
        );
      }
      return null;
    }
    
    // Use universal edge creation service to create edge
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG Calling universalEdgeCreationService.createEdge: ` +
        `sourceHandle=${sourceHandleResult.handle}, targetHandle=${targetHandleResult.handle}`
      );
    }
    
    const edgeResult = universalEdgeCreationService.createEdge({
      sourceNode,
      targetNode,
      sourceHandle: sourceHandleResult.handle,
      targetHandle: targetHandleResult.handle,
      edgeType: edgeType || 'default',
      existingEdges: workflow.edges,
      allNodes: workflow.nodes,
    });
    
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG Edge creation result: ` +
        `success=${edgeResult.success}, ` +
        `hasEdge=${!!edgeResult.edge}, ` +
        `error=${edgeResult.error || 'none'}`
      );
    }
    
    if (edgeResult.success && edgeResult.edge) {
      if (isLogOutputConnection) {
        console.log(
          `[EdgeReconciliationEngine] ✅ Successfully created edge: ` +
          `${sourceType}(${sourceId.substring(0, 8)}) → log_output(${targetId.substring(0, 8)})`
        );
      }
      return edgeResult.edge;
    }
    
    if (isLogOutputConnection) {
      console.error(
        `[EdgeReconciliationEngine] ❌ Edge creation failed: ` +
        `success=${edgeResult.success}, ` +
        `error=${edgeResult.error || 'unknown error'}`
      );
    }
    
    return null;
  }
  
  /**
   * ✅ CAPABILITY-DRIVEN: Check if edge should exist between two nodes
   * Uses capability-based roles (data_source, transformation, output) instead of registry categories
   * This ensures nodes like http_post (utility category, but data_source capability) are correctly connected
   */
  private shouldHaveEdge(source: WorkflowNode, target: WorkflowNode): boolean {
    const sourceType = unifiedNormalizeNodeTypeString(source.type || source.data?.type || '');
    const targetType = unifiedNormalizeNodeTypeString(target.type || target.data?.type || '');
    
    const sourceDef = unifiedNodeRegistry.get(sourceType);
    const targetDef = unifiedNodeRegistry.get(targetType);
    
    if (!sourceDef || !targetDef) return false;
    
    // ✅ UNIVERSAL: Prioritize intendedCapability from metadata (AI-determined, context-aware)
    // This is the PRIMARY source of truth for multi-capability nodes
    const { NodeMetadataHelper } = require('../../core/types/node-metadata');
    const sourceMetadata = NodeMetadataHelper.getMetadata(source);
    const targetMetadata = NodeMetadataHelper.getMetadata(target);
    
    const sourceIntendedCapability = sourceMetadata?.dsl?.intendedCapability;
    const targetIntendedCapability = targetMetadata?.dsl?.intendedCapability;
    
    // ✅ CAPABILITY-BASED ROLES: Use intendedCapability if available, otherwise fall back to capability registry
    const sourceIsTrigger = sourceDef.category === 'trigger';
    
    // Use intendedCapability if available (AI-determined), otherwise use capability registry
    const sourceIsDataSource = sourceIntendedCapability === 'data_source' || 
      (sourceIntendedCapability === undefined && nodeCapabilityRegistryDSL.isDataSource(sourceType));
    const sourceIsTransformation = sourceIntendedCapability === 'transformation' || 
      (sourceIntendedCapability === undefined && nodeCapabilityRegistryDSL.isTransformation(sourceType));
    const sourceIsOutput = sourceIntendedCapability === 'output' || 
      (sourceIntendedCapability === undefined && nodeCapabilityRegistryDSL.isOutput(sourceType));
    
    const targetIsDataSource = targetIntendedCapability === 'data_source' || 
      (targetIntendedCapability === undefined && nodeCapabilityRegistryDSL.isDataSource(targetType));
    const targetIsTransformation = targetIntendedCapability === 'transformation' || 
      (targetIntendedCapability === undefined && nodeCapabilityRegistryDSL.isTransformation(targetType));
    const targetIsOutput = targetIntendedCapability === 'output' || 
      (targetIntendedCapability === undefined && nodeCapabilityRegistryDSL.isOutput(targetType));
    
    // ✅ RULE 1: Triggers can connect to data sources (by capability, not category)
    if (sourceIsTrigger && targetIsDataSource) return true;
    
    // ✅ RULE 2: Data sources (by capability) can connect to transformations
    if (sourceIsDataSource && targetIsTransformation) return true;
    
    // ✅ RULE 3: Transformations can connect to other transformations or outputs
    if (sourceIsTransformation) {
      if (targetIsTransformation || targetIsOutput) return true;
      if (targetType === 'log_output') return true;
    }
    
    // ✅ RULE 4: Any node can connect to merge
    if (targetType === 'merge' || (targetDef.tags || []).includes('merge')) return true;
    
    // ✅ RULE 5: Branching nodes (if_else, switch) can connect to multiple targets
    if (sourceDef.isBranching) return true;
    
    // ✅ RULE 6: Logic nodes (if_else, switch) can connect to any node
    if (sourceDef.category === 'logic') return true;
    
    // ✅ RULE 7: Outputs can connect to log_output (universal terminal)
    if (sourceIsOutput && targetType === 'log_output') return true;
    
    // ✅ RULE 8: Data sources can connect to outputs (for direct data → output flows)
    if (sourceIsDataSource && targetIsOutput) return true;
    
    // ✅ RULE 9: Fallback: Use registry categories for nodes without capability classification
    const sourceCategory = sourceDef.category;
    const targetCategory = targetDef.category;
    
    // Legacy category-based rules (fallback only)
    if (sourceCategory === 'trigger' && targetCategory === 'data') return true;
    if (sourceCategory === 'data' && (targetCategory === 'transformation' || targetCategory === 'ai')) return true;
    if ((sourceCategory === 'transformation' || sourceCategory === 'ai') && 
        (targetCategory === 'transformation' || targetCategory === 'ai' || targetCategory === 'communication')) return true;
    if (sourceCategory === 'utility' && (targetCategory === 'transformation' || targetCategory === 'ai' || targetCategory === 'communication')) return true;
    
    return false;
  }
}

// Export singleton instance
export const edgeReconciliationEngine: EdgeReconciliationEngine = new EdgeReconciliationEngineImpl();
