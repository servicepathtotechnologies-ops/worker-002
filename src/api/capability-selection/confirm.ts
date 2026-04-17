/**
 * Capability Selection — Phase 3: Confirm
 *
 * POST /api/capability-selection/confirm
 *
 * Accepts the validated Workflow from the review step and passes it through
 * the existing AiFirstPipeline downstream stages: credential discovery,
 * property population, and field ownership. Any further structural mutations
 * go through unifiedGraphOrchestrator.injectNode(...) followed by validateWorkflow.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { unifiedGraphOrchestrator } from '../../core/orchestration/unified-graph-orchestrator';
import { runCredentialDiscoveryStage } from '../../services/ai/stages/credential-discovery-stage';
import { runPropertyPopulationStage } from '../../services/ai/stages/property-population-stage';
import { runFieldOwnershipStage } from '../../services/ai/stages/field-ownership-stage';
import { attachCanonicalPipelineMetadata } from '../../services/ai/ai-first-pipeline';
import { generateComprehensiveNodeQuestions } from '../../services/ai/comprehensive-node-questions-generator';
import type { Workflow } from '../../core/types/ai-types';

export default async function confirmCapabilityWorkflow(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const correlationId =
      typeof body.correlationId === 'string' && body.correlationId.trim()
        ? body.correlationId.trim()
        : randomUUID();
    const workflow = body.workflow as Workflow | undefined;
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim() : '';
    const structuralPrompt = typeof body.structuralPrompt === 'string' ? body.structuralPrompt.trim() : userPrompt;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!workflow || !workflow.nodes || !workflow.edges) {
      res.status(400).json({ ok: false, code: 'MISSING_WORKFLOW', message: 'workflow is required' });
      return;
    }
    if (!userPrompt) {
      res.status(400).json({ ok: false, code: 'MISSING_PROMPT', message: 'userPrompt is required' });
      return;
    }
    if (!userId) {
      res.status(400).json({ ok: false, code: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    // Validate the incoming workflow before running downstream stages (Req 6.1)
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);
    if (!validation.valid) {
      res.status(422).json({
        ok: false,
        code: 'ORCHESTRATOR_VALIDATION_FAILED',
        message: `Workflow validation failed: ${validation.errors.join('; ')}`,
      });
      return;
    }

    // Stage: Property Population (Req 6.2)
    const ppResult = await runPropertyPopulationStage({
      workflow,
      userIntent: userPrompt,
      structuralPrompt,
      correlationId,
    });
    // Property population is always ok: true (soft-failing stage)
    let populatedWorkflow = ppResult.workflow;

    // ── Reconcile edges after property population ─────────────────────────
    // Property population fills switch.cases and if_else.conditions.
    // We must rebuild the graph from the populated nodes so the orchestrator
    // creates ONLY the correct branch edges — not the old linear chain edges.
    // Simply calling reconcileWorkflow would add branch edges but leave the
    // old linear edges (e.g. Gmail→Slack1, Slack1→Slack2) causing double connections.
    try {
      // Rebuild: initializeWorkflow creates edges from scratch based on node configs
      const rebuilt = unifiedGraphOrchestrator.initializeWorkflow(populatedWorkflow.nodes);
      populatedWorkflow = {
        ...rebuilt.workflow,
        metadata: populatedWorkflow.metadata, // preserve metadata from property population
      };
    } catch (reconcileErr) {
      console.warn('[CapabilitySelection/confirm] Edge rebuild after property population failed, falling back to reconcile:', reconcileErr);
      try {
        // Fallback: remove linear edges between branch-downstream nodes, then reconcile
        const branchingNodeIds = new Set(
          populatedWorkflow.nodes
            .filter((n: any) => {
              const type = n.data?.type || n.type;
              return type === 'switch' || type === 'if_else';
            })
            .map((n: any) => n.id)
        );
        // Remove edges whose source is NOT a branching node AND whose target has
        // an incoming edge from a branching node (these are the stale linear edges)
        const branchTargetIds = new Set(
          populatedWorkflow.edges
            .filter((e: any) => branchingNodeIds.has(e.source))
            .map((e: any) => e.target)
        );
        const cleanedEdges = populatedWorkflow.edges.filter((e: any) => {
          // Keep edges from branching nodes (the correct branch edges)
          if (branchingNodeIds.has(e.source)) return true;
          // Remove edges TO branch targets from non-branching sources (stale linear)
          if (branchTargetIds.has(e.target) && !branchingNodeIds.has(e.source)) return false;
          return true;
        });
        populatedWorkflow = { ...populatedWorkflow, edges: cleanedEdges };
        const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(populatedWorkflow);
        populatedWorkflow = reconciled.workflow;
      } catch (fallbackErr) {
        console.warn('[CapabilitySelection/confirm] Fallback edge cleanup also failed (non-fatal):', fallbackErr);
      }
    }

    // Stage: Credential Discovery (Req 6.3) — non-blocking
    const cdResult = await runCredentialDiscoveryStage(populatedWorkflow, userId, correlationId);
    const requiredCredentials = cdResult.ok ? cdResult.requiredCredentials : [];
    const missingCredentials = cdResult.ok ? cdResult.missingCredentials : [];

    // Stage: Field Ownership (Req 6.4)
    const foResult = await runFieldOwnershipStage(populatedWorkflow, correlationId);

    // Generate comprehensive questions for the field-ownership wizard
    let comprehensiveQuestions: any[] = [];
    try {
      const qResult = generateComprehensiveNodeQuestions(populatedWorkflow, {}, { mode: 'full_configuration' });
      comprehensiveQuestions = qResult.questions ?? [];
    } catch {
      // non-blocking — wizard will fall back to fieldOwnershipMap synthesis
    }

    // Attach canonical pipeline metadata (Req 6.5)
    const finalWorkflow = attachCanonicalPipelineMetadata(populatedWorkflow, {
      userPrompt,
      structuralPrompt,
      correlationId,
    });

    res.status(200).json({
      ok: true,
      workflow: finalWorkflow,
      requiredCredentials: requiredCredentials.map((c) => c.vaultKey || c.displayName || c.provider),
      missingCredentials: missingCredentials.map((c) => c.vaultKey || c.displayName || c.provider),
      discoveredCredentials: missingCredentials,
      fieldOwnershipMap: foResult.fieldOwnershipMap,
      propertyPopulationSummary: ppResult.propertyPopulationSummary,
      comprehensiveQuestions,
      correlationId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CapabilitySelection/confirm] Unhandled error:', message);
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message });
  }
}
