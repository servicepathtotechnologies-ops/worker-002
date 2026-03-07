/**
 * ✅ PHASE 3: Immutable Helpers
 * 
 * Provides immutable operations to replace state mutations.
 * This fixes Root Cause #8: Complex State Management
 */

import { WorkflowNode, WorkflowEdge, Workflow } from '../types/ai-types';
import { WorkflowDSL, DSLDataSource, DSLTransformation, DSLOutput } from '../../services/ai/workflow-dsl';

/**
 * Immutably add node to workflow
 */
export function addNode(workflow: Workflow, node: WorkflowNode): Workflow {
  return {
    ...workflow,
    nodes: [...workflow.nodes, node],
  };
}

/**
 * Immutably add edge to workflow
 */
export function addEdge(workflow: Workflow, edge: WorkflowEdge): Workflow {
  return {
    ...workflow,
    edges: [...workflow.edges, edge],
  };
}

/**
 * Immutably add multiple edges to workflow
 */
export function addEdges(workflow: Workflow, edges: WorkflowEdge[]): Workflow {
  return {
    ...workflow,
    edges: [...workflow.edges, ...edges],
  };
}

/**
 * Immutably update node in workflow
 */
export function updateNode(workflow: Workflow, nodeId: string, updates: Partial<WorkflowNode>): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    ),
  };
}

/**
 * Immutably remove node from workflow
 */
export function removeNode(workflow: Workflow, nodeId: string): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.filter(node => node.id !== nodeId),
    edges: workflow.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId),
  };
}

/**
 * Immutably remove edge from workflow
 */
export function removeEdge(workflow: Workflow, edgeId: string): Workflow {
  return {
    ...workflow,
    edges: workflow.edges.filter(edge => edge.id !== edgeId),
  };
}

/**
 * Immutably add data source to DSL
 */
export function addDataSource(dsl: WorkflowDSL, dataSource: DSLDataSource): WorkflowDSL {
  return {
    ...dsl,
    dataSources: [...dsl.dataSources, dataSource],
  };
}

/**
 * Immutably add transformation to DSL
 */
export function addTransformation(dsl: WorkflowDSL, transformation: DSLTransformation): WorkflowDSL {
  return {
    ...dsl,
    transformations: [...dsl.transformations, transformation],
  };
}

/**
 * Immutably add output to DSL
 */
export function addOutput(dsl: WorkflowDSL, output: DSLOutput): WorkflowDSL {
  return {
    ...dsl,
    outputs: [...dsl.outputs, output],
  };
}

/**
 * Immutably update DSL node
 */
export function updateDSLNode(
  dsl: WorkflowDSL,
  category: 'dataSource' | 'transformation' | 'output',
  nodeId: string,
  updates: Partial<DSLDataSource | DSLTransformation | DSLOutput>
): WorkflowDSL {
  if (category === 'dataSource') {
    return {
      ...dsl,
      dataSources: dsl.dataSources.map(ds => ds.id === nodeId ? { ...ds, ...updates } as DSLDataSource : ds),
    };
  } else if (category === 'transformation') {
    return {
      ...dsl,
      transformations: dsl.transformations.map(tf => tf.id === nodeId ? { ...tf, ...updates } as DSLTransformation : tf),
    };
  } else {
    return {
      ...dsl,
      outputs: dsl.outputs.map(out => out.id === nodeId ? { ...out, ...updates } as DSLOutput : out),
    };
  }
}
