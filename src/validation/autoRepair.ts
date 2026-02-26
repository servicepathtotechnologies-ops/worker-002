import { WorkflowGraph } from '../builder/graphBuilder';

export interface AutoRepairResult {
  graph: WorkflowGraph;
  repairs: string[];
}

export function validateAndAutoRepair(graph: WorkflowGraph): AutoRepairResult {
  const repairs: string[] = [];
  const { nodes, connections } = graph;

  if (!nodes.length) {
    return { graph, repairs };
  }

  // Basic check: ensure linear connectivity (no obvious gaps)
  const connectedTargets = new Set(connections.map((c) => c.to));
  const sourceIds = new Set(connections.map((c) => c.from));

  const orphanNodes = nodes.filter(
    (n) => !sourceIds.has(n.id) && !connectedTargets.has(n.id) && n.type !== 'trigger',
  );

  if (orphanNodes.length > 0) {
    repairs.push(`Found ${orphanNodes.length} orphan nodes (not auto-fixed).`);
  }

  // Ensure there is exactly one trigger at the start
  const triggerNodes = nodes.filter((n) => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    repairs.push('Missing trigger node.');
  } else if (triggerNodes.length > 1) {
    repairs.push('Multiple trigger nodes detected.');
  }

  // NOTE: For now, we only report simple issues and keep the graph unchanged.
  // More sophisticated auto-repair (adding loop, merge, etc.) can be layered on later.

  return {
    graph,
    repairs,
  };
}

export default {
  validateAndAutoRepair,
};

