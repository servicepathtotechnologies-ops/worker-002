/**
 * Materialize / validate workflows from a persisted WorkflowBuildManifestV1.
 * Registry + orchestrator only — no ad-hoc edge wiring.
 */

import type { Workflow } from '../../core/types/ai-types';
import type { WorkflowBuildManifestV1 } from '../../core/types/workflow-build-manifest';
import { unifiedGraphOrchestrator } from '../../core/orchestration/unified-graph-orchestrator';
import { buildWorkflowFromPlanChain } from './plan-driven-workflow-builder';
import { workflowAuthorizedMultisetMatches } from '../../core/utils/workflow-build-manifest-utils';

export type MaterializeFromManifestResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; message: string };

/**
 * Rebuild workflow from a deterministic plan chain stored in the manifest (linear graphs).
 */
export function materializeWorkflowFromManifestGraphSpec(
  manifest: WorkflowBuildManifestV1,
): MaterializeFromManifestResult {
  if (manifest.graphSpec.kind !== 'deterministic_plan_chain') {
    return { ok: false, message: 'manifest graphSpec is not deterministic_plan_chain' };
  }
  const built = buildWorkflowFromPlanChain(manifest.graphSpec.planChain, manifest.userPrompt);
  if (!built.success || !built.workflow) {
    return { ok: false, message: built.errors.join('; ') };
  }
  const wf = built.workflow;
  const match = workflowAuthorizedMultisetMatches(wf, manifest);
  if (!match.ok) {
    return { ok: false, message: match.detail ?? 'authorized multiset mismatch' };
  }
  const validation = unifiedGraphOrchestrator.validateWorkflow(wf);
  if (!validation.valid) {
    return { ok: false, message: validation.errors.join('; ') };
  }
  return { ok: true, workflow: wf };
}
