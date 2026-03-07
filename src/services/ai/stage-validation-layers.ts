/**
 * ✅ FIX 4: Stage Validation Layers
 * 
 * Validates workflow state between pipeline stages to catch errors early.
 * - Stage 3 → Stage 5: Validate DSL structure before compilation
 * - Stage 5 → Stage 7: Validate workflow structure after compilation
 */

import { WorkflowDSL } from './workflow-dsl';
import { Workflow } from '../../core/types/ai-types';
import { unifiedNodeCategorizer } from './unified-node-categorizer';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { nodeLibrary } from '../nodes/node-library';

export interface StageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  context?: Record<string, any>;
}

/**
 * Stage Validation Layers
 */
export class StageValidationLayers {
  /**
   * ✅ FIX 4: Validate DSL structure before compilation (Stage 3 → Stage 5)
   */
  validateDSLBeforeCompilation(dsl: WorkflowDSL): StageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const context: Record<string, any> = {};

    console.log('[StageValidation] Validating DSL structure before compilation...');

    // Check 1: DSL has trigger
    if (!dsl.trigger || !dsl.trigger.type) {
      errors.push('DSL missing trigger - workflow cannot execute without trigger');
    } else {
      // Validate trigger type exists
      if (!nodeLibrary.isNodeTypeRegistered(dsl.trigger.type)) {
        errors.push(`Trigger type "${dsl.trigger.type}" not registered in NodeLibrary`);
      }
    }

    // Check 2: Validate categorization consistency
    // Ensure nodes in DSL arrays match their categorization
    const categorizationErrors = this.validateDSLCategorization(dsl);
    errors.push(...categorizationErrors.errors);
    warnings.push(...categorizationErrors.warnings);

    // Check 3: Validate minimum components
    if (dsl.dataSources.length === 0 && dsl.transformations.length === 0 && dsl.outputs.length === 0) {
      warnings.push('DSL has no data sources, transformations, or outputs - workflow may be empty');
    }

    // Check 4: Validate all node types exist
    const nodeTypeErrors = this.validateDSLNodeTypes(dsl);
    errors.push(...nodeTypeErrors.errors);
    warnings.push(...nodeTypeErrors.warnings);

    context.dslStructure = {
      trigger: dsl.trigger?.type || 'missing',
      dataSources: dsl.dataSources.length,
      transformations: dsl.transformations.length,
      outputs: dsl.outputs.length
    };

    const valid = errors.length === 0;
    if (valid) {
      console.log('[StageValidation] ✅ DSL structure validation passed');
    } else {
      console.error(`[StageValidation] ❌ DSL structure validation failed: ${errors.length} error(s)`);
    }

