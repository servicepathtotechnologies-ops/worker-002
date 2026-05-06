/**
 * Capability Selection — Phase 1: Analyze
 *
 * POST /api/capability-selection/analyze
 *
 * Runs the AI intent stage and AI registry-grounded node selection, returning
 * Capability_Containers to the frontend. No workflow graph is constructed here.
 *
 * Requirements: 2.8, 7.1, 7.3
 */

import { Response } from 'express';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { buildNodeCatalogText } from '../../services/ai/node-catalog-builder';
import { runIntentStage } from '../../services/ai/stages/intent-stage';
import {
  runCapabilitySelectionStage,
  type CapabilityIntentClass,
  type CapabilityOptionStep,
} from '../../services/ai/stages/capability-selection-stage';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { getCredentialVault } from '../../services/credential-vault';
import type { AuthenticatedRequest } from '../../core/middleware/subscription-auth';
import type {
  CandidateNode,
  CapabilityContainer,
  UseCaseUnit,
} from '../../services/ai/stages/capability-types';

function mapIntentClassToSemanticRole(intentClass: CapabilityIntentClass): UseCaseUnit['semanticRole'] {
  if (intentClass === 'generic_action') return 'output';
  return intentClass;
}

async function hydrateCandidateNode(nodeType: string, userId: string): Promise<CandidateNode> {
  const def = unifiedNodeRegistry.get(nodeType);
  const requirements = unifiedNodeRegistry.getRequiredCredentials(nodeType);
  const credentialRequirements = requirements.map((req) => req.category);

  let hasCredentials = requirements.length === 0;
  if (requirements.length > 0) {
    try {
      const vault = getCredentialVault();
      const checks = await Promise.all(
        requirements.map((req) => vault.exists({ userId } as any, req.provider).catch(() => false)),
      );
      hasCredentials = checks.some(Boolean);
    } catch {
      hasCredentials = false;
    }
  }

  return {
    nodeType,
    label: def?.label ?? nodeType,
    description: def?.description ?? '',
    credentialRequirements,
    hasCredentials,
  };
}

async function capabilityStepsToContainers(
  steps: CapabilityOptionStep[],
  userId: string,
): Promise<CapabilityContainer[]> {
  const containers: CapabilityContainer[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const unit: UseCaseUnit = {
      unitId: step.stepId,
      label: step.stepText,
      semanticRole: mapIntentClassToSemanticRole(step.intentClass),
      description: step.reason || step.stepText,
      orderIndex: index,
    };
    const candidates = await Promise.all(
      step.candidateNodeTypes.map((nodeType) => hydrateCandidateNode(nodeType, userId)),
    );

    containers.push({
      containerId: randomUUID(),
      label: step.stepText,
      useCaseUnit: unit,
      candidates,
    });
  }

  return containers;
}

export default async function analyzeCapabilitySelection(req: AuthenticatedRequest, res: Response): Promise<void> {
  const startedAt = Date.now();

  try {
    const body = req.body as Record<string, unknown>;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const bodyUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const userId = req.user?.id || bodyUserId;
    const correlationId =
      typeof body.correlationId === 'string' && body.correlationId.trim()
        ? body.correlationId.trim()
        : randomUUID();

    if (!prompt) {
      res.status(400).json({ ok: false, code: 'MISSING_PROMPT', message: 'prompt is required' });
      return;
    }
    if (!userId) {
      res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Authenticated user is required' });
      return;
    }

    // Build catalog once for the AI intent stage. Node selection builds its own
    // fresh registry catalog so newly registered nodes are always eligible.
    const nodeCatalog = buildNodeCatalogText();

    // Stage 1: AI intent extraction.
    const intentResult = await runIntentStage(prompt, nodeCatalog, correlationId);
    if (!intentResult.ok) {
      res.status(422).json({
        ok: false,
        code: intentResult.code,
        message: 'message' in intentResult ? intentResult.message : 'AI intent analysis failed',
      });
      return;
    }

    // Stage 2: AI node selection against the live unifiedNodeRegistry catalog.
    const selectionResult = await runCapabilitySelectionStage(intentResult.intent, correlationId);
    if (!selectionResult.ok) {
      res.status(422).json({
        ok: false,
        code: selectionResult.code,
        message: selectionResult.message,
      });
      return;
    }

    const containers = await capabilityStepsToContainers(selectionResult.steps, userId);

    // Deduplicate containers: if two containers have the same single candidate node type,
    // keep only the first one. This prevents the destination-coverage repair from adding
    // a duplicate container for a node already covered by the AI selection.
    const seenSingleCandidates = new Set<string>();
    const deduplicatedContainers = containers.filter((container) => {
      if (container.candidates.length === 1) {
        const nodeType = container.candidates[0].nodeType;
        if (seenSingleCandidates.has(nodeType)) {
          return false; // drop duplicate single-candidate container
        }
        seenSingleCandidates.add(nodeType);
      }
      return true;
    });

    const durationMs = Date.now() - startedAt;

    res.status(200).json({
      correlationId,
      containers: deduplicatedContainers,
      promptHash: createHash('sha256').update(prompt).digest('hex'),
      durationMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CapabilitySelection/analyze] Unhandled error:', message);
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message });
  }
}
