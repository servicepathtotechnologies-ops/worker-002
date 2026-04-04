/**
 * Deterministic switch case → downstream node mapping for plan-driven graphs.
 * Single source of truth shared by summarize-layer and plan-driven-workflow-builder.
 */

import type { WorkflowNode } from '../../core/types/ai-types';
import type { CaseNodeMapping } from '../../core/types/unified-node-contract';
import type { SwitchContext } from '../../core/orchestration/unified-graph-orchestrator';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { planSwitchCasesFromPrompt } from './switch-case-plan';
import { stripPlanTokenToType } from './plan-chain-prune';

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
  rawUserPrompt: string,
  nodeIdsByChainIndex?: string[]
): CaseNodeMapping | undefined {
  const switchIdx = resolvedChain.findIndex((t) => stripPlanTokenToType(t) === 'switch');
  if (switchIdx === -1) return undefined;

  const upstreamNodeType =
    switchIdx > 0 ? stripPlanTokenToType(resolvedChain[switchIdx - 1]) : undefined;
  const switchPlan = planSwitchCasesFromPrompt(rawUserPrompt, upstreamNodeType);

  if (!switchPlan.cases || switchPlan.cases.length === 0) return undefined;

  const downstreamTokens: string[] = [];
  const downstreamNodeIds: (string | undefined)[] = [];

  for (let i = switchIdx + 1; i < resolvedChain.length; i++) {
    const t = resolvedChain[i];
    if (stripPlanTokenToType(t) === 'log_output') continue;
    downstreamTokens.push(t);
    downstreamNodeIds.push(
      nodeIdsByChainIndex && nodeIdsByChainIndex.length > i ? nodeIdsByChainIndex[i] : undefined
    );
  }

  if (downstreamTokens.length === 0) return undefined;

  const mapping: CaseNodeMapping = {};

  for (let i = 0; i < switchPlan.cases.length; i++) {
    const caseValue = switchPlan.cases[i].value;
    const rawToken = downstreamTokens[i] ?? downstreamTokens[i % downstreamTokens.length];
    const descriptor = parseTargetDescriptor(rawToken);
    const explicitId = downstreamNodeIds[i] ?? downstreamNodeIds[i % downstreamNodeIds.length];

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
  rawUserPrompt: string
): SwitchContext | undefined {
  const switchIdx = resolvedChain.findIndex((t) => stripPlanTokenToType(t) === 'switch');
  if (switchIdx < 0 || switchIdx >= nodes.length) return undefined;

  const switchNode = nodes[switchIdx];
  const nt = unifiedNormalizeNodeTypeString(switchNode.type || switchNode.data?.type || '');
  if (nt !== 'switch') return undefined;

  const nodeIdsByChainIndex = nodes.map((n) => n.id);
  const caseNodeMapping = buildCaseNodeMappingFromPlanChain(
    resolvedChain,
    rawUserPrompt,
    nodeIdsByChainIndex
  );

  if (!caseNodeMapping || Object.keys(caseNodeMapping).length === 0) return undefined;

  return {
    switchNodeId: switchNode.id,
    caseNodeMapping,
  };
}