    return {
      valid,
      errors,
      warnings,
      context
    };
  }

  /**
   * ✅ FIX 4: Validate workflow structure after compilation (Stage 5 → Stage 7)
   */
  validateWorkflowAfterCompilation(workflow: Workflow): StageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const context: Record<string, any> = {};

    console.log('[StageValidation] Validating workflow structure after compilation...');

    // Check 1: Workflow has nodes
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow has no nodes - cannot execute empty workflow');
      return { valid: false, errors, warnings, context };
    }

    // ✅ PHASE 1 FIX: Use registry to check if node is trigger
    // Check 2: Workflow has exactly one trigger
    const triggerNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return unifiedNodeRegistry.isTrigger(nodeType);
    });

    if (triggerNodes.length === 0) {
      errors.push('Workflow missing trigger node - required for execution');
    } else if (triggerNodes.length > 1) {
      errors.push(`Workflow has ${triggerNodes.length} trigger nodes - should have exactly one`);
    }

    // Check 3: All nodes are connected (no orphans)
    const connectedNodeIds = new Set<string>();
    workflow.edges?.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    // ✅ PHASE 1 FIX: Use registry to check if node is trigger
    const orphanNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const isTrigger = unifiedNodeRegistry.isTrigger(nodeType);
      return !isTrigger && !connectedNodeIds.has(n.id);
    });

    if (orphanNodes.length > 0) {
      warnings.push(`Workflow has ${orphanNodes.length} orphan node(s): ${orphanNodes.map(n => unifiedNormalizeNodeType(n)).join(', ')}`);
    }

    // Check 4: Validate edges
    if (workflow.edges && workflow.edges.length > 0) {
      const edgeErrors = this.validateEdges(workflow);
      errors.push(...edgeErrors.errors);
      warnings.push(...edgeErrors.warnings);
    }

    // Check 5: Validate node types
    const nodeTypeErrors = this.validateWorkflowNodeTypes(workflow);
    errors.push(...nodeTypeErrors.errors);
    warnings.push(...nodeTypeErrors.warnings);

    context.workflowStructure = {
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges?.length || 0,
      triggerCount: triggerNodes.length,
      orphanCount: orphanNodes.length
    };

    const valid = errors.length === 0;
    if (valid) {
      console.log('[StageValidation] ✅ Workflow structure validation passed');
    } else {
      console.error(`[StageValidation] ❌ Workflow structure validation failed: ${errors.length} error(s)`);
    }

    return {
      valid,
      errors,
      warnings,
      context
    };
  }

  /**
   * ✅ FIX 4: Validate DSL categorization consistency
   */
  private validateDSLCategorization(dsl: WorkflowDSL): StageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check data sources
    for (const ds of dsl.dataSources) {
      const categorization = unifiedNodeCategorizer.categorizeWithOperation(ds.type, ds.operation || 'read');
      if (categorization.category !== 'dataSource') {
        warnings.push(`Data source "${ds.type}" categorized as "${categorization.category}" by unified categorizer (expected: dataSource)`);
      }
    }

    // Check transformations
    for (const tf of dsl.transformations) {
      const categorization = unifiedNodeCategorizer.categorizeWithOperation(tf.type, tf.operation || 'transform');
      if (categorization.category !== 'transformation') {
        warnings.push(`Transformation "${tf.type}" categorized as "${categorization.category}" by unified categorizer (expected: transformation)`);
      }
    }

    // Check outputs
    for (const out of dsl.outputs) {
      const categorization = unifiedNodeCategorizer.categorizeWithOperation(out.type, out.operation || 'write');
      if (categorization.category !== 'output') {
        warnings.push(`Output "${out.type}" categorized as "${categorization.category}" by unified categorizer (expected: output)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * ✅ FIX 4: Validate DSL node types exist
   */
  private validateDSLNodeTypes(dsl: WorkflowDSL): StageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check trigger
    if (dsl.trigger && !nodeLibrary.isNodeTypeRegistered(dsl.trigger.type)) {
      errors.push(`Trigger type "${dsl.trigger.type}" not registered in NodeLibrary`);
    }

    // Check data sources
    for (const ds of dsl.dataSources) {
      if (!nodeLibrary.isNodeTypeRegistered(ds.type)) {
        errors.push(`Data source type "${ds.type}" not registered in NodeLibrary`);
      }
    }

    // Check transformations
    for (const tf of dsl.transformations) {
      if (!nodeLibrary.isNodeTypeRegistered(tf.type)) {
        errors.push(`Transformation type "${tf.type}" not registered in NodeLibrary`);
      }
    }

    // Check outputs
    for (const out of dsl.outputs) {
      if (!nodeLibrary.isNodeTypeRegistered(out.type)) {
        errors.push(`Output type "${out.type}" not registered in NodeLibrary`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * ✅ FIX 4: Validate workflow node types
   */
  private validateWorkflowNodeTypes(workflow: Workflow): StageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const node of workflow.nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      if (!nodeLibrary.isNodeTypeRegistered(nodeType)) {
        errors.push(`Node type "${nodeType}" (node ID: ${node.id}) not registered in NodeLibrary`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * ✅ FIX 4: Validate edges
   */
  private validateEdges(workflow: Workflow): StageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));

    // Check for duplicate edges
    const edgeKeys = new Set<string>();
    for (const edge of workflow.edges || []) {
      const key = `${edge.source}:${edge.target}:${edge.sourceHandle || ''}:${edge.targetHandle || ''}`;
      if (edgeKeys.has(key)) {
        errors.push(`Duplicate edge: ${edge.source} → ${edge.target}`);
      }
      edgeKeys.add(key);

      // Check source node exists
      if (!nodeMap.has(edge.source)) {
        errors.push(`Edge references non-existent source node: ${edge.source}`);
      }

      // Check target node exists
      if (!nodeMap.has(edge.target)) {
        errors.push(`Edge references non-existent target node: ${edge.target}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export singleton instance
export const stageValidationLayers = new StageValidationLayers();
