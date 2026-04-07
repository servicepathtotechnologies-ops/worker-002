/**
 * Stable workflow topology fingerprinting for attach-inputs / attach-credentials guards.
 * Only structural identity (node ids + edge wiring semantics), not config/position.
 */

export interface WorkflowTopologyFingerprint {
  /** Stable hash string for equality checks */
  fingerprint: string;
  nodeIdsSorted: string[];
  edgeKeysSorted: string[];
}

function canonicalEdgeKey(edge: any, index: number): string {
  if (!edge || typeof edge !== 'object') {
    return `invalid|${index}`;
  }
  const src = String(edge.source ?? '');
  const tgt = String(edge.target ?? '');
  const sh = String(edge.sourceHandle ?? '');
  const th = String(edge.targetHandle ?? '');
  const typ = String(edge.type ?? '');
  const id = edge.id != null ? String(edge.id) : `idx:${index}`;
  return `${src}|${tgt}|${sh}|${th}|${typ}|${id}`;
}

/**
 * Build a deterministic topology fingerprint from nodes and edges.
 */
export function fingerprintWorkflowTopology(
  nodes: unknown,
  edges: unknown
): WorkflowTopologyFingerprint {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];

  const nodeIds = new Set<string>();
  for (const n of nodeList) {
    if (n && typeof n === 'object' && (n as any).id != null) {
      nodeIds.add(String((n as any).id));
    }
  }
  const nodeIdsSorted = [...nodeIds].sort();

  const edgeKeys = edgeList.map((e, i) => canonicalEdgeKey(e, i)).sort();
  const payload = JSON.stringify({ n: nodeIdsSorted, e: edgeKeys });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (Math.imul(31, hash) + payload.charCodeAt(i)) | 0;
  }
  const fingerprint = `tp_${nodeIdsSorted.length}_${edgeKeys.length}_${hash.toString(16)}`;

  return {
    fingerprint,
    nodeIdsSorted,
    edgeKeysSorted: edgeKeys,
  };
}

export interface TopologyDiff {
  equal: boolean;
  addedNodeIds: string[];
  removedNodeIds: string[];
  addedEdgeKeys: string[];
  removedEdgeKeys: string[];
}

export function diffWorkflowTopology(
  baseline: WorkflowTopologyFingerprint,
  current: WorkflowTopologyFingerprint
): TopologyDiff {
  const baseN = new Set(baseline.nodeIdsSorted);
  const curN = new Set(current.nodeIdsSorted);
  const addedNodeIds = [...curN].filter((id) => !baseN.has(id));
  const removedNodeIds = [...baseN].filter((id) => !curN.has(id));

  const baseE = new Set(baseline.edgeKeysSorted);
  const curE = new Set(current.edgeKeysSorted);
  const addedEdgeKeys = [...curE].filter((k) => !baseE.has(k));
  const removedEdgeKeys = [...baseE].filter((k) => !curE.has(k));

  const equal =
    addedNodeIds.length === 0 &&
    removedNodeIds.length === 0 &&
    addedEdgeKeys.length === 0 &&
    removedEdgeKeys.length === 0;

  return {
    equal,
    addedNodeIds,
    removedNodeIds,
    addedEdgeKeys,
    removedEdgeKeys,
  };
}
