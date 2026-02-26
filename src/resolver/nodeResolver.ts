import { WorkflowSpec } from '../planner/types';

export interface ResolvedNode {
  id: string;
  name: string;
  type: string;
  operation: string;
  parameters: Record<string, any>;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function resolveNodesFromSpec(spec: WorkflowSpec): ResolvedNode[] {
  const nodes: ResolvedNode[] = [];

  // Trigger node
  const triggerId = nextId('trigger');
  nodes.push({
    id: triggerId,
    name: `${spec.trigger}_trigger`,
    type: 'trigger',
    operation: spec.trigger,
    parameters: {},
  });

  // Data source nodes (read)
  for (const source of spec.data_sources) {
    const id = nextId('source');
    nodes.push({
      id,
      name: `${source}.read`,
      type: source,
      operation: 'read',
      parameters: {},
    });
  }

  // Transformation nodes (logic)
  for (const t of spec.transformations) {
    const id = nextId('transform');
    nodes.push({
      id,
      name: t,
      type: t,
      operation: t,
      parameters: {},
    });
  }

  // Action nodes (write/side-effects)
  for (const action of spec.actions) {
    const [service, op] = action.split('.');
    const id = nextId('action');
    nodes.push({
      id,
      name: action,
      type: service || action,
      operation: op || 'execute',
      parameters: {},
    });
  }

  // Storage nodes
  for (const storage of spec.storage) {
    const id = nextId('storage');
    nodes.push({
      id,
      name: `${storage}.write`,
      type: storage,
      operation: 'write',
      parameters: {},
    });
  }

  // mentioned_only are intentionally ignored for node creation

  return nodes;
}

export default {
  resolveNodesFromSpec,
};

