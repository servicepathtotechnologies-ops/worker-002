/**
 * ✅ UNIFIED GRAPH ORCHESTRATOR
 * 
 * Main orchestrator that coordinates all graph operations.
 * 
 * Key Features:
 * 1. Single Entry Point: All graph modifications go through this orchestrator
 * 2. Atomic Operations: Ensures execution order and edges are always in sync
 * 3. Registry-Driven: Uses unifiedNodeRegistry for all decisions
 * 4. Automatic Validation: Validates graph after every operation
 * 
 * This is the SINGLE SOURCE OF TRUTH for all graph operations in the system.
 */

import { Workflow, WorkflowNode } from '../types/ai-types';
import { ExecutionOrder, executionOrderManager } from './execution-order-manager';
import { edgeReconciliationEngine } from './edge-reconciliation-engine';
import { nodeInjectionCoordinator, InjectionContext } from './node-injection-coordinator';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface UnifiedGraphOrchestrator {
  /**
   * Initialize workflow graph with execution order
   * Creates initial edges based on execution order
   * 
   * @param nodes - Workflow nodes
   * @param initialExecutionOrder - Optional pre-computed execution order
   * @param dslExecutionOrder - Optional DSL execution steps (TIER 1: Primary source of truth)
   */
  initializeWorkflow(
    nodes: WorkflowNode[],
    initialExecutionOrder?: ExecutionOrder,
    dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>
  ): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    removedNodeTypes: string[]; // ✅ NEW: Track removed node types
  };
  
  /**
   * Inject node with automatic orchestration
   * Delegates to NodeInjectionCoordinator
   */
  injectNode(
    workflow: Workflow,
    node: WorkflowNode,
    context: InjectionContext
  ): Promise<{
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
  }>;
  
  /**
   * Remove node with automatic orchestration
   * Updates execution order, reconciles edges
   */
  removeNode(
    workflow: Workflow,
    nodeId: string
  ): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
  };
  
  /**
   * Reconcile workflow (fix broken edges)
   * Uses current execution order to fix edges
   */
  reconcileWorkflow(workflow: Workflow): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
    removedNodeTypes: string[]; // ✅ NEW: Track removed node types
  };
  
  /**
   * Validate workflow structure
   * Checks execution order, edges, DAG rules
   */
  validateWorkflow(
    workflow: Workflow,
    existingExecutionOrder?: ExecutionOrder
  ): WorkflowValidationResult;
  
  /**
   * ✅ UNIVERSAL: Ensure always-terminal nodes are actually terminal
   * Queries registry for nodes with alwaysTerminal behavior
   * Removes outgoing edges from nodes that should be terminal
   */
  ensureTerminalNodes(workflow: Workflow): {
    workflow: Workflow;
    errors: string[];
    warnings: string[];
  };
}

