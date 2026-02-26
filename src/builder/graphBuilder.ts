import { ResolvedNode } from '../resolver/nodeResolver';

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  operation: string;
  parameters: Record<string, any>;
  position?: [number, number];
}

export interface WorkflowConnection {
  from: string;
  to: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
}

/**
 * Build a simple linear workflow graph:
 * Trigger -> Data Sources -> Transformations -> Actions -> Storage
 *
 * If multiple nodes exist in a stage, they are chained in insertion order.
 * For now we keep this simple and deterministic.
 */
export function buildWorkflowGraph(nodes: ResolvedNode[]): WorkflowGraph {
  if (!nodes.length) {
    return { nodes: [], connections: [] };
  }

  const workflowNodes: WorkflowNode[] = nodes.map((n, index) => ({
    ...n,
    position: [index * 260, 0],
  }));

  const connections: WorkflowConnection[] = [];

  // Simple deterministic chaining by insertion order
  for (let i = 0; i < workflowNodes.length - 1; i++) {
    connections.push({
      from: workflowNodes[i].id,
      to: workflowNodes[i + 1].id,
    });
  }

  return {
    nodes: workflowNodes,
    connections,
  };
}

export default {
  buildWorkflowGraph,
};

