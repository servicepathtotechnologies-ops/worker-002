/**
 * Final Workflow Validator
 * 
 * Comprehensive validation before returning workflow result.
 * 
 * Validation checks:
 * 1. All nodes connected to output
 * 2. No orphan nodes
 * 3. No duplicate triggers
 * 4. Data flows correctly
 * 5. Each node has required inputs
 * 6. Workflow minimal
 * 
 * If validation fails → regenerate workflow.
 * Only valid workflows are returned.
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { getTriggerNodes, isTriggerNode } from '../../core/utils/trigger-deduplicator';
import { nodeDataTypeSystem, validateWorkflowTypes } from './node-data-type-system';
import { nodeLibrary } from '../nodes/node-library';
import { isValidHandle } from '../../core/utils/node-handle-registry';
import { transformationDetector, detectTransformations } from './transformation-detector';
import { executionOrderEnforcer } from './execution-order-enforcer';

export interface FinalValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    orphanNodes: string[];
    duplicateTriggers: string[];
    duplicateNodes: string[];
    disconnectedNodes: string[];
    missingInputs: Array<{ nodeId: string; nodeType: string; reason: string }>;
    invalidEdgeHandles: Array<{ edgeId: string; sourceHandle?: string; targetHandle?: string; reason: string }>;
    missingTransformations: string[];
    orderIssues: string[];
    nonMinimalIssues: string[];
    dataFlowIssues: string[];
  };
  shouldRegenerate: boolean;
}

/**
 * Final Workflow Validator
 * Performs comprehensive validation before returning workflow
 */
export class FinalWorkflowValidator {
  /**
   * Validate workflow comprehensively
   * 
   * @param workflow - Workflow to validate
   * @param originalPrompt - Original user prompt (for transformation detection)
   * @returns Validation result with detailed errors and warnings
   */
  validate(workflow: Workflow, originalPrompt?: string): FinalValidationResult {
    console.log('[FinalWorkflowValidator] Starting comprehensive workflow integrity validation...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: FinalValidationResult['details'] = {
      orphanNodes: [],
      duplicateTriggers: [],
      duplicateNodes: [],
      disconnectedNodes: [],
      missingInputs: [],
      invalidEdgeHandles: [],
      missingTransformations: [],
      orderIssues: [],
      nonMinimalIssues: [],
      dataFlowIssues: [],
    };
    
    // Check 1: Transformation exists if required
    if (originalPrompt) {
      const transformationCheck = this.checkRequiredTransformations(workflow.nodes, originalPrompt);
      if (!transformationCheck.valid) {
        errors.push(...transformationCheck.errors);
        details.missingTransformations = transformationCheck.missing;
      }
    }
    
    // Check 2: No duplicate nodes
    const duplicateCheck = this.checkDuplicateNodes(workflow.nodes);
    if (!duplicateCheck.valid) {
      errors.push(...duplicateCheck.errors);
      details.duplicateNodes = duplicateCheck.duplicateNodeIds;
    }
    
    // Check 3: No orphan nodes
    const orphanCheck = this.checkOrphanNodes(workflow.nodes, workflow.edges);
    if (!orphanCheck.valid) {
      errors.push(...orphanCheck.errors);
      details.orphanNodes = orphanCheck.orphanNodeIds;
    }
    
    // Check 4: Valid edge handles
    const handleCheck = this.checkEdgeHandles(workflow.nodes, workflow.edges);
    if (!handleCheck.valid) {
      errors.push(...handleCheck.errors);
      details.invalidEdgeHandles = handleCheck.invalidHandles;
    }
    
    // Check 5: Correct execution order
    const orderCheck = this.checkExecutionOrderStrict(workflow.nodes, workflow.edges);
    if (!orderCheck.valid) {
      errors.push(...orderCheck.errors);
      details.orderIssues = orderCheck.issues;
    }
    warnings.push(...orderCheck.warnings);
    
    // Check 6: All nodes connected to output
    const outputCheck = this.checkAllNodesConnectedToOutput(workflow.nodes, workflow.edges);
    if (!outputCheck.valid) {
      errors.push(...outputCheck.errors);
      details.disconnectedNodes = outputCheck.disconnectedNodeIds;
    }
    
    // Check 7: No duplicate triggers
    const triggerCheck = this.checkDuplicateTriggers(workflow.nodes);
    if (!triggerCheck.valid) {
      errors.push(...triggerCheck.errors);
      details.duplicateTriggers = triggerCheck.duplicateTriggerIds;
    }
    
    // Check 8: Data flows correctly
    const dataFlowCheck = this.checkDataFlow(workflow.nodes, workflow.edges);
    if (!dataFlowCheck.valid) {
      errors.push(...dataFlowCheck.errors);
      details.dataFlowIssues = dataFlowCheck.issues;
    }
    warnings.push(...dataFlowCheck.warnings);
    
    // Check 9: Each node has required inputs
    const inputCheck = this.checkRequiredInputs(workflow.nodes, workflow.edges);
    if (!inputCheck.valid) {
      errors.push(...inputCheck.errors);
      details.missingInputs = inputCheck.missingInputs;
    }
    warnings.push(...inputCheck.warnings);
    
    // Check 10: Workflow minimal
    const minimalCheck = this.checkWorkflowMinimal(workflow.nodes, workflow.edges);
    if (!minimalCheck.valid) {
      warnings.push(...minimalCheck.warnings);
      details.nonMinimalIssues = minimalCheck.issues;
    }
    
    const valid = errors.length === 0;
    const shouldRegenerate = !valid || errors.length > 0;
    
    if (valid) {
      console.log(`[FinalWorkflowValidator] ✅ Workflow integrity validation passed`);
    } else {
      console.error(`[FinalWorkflowValidator] ❌ Workflow integrity validation failed: ${errors.length} errors`);
      console.error(`[FinalWorkflowValidator]   Errors: ${errors.join('; ')}`);
    }
    
    return {
      valid,
      errors,
      warnings,
      details,
      shouldRegenerate,
    };
  }
  
