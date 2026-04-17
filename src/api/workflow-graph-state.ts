import crypto from 'crypto';

type WorkflowRowLike = {
  id?: string;
  graph?: unknown;
  nodes?: unknown;
  edges?: unknown;
  metadata?: unknown;
};

type GraphSource = 'graph' | 'columns' | 'empty';

export interface ResolvedWorkflowGraphState {
  nodes: any[];
  edges: any[];
  source: GraphSource;
  inSync: boolean;
  needsHealing: boolean;
  reason: string;
}

function parseArrayField(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseGraphObject(rawGraph: unknown): { nodes: any[]; edges: any[] } | null {
  if (!rawGraph) return null;
  let candidate: any = rawGraph;
  if (typeof rawGraph === 'string') {
    try {
      candidate = JSON.parse(rawGraph);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    nodes: parseArrayField((candidate as any).nodes),
    edges: parseArrayField((candidate as any).edges),
  };
}

function hashGraph(nodes: any[], edges: any[]): string {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ nodes, edges }))
    .digest('hex');
}

function hasGraphShape(nodes: any[], edges: any[]): boolean {
  return nodes.length > 0 || edges.length > 0;
}

export function resolveWorkflowGraphState(workflow: WorkflowRowLike): ResolvedWorkflowGraphState {
  const columnNodes = parseArrayField(workflow.nodes);
  const columnEdges = parseArrayField(workflow.edges);
  const graphObject = parseGraphObject(workflow.graph);

  if (!graphObject) {
    if (hasGraphShape(columnNodes, columnEdges)) {
      return {
        nodes: columnNodes,
        edges: columnEdges,
        source: 'columns',
        inSync: true,
        needsHealing: true,
        reason: 'graph_missing_or_invalid',
      };
    }
    return {
      nodes: [],
      edges: [],
      source: 'empty',
      inSync: true,
      needsHealing: false,
      reason: 'graph_empty',
    };
  }

  const graphNodes = graphObject.nodes;
  const graphEdges = graphObject.edges;
  const graphHasContent = hasGraphShape(graphNodes, graphEdges);
  const columnsHaveContent = hasGraphShape(columnNodes, columnEdges);

  if (!graphHasContent && columnsHaveContent) {
    return {
      nodes: columnNodes,
      edges: columnEdges,
      source: 'columns',
      inSync: true,
      needsHealing: true,
      reason: 'graph_empty_columns_present',
    };
  }

  if (graphHasContent && !columnsHaveContent) {
    return {
      nodes: graphNodes,
      edges: graphEdges,
      source: 'graph',
      inSync: true,
      needsHealing: true,
      reason: 'columns_empty_graph_present',
    };
  }

  if (!graphHasContent && !columnsHaveContent) {
    return {
      nodes: [],
      edges: [],
      source: 'empty',
      inSync: true,
      needsHealing: false,
      reason: 'graph_and_columns_empty',
    };
  }

  const graphHash = hashGraph(graphNodes, graphEdges);
  const columnsHash = hashGraph(columnNodes, columnEdges);
  if (graphHash === columnsHash) {
    return {
      nodes: graphNodes,
      edges: graphEdges,
      source: 'graph',
      inSync: true,
      needsHealing: false,
      reason: 'graph_columns_in_sync',
    };
  }

  return {
    nodes: columnNodes,
    edges: columnEdges,
    source: 'columns',
    inSync: false,
    needsHealing: true,
    reason: 'graph_columns_mismatch_columns_authoritative',
  };
}

export function buildSyncedGraphPayload(nodes: any[], edges: any[], metadata?: unknown): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nodes,
    edges,
  };
  if (metadata && typeof metadata === 'object') {
    payload.metadata = metadata;
  }
  return payload;
}
