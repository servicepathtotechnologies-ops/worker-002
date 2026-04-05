/**
 * AI-First Pipeline — Single Universal Workflow Generation Pipeline
 *
 * This is the ONLY pipeline. No feature flag. No fallback. No dual paths.
 * Sequences: Intent → Node Selection → Node Hydration → Edge Reasoning → Validation
 *
 * Requirements: 6.3, 6.5, 8.1, 8.2, 8.4, 9.1, 9.3
 */

import { randomUUID } from 'crypto';
import { logger } from '../../core/logger';
import { buildNodeCatalogText } from './node-catalog-builder';
import { runIntentStage } from './stages/intent-stage';
import { runStructuralPromptStage } from './stages/structural-prompt-stage';
import { runNodeSelectionStage } from './stages/node-selection-stage';
import { runEdgeReasoningStage } from './stages/edge-reasoning-stage';
import { runValidationStage } from './stages/validation-stage';
import { runPropertyPopulationStage } from './stages/property-population-stage';
import { runCredentialDiscoveryStage } from './stages/credential-discovery-stage';
import { runFieldOwnershipStage } from './stages/field-ownership-stage';
import type { Workflow } from '../../core/types/ai-types';
import type { SelectedNode, ValidationIssue } from './system-prompt-builder';
import type { NodeCatalogOptions } from './node-catalog-builder';
import type { CredentialRequirement } from './credential-discovery-phase';
import type { FieldOwnershipMap } from './stages/field-ownership-stage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiPipelineInput {
  userPrompt: string;
  userId: string;
  correlationId?: string;
}

export interface StageTrace {
  stage: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  llmCall?: {
    model: string;
    temperature: number;
    promptTokens: number;
    completionTokens: number;
  };
  error?: string;
}

export interface AiPipelineOutput {
  workflow: Workflow;
  validationIssues: ValidationIssue[]; // empty on clean pass
  stageTrace: StageTrace[];
  requiredCredentials: CredentialRequirement[];
  missingCredentials: CredentialRequirement[];
  fieldOwnershipMap: FieldOwnershipMap;
  propertyPopulationSummary: Record<string, string[]>;
}

export interface AiPipelineError {
  ok: false;
  code: 'NO_VALID_NODES' | 'CYCLE_DETECTED' | 'INVALID_LLM_RESPONSE' | 'ORCHESTRATOR_VALIDATION_FAILED' | 'INTENT_FAILED' | 'STRUCTURAL_PROMPT_FAILED';
  message: string;
  stageTrace: StageTrace[];
}

export type AiPipelineResult = ({ ok: true } & AiPipelineOutput) | AiPipelineError;

export interface AiPipelineDeps {
  nodeCatalogOptions?: NodeCatalogOptions;
}

// ─── AiFirstPipeline ─────────────────────────────────────────────────────────

export class AiFirstPipeline {
  private readonly nodeCatalogOptions: NodeCatalogOptions;

  constructor(deps: AiPipelineDeps = {}) {
    this.nodeCatalogOptions = deps.nodeCatalogOptions ?? {
      tokenBudget: 32000,
      priorityOrder: ['trigger', 'logic', 'data', 'ai', 'communication', 'transformation', 'utility'],
    };
  }