  /**
   * Check 1: All nodes connected to output
   * Every node must be reachable from trigger and lead to an output
   */
  private checkAllNodesConnectedToOutput(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[]; disconnectedNodeIds: string[] } {
    const errors: string[] = [];
    const disconnectedNodeIds: string[] = [];
    
    // Find trigger nodes
    const triggerNodes = getTriggerNodes(nodes);
    if (triggerNodes.length === 0) {
      errors.push('No trigger node found in workflow');
      return { valid: false, errors, disconnectedNodeIds };
    }
    
    // Find output nodes (nodes with no outgoing edges, excluding triggers)
    const outgoingEdgesMap = new Map<string, WorkflowEdge[]>();
    edges.forEach(edge => {
      if (!outgoingEdgesMap.has(edge.source)) {
        outgoingEdgesMap.set(edge.source, []);
      }
      outgoingEdgesMap.get(edge.source)!.push(edge);
    });
    
    const outputNodes = nodes.filter(node => {
      const nodeType = normalizeNodeType(node);
      return !outgoingEdgesMap.has(node.id) && 
             !isTriggerNode(node) &&
             (this.isOutputAction(nodeType) || this.isDataProducer(nodeType));
    });
    
    if (outputNodes.length === 0) {
      errors.push('No output nodes found in workflow');
      return { valid: false, errors, disconnectedNodeIds };
    }
    
    // Build reverse adjacency list (for backward traversal from outputs)
    const reverseAdj = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!reverseAdj.has(edge.target)) {
        reverseAdj.set(edge.target, []);
      }
      reverseAdj.get(edge.target)!.push(edge.source);
    });
    
    // Find all nodes reachable from outputs (backward BFS)
    const reachableFromOutput = new Set<string>();
    const queue: string[] = [...outputNodes.map(n => n.id)];
    outputNodes.forEach(node => reachableFromOutput.add(node.id));
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const predecessors = reverseAdj.get(nodeId) || [];
      for (const predId of predecessors) {
        if (!reachableFromOutput.has(predId)) {
          reachableFromOutput.add(predId);
          queue.push(predId);
        }
      }
    }
    
    // Check if all nodes are reachable from outputs
    for (const node of nodes) {
      if (!reachableFromOutput.has(node.id) && !isTriggerNode(node)) {
        const nodeType = normalizeNodeType(node);
        errors.push(`Node "${nodeType}" (${node.id}) is not connected to any output`);
        disconnectedNodeIds.push(node.id);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      disconnectedNodeIds,
    };
  }
  
  /**
   * Check 2: No orphan nodes
   * All nodes must be reachable from trigger
   */
  private checkOrphanNodes(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[]; orphanNodeIds: string[] } {
    const errors: string[] = [];
    const orphanNodeIds: string[] = [];
    
    // Find trigger nodes
    const triggerNodes = getTriggerNodes(nodes);
    if (triggerNodes.length === 0) {
      errors.push('No trigger node found - cannot check for orphan nodes');
      return { valid: false, errors, orphanNodeIds };
    }
    
    // Build adjacency list (for forward traversal from trigger)
    const adj = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!adj.has(edge.source)) {
        adj.set(edge.source, []);
      }
      adj.get(edge.source)!.push(edge.target);
    });
    
    // Find all nodes reachable from triggers (forward BFS)
    const reachableFromTrigger = new Set<string>();
    const queue: string[] = [...triggerNodes.map(n => n.id)];
    triggerNodes.forEach(node => reachableFromTrigger.add(node.id));
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const neighbors = adj.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (!reachableFromTrigger.has(neighborId)) {
          reachableFromTrigger.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
    
    // Check for orphan nodes
    for (const node of nodes) {
      if (!reachableFromTrigger.has(node.id)) {
        const nodeType = normalizeNodeType(node);
        errors.push(`Orphan node "${nodeType}" (${node.id}) is not reachable from trigger`);
        orphanNodeIds.push(node.id);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      orphanNodeIds,
    };
  }
  
  /**
   * Check 3: No duplicate triggers
   * Workflow must have exactly one trigger
   */
  private checkDuplicateTriggers(
    nodes: WorkflowNode[]
  ): { valid: boolean; errors: string[]; duplicateTriggerIds: string[] } {
    const errors: string[] = [];
    const duplicateTriggerIds: string[] = [];
    
    const triggerNodes = getTriggerNodes(nodes);
    
    if (triggerNodes.length === 0) {
      errors.push('No trigger node found in workflow');
      return { valid: false, errors, duplicateTriggerIds };
    }
    
    if (triggerNodes.length > 1) {
      errors.push(`Multiple trigger nodes found: ${triggerNodes.length} (expected 1)`);
      triggerNodes.forEach(node => {
        const nodeType = normalizeNodeType(node);
        duplicateTriggerIds.push(node.id);
        errors.push(`  - Duplicate trigger: "${nodeType}" (${node.id})`);
      });
      return { valid: false, errors, duplicateTriggerIds };
    }
    
    return {
      valid: true,
      errors: [],
      duplicateTriggerIds: [],
    };
  }
  
  /**
   * Check 4: Data flows correctly
   * Validate type compatibility and data flow direction
   */
  private checkDataFlow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[]; warnings: string[]; issues: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const issues: string[] = [];
    
    // Use type system to validate data flow
    const typeValidation = validateWorkflowTypes(nodes, edges);
    
    if (!typeValidation.valid) {
      errors.push(...typeValidation.errors);
      typeValidation.incompatibleEdges.forEach(edge => {
        issues.push(`Type mismatch: ${edge.source} (${edge.sourceType}) → ${edge.target} (${edge.targetType}): ${edge.reason}`);
      });
    }
    
    warnings.push(...typeValidation.warnings);
    
    // Check for cycles (data should flow forward)
    if (this.hasCycle(nodes, edges)) {
      errors.push('Workflow contains a cycle - data flow must be acyclic');
      issues.push('Cycle detected in workflow graph');
    }
    
    // Check execution order (producer → transformer → output)
    const orderIssues = this.checkExecutionOrder(nodes, edges);
    if (orderIssues.length > 0) {
      warnings.push(...orderIssues);
      issues.push(...orderIssues);
    }

    // ✅ AI SAFETY: Warn if AI nodes can receive array/bulk data without an upstream `limit`
    const aiSafety = this.checkAiLimitSafety(nodes, edges);
    if (aiSafety.warnings.length > 0) {
      warnings.push(...aiSafety.warnings);
      issues.push(...aiSafety.issues);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      issues,
    };
  }

  /**
   * AI safety check: if an AI node has an upstream array-producing source,
   * ensure there is a `limit` node somewhere upstream in the same path.
   *
   * This is a validator-level backstop in case planner/injector misses safety injection.
   * We keep this as a WARNING (not blocking) to avoid regen loops.
   */
  private checkAiLimitSafety(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { warnings: string[]; issues: string[] } {
    const warnings: string[] = [];
    const issues: string[] = [];

    const nodeById = new Map<string, WorkflowNode>();
    nodes.forEach(n => nodeById.set(n.id, n));

    const incoming = new Map<string, WorkflowEdge[]>();
    edges.forEach(e => {
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      incoming.get(e.target)!.push(e);
    });

    const isAiNodeType = (t: string): boolean => {
      const tl = (t || '').toLowerCase();
      return (
        tl === 'ai_chat_model' ||
        tl === 'ai_agent' ||
        tl === 'text_summarizer' ||
        tl === 'sentiment_analyzer' ||
        tl === 'ai_service' ||
        tl === 'ollama' ||
        tl.includes('openai') ||
        tl.includes('anthropic') ||
        tl.includes('gemini')
      );
    };

    const outputsArray = (t: string): boolean => {
      const schema = nodeLibrary.getSchema(t);
      const out = schema?.outputSchema as any;
      if (!out) return this.isDataProducer(t); // fallback heuristic
      return out.type === 'array';
    };

    const hasUpstreamType = (startNodeId: string, wantedType: string, maxDepth: number): boolean => {
      const visited = new Set<string>();
      const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth > maxDepth) continue;

        const inEdges = incoming.get(id) || [];
        for (const e of inEdges) {
          const src = nodeById.get(e.source);
          if (!src) continue;
          const srcType = normalizeNodeType(src);
          if (srcType === wantedType) return true;
          if (!visited.has(src.id)) {
            visited.add(src.id);
            queue.push({ id: src.id, depth: depth + 1 });
          }
        }
      }

      return false;
    };

    const findUpstreamArraySource = (startNodeId: string, maxDepth: number): { nodeId: string; nodeType: string } | null => {
      const visited = new Set<string>();
      const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth > maxDepth) continue;

        const inEdges = incoming.get(id) || [];
        for (const e of inEdges) {
          const src = nodeById.get(e.source);
          if (!src) continue;
          const srcType = normalizeNodeType(src);
          if (outputsArray(srcType)) {
            return { nodeId: src.id, nodeType: srcType };
          }
          if (!visited.has(src.id)) {
            visited.add(src.id);
            queue.push({ id: src.id, depth: depth + 1 });
          }
        }
      }
      return null;
    };

    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      if (!isAiNodeType(nodeType)) continue;

      // If there is no incoming edge, other rules will catch it (required inputs).
      const inEdges = incoming.get(node.id) || [];
      if (inEdges.length === 0) continue;

      // Look for upstream array source (close-ish)
      const arraySource = findUpstreamArraySource(node.id, 6);
      if (!arraySource) continue;

      // Require `limit` somewhere upstream (including via if_else branches etc.)
      const hasLimit = hasUpstreamType(node.id, 'limit', 6);
      if (!hasLimit) {
        const msg = `AI safety: "${nodeType}" (${node.id}) can receive array output from "${arraySource.nodeType}" (${arraySource.nodeId}) without an upstream "limit" node`;
        warnings.push(msg);
        issues.push(msg);
      }
    }

    return { warnings, issues };
  }
  
  /**
   * Check 5: Each node has required inputs
   * Non-trigger nodes should have at least one input edge
   */
  private checkRequiredInputs(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[]; warnings: string[]; missingInputs: Array<{ nodeId: string; nodeType: string; reason: string }> } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingInputs: Array<{ nodeId: string; nodeType: string; reason: string }> = [];
    
    // Build incoming edges map
    const incomingEdgesMap = new Map<string, WorkflowEdge[]>();
    edges.forEach(edge => {
      if (!incomingEdgesMap.has(edge.target)) {
        incomingEdgesMap.set(edge.target, []);
      }
      incomingEdgesMap.get(edge.target)!.push(edge);
    });
    
    // Check each node
    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      
      // Triggers don't need inputs
      if (isTriggerNode(node)) {
        continue;
      }
      
      // Check if node has incoming edges
      const incomingEdges = incomingEdgesMap.get(node.id) || [];
      
      if (incomingEdges.length === 0) {
        // Core graph rule: every non-trigger node must have at least one input
        errors.push(`Node "${nodeType}" (${node.id}) has no input connections (every non-trigger node must have an input)`);
        missingInputs.push({
          nodeId: node.id,
          nodeType,
          reason: 'No incoming edges found',
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingInputs,
    };
  }
  
  /**
   * Check 6: Workflow minimal
   * Workflow should not have unnecessary nodes or edges
   */
  private checkWorkflowMinimal(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; warnings: string[]; issues: string[] } {
    const warnings: string[] = [];
    const issues: string[] = [];
    
    // Check for duplicate nodes (same type used multiple times unnecessarily)
    const nodeTypeCount = new Map<string, number>();
    nodes.forEach(node => {
      const nodeType = normalizeNodeType(node);
      nodeTypeCount.set(nodeType, (nodeTypeCount.get(nodeType) || 0) + 1);
    });
    
    nodeTypeCount.forEach((count, nodeType) => {
      if (count > 1 && !this.isAllowedDuplicate(nodeType)) {
        warnings.push(`Duplicate node type "${nodeType}" found ${count} times (may be non-minimal)`);
        issues.push(`Multiple instances of "${nodeType}" node`);
      }
    });
    
    // Check for parallel paths (may indicate non-minimal workflow)
    const parallelPaths = this.findParallelPaths(nodes, edges);
    if (parallelPaths.length > 0) {
      warnings.push(`Parallel paths detected (may indicate non-minimal workflow)`);
      issues.push(...parallelPaths);
    }
    
    // Check for unnecessary transform nodes
    const unnecessaryTransforms = this.findUnnecessaryTransforms(nodes, edges);
    if (unnecessaryTransforms.length > 0) {
      warnings.push(`Unnecessary transform nodes detected`);
      issues.push(...unnecessaryTransforms);
    }
    
    return {
      valid: warnings.length === 0,
      warnings,
      issues,
    };
  }
  
  /**
   * Check 1: Transformation exists if required
   * Validates that required transformation nodes exist based on prompt
   */
  private checkRequiredTransformations(
    nodes: WorkflowNode[],
    originalPrompt: string
  ): { valid: boolean; errors: string[]; missing: string[] } {
    const errors: string[] = [];
    const missing: string[] = [];
    
    // Detect required transformations from prompt
    const detection = detectTransformations(originalPrompt);
    
    if (!detection.detected) {
      return { valid: true, errors: [], missing: [] };
    }
    
    // Get node types in workflow
    const workflowNodeTypes = nodes.map(node => normalizeNodeType(node));
    
    // Validate transformations exist
    const validation = transformationDetector.validateTransformations(detection, workflowNodeTypes);
    
    if (!validation.valid) {
      errors.push(...validation.errors);
      missing.push(...validation.missing);
      console.error(`[FinalWorkflowValidator] ❌ Missing required transformations: ${validation.missing.join(', ')}`);
    } else {
      console.log(`[FinalWorkflowValidator] ✅ All required transformations present`);
    }
    
    return {
      valid: validation.valid,
      errors,
      missing,
    };
  }
  
  /**
   * Check 2: No duplicate nodes
   * Validates that no duplicate node IDs or unnecessary duplicate node types exist
   */
  private checkDuplicateNodes(
    nodes: WorkflowNode[]
  ): { valid: boolean; errors: string[]; duplicateNodeIds: string[] } {
    const errors: string[] = [];
    const duplicateNodeIds: string[] = [];
    
    // Check for duplicate node IDs
    const nodeIdMap = new Map<string, WorkflowNode[]>();
    nodes.forEach(node => {
      if (!nodeIdMap.has(node.id)) {
        nodeIdMap.set(node.id, []);
      }
      nodeIdMap.get(node.id)!.push(node);
    });
    
    nodeIdMap.forEach((duplicates, nodeId) => {
      if (duplicates.length > 1) {
        errors.push(`Duplicate node ID found: "${nodeId}" (${duplicates.length} instances)`);
        duplicateNodeIds.push(nodeId);
      }
    });
    
    // Check for unnecessary duplicate node types (same type in same position)
    const nodeTypePositions = new Map<string, Set<string>>();
    nodes.forEach(node => {
      const nodeType = normalizeNodeType(node);
      if (!nodeTypePositions.has(nodeType)) {
        nodeTypePositions.set(nodeType, new Set());
      }
      nodeTypePositions.get(nodeType)!.add(node.id);
    });
    
    // Some node types are allowed to be duplicated (e.g., set_variable, log)
    const allowedDuplicates = ['set_variable', 'log', 'delay', 'notification'];
    
    nodeTypePositions.forEach((nodeIds, nodeType) => {
      if (nodeIds.size > 1 && !allowedDuplicates.includes(nodeType)) {
        // Check if duplicates are necessary (e.g., multiple data sources)
        const isDataProducer = this.isDataProducer(nodeType);
        const isOutputAction = this.isOutputAction(nodeType);
        
        // Allow multiple data producers or output actions if they serve different purposes
        if (!isDataProducer && !isOutputAction) {
          errors.push(`Unnecessary duplicate node type "${nodeType}" found (${nodeIds.size} instances)`);
          nodeIds.forEach(id => duplicateNodeIds.push(id));
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      duplicateNodeIds: Array.from(new Set(duplicateNodeIds)),
    };
  }
  
  /**
   * Check 4: Valid edge handles
   * Validates that all edge handles exist on their respective nodes
   */
  private checkEdgeHandles(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[]; invalidHandles: Array<{ edgeId: string; sourceHandle?: string; targetHandle?: string; reason: string }> } {
    const errors: string[] = [];
    const invalidHandles: Array<{ edgeId: string; sourceHandle?: string; targetHandle?: string; reason: string }> = [];
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      
      if (!sourceNode || !targetNode) {
        errors.push(`Edge ${edge.id}: Source or target node not found`);
        invalidHandles.push({
          edgeId: edge.id,
          reason: 'Source or target node not found',
        });
        continue;
      }
      
      const sourceType = normalizeNodeType(sourceNode);
      const targetType = normalizeNodeType(targetNode);
      
      // Validate source handle
      if (edge.sourceHandle) {
        if (!isValidHandle(sourceType, edge.sourceHandle, true)) {
          const error = `Edge ${edge.id}: Invalid source handle "${edge.sourceHandle}" for node type "${sourceType}"`;
          errors.push(error);
          invalidHandles.push({
            edgeId: edge.id,
            sourceHandle: edge.sourceHandle,
            reason: `Invalid source handle "${edge.sourceHandle}" for "${sourceType}"`,
          });
        }
      }
      
      // Validate target handle
      if (edge.targetHandle) {
        if (!isValidHandle(targetType, edge.targetHandle, false)) {
          const error = `Edge ${edge.id}: Invalid target handle "${edge.targetHandle}" for node type "${targetType}"`;
          errors.push(error);
          invalidHandles.push({
            edgeId: edge.id,
            targetHandle: edge.targetHandle,
            reason: `Invalid target handle "${edge.targetHandle}" for "${targetType}"`,
          });
        }
      }
    }
    
    if (errors.length === 0) {
      console.log(`[FinalWorkflowValidator] ✅ All edge handles are valid`);
    } else {
      console.error(`[FinalWorkflowValidator] ❌ Found ${errors.length} invalid edge handles`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      invalidHandles,
    };
  }
  
  /**
   * Check 5: Correct execution order (strict)
   * Validates that workflow follows strict execution order: trigger → data source → transformation → action
   */
  private checkExecutionOrderStrict(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[]; warnings: string[]; issues: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const issues: string[] = [];
    
    // Use execution order enforcer to check order
    const orderResult = executionOrderEnforcer.enforceOrdering(nodes, edges);
    
    if (orderResult.reordered) {
      // If workflow was reordered, it means original order was incorrect
      const reorderCount = orderResult.ordering.filter(item => item.originalOrder !== item.finalOrder).length;
      if (reorderCount > 0) {
        errors.push(`Workflow execution order is incorrect - ${reorderCount} nodes need reordering`);
        orderResult.ordering.forEach(item => {
          if (item.originalOrder !== item.finalOrder) {
            issues.push(`${item.nodeType}: position ${item.originalOrder} → ${item.finalOrder} (${item.category})`);
          }
        });
      }
    } else {
      console.log(`[FinalWorkflowValidator] ✅ Execution order is correct`);
    }
    
    // Additional validation: check category order in edges
    const nodeCategoryMap = new Map<string, string>();
    nodes.forEach(node => {
      const nodeType = normalizeNodeType(node);
      if (this.isDataProducer(nodeType)) {
        nodeCategoryMap.set(node.id, 'producer');
      } else if (this.isDataTransformer(nodeType)) {
        nodeCategoryMap.set(node.id, 'transformer');
      } else if (this.isOutputAction(nodeType)) {
        nodeCategoryMap.set(node.id, 'output');
      } else if (isTriggerNode(node)) {
        nodeCategoryMap.set(node.id, 'trigger');
      }
    });
    
    const categoryOrder: Record<string, number> = {
      'trigger': 0,
      'producer': 1,
      'transformer': 2,
      'output': 3,
    };
    
    edges.forEach(edge => {
      const sourceCategory = nodeCategoryMap.get(edge.source);
      const targetCategory = nodeCategoryMap.get(edge.target);
      
      if (sourceCategory && targetCategory) {
        const sourcePriority = categoryOrder[sourceCategory] ?? 99;
        const targetPriority = categoryOrder[targetCategory] ?? 99;
        
        if (sourcePriority > targetPriority) {
          const issue = `Incorrect order: ${edge.source} (${sourceCategory}) → ${edge.target} (${targetCategory})`;
          errors.push(issue);
          issues.push(issue);
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      issues,
    };
  }
  
  // Helper methods
  
  private hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const adj = new Map<string, string[]>();
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    nodes.forEach(node => adj.set(node.id, []));
    edges.forEach(edge => adj.get(edge.source)?.push(edge.target));
    
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      for (const neighborId of adj.get(nodeId) || []) {
        if (!visited.has(neighborId)) {
          if (dfs(neighborId)) {
            return true;
          }
        } else if (recursionStack.has(neighborId)) {
          return true; // Cycle detected
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  private checkExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    // This method is kept for backward compatibility but uses the strict check
    const strictCheck = this.checkExecutionOrderStrict(nodes, edges);
    return strictCheck.issues;
  }
  
  private findParallelPaths(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const issues: string[] = [];
    
    // Find paths between same source and target
    const pathMap = new Map<string, number>();
    edges.forEach(edge => {
      const key = `${edge.source}→${edge.target}`;
      pathMap.set(key, (pathMap.get(key) || 0) + 1);
    });
    
    pathMap.forEach((count, path) => {
      if (count > 1) {
        issues.push(`Multiple edges between ${path}`);
      }
    });
    
    return issues;
  }
  
  private findUnnecessaryTransforms(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const issues: string[] = [];
    
    // Find transform nodes that don't change type
    const transformNodes = nodes.filter(node => {
      const nodeType = normalizeNodeType(node);
      return nodeType.includes('transform') || nodeType.includes('format');
    });
    
    for (const transformNode of transformNodes) {
      const incomingEdges = edges.filter(e => e.target === transformNode.id);
      const outgoingEdges = edges.filter(e => e.source === transformNode.id);
      
      if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
        // Check if transform actually changes type
        const sourceNode = nodes.find(n => n.id === incomingEdges[0].source);
        const targetNode = nodes.find(n => n.id === outgoingEdges[0].target);
        
        if (sourceNode && targetNode) {
          const sourceType = nodeDataTypeSystem.getNodeTypeInfo(normalizeNodeType(sourceNode));
          const targetType = nodeDataTypeSystem.getNodeTypeInfo(normalizeNodeType(targetNode));
          
          if (sourceType && targetType) {
            const compatibility = nodeDataTypeSystem.checkTypeCompatibility(
              sourceType.outputType,
              targetType.inputType
            );
            
            if (compatibility.compatible && !compatibility.requiresTransform) {
              issues.push(`Unnecessary transform node: ${transformNode.id} (types already compatible)`);
            }
          }
        }
      }
    }
    
    return issues;
  }
  
  private isAllowedDuplicate(nodeType: string): boolean {
    // Some node types are allowed to be duplicated (e.g., set_variable, log)
    const allowedDuplicates = ['set_variable', 'log', 'delay', 'notification'];
    return allowedDuplicates.includes(nodeType);
  }
  
  private isDataProducer(nodeType: string): boolean {
    return nodeType.includes('sheets') || nodeType.includes('database') ||
           nodeType.includes('postgres') || nodeType.includes('mysql') ||
           nodeType.includes('http') || nodeType.includes('api') ||
           nodeType.includes('csv') || nodeType.includes('excel');
  }
  
  private isDataTransformer(nodeType: string): boolean {
    return nodeType.includes('summarizer') || nodeType.includes('classifier') ||
           nodeType.includes('transform') || nodeType.includes('format') ||
           nodeType.includes('ollama') || nodeType.includes('openai') ||
           nodeType.includes('anthropic') || nodeType.includes('gemini');
  }
  
  private isOutputAction(nodeType: string): boolean {
    return nodeType.includes('gmail') || nodeType.includes('email') ||
           nodeType.includes('slack') || nodeType.includes('discord') ||
           nodeType.includes('notification') || nodeType.includes('webhook') ||
           nodeType.includes('database_write') || nodeType.includes('sheets_write');
  }
}

// Export singleton instance
export const finalWorkflowValidator = new FinalWorkflowValidator();

// Export convenience function
export function validateFinalWorkflow(workflow: Workflow, originalPrompt?: string): FinalValidationResult {
  return finalWorkflowValidator.validate(workflow, originalPrompt);
}
