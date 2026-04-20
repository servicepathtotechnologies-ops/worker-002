import { createHash } from 'crypto';
import type { Workflow } from '../types/ai-types';
import type {
  AuthorizedNodeEntry,
  ManifestStructuredIntent,
  WorkflowBuildManifestV1,
} from '../types/workflow-build-manifest';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import type { SelectedNode } from '../../services/ai/system-prompt-builder';
import type { StructuredIntent } from '../../services/ai/stages/intent-stage';
import type { FieldOwnershipMap } from '../../services/ai/stages/field-ownership-stage';
import type { ManifestFieldOwnershipSnapshot } from '../types/workflow-build-manifest';

/** Stable JSON for integrity hashing (sorted object keys). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const obj = value as Record<string, unknown>;
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function computeManifestContentHash(payload: Omit<WorkflowBuildManifestV1, 'integrity'>): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function verifyBuildManifestIntegrity(manifest: WorkflowBuildManifestV1): boolean {
  const { integrity, ...rest } = manifest;
  if (!integrity?.contentHash) return false;
  return computeManifestContentHash(rest as Omit<WorkflowBuildManifestV1, 'integrity'>) === integrity.contentHash;
}

export function sealWorkflowBuildManifest(
  draft: Omit<WorkflowBuildManifestV1, 'integrity'>,
): WorkflowBuildManifestV1 {
  const contentHash = computeManifestContentHash(draft);
  return {
    ...draft,
    integrity: { contentHash },
  };
}

export function toManifestStructuredIntent(intent: StructuredIntent): ManifestStructuredIntent {
  return {
    intent: intent.intent,
    triggerType: intent.triggerType,
    actions: [...intent.actions],
    dataFlows: intent.dataFlows.map((d) => ({ ...d })),
    constraints: [...intent.constraints],
  };
}

export function toAuthorizedNodeEntries(selected: SelectedNode[]): AuthorizedNodeEntry[] {
  return selected.map((n) => ({
    registryType: n.type,
    nodeId: n.nodeId,
    role: n.role,
    reason: n.reason,
  }));
}

/**
 * Linear when no selected node type is registry-branching (if_else, switch, …).
 */
export function inferLinearBranchingFromSelection(selected: SelectedNode[]): boolean {
  for (const n of selected) {
    if (unifiedNodeRegistry.allowsBranching(n.type)) {
      return false;
    }
  }
  return true;
}

/**
 * Trigger first, preserve middle order, terminal last — for deterministic plan chains.
 */
export function sortSelectedNodesForLinearChain(selected: SelectedNode[]): SelectedNode[] {
  const triggers = selected.filter((n) => n.role === 'trigger');
  const terminals = selected.filter((n) => n.role === 'terminal');
  const middle = selected.filter((n) => n.role !== 'trigger' && n.role !== 'terminal');
  return [...triggers, ...middle, ...terminals];
}

/**
 * Plan chain tokens: plain canonical types in execution order (linear graphs).
 */
export function linearPlanChainFromSelection(selected: SelectedNode[]): string[] {
  return sortSelectedNodesForLinearChain(selected).map((n) => n.type);
}

/**
 * When mandatory node types include non-triggers, restrict selection to that set (authoritative chain).
 */
export function applyMandatoryNodeFilterToSelection(
  nodes: SelectedNode[],
  mandatory?: string[],
): SelectedNode[] | { error: 'empty_mandatory_intersection' } {
  if (!mandatory || mandatory.length === 0) return nodes;
  const mset = new Set(mandatory);
  const hasNonTriggerMandatory = mandatory.some((t) => !unifiedNodeRegistry.isTrigger(t));
  if (!hasNonTriggerMandatory) return nodes;
  const filtered = nodes.filter((n) => mset.has(n.type));
  if (filtered.length === 0) return { error: 'empty_mandatory_intersection' };
  return filtered;
}

export function serializeFieldOwnershipSnapshot(map: FieldOwnershipMap): ManifestFieldOwnershipSnapshot {
  const out: ManifestFieldOwnershipSnapshot = {};
  for (const [nid, fields] of Object.entries(map)) {
    out[nid] = {};
    for (const [k, v] of Object.entries(fields)) {
      out[nid][k] = String(v);
    }
  }
  return out;
}