class UnifiedGraphOrchestratorImpl implements UnifiedGraphOrchestrator {
  /**
   * Initialize workflow graph with execution order
   * ✅ TIER 1: Uses DSL execution order if available (primary source of truth)
   */
  initializeWorkflow(
    nodes: WorkflowNode[],
    initialExecutionOrder?: ExecutionOrder,
    dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>
  ): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    removedNodeTypes: string[]; // ✅ NEW: Track removed node types
  } {
    // Create initial workflow with nodes (no edges yet)
    const workflow: Workflow = {
      nodes,
      edges: [],
    };
    
    // ✅ TIER 1: Initialize execution order using 3-tier approach
    // Pass DSL execution order to execution order manager (primary source of truth)
    const executionOrder = initialExecutionOrder || executionOrderManager.initialize(workflow, dslExecutionOrder);
    
    // Create edges from execution order
    const reconciliationResult = edgeReconciliationEngine.reconcileEdges(
      workflow,
      executionOrder
    );
    
    return {
      workflow: reconciliationResult.workflow,
      executionOrder,
      removedNodeTypes: reconciliationResult.removedNodeTypes || [], // ✅ Return removed node types
    };
  }
  
  /**
   * Inject node with automatic orchestration
   */
  async injectNode(
    workflow: Workflow,
    node: WorkflowNode,
    context: InjectionContext
  ): Promise<{
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
  }> {
    const result = nodeInjectionCoordinator.injectNode(workflow, node, context);
    
    // Validate after injection using the SAME execution order that was used for orchestration
    const validation = this.validateWorkflow(result.workflow, result.executionOrder);
    
    return {
      workflow: result.workflow,
      executionOrder: result.executionOrder,
      errors: [...result.errors, ...validation.errors],
      warnings: [...result.warnings, ...validation.warnings],
    };
  }
  
  /**
   * Remove node with automatic orchestration
   */
  removeNode(
    workflow: Workflow,
    nodeId: string
  ): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if node exists
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      errors.push(`Node ${nodeId} not found in workflow`);
      return {
        workflow,
        executionOrder: executionOrderManager.initialize(workflow),
        errors,
        warnings,
      };
    }
    
    // Remove node from workflow
    const updatedWorkflow: Workflow = {
      ...workflow,
      nodes: workflow.nodes.filter(n => n.id !== nodeId),
      edges: workflow.edges.filter(
        e => e.source !== nodeId && e.target !== nodeId
      ),
    };
    
    // Update execution order based on current workflow and removal
    let executionOrder = executionOrderManager.initialize(workflow);
    executionOrder = executionOrderManager.removeNode(executionOrder, nodeId);
    
    // Reconcile edges
    const reconciliationResult = edgeReconciliationEngine.reconcileEdges(
      updatedWorkflow,
      executionOrder
    );
    
    if (reconciliationResult.errors.length > 0) {
      errors.push(...reconciliationResult.errors);
    }
    if (reconciliationResult.warnings.length > 0) {
      warnings.push(...reconciliationResult.warnings);
    }
    
    // Validate after removal using the SAME execution order
    const validation = this.validateWorkflow(reconciliationResult.workflow, executionOrder);
    
    return {
      workflow: reconciliationResult.workflow,
      executionOrder,
      errors: [...errors, ...validation.errors],
      warnings: [...warnings, ...validation.warnings],
    };
  }
  
  /**
   * Reconcile workflow (fix broken edges)
   */
  reconcileWorkflow(workflow: Workflow): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
    removedNodeTypes: string[]; // ✅ NEW: Track removed node types
  } {
    // Get current execution order
    const executionOrder = executionOrderManager.initialize(workflow);
    
    // Reconcile edges
    const reconciliationResult = edgeReconciliationEngine.reconcileEdges(
      workflow,
      executionOrder
    );
    
    return {
      workflow: reconciliationResult.workflow,
      executionOrder,
      errors: reconciliationResult.errors,
      warnings: reconciliationResult.warnings,
      removedNodeTypes: reconciliationResult.removedNodeTypes || [], // ✅ Return removed node types
    };
  }
  
  /**
   * Validate workflow structure
   */
  validateWorkflow(
    workflow: Workflow,
    existingExecutionOrder?: ExecutionOrder
  ): WorkflowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let currentWorkflow: Workflow = workflow;
    
    // Check if workflow has nodes
    if (!currentWorkflow.nodes || currentWorkflow.nodes.length === 0) {
      errors.push('Workflow has no nodes');
      return { valid: false, errors, warnings };
    }
    
    // Check if workflow has trigger
    const hasTrigger = currentWorkflow.nodes.some(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.category === 'trigger';
    });
    
    if (!hasTrigger) {
      errors.push('Workflow has no trigger node');
    }
    
    // Validate execution order
    // If an execution order is already known (from initializeWorkflow / injectNode / removeNode),
    // REUSE it to avoid recomputing a different order from edges.
    // If not provided, reconcile workflow first to obtain a canonical order and edge set.
    let executionOrder: ExecutionOrder;
    if (existingExecutionOrder) {
      executionOrder = existingExecutionOrder;
    } else {
      const reconciliation = this.reconcileWorkflow(currentWorkflow);
      currentWorkflow = reconciliation.workflow;
      executionOrder = reconciliation.executionOrder;
      if (reconciliation.errors.length > 0) {
        warnings.push(
          `Reconciliation reported ${reconciliation.errors.length} issue(s): ${reconciliation.errors.join(
            ', '
          )}`
        );
      }
      if (reconciliation.warnings.length > 0) {
        warnings.push(...reconciliation.warnings);
      }
    }
    
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(executionOrder);
    
    // Check if all nodes are in execution order
    const nodesNotInOrder = currentWorkflow.nodes.filter(
      n => !orderedNodeIds.includes(n.id)
    );
    
    if (nodesNotInOrder.length > 0) {
      warnings.push(
        `${nodesNotInOrder.length} node(s) not in execution order: ${nodesNotInOrder.map(n => n.id).join(', ')}`
      );
    }
    
    // Validate edges against execution order
    const edgeValidation = edgeReconciliationEngine.validateEdges(currentWorkflow, executionOrder);
    
    if (edgeValidation.violations.length > 0) {
      errors.push(...edgeValidation.violations);
    }
    
    // Check for orphaned nodes (nodes with no incoming edges except trigger)
    const nodeIds = new Set(currentWorkflow.nodes.map(n => n.id));
    const connectedNodeIds = new Set(currentWorkflow.edges.map(e => e.target));
    
    const orphanedNodes = currentWorkflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const isTrigger = nodeDef?.category === 'trigger';
      
      return !isTrigger && !connectedNodeIds.has(n.id);
    });
    
    if (orphanedNodes.length > 0) {
      // ✅ AUTO-REMOVAL LOGIC: Separate required vs non-required orphaned nodes
      const requiredOrphanedNodes: WorkflowNode[] = [];
      const nonRequiredOrphanedNodes: WorkflowNode[] = [];
      
      orphanedNodes.forEach(n => {
        const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        const isRequired = 
          nodeDef?.workflowBehavior?.alwaysRequired === true ||
          nodeDef?.workflowBehavior?.exemptFromRemoval === true;
        
        if (isRequired) {
          requiredOrphanedNodes.push(n);
        } else {
          nonRequiredOrphanedNodes.push(n);
        }
      });
      
      // Required orphaned nodes = real error (edge creation failed)
      if (requiredOrphanedNodes.length > 0) {
        errors.push(
          `Found ${requiredOrphanedNodes.length} required orphaned node(s) (edge creation may have failed): ${requiredOrphanedNodes.map(n => `${n.type || 'unknown'} (${n.id})`).join(', ')}`
        );
      }
      
      // Non-required orphaned nodes = warning (should be auto-removed by reconciliation)
      if (nonRequiredOrphanedNodes.length > 0) {
        warnings.push(
          `Found ${nonRequiredOrphanedNodes.length} non-required orphaned node(s) (should be auto-removed): ${nonRequiredOrphanedNodes.map(n => `${n.type || 'unknown'} (${n.id})`).join(', ')}`
        );
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * ✅ UNIVERSAL: Ensure always-terminal nodes are actually terminal
   * Queries registry for nodes with alwaysTerminal behavior
   * Removes outgoing edges from nodes that should be terminal
   */
  ensureTerminalNodes(workflow: Workflow): {
    workflow: Workflow;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // ✅ UNIVERSAL: Query registry for always-terminal nodes
    const alwaysTerminalNodes = unifiedNodeRegistry.getAlwaysTerminalNodes();
    const alwaysTerminalTypes = new Set(alwaysTerminalNodes.map(n => n.type));
    
    // Find nodes in workflow that should be terminal
    const terminalNodesInWorkflow = workflow.nodes.filter(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      return alwaysTerminalTypes.has(nodeType);
    });
    
    // Ensure they have no outgoing edges
    let updatedWorkflow = workflow;
    for (const node of terminalNodesInWorkflow) {
      const outgoingEdges = updatedWorkflow.edges.filter(e => e.source === node.id);
      if (outgoingEdges.length > 0) {
        // Registry says this node must be terminal, but it has outgoing edges
        warnings.push(
          `Node ${node.id} (${unifiedNormalizeNodeTypeString(node.type || node.data?.type || '')}) should be terminal but has ${outgoingEdges.length} outgoing edge(s)`
        );
        
        // Remove outgoing edges (registry-driven enforcement)
        updatedWorkflow = {
          ...updatedWorkflow,
          edges: updatedWorkflow.edges.filter(e => e.source !== node.id),
        };
        console.log(
          `[UnifiedGraphOrchestrator] ✅ Removed ${outgoingEdges.length} outgoing edge(s) from terminal node ${node.id}`
        );
      }
    }
    
    return { workflow: updatedWorkflow, errors, warnings };
  }
}

// Export singleton instance
export const unifiedGraphOrchestrator: UnifiedGraphOrchestrator = new UnifiedGraphOrchestratorImpl();
