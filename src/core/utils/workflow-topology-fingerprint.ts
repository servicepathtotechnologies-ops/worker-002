/**
 * Stable workflow topology fingerprinting for attach-inputs / attach-credentials guards.
 * Only structural identity (node ids + edge wiring semantics), not config/position.
 */
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { isCredentialOwnership } from './field-ownership';

export interface WorkflowTopologyFingerprint {
  /** Stable hash string for equality checks */
  fingerprint: string;
  nodeIdsSorted: string[];
  edgeKeysSorted: string[];
}

export interface WorkflowProtectedConfigFingerprint {
  /** Stable hash string for equality checks */
  fingerprint: string;
  nodeKeysSorted: string[];
}

function canonicalEdgeKey(edge: any, index: number): string {
  if (!edge || typeof edge !== 'object') {
    return `invalid|${index}`;
  }
  const src = String(edge.source ?? '');
  const tgt = String(edge.target ?? '');
  const sh = String(edge.sourceHandle ?? '');
  const th = String(edge.targetHandle ?? '');
  // edge.type is a React Flow visual renderer hint ('default', 'step', 'smoothstep', etc.)
  // and is NOT a topology-defining property — normalizers may change it from branch labels
  // ('failed', 'success') to 'output' without changing the actual wiring. Exclude it so
  // cosmetic type changes don't trigger the topology mutation guard.
  const id = edge.id != null ? String(edge.id) : `idx:${index}`;
  return `${src}|${tgt}|${sh}|${th}|${id}`;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function stripCredentialOwnedConfig(nodeType: string, config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const inputSchema = unifiedNodeRegistry.get(nodeType)?.inputSchema || {};
  const volatileKeys = new Set(['credentialId', '_ownershipUnlock', '_fillMode']);
  for (const [k, v] of Object.entries(config || {})) {
    if (volatileKeys.has(k)) continue;
    const fieldDef = (inputSchema as any)?.[k];
    if (fieldDef && isCredentialOwnership(k, fieldDef)) continue;
    out[k] = v;
  }
  return out;
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

/**
 * Build a deterministic fingerprint for protected node config (all non-credential-owned fields).
 * Used to prevent post-freeze config drift while still allowing credential injection.
 */
export function fingerprintWorkflowProtectedConfig(nodes: unknown): WorkflowProtectedConfigFingerprint {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const nodeKeys: string[] = [];
  for (const n of nodeList) {
    if (!n || typeof n !== "object") continue;
    const node = n as any;
    const id = String(node.id || '');
    if (!id) continue;
    const semanticType = String(node?.data?.type || node.type || '');
    const cfg = (node?.data?.config || {}) as Record<string, unknown>;
    const protectedCfg = stripCredentialOwnedConfig(semanticType, cfg);
    nodeKeys.push(`${id}|${semanticType}|${stableStringify(protectedCfg)}`);
  }
  const nodeKeysSorted = nodeKeys.sort();
  const payload = JSON.stringify({ c: nodeKeysSorted });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (Math.imul(31, hash) + payload.charCodeAt(i)) | 0;
  }
  return {
    fingerprint: `cp_${nodeKeysSorted.length}_${hash.toString(16)}`,
    nodeKeysSorted,
  };
}

export interface ProtectedConfigDiff {
  equal: boolean;
  changedNodeIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
}

export function diffWorkflowProtectedConfig(
  baseline: WorkflowProtectedConfigFingerprint,
  current: WorkflowProtectedConfigFingerprint
): ProtectedConfigDiff {
  const parseNodeId = (row: string): string => String(row.split('|')[0] || '');
  const baseMap = new Map<string, string>();
  for (const row of baseline.nodeKeysSorted) baseMap.set(parseNodeId(row), row);
  const curMap = new Map<string, string>();
  for (const row of current.nodeKeysSorted) curMap.set(parseNodeId(row), row);

  const allNodeIds = new Set<string>([...baseMap.keys(), ...curMap.keys()]);
  const changedNodeIds: string[] = [];
  const addedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  for (const nodeId of allNodeIds) {
    const b = baseMap.get(nodeId);
    const c = curMap.get(nodeId);
    if (b && !c) {
      removedNodeIds.push(nodeId);
      continue;
    }
    if (!b && c) {
      addedNodeIds.push(nodeId);
      continue;
    }
    if (b !== c) {
      changedNodeIds.push(nodeId);
    }
  }

  return {
    equal: changedNodeIds.length === 0 && addedNodeIds.length === 0 && removedNodeIds.length === 0,
    changedNodeIds,
    addedNodeIds,
    removedNodeIds,
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
