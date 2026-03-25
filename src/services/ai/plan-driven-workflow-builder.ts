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

/**
 * Normalize a node type from the structured plan to a registry-backed type.
 */
export function resolvePlanNodeType(raw: string): { normalized: string; error?: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { normalized: '', error: 'Empty node type in plan chain' };
  }
  try {
    return { normalized: resolveCanonicalNodeTypeStrict(trimmed) };
  } catch (e: any) {
    return {
      normalized: trimmed,
      error: e?.message || `Unknown or unregistered node type "${trimmed}"`,
    };
  }
}

export function buildWorkflowFromPlanChain(planChain: string[]): PlanDrivenBuildResult {
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

  for (const raw of planChain) {
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
    resolvedChain.push(normalized);

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
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0);
      if (missing) {
        if (!(config as any)._fillMode || typeof (config as any)._fillMode !== 'object') {
          (config as any)._fillMode = {};
        }
        (config as any)._fillMode[field] = coerceFieldFillModeByPolicy(
          field,
          'runtime_ai',
          def.inputSchema
        ).mode;
      }
    }

    const id = `node_${randomUUID()}`;
    const label = def.label || normalized;

    nodes.push({
      id,
      type: normalized,
      data: {
        label,
        type: normalized,
        category: def.category || 'utility',
        config: { ...config },
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

  let { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
  workflow = materializeStructuralFields(workflow);
  // Ensure branching nodes receive contract-valid branch fanout/typed edges before validation.
  const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
  workflow = reconciled.workflow;
  const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);

  if (!validation.valid) {
    errors.push(...validation.errors);
  }
  if (validation.warnings?.length) {
    warnings.push(...validation.warnings);
  }

  if (!validation.valid) {
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

  const branchingNodes = workflow.nodes.filter((n) => {
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
