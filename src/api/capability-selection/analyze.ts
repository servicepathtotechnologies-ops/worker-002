/**
 * Capability Selection — Phase 1: Analyze
 *
 * POST /api/capability-selection/analyze
 *
 * Runs Intent_Analyzer and Capability_Grouper, returning Capability_Containers
 * to the frontend. No workflow graph is constructed at this point.
 *
 * Requirements: 2.8, 7.1, 7.3
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { buildNodeCatalogText } from '../../services/ai/node-catalog-builder';
import { runIntentAnalysis } from '../../services/ai/stages/capability-intent-analyzer';
import { runCapabilityGrouping } from '../../services/ai/stages/capability-grouper-stage';

export default async function analyzeCapabilitySelection(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();

  try {
    const body = req.body as Record<string, unknown>;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const correlationId =
      typeof body.correlationId === 'string' && body.correlationId.trim()
        ? body.correlationId.trim()
        : randomUUID();

    if (!prompt) {
      res.status(400).json({ ok: false, code: 'MISSING_PROMPT', message: 'prompt is required' });
      return;
    }
    if (!userId) {
      res.status(400).json({ ok: false, code: 'MISSING_USER_ID', message: 'userId is required' });
      return;
    }

    // Build catalog once; reused across all LLM calls in this request (Req 7.3)
    const nodeCatalog = buildNodeCatalogText();

    // Stage 1: Intent Analysis
    const intentResult = await runIntentAnalysis(prompt, nodeCatalog, correlationId);
    if (!intentResult.ok) {
      res.status(422).json({
        ok: false,
        code: intentResult.code,
        message: intentResult.message,
      });
      return;
    }

    // Stage 2: Capability Grouping
    const groupingResult = await runCapabilityGrouping(
      intentResult.units,
      nodeCatalog,
      userId,
      correlationId,
    );
    if (!groupingResult.ok) {
      res.status(422).json({
        ok: false,
        code: groupingResult.code,
        message: groupingResult.message,
        failedUnitId: groupingResult.failedUnitId,
      });
      return;
    }

    const durationMs = Date.now() - startedAt;

    res.status(200).json({
      correlationId,
      containers: groupingResult.containers,
      promptHash: intentResult.promptHash,
      durationMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CapabilitySelection/analyze] Unhandled error:', message);
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message });
  }
}
