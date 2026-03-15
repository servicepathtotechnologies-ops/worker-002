/**
 * ✅ NODE INJECTION COORDINATOR
 * 
 * Unified API for ALL node injections (safety, missing nodes, error handling, etc.).
 * 
 * Key Features:
 * 1. Unified Injection API: Single entry point for all node injections
 * 2. Execution Order Updates: Automatically updates execution order when nodes are injected
 * 3. Edge Reconciliation: Automatically triggers edge reconciliation after injection
 * 4. Registry-Driven: Uses unifiedNodeRegistry to determine injection rules
 * 
 * This ensures ALL node injections follow the same orchestration flow.
 */

import { Workflow, WorkflowNode } from '../types/ai-types';
import { ExecutionOrder, executionOrderManager } from './execution-order-manager';
import { edgeReconciliationEngine } from './edge-reconciliation-engine';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface InjectionContext {
  type: 'safety' | 'missing' | 'error_handling' | 'user_requested' | 'lifecycle';
  position: 'before' | 'after' | 'replace';
  referenceNodeId: string;
  reason?: string;
}

export interface NodeInjectionResult {
  workflow: Workflow;
  executionOrder: ExecutionOrder;
  edgesReconciled: boolean;
  errors: string[];
  warnings: string[];
}

export interface NodeInjectionCoordinator {
  /**
   * Inject node into workflow with automatic orchestration
   * - Inserts node into execution order
   * - Reconciles edges automatically
   * - Returns updated workflow
   */
  injectNode(
    workflow: Workflow,
    node: WorkflowNode,
    injectionContext: InjectionContext
  ): NodeInjectionResult;
  
  /**
   * Batch inject multiple nodes
   * Coordinates all injections, updates execution order once
   */
  injectNodes(
    workflow: Workflow,
    nodes: Array<{
      node: WorkflowNode;
      injectionContext: InjectionContext;
    }>
  ): NodeInjectionResult;
}

class NodeInjectionCoordinatorImpl implements NodeInjectionCoordinator {
  /**
   * Inject node into workflow with automatic orchestration
   */
  injectNode(
    workflow: Workflow,
    node: WorkflowNode,
    injectionContext: InjectionContext
  ): NodeInjectionResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Step 1: Validate injection context
      const validation = this.validateInjectionContext(workflow, node, injectionContext);
      if (!validation.valid) {
        errors.push(...validation.errors);
        return {
          workflow,
          executionOrder: executionOrderManager.initialize(workflow),
          edgesReconciled: false,
          errors,
          warnings,
        };
      }
      
      // Step 2: Add node to workflow
      const updatedWorkflow: Workflow = {
        ...workflow,
        nodes: [...workflow.nodes, node],
      };
      
      // Step 3: Get or initialize execution order
      let executionOrder = executionOrderManager.initialize(workflow);
      
      // Step 4: Update execution order (insert node at correct position)
      executionOrder = executionOrderManager.insertNode(
        executionOrder,
        node,
        injectionContext.position,
        injectionContext.referenceNodeId
      );
      
      // Step 5: Reconcile edges (automatic)
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
      
      return {
        workflow: reconciliationResult.workflow,
        executionOrder,
        edgesReconciled: true,
        errors,
        warnings,
      };
    } catch (error: any) {
      errors.push(`Node injection failed: ${error?.message || 'Unknown error'}`);
      return {
        workflow,
        executionOrder: executionOrderManager.initialize(workflow),
        edgesReconciled: false,
        errors,
        warnings,
      };
    }
  }
  
  /**
   * Batch inject multiple nodes
   */
  injectNodes(
    workflow: Workflow,
    nodes: Array<{
      node: WorkflowNode;
      injectionContext: InjectionContext;
    }>
  ): NodeInjectionResult {
    let currentWorkflow = workflow;
    let currentOrder = executionOrderManager.initialize(workflow);
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    
    // Inject nodes one by one (order matters for execution order)
    for (const { node, injectionContext } of nodes) {
      const result = this.injectNode(currentWorkflow, node, injectionContext);
      
      if (result.errors.length > 0) {
        allErrors.push(...result.errors);
      }
      if (result.warnings.length > 0) {
        allWarnings.push(...result.warnings);
      }
      
      currentWorkflow = result.workflow;
      currentOrder = result.executionOrder;
    }
    
    // Final reconciliation pass
    const finalReconciliation = edgeReconciliationEngine.reconcileEdges(
      currentWorkflow,
      currentOrder
    );
    
    return {
      workflow: finalReconciliation.workflow,
      executionOrder: currentOrder,
      edgesReconciled: true,
      errors: allErrors,
      warnings: [...allWarnings, ...finalReconciliation.warnings],
    };
  }
  
  /**
   * Validate injection context
   */
  private validateInjectionContext(
    workflow: Workflow,
    node: WorkflowNode,
    context: InjectionContext
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check if reference node exists
    if (context.referenceNodeId) {
      const referenceNode = workflow.nodes.find(n => n.id === context.referenceNodeId);
      if (!referenceNode) {
        errors.push(`Reference node ${context.referenceNodeId} not found in workflow`);
      }
    }
    
    // Check if node type is valid (registry-based)
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (!nodeDef) {
      errors.push(`Node type ${nodeType} not found in registry`);
    }
    
    // Check if position is valid for node type (registry-based)
    if (context.position === 'replace' && !context.referenceNodeId) {
      errors.push(`Replace position requires referenceNodeId`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const nodeInjectionCoordinator: NodeInjectionCoordinator = new NodeInjectionCoordinatorImpl();
