/**
 * Plan-driven workflow construction: builds a workflow graph that matches
 * WorkflowIntentPlan.proposedNodeChain exactly (no extra helper nodes).
 *
 * Uses unified-node-registry for defaults and unified-graph-orchestrator for edges.
 */

import { randomUUID } from 'crypto';
import { Workflow, WorkflowNode } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../../core/orchestration';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { resolveCanonicalNodeTypeStrict } from '../../core/utils/node-type-resolver-util';
import { coerceFieldFillModeByPolicy } from '../../core/utils/fill-mode-resolver';
import { materializeStructuralFields } from './structure-materializer';
import { applyStructuralIntentAlignment } from './intent-structural-projection';
import { normalizeWorkflowFormFieldIdentities } from '../../core/utils/form-field-identity';
import { isEmptyConfigValue } from '../../core/validation/registry-field-contract';
import { hydrateRequiredConfigFromRegistryDefaults } from '../../core/validation/workflow-config-hydrator';
import { computeSwitchContextForPlanChain } from './switch-case-node-mapping';
import { formatPlanChainToken, stripPlanTokenToType, extractBranchTag } from './plan-chain-prune';

export interface CanonicalizationEntry {
  input: string;
  normalized?: string;
  status: 'accepted' | 'rejected';
  reason?: string;
}

export interface PlanBuildDiagnostics {
  canonicalization: CanonicalizationEntry[];
  resolvedChain: string[];
  unknownTypes: string[];
  branchCoverage: {
    branchingNodes: number;
    branchEdges: number;
  };
}

export interface PlanDrivenBuildResult {
  success: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
  resolvedChain: string[];
  diagnostics: PlanBuildDiagnostics;
}

function buildSingleRetrySwitchContext(original: any): any {
  if (!original) return original;
  const normalizeContext = (ctx: any) => {
    const caseNodeMapping = Object.entries(ctx?.caseNodeMapping || {}).reduce((acc: any, [k, v]: [string, any]) => {
      acc[k] = {
        targetNodeType: v?.targetNodeType,
        slot: v?.slot,
      };
      return acc;
    }, {});
    return {
      switchNodeId: ctx?.switchNodeId,
      caseNodeMapping,
    };
  };
  const switchContexts = Array.isArray(original?.switchContexts)
    ? original.switchContexts.map((ctx: any) => normalizeContext(ctx))
    : [normalizeContext(original)];
  return {
    ...normalizeContext(original),
    switchContexts,
  };
}

function parsePlanNodeToken(raw: string): { nodeTypeToken: string; explicitNodeId?: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { nodeTypeToken: '' };
  const hashIdx = trimmed.indexOf('#');
  const atIdx = trimmed.indexOf('@');
  const sepIdx =
    hashIdx > 0 && atIdx > 0 ? Math.min(hashIdx, atIdx) : Math.max(hashIdx, atIdx);
  if (sepIdx > 0 && sepIdx < trimmed.length - 1) {
    return {
      nodeTypeToken: trimmed.slice(0, sepIdx).trim(),
      explicitNodeId: trimmed.slice(sepIdx + 1).trim(),
    };
  }
  return { nodeTypeToken: trimmed };
}

/**
 * Normalize a node type from the structured plan to a registry-backed type.
 * Handles annotated tokens like `google_gmail[true]` by stripping the branch tag
 * before registry lookup.
 */
export function resolvePlanNodeType(raw: string): { normalized: string; error?: string } {
  // Use stripPlanTokenToType which handles both [branchTag] and #id/@id annotations
  const canonicalType = stripPlanTokenToType(raw);
  if (!canonicalType) {
    return { normalized: '', error: 'Empty node type in plan chain' };
  }
  try {
    return { normalized: resolveCanonicalNodeTypeStrict(canonicalType) };
  } catch (e: any) {
    return {
      normalized: canonicalType,
      error: e?.message || `Unknown or unregistered node type "${canonicalType}"`,
    };
  }
}

/**
 * @param planChain - Canonical registry node types in execution order.
 * @param rawUserPrompt - Optional original user prompt (not the full structured plan blob). When set and the chain contains `switch`, case edges are wired deterministically before edge reconciliation.
 */
