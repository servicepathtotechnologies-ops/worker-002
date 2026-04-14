/**
 * Generate Workflow — AI-First Pipeline Entry Point
 *
 * mode: 'analyze' → Uses AI-first intent + structural prompt stages to generate plan summary
 * mode: 'refine'  → AI-First Pipeline (builds the actual workflow graph)
 * (no mode)       → AI-First Pipeline (direct generation)
 *
 * Requirements: 9.1, 9.3
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AiFirstPipeline } from '../services/ai/ai-first-pipeline';
import { runIntentStage } from '../services/ai/stages/intent-stage';
import { runStructuralPromptStage } from '../services/ai/stages/structural-prompt-stage';
import { runNodeSelectionStage } from '../services/ai/stages/node-selection-stage';
import { buildNodeCatalogText } from '../services/ai/node-catalog-builder';
import { generateComprehensiveNodeQuestions } from '../services/ai/comprehensive-node-questions-generator';
import {
  inferLinearBranchingFromSelection,
  linearPlanChainFromSelection,
  resolvePreferredTerminalNodeType,
} from '../core/utils/workflow-build-manifest-utils';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';

const pipeline = new AiFirstPipeline();

export default async function generateWorkflow(req: Request, res: Response): Promise<void> {
  const correlationId = randomUUID();

  try {
    const body = req.body as Record<string, unknown>;
    const mode = String(body.mode || '').toLowerCase();

    const userPrompt = String(
      body.prompt ||
      body.refinedPrompt ||
      body.originalPrompt ||
      ''
    ).trim();

    if (!userPrompt) {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    // ── mode: analyze → AI-first intent + structural prompt (replaces failing legacy clarifier) ──
    if (mode === 'analyze') {
      const nodeCatalog = buildNodeCatalogText();

      // Stage 1: extract structured intent
      const intentResult = await runIntentStage(userPrompt, nodeCatalog, correlationId);
      const terminalFallback = resolvePreferredTerminalNodeType();
      if (!intentResult.ok) {
        res.json({
          phase: 'summarize',
          workflowIntentPlan: {
            structuredSummary: userPrompt,
            proposedNodeChain: ['manual_trigger', terminalFallback],
            mandatoryNodeTypes: ['manual_trigger'],
          },
          matchedKeywords: [],
          mandatoryNodeTypes: ['manual_trigger'],
          correlationId,
        });
        return;
      }

      // Stage 2: generate structural blueprint
      const spResult = await runStructuralPromptStage(intentResult.intent, nodeCatalog, correlationId);
      const structuredSummary = spResult.ok ? spResult.structuralPrompt : intentResult.intent.intent;
      const structuralForSelection = spResult.ok ? spResult.structuralPrompt : undefined;

      // Stage 3: same node selection as full pipeline — registry-grounded chain (no fixed log_output suffix)
      const nsResult = await runNodeSelectionStage(
        intentResult.intent,
        nodeCatalog,
        correlationId,
        structuralForSelection,
      );

      let proposedNodeChain: string[];
      if (nsResult.ok && nsResult.selectedNodes.length > 0) {
        if (inferLinearBranchingFromSelection(nsResult.selectedNodes)) {
          proposedNodeChain = linearPlanChainFromSelection(nsResult.selectedNodes);
        } else {
          proposedNodeChain = nsResult.selectedNodes.map((n) => n.type);
        }
      } else {
        const trig = intentResult.intent.triggerType || 'manual_trigger';
        const actions = intentResult.intent.actions
          .filter((a) => unifiedNodeRegistry.has(a))
          .slice(0, 8);
        proposedNodeChain = [trig, ...actions, terminalFallback];
      }

      res.json({
        phase: 'summarize',
        workflowIntentPlan: {
          structuredSummary,
          proposedNodeChain,
          mandatoryNodeTypes: [intentResult.intent.triggerType || 'manual_trigger'],
          nodeInclusionReasons: intentResult.intent.actions.reduce((acc: Record<string, string>, a: string) => {
            acc[a] = `Required for: ${a.replace(/_/g, ' ')}`;
            return acc;
          }, {}),
        },
        matchedKeywords: intentResult.intent.actions,
        mandatoryNodeTypes: [intentResult.intent.triggerType || 'manual_trigger'],
        correlationId,
      });
      return;
    }

    // ── mode: refine (or no mode) → AI-First Pipeline ──────────────────────
    const userId = String(body.userId || body.user_id || 'anonymous');

    const existingWorkflow = body.existingWorkflow as any | undefined;

    const isStreaming = req.headers['x-stream-progress'] === 'true';

    if (isStreaming) {
      // ── Streaming mode: emit NDJSON stage events ──────────────────────────
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.flushHeaders();

      const writeEvent = (event: object) => res.write(JSON.stringify(event) + '\n');

      const result = await pipeline.run({
        userPrompt,
        userId,
        correlationId,
        existingWorkflow,
        onStageComplete: (stageName, progress, log) => {
          writeEvent({ current_phase: stageName, progress_percentage: progress, log });
        },
      });

      if (!result.ok) {
        writeEvent({ status: 'error', error: result.code, message: result.message });
        res.end();
        return;
      }

      // Finalizing sentinel before terminal payload
      writeEvent({ current_phase: 'finalizing', progress_percentage: 99, log: 'Finalizing workflow...' });

      // Build credentialStatuses for terminal payload
      const streamingCredentialStatuses = result.requiredCredentials.flatMap((req: any) => {
        const credentialId = (req.vaultKey || req.provider || '').toLowerCase().trim()
          .replace(/^gmail$/, 'google');
        const status = req.satisfied ? 'resolved_connected' : 'required_missing';
        const nodeIds = Array.isArray(req.nodeIds) && req.nodeIds.length > 0
          ? req.nodeIds
          : ['unknown'];
        const displayName =
          (typeof req.displayName === 'string' && req.displayName.trim()) ||
          (typeof req.vaultKey === 'string' && req.vaultKey.trim()) ||
          (typeof req.provider === 'string' && req.provider.trim()) ||
          credentialId ||
          'Credential';
        return nodeIds.map((nodeId: string) => ({ nodeId, credentialId, status, displayName }));
      });

      // Terminal payload as a single NDJSON line
      writeEvent({
        success: true,
        phase: 'ready',
        workflow: result.workflow,
        validationIssues: result.validationIssues,
        comprehensiveQuestions: (() => {
          try {
            const qResult = generateComprehensiveNodeQuestions(result.workflow, {}, { mode: 'full_configuration' });
            return qResult.questions ?? [];
          } catch {
            return [];
          }
        })(),
        requiredCredentials: result.requiredCredentials.map((c) => c.vaultKey || c.displayName || c.provider),
        missingCredentials: result.missingCredentials.map((c) => c.vaultKey || c.displayName || c.provider),
        discoveredCredentials: result.missingCredentials,
        credentialStatuses: streamingCredentialStatuses,
        fieldOwnershipMap: result.fieldOwnershipMap,
        stageTrace: result.stageTrace,
        propertyPopulationSummary: result.propertyPopulationSummary,
        correlationId,
      });

      res.end();
      return;
    }

    // ── Non-streaming mode (backward-compatible) ──────────────────────────
    const result = await pipeline.run({ userPrompt, userId, correlationId, existingWorkflow });

    if (!result.ok) {
      res.status(422).json({
        success: false,
        error: result.code,
        message: result.message,
        correlationId,
        stageTrace: result.stageTrace,
      });
      return;
    }

    // Map requiredCredentials (with satisfied flags from vault queries) into
    // the credentialStatuses shape consumed by filterStillBlockingOAuth() in the wizard.
    const credentialStatuses = result.requiredCredentials.flatMap((req: any) => {
      const credentialId = (req.vaultKey || req.provider || '').toLowerCase().trim()
        .replace(/^gmail$/, 'google'); // normalize gmail → google
      const status = req.satisfied ? 'resolved_connected' : 'required_missing';
      const nodeIds = Array.isArray(req.nodeIds) && req.nodeIds.length > 0
        ? req.nodeIds
        : ['unknown'];
      const displayName =
        (typeof req.displayName === 'string' && req.displayName.trim()) ||
        (typeof req.vaultKey === 'string' && req.vaultKey.trim()) ||
        (typeof req.provider === 'string' && req.provider.trim()) ||
        credentialId ||
        'Credential';
      return nodeIds.map((nodeId: string) => ({ nodeId, credentialId, status, displayName }));
    });

    res.json({
      success: true,
      // Use 'ready' so the existing field-ownership wizard activates in the UI
      // (applyUnifiedWizardFromGenerateUpdate checks for phase === 'ready')
      phase: 'ready',
      workflow: result.workflow,
      validationIssues: result.validationIssues,
      // Generate per-node questions (AI pre-fills buildtime_ai_once fields like conditions,
      // titles, switch cases; user fills manual_static; runtime_ai resolved at execution)
      comprehensiveQuestions: (() => {
        try {
          const qResult = generateComprehensiveNodeQuestions(result.workflow, {}, { mode: 'full_configuration' });
          return qResult.questions ?? [];
        } catch {
          return [];
        }
      })(),
      // Normalize to string array for UI compatibility
      requiredCredentials: result.requiredCredentials.map((c) => c.vaultKey || c.displayName || c.provider),
      missingCredentials: result.missingCredentials.map((c) => c.vaultKey || c.displayName || c.provider),
      // Full objects for the configure step
      discoveredCredentials: result.missingCredentials,
      credentialStatuses,
      fieldOwnershipMap: result.fieldOwnershipMap,
      stageTrace: result.stageTrace,
      propertyPopulationSummary: result.propertyPopulationSummary,
      correlationId,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GenerateWorkflow] Unhandled error:', message, error?.stack);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message,
      correlationId,
    });
  }
}
