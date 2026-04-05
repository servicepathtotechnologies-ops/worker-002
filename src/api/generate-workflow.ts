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
import { buildNodeCatalogText } from '../services/ai/node-catalog-builder';
import { generateComprehensiveNodeQuestions } from '../services/ai/comprehensive-node-questions-generator';

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
      if (!intentResult.ok) {
        // Fallback: return minimal plan so UI can still proceed
        res.json({
          phase: 'summarize',
          workflowIntentPlan: {
            structuredSummary: userPrompt,
            proposedNodeChain: ['manual_trigger', 'log_output'],
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

      // Build a proposed node chain from the intent actions
      const proposedNodeChain = [
        intentResult.intent.triggerType || 'manual_trigger',
        ...intentResult.intent.actions.slice(0, 5),
        'log_output',
      ];

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

    const result = await pipeline.run({ userPrompt, userId, correlationId });

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