export function buildWorkflowFromPlanChain(planChain: string[], rawUserPrompt?: string): PlanDrivenBuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolvedChain: string[] = [];
  const canonicalization: CanonicalizationEntry[] = [];

  if (!Array.isArray(planChain) || planChain.length === 0) {
    return {
      success: false,
      errors: ['planProposedNodeChain must be a non-empty array'],
      warnings,
      resolvedChain,
      diagnostics: {
        canonicalization: [{ input: 'planProposedNodeChain', status: 'rejected', reason: 'empty_chain' }],
        resolvedChain,
        unknownTypes: [],
        branchCoverage: { branchingNodes: 0, branchEdges: 0 },
      },
    };
  }

  const nodes: WorkflowNode[] = [];
  const usedNodeIds = new Set<string>();

  for (const raw of planChain) {
    const { explicitNodeId } = parsePlanNodeToken(raw);
    const { normalized, error } = resolvePlanNodeType(raw);
    if (error || !normalized) {
      canonicalization.push({
        input: raw,
        normalized: normalized || undefined,
        status: 'rejected',
        reason: error || 'invalid_node_type',
      });
      errors.push(error || `Invalid type: ${raw}`);
      continue;
    }
    canonicalization.push({ input: raw, normalized, status: 'accepted' });
    resolvedChain.push(formatPlanChainToken(raw, normalized));

    const def = unifiedNodeRegistry.get(normalized);
    if (!def) {
      errors.push(`Registry missing definition for ${normalized}`);
      continue;
    }

    const config = typeof def.defaultConfig === 'function' ? def.defaultConfig() : {} as Record<string, unknown>;
    // Universal planner invariant:
    // if required fields are missing at plan stage, select the policy-safe deferred owner.
    const requiredInputs = Array.isArray(def.requiredInputs) ? def.requiredInputs : [];
    for (const field of requiredInputs) {
      const value = (config as Record<string, unknown>)[field];
      const missing = isEmptyConfigValue(value);
      if (missing) {
        if (!(config as any)._fillMode || typeof (config as any)._fillMode !== 'object') {
          (config as any)._fillMode = {};
        }
        (config as any)._fillMode[field] = coerceFieldFillModeByPolicy(
          field,
          'runtime_ai',
          def.inputSchema,
          config as Record<string, any>
        ).mode;
      }
    }

    let id = explicitNodeId || `node_${randomUUID()}`;
    // When a branchTag is present (e.g. google_gmail[true]), incorporate it into the ID
    // so same-type branch nodes get distinct IDs.
    const branchTag = extractBranchTag(raw);
    if (branchTag && !explicitNodeId) {
      id = `${normalized}_${branchTag}_${randomUUID().slice(0, 8)}`;
    }
    if (usedNodeIds.has(id)) {
      id = `${id}_${randomUUID().slice(0, 8)}`;
      warnings.push(`Duplicate explicit node id in plan token; using generated id "${id}"`);
    }
    usedNodeIds.add(id);
    const label = def.label || normalized;

    nodes.push({
      id,
      type: normalized,
      data: {
        label,
        type: normalized,
        category: def.category || 'utility',
        config: { ...config },
        // Store branchTag in meta for downstream Config_Filler context
        ...(branchTag ? { meta: { branchTag } } : {}),
      },
    });
  }

  if (errors.length > 0 || nodes.length !== resolvedChain.length) {
    return {
      success: false,
      errors,
      warnings,
      resolvedChain,
      diagnostics: {
        canonicalization,
        resolvedChain,
        unknownTypes: canonicalization.filter((c) => c.status === 'rejected').map((c) => c.input),
        branchCoverage: { branchingNodes: 0, branchEdges: 0 },
      },
    };
  }

  const trimmedPrompt = typeof rawUserPrompt === 'string' ? rawUserPrompt.trim() : '';
  const hasSwitch = resolvedChain.some((t) => stripPlanTokenToType(t) === 'switch');
  const switchContext =
    trimmedPrompt.length > 0 && hasSwitch
      ? computeSwitchContextForPlanChain(nodes, resolvedChain, trimmedPrompt)
      : undefined;

  let workflow: any;
  let executionOrder: any;
  let initializeError: unknown;
  try {
    ({ workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(
      nodes,
      undefined,
      undefined,
      switchContext
    ));
  } catch (err) {
    initializeError = err;
    const retrySwitchContext = buildSingleRetrySwitchContext(switchContext);
    try {
      ({ workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(
        nodes,
        undefined,
        undefined,
        retrySwitchContext
      ));
      warnings.push(
        `Switch wiring required single retry with relaxed target IDs: ${err instanceof Error ? err.message : String(err)}`
      );
    } catch (retryErr) {
      return {
        success: false,
        errors: [
          `Deterministic branch wiring failed after one retry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
        ],
        warnings: [
          ...(initializeError ? [`Initial branch wiring error: ${initializeError instanceof Error ? initializeError.message : String(initializeError)}`] : []),
          ...warnings,
        ],
        resolvedChain,
        diagnostics: {
          canonicalization,
          resolvedChain,
          unknownTypes: canonicalization.filter((c) => c.status === 'rejected').map((c) => c.input),
          branchCoverage: { branchingNodes: 0, branchEdges: 0 },
        },
      };
    }
  }
  workflow = materializeStructuralFields(workflow);
  workflow = applyStructuralIntentAlignment(workflow);
  workflow = hydrateRequiredConfigFromRegistryDefaults(workflow);
  workflow = normalizeWorkflowFormFieldIdentities(workflow);
  // Ensure branching nodes receive contract-valid branch fanout/typed edges before validation.
  const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
  workflow = reconciled.workflow;
  executionOrder = reconciled.executionOrder;

  if (reconciled.errors.length > 0) {
    errors.push(...reconciled.errors);
  }
  if (reconciled.warnings?.length) {
    warnings.push(...reconciled.warnings);
  }

  if (reconciled.errors.length > 0) {
    return {
      success: false,
      errors,
      warnings,
      resolvedChain,
      diagnostics: {
        canonicalization,
        resolvedChain,
        unknownTypes: canonicalization.filter((c) => c.status === 'rejected').map((c) => c.input),
        branchCoverage: { branchingNodes: 0, branchEdges: 0 },
      },
    };
  }

  const branchingNodes = workflow.nodes.filter((n: WorkflowNode) => {
    const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
    return unifiedNodeRegistry.get(nodeType)?.isBranching === true;
  }).length;
  const branchEdges = workflow.edges.filter((e: any) =>
    e.type === 'true' || e.type === 'false' || String(e.type || '').startsWith('case_')
  ).length;
  if (branchingNodes > 0 && branchEdges === 0) {
    warnings.push('Branching nodes detected but no typed branch edges found after reconciliation');
  }

  return {
    success: true,
    workflow,
    errors: [],
    warnings,
    resolvedChain,
    diagnostics: {
      canonicalization,
      resolvedChain,
      unknownTypes: [],
      branchCoverage: { branchingNodes, branchEdges },
    },
  };
}
