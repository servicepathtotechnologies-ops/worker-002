/**
 * Capability Selection — Phase 2: Generate
 *
 * POST /api/capability-selection/generate
 *
 * Accepts Node_Selections from the frontend, reconstructs ordered NodeSelection[],
 * runs the Structural_Prompt_Generator, and returns the structural prompt and
 * validated workflow for user review.
 *
 * Requirements: 4.1, 4.2, 6.6, 7.1
 */

import { Request, Response } from 'express';
import { buildNodeCatalogText } from '../../services/ai/node-catalog-builder';
import { runCapabilityStructuralPromptStage } from '../../services/ai/stages/capability-structural-prompt-stage';
import type {
  NodeSelectionMap,
  CapabilityContainer,
  NodeSelection,
} from '../../services/ai/stages/capability-types';

export default async function generateCapabilityWorkflow(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();

  try {
    const body = req.body as Record<string, unknown>;
    const correlationId = typeof body.correlationId === 'string' ? body.correlationId.trim() : '';
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim() : '';
    const selections = (body.selections ?? {}) as NodeSelectionMap;
    const containers = (body.containers ?? []) as CapabilityContainer[];

    if (!userPrompt) {
      res.status(400).json({ ok: false, code: 'MISSING_PROMPT', message: 'userPrompt is required', selections });
      return;
    }
    if (!selections || Object.keys(selections).length === 0) {
      res.status(400).json({ ok: false, code: 'MISSING_SELECTIONS', message: 'selections is required', selections });
      return;
    }
    if (!containers || containers.length === 0) {
      res.status(400).json({ ok: false, code: 'MISSING_CONTAINERS', message: 'containers is required', selections });
      return;
    }

    // Reconstruct ordered NodeSelection[] from selections map and containers.
    // Match containerId → nodeType, preserve useCaseUnit.orderIndex order.
    const orderedSelections: NodeSelection[] = containers
      .slice()
      .sort((a, b) => a.useCaseUnit.orderIndex - b.useCaseUnit.orderIndex)
      .filter((container) => selections[container.containerId] !== undefined)
      .map((container) => ({
        containerId: container.containerId,
        useCaseUnit: container.useCaseUnit,
        selectedNodeType: selections[container.containerId],
      }));

    if (orderedSelections.length === 0) {
      res.status(422).json({
        ok: false,
        code: 'NO_VALID_SELECTIONS',
        message: 'No valid selections could be matched to containers.',
        selections,
      });
      return;
    }

    // Build catalog once for this request
    const nodeCatalog = buildNodeCatalogText();

    const result = await runCapabilityStructuralPromptStage({
      userPrompt,
      orderedSelections,
      nodeCatalog,
      correlationId: correlationId || undefined,
    });

    if (!result.ok) {
      res.status(422).json({
        ok: false,
        code: result.code,
        message: result.message,
        selections, // Req 6.6 — preserve selections for retry
      });
      return;
    }

    const durationMs = Date.now() - startedAt;

    res.status(200).json({
      structuralPrompt: result.structuralPrompt,
      workflow: result.workflow,
      selectedNodeTypes: result.selectedNodeTypes,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      durationMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CapabilitySelection/generate] Unhandled error:', message);
    const body = req.body as Record<string, unknown>;
    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message,
      selections: (body.selections ?? {}) as NodeSelectionMap,
    });
  }
}
