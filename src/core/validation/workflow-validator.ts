/**
 * Workflow Validator
 * 
 * Validates entire workflow before save/execution.
 * Ensures save-time validation guarantees run-time success.
 */

import { validateNodeConfig as validateNodeConfigFromRegistry } from './schema-based-validator';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { normalizeNodeType } from '../utils/node-type-normalizer';

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
    const nodeType = normalizeNodeType(node as any) || node.data?.type || node.type;
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) {
      warnings.push(`Node ${node.id} has unknown type: ${nodeType}`);
      continue;
    }

    const validation = validateNodeConfigFromRegistry(node as any);
    if (!validation.valid) {
      for (const errorMsg of validation.errors) {
        errors.push({
          code: 'INVALID_NODE_INPUTS',
          message: errorMsg,
          nodeId: node.id,
        });
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
