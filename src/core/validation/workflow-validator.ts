/**
 * Workflow Validator
 * 
 * Validates entire workflow before save/execution.
 * Ensures save-time validation guarantees run-time success.
 */

import { nodeDefinitionRegistry } from '../types/node-definition';

export interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label?: string;
    type: string;
    config: Record<string, any>;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Validate all node inputs in workflow
 */
export function validateAllNodeInputs(nodes: WorkflowNode[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  for (const node of nodes) {
    const nodeType = node.data?.type || node.type;
    const definition = nodeDefinitionRegistry.get(nodeType);

    if (!definition) {
      warnings.push(`Node ${node.id} has unknown type: ${nodeType}`);
      continue;
    }

    // Get inputs from node config
    const inputs = node.data?.config || {};

    // Validate inputs against schema
    const validation = definition.validateInputs(inputs);
    if (!validation.valid) {
      for (const errorMsg of validation.errors) {
        errors.push({
          code: 'INVALID_NODE_INPUTS',
          message: errorMsg,
          nodeId: node.id,
          field: errorMsg.includes('conditions') ? 'conditions' : undefined,
        });
      }
    }

    // Check required inputs with conditional validation
    for (const requiredField of definition.requiredInputs) {
      // ✅ CRITICAL: Conditional validation for Gmail node
      // messageId is only required when operation === 'get', not for 'send'
      if (nodeType === 'google_gmail' && requiredField === 'messageId') {
        const operation = inputs.operation || 'send';
        if (operation !== 'get') {
          console.log(`[ValidateAllNodeInputs] Skipping messageId validation for Gmail - operation is '${operation}', not 'get'`);
          continue; // Skip messageId validation for non-get operations
        }
      }

      const value = inputs[requiredField];
      if (value === undefined || value === null || value === '') {
        // Check if it's an array that's empty
        if (Array.isArray(value) && value.length === 0) {
          errors.push({
            code: 'MISSING_REQUIRED_INPUT',
            message: `Node "${node.data?.label || node.id}" is missing required input: ${requiredField}`,
            nodeId: node.id,
            field: requiredField,
          });
        } else if (!Array.isArray(value)) {
          errors.push({
            code: 'MISSING_REQUIRED_INPUT',
            message: `Node "${node.data?.label || node.id}" is missing required input: ${requiredField}`,
            nodeId: node.id,
            field: requiredField,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate workflow graph topology
 * (Uses existing workflowGraphValidator, but ensures it works with WorkflowNode type)
 */
export function validateWorkflowTopology(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  // Convert to format expected by workflowGraphValidator
  const reactFlowNodes = nodes.map(n => ({
    id: n.id,
    data: {
      type: n.data?.type || n.type,
      label: n.data?.label || n.id,
    },
  }));

  const reactFlowEdges = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));

  // Import and use existing validator
  const { validateWorkflowGraph } = require('../../ctrl_checks/src/lib/workflowGraphValidator');
  return validateWorkflowGraph(reactFlowNodes, reactFlowEdges);
}

/**
 * Complete workflow validation (topology + inputs)
 */
export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  const topologyResult = validateWorkflowTopology(nodes, edges);
  const inputsResult = validateAllNodeInputs(nodes);

  return {
    valid: topologyResult.valid && inputsResult.valid,
    errors: [...topologyResult.errors, ...inputsResult.errors],
    warnings: [...topologyResult.warnings, ...inputsResult.warnings],
  };
}
