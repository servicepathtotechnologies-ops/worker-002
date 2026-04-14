/**
 * Deterministic switch case → downstream node mapping for plan-driven graphs.
 * Single source of truth shared by summarize-layer and plan-driven-workflow-builder.
 */

import type { WorkflowNode } from '../../core/types/ai-types';
import type { CaseNodeMapping } from '../../core/types/unified-node-contract';
import type { SwitchContext } from '../../core/orchestration/unified-graph-orchestrator';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { extractSwitchCasePortNames } from '../../core/utils/branching-node-ports';
import { extractBranchTag, stripPlanTokenToType } from './plan-chain-prune';

function parseTargetDescriptor(raw: string): { targetNodeType: string; targetNodeId?: string } {
  const hashIdx = raw.indexOf('#');
  const atIdx = raw.indexOf('@');
  const sepIdx = hashIdx > 0 && atIdx > 0 ? Math.min(hashIdx, atIdx) : Math.max(hashIdx, atIdx);
  if (sepIdx > 0 && sepIdx < raw.length - 1) {
    return {
      targetNodeType: raw.slice(0, sepIdx),
      targetNodeId: raw.slice(sepIdx + 1),
    };
  }
  return { targetNodeType: raw };
}

/**
 * Build caseNodeMapping: each extracted case value maps to the i-th non-terminal node after `switch`
 * in the plan chain, using explicit node IDs when available so duplicate types (e.g. two Gmail) wire correctly.
 */
export function buildCaseNodeMappingFromPlanChain(
  resolvedChain: string[],
  _rawUserPrompt?: string,
  nodeIdsByChainIndex?: string[],
  switchIndex?: number,
  switchCaseValues?: string[]
): CaseNodeMapping | undefined {
  const switchIdx =
    typeof switchIndex === 'number'
      ? switchIndex
      : resolvedChain.findIndex((t) => stripPlanTokenToType(t) === 'switch');
  if (switchIdx === -1) return undefined;

  // Universal deterministic case authority:
  // 1) explicit switch config cases from registry-backed node config
  // 2) branch tags encoded in plan tokens (e.g. node_type[case_x])
  // 3) structural fallback case_N based on nearest downstream candidates
  let resolvedCaseValues = Array.isArray(switchCaseValues)
    ? switchCaseValues.map((c) => String(c || '').trim()).filter(Boolean)
    : [];

  const downstreamTokens: string[] = [];
  const downstreamNodeIds: (string | undefined)[] = [];
  const inferredFromBranchTags: string[] = [];

  for (let i = switchIdx + 1; i < resolvedChain.length; i++) {
    const t = resolvedChain[i];
    if (stripPlanTokenToType(t) === 'log_output') continue;
    downstreamTokens.push(t);
    downstreamNodeIds.push(
      nodeIdsByChainIndex && nodeIdsByChainIndex.length > i ? nodeIdsByChainIndex[i] : undefined
    );
    const branchTag = extractBranchTag(t);
    if (branchTag && !inferredFromBranchTags.includes(branchTag)) {
      inferredFromBranchTags.push(branchTag);
    }

    // Use nearest downstream nodes for this switch context only.
    // This prevents earlier switches from consuming far-tail nodes in nested plans.
    const requiredTargets = resolvedCaseValues.length > 0 ? resolvedCaseValues.length : 0;
    if (requiredTargets > 0 && downstreamTokens.length >= requiredTargets) break;
  }

  if (downstreamTokens.length === 0) return undefined;
  if (resolvedCaseValues.length === 0 && inferredFromBranchTags.length > 0) {
    resolvedCaseValues = inferredFromBranchTags;
  }
  if (resolvedCaseValues.length === 0) {
    resolvedCaseValues = downstreamTokens.map((_, i) => `case_${i + 1}`);
  }

  const mapping: CaseNodeMapping = {};

  for (let i = 0; i < resolvedCaseValues.length; i++) {
    if (i >= downstreamTokens.length) break;
    const caseValue = resolvedCaseValues[i];
    const rawToken = downstreamTokens[i];
    const descriptor = parseTargetDescriptor(rawToken);
    const explicitId = downstreamNodeIds[i];

    mapping[caseValue] = {
      targetNodeType: descriptor.targetNodeType,
      targetNodeId: descriptor.targetNodeId ?? explicitId,
      slot: `case_${i + 1}`,
    };
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

/**
 * Build SwitchContext for `initializeWorkflow` after plan nodes are materialized (same order as resolvedChain).
 */
export function computeSwitchContextForPlanChain(
  nodes: WorkflowNode[],
  resolvedChain: string[],
  rawUserPrompt?: string
): SwitchContext | undefined {
  const nodeIdsByChainIndex = nodes.map((n) => n.id);
  const switchContexts: Array<{ switchNodeId: string; caseNodeMapping: CaseNodeMapping }> = [];

  for (let i = 0; i < resolvedChain.length; i++) {
    if (stripPlanTokenToType(resolvedChain[i]) !== 'switch') continue;
    if (i < 0 || i >= nodes.length) continue;
    const switchNode = nodes[i];
    const nt = unifiedNormalizeNodeTypeString(switchNode.data?.type || switchNode.type || '');
    if (nt !== 'switch') continue;
    const switchCaseValues = extractSwitchCasePortNames(
      (switchNode.data?.config || {}) as Record<string, any>
    );
    const caseNodeMapping = buildCaseNodeMappingFromPlanChain(
      resolvedChain,
      rawUserPrompt,
      nodeIdsByChainIndex,
      i,
      switchCaseValues
    );
    if (!caseNodeMapping || Object.keys(caseNodeMapping).length === 0) continue;
    switchContexts.push({
      switchNodeId: switchNode.id,
      caseNodeMapping,
    });
  }

  if (switchContexts.length === 0) return undefined;
  // Backward compatible: first context remains available via legacy fields.
  return {
    switchNodeId: switchContexts[0].switchNodeId,
    caseNodeMapping: switchContexts[0].caseNodeMapping,
    switchContexts,
  } as SwitchContext;
}
