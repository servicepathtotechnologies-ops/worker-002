/**
 * ✅ PHASE 2: Pipeline Stage Contracts
 * 
 * Defines strict TypeScript interfaces for data passed between pipeline stages.
 * This ensures type safety and prevents errors from propagating between stages.
 * 
 * Contracts:
 * 1. StructuredIntent → DSL Generator (Stage 2 → Stage 3)
 * 2. DSL → Compiler (Stage 3 → Stage 5)
 * 3. Workflow → Validator (Stage 5 → Stage 7)
 */

import { StructuredIntent } from '../../services/ai/intent-structurer';
import { WorkflowDSL } from '../../services/ai/workflow-dsl';
import { Workflow } from '../types/ai-types';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

/**
 * Contract: StructuredIntent (Input to DSL Generator)
 * 
 * Guarantees:
 * - Has trigger
 * - Has actions array
 * - All actions have type and operation
 */
export interface ValidatedStructuredIntent extends StructuredIntent {
  trigger: string; // Required, not optional
  actions: Array<{
    type: string;
    operation: string;
    config?: Record<string, unknown>;
  }>; // Required, not optional
}

/**
 * Contract: WorkflowDSL (Output from DSL Generator, Input to Compiler)
 * 
 * Guarantees:
 * - Has exactly one trigger
 * - All dataSources have valid type and operation
 * - All transformations have valid type and operation
 * - All outputs have valid type and operation
 * - All node types exist in registry
 * 
 * Note: This is a type alias, not an interface extension, because WorkflowDSL
 * already defines these properties with compatible types.
 */
export type ValidatedWorkflowDSL = WorkflowDSL;

/**
 * Contract: Workflow (Output from Compiler, Input to Validator)
 * 
 * Guarantees:
 * - Has at least one node
 * - Has exactly one trigger node
 * - All nodes have valid type
 * - All edges connect valid nodes
 * - No cycles
 */
/**
 * Note: This is a type alias, not an interface extension, because Workflow
 * already defines these properties with compatible types.
 */
export type ValidatedWorkflow = Workflow;

/**
 * Stage Boundary Validators
 */

/**
 * ✅ PHASE 2: Validate StructuredIntent before DSL generation
 * 
 * This ensures the DSL generator receives valid input.
 * Catches errors early before they propagate through the pipeline.
 */