  async run(input: AiPipelineInput): Promise<AiPipelineResult> {
    const correlationId = input.correlationId ?? randomUUID();
    const stageTrace: StageTrace[] = [];

    try {
      const nodeCatalog = buildNodeCatalogText(this.nodeCatalogOptions);

    logger.info({ event: 'ai_pipeline_start', correlationId, promptLen: input.userPrompt.length });

    // ── Stage 1: Intent ────────────────────────────────────────────────────
    const intentStart = Date.now();
    const intentResult = await runIntentStage(input.userPrompt, nodeCatalog, correlationId);
    stageTrace.push({
      stage: 'intent',
      startedAt: intentStart,
      completedAt: Date.now(),
      durationMs: intentResult.durationMs,
      inputSummary: `prompt_len=${input.userPrompt.length}`,
      outputSummary: intentResult.ok ? `actions=${intentResult.intent.actions.length}` : 'failed',
      llmCall: intentResult.ok ? intentResult.llmCall : undefined,
      error: intentResult.ok ? undefined : intentResult.code,
    });

    if (!intentResult.ok) {
      return { ok: false, code: 'INTENT_FAILED', message: `Intent stage failed: ${intentResult.code}`, stageTrace };
    }

    // ── Stage 2: Structural Prompt ─────────────────────────────────────────
    const spStart = Date.now();
    const spResult = await runStructuralPromptStage(intentResult.intent, nodeCatalog, correlationId);
    stageTrace.push({
      stage: 'structural_prompt',
      startedAt: spStart,
      completedAt: Date.now(),
      durationMs: spResult.durationMs,
      inputSummary: `actions=${intentResult.intent.actions.length}`,
      outputSummary: spResult.ok ? `len=${spResult.structuralPrompt.length}` : 'failed',
      llmCall: spResult.ok ? spResult.llmCall : undefined,
      error: spResult.ok ? undefined : spResult.code,
    });

    if (!spResult.ok) {
      return { ok: false, code: 'STRUCTURAL_PROMPT_FAILED', message: `Structural prompt stage failed: ${spResult.code}`, stageTrace };
    }

    const structuralPrompt = spResult.structuralPrompt;

    // ── Stage 3: Node Selection ────────────────────────────────────────────
    const nsStart = Date.now();
    const nsResult = await runNodeSelectionStage(intentResult.intent, nodeCatalog, correlationId, structuralPrompt);
    stageTrace.push({
      stage: 'node_selection',
      startedAt: nsStart,
      completedAt: Date.now(),
      durationMs: nsResult.durationMs,
      inputSummary: `actions=${intentResult.intent.actions.length}`,
      outputSummary: nsResult.ok ? `selectedNodes=${nsResult.selectedNodes.length}` : 'failed',
      llmCall: nsResult.ok ? nsResult.llmCall : undefined,
      error: nsResult.ok ? undefined : nsResult.code,
    });

    if (!nsResult.ok) {
      return { ok: false, code: nsResult.code, message: `Node selection failed: ${nsResult.code}`, stageTrace };
    }

    // ── Stage 4: Edge Reasoning ────────────────────────────────────────────
    const erStart = Date.now();
    const erResult = await runEdgeReasoningStage(nsResult.selectedNodes, nodeCatalog, intentResult.intent.intent, correlationId, structuralPrompt);
    stageTrace.push({
      stage: 'edge_reasoning',
      startedAt: erStart,
      completedAt: Date.now(),
      durationMs: erResult.durationMs,
      inputSummary: `nodes=${nsResult.selectedNodes.length}`,
      outputSummary: erResult.ok ? `edges=${erResult.workflow.edges.length}` : 'failed',
      llmCall: erResult.ok ? erResult.llmCall : undefined,
      error: erResult.ok ? undefined : erResult.code,
    });

    if (!erResult.ok) {
      return { ok: false, code: erResult.code, message: `Edge reasoning failed: ${erResult.code}`, stageTrace };
    }

    // ── Stage 5: Validation ────────────────────────────────────────────────
    const vsStart = Date.now();
    const vsResult = await runValidationStage(
      erResult.workflow,
      nodeCatalog,
      intentResult.intent.intent,
      nsResult.selectedNodes,
      erResult.edges,
      correlationId,
      structuralPrompt,
    );
    stageTrace.push({
      stage: 'validation',
      startedAt: vsStart,
      completedAt: Date.now(),
      durationMs: vsResult.durationMs,
      inputSummary: `nodes=${erResult.workflow.nodes.length}, edges=${erResult.workflow.edges.length}`,
      outputSummary: vsResult.ok ? `issues=${vsResult.validationIssues.length}` : 'failed',
      llmCall: vsResult.ok ? vsResult.llmCall : undefined,
      error: vsResult.ok ? undefined : vsResult.code,
    });

    if (!vsResult.ok) {
      return {
        ok: false,
        code: vsResult.code,
        message: `Validation failed: ${vsResult.code}`,
        stageTrace,
      };
    }

    // ── Stage 6: Property Population ──────────────────────────────────────
    const ppStart = Date.now();
    const ppResult = await runPropertyPopulationStage({
      workflow: vsResult.workflow,
      userIntent: intentResult.intent.intent,
      structuralPrompt,
      correlationId,
    });
    stageTrace.push({
      stage: 'property_population',
      startedAt: ppStart,
      completedAt: Date.now(),
      durationMs: ppResult.durationMs,
      inputSummary: `nodes=${vsResult.workflow.nodes.length}`,
      outputSummary: `populated=${Object.keys(ppResult.propertyPopulationSummary).length} nodes`,
    });

    // ── Stage 7: Credential Discovery ─────────────────────────────────────
    const cdStart = Date.now();
    const cdResult = await runCredentialDiscoveryStage(ppResult.workflow, input.userId, correlationId);
    stageTrace.push({
      stage: 'credential_discovery',
      startedAt: cdStart,
      completedAt: Date.now(),
      durationMs: cdResult.durationMs,
      inputSummary: `nodes=${ppResult.workflow.nodes.length}`,
      outputSummary: cdResult.ok
        ? `required=${cdResult.requiredCredentials.length}, missing=${cdResult.missingCredentials.length}`
        : 'failed (non-blocking)',
      error: cdResult.ok ? undefined : cdResult.code,
    });

    // Credential discovery is non-blocking — always continue with empty arrays on failure
    const requiredCredentials = cdResult.ok ? cdResult.requiredCredentials : [];
    const missingCredentials = cdResult.ok ? cdResult.missingCredentials : [];

    // ── Stage 7: Field Ownership ───────────────────────────────────────────
    const foStart = Date.now();
    const foResult = await runFieldOwnershipStage(ppResult.workflow, correlationId);
    stageTrace.push({
      stage: 'field_ownership',
      startedAt: foStart,
      completedAt: Date.now(),
      durationMs: foResult.durationMs,
      inputSummary: `nodes=${ppResult.workflow.nodes.length}`,
      outputSummary: `nodes=${Object.keys(foResult.fieldOwnershipMap).length}`,
    });

      logger.info({ event: 'ai_pipeline_complete', correlationId, nodes: ppResult.workflow.nodes.length, edges: ppResult.workflow.edges.length });

      return {
        ok: true,
        workflow: ppResult.workflow,
        validationIssues: vsResult.validationIssues,
        stageTrace,
        requiredCredentials,
        missingCredentials,
        fieldOwnershipMap: foResult.fieldOwnershipMap,
        propertyPopulationSummary: ppResult.propertyPopulationSummary,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'ai_pipeline_unhandled_error', correlationId, error: message, stack: err instanceof Error ? err.stack : undefined });
      return {
        ok: false,
        code: 'INVALID_LLM_RESPONSE',
        message: `Unexpected pipeline error: ${message}`,
        stageTrace,
      };
    }
  }
}

export const aiFirstPipeline = new AiFirstPipeline();