/**
 * Prefer a registry type tagged terminal/sink (log_output is registered with terminal tag).
 */
export function resolvePreferredTerminalNodeType(): string {
  const types = unifiedNodeRegistry.getAllTypes();
  const terminalTagged = types.filter(
    (t) =>
      unifiedNodeRegistry.hasTag(t, 'terminal') &&
      unifiedNodeRegistry.hasTag(t, 'sink'),
  );
  // Prefer nodes with isTerminal flag
  const terminalWithFlag = terminalTagged.find((t) => {
    const def = unifiedNodeRegistry.get(t);
    return def?.isTerminal === true;
  });
  if (terminalWithFlag) return terminalWithFlag;
  if (terminalTagged.length > 0) return terminalTagged[0];
  const anyTerminal = types.find((t) => unifiedNodeRegistry.hasTag(t, 'terminal'));
  // Fallback: find any node with isTerminal flag
  if (!anyTerminal) {
    const terminalFlagged = types.find((t) => {
      const def = unifiedNodeRegistry.get(t);
      return def?.isTerminal === true;
    });
    if (terminalFlagged) return terminalFlagged;
  }
  return anyTerminal ?? 'log_output'; // Ultimate fallback
}

type Multiset = Map<string, number>;

function typeMultiset(nodes: { type: string }[]): Multiset {
  const m = new Map<string, number>();
  for (const n of nodes) {
    const t = n.type;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

function manifestMultiset(entries: AuthorizedNodeEntry[]): Multiset {
  const m = new Map<string, number>();
  for (const e of entries) {
    m.set(e.registryType, (m.get(e.registryType) ?? 0) + 1);
  }
  return m;
}

function multisetsEqual(a: Multiset, b: Multiset): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if ((b.get(k) ?? 0) !== v) return false;
  }
  return true;
}

/**
 * After graph materialization, bind manifest authorized entries to final node ids (LLM or deterministic).
 */
export function buildAuthorizedEntriesFromFinalWorkflow(
  workflow: Workflow,
  selected: SelectedNode[],
): AuthorizedNodeEntry[] {
  const byId = new Map(selected.map((s) => [s.nodeId, s]));
  return workflow.nodes.map((n) => {
    const type = (n.data?.type || n.type) as string;
    const sel = byId.get(n.id);
    return {
      registryType: type,
      nodeId: n.id,
      role: sel?.role ?? 'action',
      reason: sel?.reason,
    };
  });
}

/**
 * Deterministic linear plan chain creates new node ids — align roles by index with sorted selection.
 */
export function buildAuthorizedEntriesFromLinearWorkflow(
  workflow: Workflow,
  selected: SelectedNode[],
): AuthorizedNodeEntry[] {
  const sortedSel = sortSelectedNodesForLinearChain(selected);
  return workflow.nodes.map((n, i) => {
    const type = (n.data?.type || n.type) as string;
    const sel = sortedSel[i];
    return {
      registryType: type,
      nodeId: n.id,
      role: sel?.role ?? 'action',
      reason: sel?.reason,
    };
  });
}

export function buildAuthorizedEntriesForPipeline(
  workflow: Workflow,
  selected: SelectedNode[],
  linearDeterministic: boolean,
): AuthorizedNodeEntry[] {
  if (linearDeterministic) {
    return buildAuthorizedEntriesFromLinearWorkflow(workflow, selected);
  }
  return buildAuthorizedEntriesFromFinalWorkflow(workflow, selected);
}

/**
 * Gate B: workflow node types (multiset) match manifest authorized node types.
 */
export function workflowAuthorizedMultisetMatches(
  workflow: Workflow,
  manifest: WorkflowBuildManifestV1,
): { ok: boolean; detail?: string } {
  const wfTypes = typeMultiset(workflow.nodes.map((n) => ({ type: (n.data?.type || n.type) as string })));
  const auth = manifestMultiset(manifest.authorizedNodes);
  if (!multisetsEqual(wfTypes, auth)) {
    return {
      ok: false,
      detail: 'workflow node type multiset does not match manifest authorizedNodes',
    };
  }
  return { ok: true };
}
