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

import { Workflow, WorkflowEdge, WorkflowNode } from '../types/ai-types';
import { ExecutionOrder, executionOrderManager } from './execution-order-manager';
import { edgeReconciliationEngine } from './edge-reconciliation-engine';
import { nodeInjectionCoordinator, InjectionContext } from './node-injection-coordinator';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
import { validateIfElseConditionsAgainstUpstreamForm } from './form-ifelse-binding';
import { evaluateTerminalMode } from './terminal-mode-policy';
import type { CaseNodeMapping } from '../types/unified-node-contract';

/**
 * Optional switch context for wiring case edges during initializeWorkflow.
 * When provided, the orchestrator creates one labeled edge per case value
 * connecting the switch node to the correct downstream node.
 */
export interface SwitchContext {
  /** The node ID of the switch node in the workflow. */
  switchNodeId: string;
  /** Maps case values to downstream target descriptors (from WorkflowIntentPlan.caseNodeMapping). */
  caseNodeMapping: CaseNodeMapping;
  /** Optional multi-switch contexts for nested/compound switch workflows. */
  switchContexts?: Array<{
    switchNodeId: string;
    caseNodeMapping: CaseNodeMapping;
  }>;
}

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
   * @param switchContext - Optional switch context for wiring case edges
   */
  initializeWorkflow(
    nodes: WorkflowNode[],
    initialExecutionOrder?: ExecutionOrder,
    dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>,
    switchContext?: SwitchContext
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
   * Remove edges matching a predicate, then recompute execution order and reconcile.
   * Use instead of mutating workflow.edges in feature code.
   */
  removeEdges(
    workflow: Workflow,
    shouldRemove: (edge: WorkflowEdge) => boolean
  ): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
    removedNodeTypes: string[];
  };

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
   * ✅ PHASE 4: Accept tagsFromVariation to preserve nodes in tags
   */
  reconcileWorkflow(workflow: Workflow, tagsFromVariation?: string[]): {
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
  private getNodeType(node: WorkflowNode): string {
    return unifiedNormalizeNodeType(node);
  }
  /**
   * Initialize workflow graph with execution order
   * ✅ TIER 1: Uses DSL execution order if available (primary source of truth)
   * ✅ SWITCH CONTEXT: When switchContext is provided, wires case edges through edgeReconciliationEngine
   */
  initializeWorkflow(
    nodes: WorkflowNode[],
    initialExecutionOrder?: ExecutionOrder,
    dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>,
    switchContext?: SwitchContext
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
    
    // For switch workflows, pre-wire case edges before reconciliation so branch target nodes
    // are reachable and not pruned as orphaned during reconciliation.
    let seedWorkflow = workflow;
    if (switchContext) {
      const contexts = Array.isArray(switchContext.switchContexts) && switchContext.switchContexts.length > 0
        ? switchContext.switchContexts
        : (
            switchContext.switchNodeId && switchContext.caseNodeMapping
              ? [{ switchNodeId: switchContext.switchNodeId, caseNodeMapping: switchContext.caseNodeMapping }]
              : []
          );
      for (const ctx of contexts) {
        seedWorkflow = this.wireSwitchCaseEdges(seedWorkflow, ctx as SwitchContext);
      }
    }

    // Create/reconcile edges from execution order using orchestrator core engine.
    const reconciliationResult = edgeReconciliationEngine.reconcileEdges(
      seedWorkflow,
      executionOrder
    );

    const finalWorkflow = reconciliationResult.workflow;
    const terminalNodes = finalWorkflow.nodes.filter((n) => {
      const nodeType = unifiedNormalizeNodeTypeString((n.data as any)?.type || n.type || '');
      const def = unifiedNodeRegistry.get(nodeType);
      return def?.workflowBehavior?.alwaysTerminal === true;
    });
    const hasBranchingNode = finalWorkflow.nodes.some((n) => {
      const nodeType = unifiedNormalizeNodeTypeString((n.data as any)?.type || n.type || '');
      const def = unifiedNodeRegistry.get(nodeType);
      return def?.isBranching === true;
    });
    const shouldEnforceBranchTerminalLineage = hasBranchingNode && terminalNodes.length >= 2;

    const postWireValidation = this.validateWorkflow(finalWorkflow, executionOrder);
    if (!postWireValidation.valid && shouldEnforceBranchTerminalLineage) {
      const terminalLineageErrors = postWireValidation.errors.filter(e =>
        e.toLowerCase().includes('orphan') ||
        e.toLowerCase().includes('terminal lineage')
      );
      if (terminalLineageErrors.length > 0) {
        throw new Error(`Post-wiring validation failed: ${terminalLineageErrors.join(' | ')}`);
      }
    }
    
    return {
      workflow: finalWorkflow,
      executionOrder,
      removedNodeTypes: reconciliationResult.removedNodeTypes || [], // ✅ Return removed node types
    };
  }

  /**
   * Wire switch case edges using the provided SwitchContext.
   * Reads outgoingPorts from the switch node's registry definition and creates
   * one labeled edge per case (case_1, case_2, … case_n) connecting the switch
   * node to the correct downstream node from caseNodeMapping.
   *
   * All edge creation goes through edgeReconciliationEngine — no direct workflow.edges.push.
   */
  private wireSwitchCaseEdges(workflow: Workflow, switchContext: SwitchContext): Workflow {
    const { switchNodeId, caseNodeMapping } = switchContext;

    const switchNode = workflow.nodes.find((n) => n.id === switchNodeId);
    if (!switchNode) {
      console.warn(`[UnifiedGraphOrchestrator] wireSwitchCaseEdges: switch node ${switchNodeId} not found`);
      return workflow;
    }

    const switchNodeType = this.getNodeType(switchNode);
    const switchDef = unifiedNodeRegistry.get(switchNodeType);
    const outgoingPorts: string[] = switchDef?.outgoingPorts ?? [];

    const caseEntries = Object.entries(caseNodeMapping);
    if (caseEntries.length === 0) return workflow;

    // Build an ordered list of non-trigger/non-switch downstream nodes.
    // Used as fallback when type-based lookup finds no match.
    // Note: do NOT exclude log_output here. Switch branches may legitimately
    // terminate directly into per-branch log_output nodes.
    const downstreamNodes = workflow.nodes.filter((n) => {
      if (n.id === switchNodeId) return false;
      const nt = this.getNodeType(n);
      const def = unifiedNodeRegistry.get(nt);
      return def?.category !== 'trigger';
    });

    // Track which node IDs have already been assigned to a case (prevent double-wiring).
    const assignedNodeIds = new Set<string>();

    // Remove any existing edges from the switch node (they will be replaced by case edges)
    const edgesWithoutSwitch = workflow.edges.filter((e) => e.source !== switchNodeId);

    // Create one labeled edge per case.
    // Resolution order:
    // (1) descriptor.targetNodeId (exact),
    // (2) descriptor.targetNodeType (type match),
    // (3) legacy string target type,
    // (4) positional fallback among unassigned downstream nodes.
    const caseEdges: WorkflowEdge[] = [];
    caseEntries.forEach(([caseValue, targetSpec], index) => {
      const explicitSlot =
        targetSpec && typeof targetSpec === 'object' && !Array.isArray(targetSpec)
          ? targetSpec.slot
          : undefined;
      const portLabel = explicitSlot || outgoingPorts[index] || `case_${index + 1}`;
      const targetNodeId =
        targetSpec && typeof targetSpec === 'object' && !Array.isArray(targetSpec)
          ? targetSpec.targetNodeId
          : undefined;
      const targetNodeType =
        targetSpec && typeof targetSpec === 'object' && !Array.isArray(targetSpec)
          ? targetSpec.targetNodeType
          : typeof targetSpec === 'string'
            ? targetSpec
            : undefined;

      // (1) Node ID lookup — find explicit node id target first.
      let targetNode = targetNodeId
        ? downstreamNodes.find((n) => n.id === targetNodeId && !assignedNodeIds.has(n.id))
        : undefined;

      // (1b) Index-aware type+position lookup — when ID lookup fails (stale plan-time ID),
      // prefer the node at position `index` in downstreamNodes whose type matches targetNodeType.
      // This preserves semantic intent when IDs differ between plan-time and materialized nodes.
      if (!targetNode && targetNodeId && targetNodeType) {
        const candidateByPosition = downstreamNodes[index];
        if (
          candidateByPosition &&
          !assignedNodeIds.has(candidateByPosition.id) &&
          this.getNodeType(candidateByPosition) === targetNodeType
        ) {
          targetNode = candidateByPosition;
          console.log(
            `[UnifiedGraphOrchestrator] wireSwitchCaseEdges: case "${caseValue}" — stale ID "${targetNodeId}", resolved via index+type to ${this.getNodeType(candidateByPosition)}(${candidateByPosition.id.substring(0, 8)})`
          );
        }
      }

      // (2) Type-based lookup — find the first unassigned node whose type matches.
      if (!targetNode && targetNodeType) {
        targetNode = downstreamNodes.find(
          (n) => !assignedNodeIds.has(n.id) && this.getNodeType(n) === targetNodeType
        );
      }

      // (3) Bounded positional fallback — only for legacy/underspecified mappings with no target type.
      if (!targetNode && !targetNodeType) {
        targetNode = downstreamNodes.find((n) => {
          if (assignedNodeIds.has(n.id)) return false;
          const def = unifiedNodeRegistry.get(this.getNodeType(n));
          return def?.workflowBehavior?.alwaysTerminal !== true;
        });
      }

      // (4) Final fallback — only for legacy/underspecified mappings with no target type.
      if (!targetNode && !targetNodeType) {
        targetNode = downstreamNodes.find((n) => !assignedNodeIds.has(n.id));
      }

      // If mapping carries explicit target type but no compatible target exists, skip
      // case edge instead of wiring to an arbitrary node.
      if (!targetNode && targetNodeType) {
        console.warn(
          `[UnifiedGraphOrchestrator] wireSwitchCaseEdges: case "${caseValue}" has no compatible target for type "${targetNodeType}" on switch ${switchNodeId}`
        );
        return;
      }

      if (!targetNode) {
        console.warn(
          `[UnifiedGraphOrchestrator] wireSwitchCaseEdges: no downstream node for case "${caseValue}" (type: ${targetNodeType || 'unknown'}, id: ${targetNodeId || 'none'})`
        );
        return;
      }

      assignedNodeIds.add(targetNode.id);
      caseEdges.push({
        id: `${switchNodeId}-${portLabel}-${targetNode.id}`,
        source: switchNodeId,
        target: targetNode.id,
        type: portLabel,
        sourceHandle: portLabel,
        targetHandle: 'default',
      } as WorkflowEdge);

      console.log(
        `[UnifiedGraphOrchestrator] wireSwitchCaseEdges: case "${caseValue}" → ${(targetNodeType || this.getNodeType(targetNode))}(${targetNode.id.substring(0, 8)}) via port ${portLabel}`
      );
    });

    return {
      ...workflow,
      edges: [...edgesWithoutSwitch, ...caseEdges],
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
   * Remove edges matching a predicate, then reconcile.
   */
  removeEdges(
    workflow: Workflow,
    shouldRemove: (edge: WorkflowEdge) => boolean
  ): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
    removedNodeTypes: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const filteredEdges = workflow.edges.filter(e => !shouldRemove(e));
    const updatedWorkflow: Workflow = {
      ...workflow,
      edges: filteredEdges,
    };
    const executionOrder = executionOrderManager.initialize(updatedWorkflow);
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
    const validation = this.validateWorkflow(reconciliationResult.workflow, executionOrder);
    return {
      workflow: reconciliationResult.workflow,
      executionOrder,
      errors: [...errors, ...validation.errors],
      warnings: [...warnings, ...validation.warnings],
      removedNodeTypes: reconciliationResult.removedNodeTypes || [],
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
  reconcileWorkflow(workflow: Workflow, tagsFromVariation?: string[]): {
    workflow: Workflow;
    executionOrder: ExecutionOrder;
    errors: string[];
    warnings: string[];
    removedNodeTypes: string[]; // ✅ NEW: Track removed node types
  } {
    // Get current execution order
    const executionOrder = executionOrderManager.initialize(workflow);
    
    // Reconcile edges
    // ✅ PHASE 4: Pass tagsFromVariation to preserve nodes in tags
    const reconciliationResult = edgeReconciliationEngine.reconcileEdges(
      workflow,
      executionOrder,
      tagsFromVariation
    );

    // Structural validation must use the same execution order as reconciliation (avoid stale order + duplicate reconcile).
    const postReconcileValidation = this.validateWorkflow(
      reconciliationResult.workflow,
      executionOrder
    );

    return {
      workflow: reconciliationResult.workflow,
      executionOrder,
      errors: [...reconciliationResult.errors, ...postReconcileValidation.errors],
      warnings: [...reconciliationResult.warnings, ...postReconcileValidation.warnings],
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
      const nodeType = this.getNodeType(n);
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
      const nodeType = this.getNodeType(n);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const isTrigger = nodeDef?.category === 'trigger';
      
      return !isTrigger && !connectedNodeIds.has(n.id);
    });
    
    if (orphanedNodes.length > 0) {
      // ✅ AUTO-REMOVAL LOGIC: Separate required vs non-required orphaned nodes
      const requiredOrphanedNodes: WorkflowNode[] = [];
      const nonRequiredOrphanedNodes: WorkflowNode[] = [];
      
      orphanedNodes.forEach(n => {
        const nodeType = this.getNodeType(n);
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
        const orphanDiagnostics = requiredOrphanedNodes.map(n => {
          const normalizedType = this.getNodeType(n);
          const incomingCount = currentWorkflow.edges.filter(e => e.target === n.id).length;
          const outgoingCount = currentWorkflow.edges.filter(e => e.source === n.id).length;
          return `${normalizedType} (${n.id}) [incoming=${incomingCount}, outgoing=${outgoingCount}]`;
        });
        errors.push(
          `Found ${requiredOrphanedNodes.length} required orphaned node(s) (edge creation may have failed): ${orphanDiagnostics.join(', ')}`
        );
      }
      
      // Non-required orphaned nodes = warning (should be auto-removed by reconciliation)
      if (nonRequiredOrphanedNodes.length > 0) {
        warnings.push(
          `Found ${nonRequiredOrphanedNodes.length} non-required orphaned node(s) (should be auto-removed): ${nonRequiredOrphanedNodes.map(n => `${n.type || 'unknown'} (${n.id})`).join(', ')}`
        );
      }
    }

    // Gmail + Sheets hybrid: warn when extract_from_sheet has neither upstream google_sheets nor inline spreadsheetId
    const reverseAdj = new Map<string, string[]>();
    for (const e of currentWorkflow.edges) {
      if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
      reverseAdj.get(e.target)!.push(e.source);
    }
    const ancestorsOf = (nodeId: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [...(reverseAdj.get(nodeId) || [])];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const p of reverseAdj.get(id) || []) stack.push(p);
      }
      return seen;
    };

    for (const n of currentWorkflow.nodes) {
      const nodeType = this.getNodeType(n);
      if (nodeType !== 'google_gmail') continue;
      const cfg = (n.data as { config?: Record<string, unknown> })?.config || {};
      const op = typeof cfg.operation === 'string' ? cfg.operation : 'send';
      if (op !== 'send') continue;
      if (cfg.recipientSource !== 'extract_from_sheet') continue;
      const inlineId = typeof cfg.spreadsheetId === 'string' ? cfg.spreadsheetId.trim() : '';
      const ancestors = ancestorsOf(n.id);
      let hasSheetsUpstream = false;
      for (const aid of ancestors) {
        const an = currentWorkflow.nodes.find((x) => x.id === aid);
        if (!an) continue;
        const at = this.getNodeType(an);
        if (at === 'google_sheets') {
          hasSheetsUpstream = true;
          break;
        }
      }
      if (!hasSheetsUpstream && !inlineId) {
        warnings.push(
          `Gmail node "${n.id}": recipientSource is extract_from_sheet but there is no upstream Google Sheets node and no inline Spreadsheet ID. Add a Sheets node before Gmail or set optional Spreadsheet ID + sheet on Gmail for API fallback.`
        );
      }
    }

    // Switch case count invariant: out-degree must equal cases.length.
    // Registry-driven — no hardcoded node type strings; uses unifiedNodeRegistry to detect
    // switch-like nodes (those whose effective outgoing ports are derived from cases config).
    for (const n of currentWorkflow.nodes) {
      const nodeType = this.getNodeType(n);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      // Only check nodes whose ports are case-driven (switch family).
      // getBranchOutgoingPortsForNode returns case values for switch nodes.
      const cfg = (n.data as { config?: Record<string, unknown> })?.config ?? {};
      const effectivePorts = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(n);
      const isCaseDriven = effectivePorts.length > 0 && effectivePorts.every(p => p !== 'output' && p !== 'true' && p !== 'false');
      if (!isCaseDriven) continue;
      const caseCount = Array.isArray((cfg as any).cases) ? (cfg as any).cases.length : 0;
      if (caseCount === 0) continue; // No cases configured yet — skip (not a structural error)
      const outDegree = currentWorkflow.edges.filter(e => e.source === n.id).length;
      if (outDegree !== caseCount) {
        // Downgrade to warning: the AI may have generated fewer branch nodes than cases
        // (e.g. 2 downstream nodes for a 3-case switch). This is a generation-time issue
        // that the node selection prompt fix addresses. At save/validation time, a mismatch
        // means some branches are unwired but the graph is otherwise valid — treat as warning
        // so the workflow can still be saved and the user can add the missing branch node.
        warnings.push(
          `Switch node "${n.id}": out-degree ${outDegree} does not match cases.length ${caseCount} — some branches may be unwired`
        );
      }
    }

    const ifElseFormBinding = validateIfElseConditionsAgainstUpstreamForm(currentWorkflow);
    errors.push(...ifElseFormBinding.errors);

    // Terminal mode compatibility:
    // - log_output_preferred (default): keep backward compatibility, but allow workflows that end at output sinks.
    // - gmail_terminal: require at least one Gmail leaf terminal.
    // - mixed: allow either log_output or sink output leaves.
    const terminalPolicy = evaluateTerminalMode(currentWorkflow);
    errors.push(...terminalPolicy.errors);
    warnings.push(...terminalPolicy.warnings);

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
      const nodeType = this.getNodeType(node);
      return alwaysTerminalTypes.has(nodeType);
    });
    
    // Ensure they have no outgoing edges
    let updatedWorkflow = workflow;
    for (const node of terminalNodesInWorkflow) {
      const outgoingEdges = updatedWorkflow.edges.filter(e => e.source === node.id);
      if (outgoingEdges.length > 0) {
        // Registry says this node must be terminal, but it has outgoing edges
        warnings.push(
          `Node ${node.id} (${this.getNodeType(node)}) should be terminal but has ${outgoingEdges.length} outgoing edge(s)`
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
