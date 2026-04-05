/**
 * Credential Discovery Stage — AI-First Pipeline (Stage 8)
 *
 * Thin wrapper around credentialDiscoveryPhase.discoverCredentials().
 * Runs after validation to discover all credentials required by the workflow.
 * Non-blocking: pipeline returns the workflow even if this stage fails.
 *
 * Requirements: 2.6, 3.7
 */

import { credentialDiscoveryPhase } from '../credential-discovery-phase';
import { logger } from '../../../core/logger';
import type { Workflow } from '../../../core/types/ai-types';
import type { CredentialRequirement } from '../credential-discovery-phase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CredentialDiscoveryStageResult {
  ok: true;
  requiredCredentials: CredentialRequirement[];
  missingCredentials: CredentialRequirement[];
  satisfiedCredentials: CredentialRequirement[];
  durationMs: number;
}

export interface CredentialDiscoveryStageError {
  ok: false;
  code: 'CREDENTIAL_DISCOVERY_FAILED';
  errors: string[];
  durationMs: number;
}

export type CredentialDiscoveryStageOutput = CredentialDiscoveryStageResult | CredentialDiscoveryStageError;

// ─── Credential Discovery Stage ──────────────────────────────────────────────

export async function runCredentialDiscoveryStage(
  workflow: Workflow,
  userId?: string,
  correlationId?: string,
): Promise<CredentialDiscoveryStageOutput> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'credential_discovery',
    correlationId,
    inputSummary: `nodes=${workflow.nodes.length}`,
  });

  try {
    const result = await credentialDiscoveryPhase.discoverCredentials(workflow, userId);
    const durationMs = Date.now() - startedAt;

    logger.info({
      event: 'ai_pipeline_stage_end',
      stage: 'credential_discovery',
      correlationId,
      outputSummary: `required=${result.requiredCredentials.length}, missing=${(result.missingCredentials ?? []).length}`,
      durationMs,
    });

    return {
      ok: true,
      requiredCredentials: result.requiredCredentials,
      missingCredentials: result.missingCredentials ?? [],
      satisfiedCredentials: result.satisfiedCredentials ?? [],
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    logger.error({
      event: 'ai_pipeline_stage_error',
      stage: 'credential_discovery',
      correlationId,
      error: 'CREDENTIAL_DISCOVERY_FAILED',
      message,
    });
    return {
      ok: false,
      code: 'CREDENTIAL_DISCOVERY_FAILED',
      errors: [message],
      durationMs,
    };
  }
}