export function validateStructuredIntent(intent: StructuredIntent | null | undefined): {
  valid: boolean;
  errors: string[];
  intent?: ValidatedStructuredIntent;
} {
  const errors: string[] = [];

  if (!intent) {
    errors.push('StructuredIntent is null or undefined');
    return { valid: false, errors };
  }

  if (!intent.trigger || typeof intent.trigger !== 'string') {
    errors.push('StructuredIntent missing trigger or trigger is not a string');
  }

  if (!intent.actions || !Array.isArray(intent.actions) || intent.actions.length === 0) {
    errors.push('StructuredIntent missing actions array or actions is empty');
  } else {
    intent.actions.forEach((action, index) => {
      if (!action || typeof action !== 'object') {
        errors.push(`Action ${index} is not an object`);
        return;
      }
      if (!action.type || typeof action.type !== 'string') {
        errors.push(`Action ${index} missing type or type is not a string`);
      }
      if (!action.operation || typeof action.operation !== 'string') {
        errors.push(`Action ${index} missing operation or operation is not a string`);
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    intent: intent as ValidatedStructuredIntent,
  };
}

/**
 * Validate WorkflowDSL before compilation
 */
export function validateWorkflowDSL(dsl: WorkflowDSL): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dsl?: ValidatedWorkflowDSL;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dsl) {
    errors.push('WorkflowDSL is null or undefined');
    return { valid: false, errors, warnings };
  }

  if (!dsl.trigger || !dsl.trigger.type) {
    errors.push('WorkflowDSL missing trigger or trigger.type');
  }

  if (!dsl.dataSources || !Array.isArray(dsl.dataSources)) {
    errors.push('WorkflowDSL missing dataSources array');
  } else {
    dsl.dataSources.forEach((ds, index) => {
      if (!ds.id) {
        errors.push(`DataSource ${index} missing id`);
      }
      if (!ds.type) {
        errors.push(`DataSource ${index} missing type`);
      }
      if (!ds.operation) {
        errors.push(`DataSource ${index} missing operation`);
      }
    });
  }

  if (!dsl.transformations || !Array.isArray(dsl.transformations)) {
    warnings.push('WorkflowDSL missing transformations array (may be empty)');
  } else {
    dsl.transformations.forEach((tf, index) => {
      if (!tf.id) {
        errors.push(`Transformation ${index} missing id`);
      }
      if (!tf.type) {
        errors.push(`Transformation ${index} missing type`);
      }
      if (!tf.operation) {
        errors.push(`Transformation ${index} missing operation`);
      }
    });
  }

  if (!dsl.outputs || !Array.isArray(dsl.outputs) || dsl.outputs.length === 0) {
    errors.push('WorkflowDSL missing outputs array or outputs is empty');
  } else {
    dsl.outputs.forEach((out, index) => {
      if (!out.id) {
        errors.push(`Output ${index} missing id`);
      }
      if (!out.type) {
        errors.push(`Output ${index} missing type`);
      }
      if (!out.operation) {
        errors.push(`Output ${index} missing operation`);
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    dsl: dsl as ValidatedWorkflowDSL,
  };
}

/**
 * Validate Workflow after compilation
 */
export function validateWorkflow(workflow: Workflow): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  workflow?: ValidatedWorkflow;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!workflow) {
    errors.push('Workflow is null or undefined');
    return { valid: false, errors, warnings };
  }

  if (!workflow.nodes || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push('Workflow missing nodes array or nodes is empty');
  } else {
    workflow.nodes.forEach((node, index) => {
      if (!node.id) {
        errors.push(`Node ${index} missing id`);
      }
      const nodeType = node.type || node.data?.type;
      if (!nodeType) {
        errors.push(`Node ${index} missing type`);
      }
    });
  }

  if (!workflow.edges || !Array.isArray(workflow.edges)) {
    warnings.push('Workflow missing edges array (may be empty)');
  } else {
    const nodeIds = new Set(workflow.nodes?.map(n => n.id) || []);
    workflow.edges.forEach((edge, index) => {
      if (!edge.id) {
        errors.push(`Edge ${index} missing id`);
      }
      if (!edge.source) {
        errors.push(`Edge ${index} missing source`);
      } else if (!nodeIds.has(edge.source)) {
        errors.push(`Edge ${index} source node "${edge.source}" not found in workflow`);
      }
      if (!edge.target) {
        errors.push(`Edge ${index} missing target`);
      } else if (!nodeIds.has(edge.target)) {
        errors.push(`Edge ${index} target node "${edge.target}" not found in workflow`);
      }
    });
    
    // ✅ PHASE 3: Comprehensive validation - Check for orphan nodes
    const connectedNodeIds = new Set<string>();
    const triggerNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return unifiedNodeRegistry.isTrigger(nodeType);
    });
    triggerNodes.forEach(n => connectedNodeIds.add(n.id));
    workflow.edges.forEach(edge => connectedNodeIds.add(edge.target));
    const orphanNodes = workflow.nodes.filter(n => !connectedNodeIds.has(n.id));
    if (orphanNodes.length > 0) {
      errors.push(`Workflow has ${orphanNodes.length} orphan node(s) not reachable from trigger: ${orphanNodes.map(n => n.id).join(', ')}`);
    }

    // ✅ PHASE 3: Comprehensive validation - Check for cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const hasCycle = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      recStack.add(nodeId);
      const outgoingEdges = workflow.edges?.filter(e => e.source === nodeId) || [];
      for (const edge of outgoingEdges) {
        if (hasCycle(edge.target)) return true;
      }
      recStack.delete(nodeId);
      return false;
    };
    for (const node of workflow.nodes) {
      if (!visited.has(node.id) && hasCycle(node.id)) {
        errors.push('Workflow contains cycles. Workflows must be acyclic (DAG).');
        break;
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    workflow: workflow as ValidatedWorkflow,
  };
}
