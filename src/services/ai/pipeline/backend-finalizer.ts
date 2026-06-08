/**
 * Backend Finalizer — Stage 3
 *
 * Wraps the existing pipeline stages 5–9 from AiFirstPipeline into a single
 * class with one public finalize() method. This is the ONLY place where:
 *   - Edge reasoning runs (Gemini)
 *   - Semantic validation runs (Gemini + orchestrator safety net)
 *   - Property population runs (Gemini buildtime_ai_once fields)
 *   - Field ownership is classified (registry-driven)
 *   - Credential discovery runs (non-blocking)
 *   - Build manifest is sealed (SHA-256 integrity hash)
 *
 * All edge operations go through UnifiedGraphOrchestrator.
 * workflow.edges is never mutated directly.
 *
 * Requirements: 4.1–4.12, 7.1, 7.2, 7.4, 7.5
 */

import { randomUUID } from 'crypto';
import { logger } from '../../../core/logger';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { buildNodeCatalogText } from '../node-catalog-builder';
import { runEdgeReasoningStage } from '../stages/edge-reasoning-stage';
import { runValidationStage } from '../stages/validation-stage';
import { runPropertyPopulationStage } from '../stages/property-population-stage';
import { runCredentialDiscoveryStage } from '../stages/credential-discovery-stage';
import { runFieldOwnershipStage } from '../stages/field-ownership-stage';
import { buildWorkflowFromPlanChain } from '../plan-driven-workflow-builder';
import {
  inferLinearBranchingFromSelection,
  linearPlanChainFromSelection,
  buildAuthorizedEntriesForPipeline,
  sealWorkflowBuildManifest,
  serializeFieldOwnershipSnapshot,
  toManifestStructuredIntent,
} from '../../../core/utils/workflow-build-manifest-utils';
import { getNodeCapabilityDedupeKey } from '../../../core/utils/node-capability-dedupe';
import { attachCanonicalPipelineMetadata } from '../ai-first-pipeline';
import { WORKFLOW_BUILD_MANIFEST_VERSION } from '../../../core/types/workflow-build-manifest';
import { getStageProgress, STAGE_LOG_LABELS } from '../stage-progress-map';
import type { SelectedNode, ProposedEdge } from '../system-prompt-builder';
import type { StructuredIntent } from '../stages/intent-stage';
import type { Workflow, WorkflowNode } from '../../../core/types/ai-types';
import type {
  Stage3Output,
  PipelineErrorResponse,
  StageTrace,
  FieldOwnershipMap,
} from '../../../core/types/pipeline-contracts';

export interface BackendFinalizerInput {
  selectedNodes: SelectedNode[];
  /** Confirmed structural prompt text — frozen after Stage 2. */
  structuralPrompt: string;
  /** Raw user intent string from StructuredIntent.intent. */
  userIntent: string;
  /** Full structured intent for manifest serialization. */
  structuredIntent: StructuredIntent;
  correlationId: string;
  userId: string;
  userPrompt: string;
  onStageComplete?: (stageName: string, progress: number, log: string) => void;
}

export class BackendFinalizer {
  async finalize(
    input: BackendFinalizerInput,
  ): Promise<({ ok: true } & Stage3Output) | PipelineErrorResponse> {
    const {
      selectedNodes,
      structuralPrompt,
      userIntent,
      structuredIntent,
      correlationId,
      userId,
      userPrompt,
      onStageComplete,
    } = input;

    const stageTrace: StageTrace[] = [];
    const nodeCatalog = buildNodeCatalogText();

    // ── Step 1: Build WorkflowNode[] from SelectedNode[] ──────────────────
    const workflowNodes: WorkflowNode[] = selectedNodes.map((sel) => {
      const def = unifiedNodeRegistry.get(sel.type);
      const baseConfig = def?.defaultConfig ? def.defaultConfig() : {};
      return {
        id: sel.nodeId,
        type: sel.type,
        data: {
          label: def?.label || sel.type,
          type: sel.type,
          category: def?.category || 'action',
          config: baseConfig,
        },
      } as WorkflowNode;
    });

    // ── Step 2: Initialize workflow via orchestrator ───────────────────────
    const { workflow: initialWorkflow } = unifiedGraphOrchestrator.initializeWorkflow(workflowNodes);
    let workflow: Workflow = initialWorkflow;

    // ── Step 3: Edge Reasoning via Gemini ─────────────────────────────────
    const erStart = Date.now();
    const useLinear = inferLinearBranchingFromSelection(selectedNodes);
    let proposedEdges: ProposedEdge[] = [];

    if (useLinear) {
      const chain = linearPlanChainFromSelection(selectedNodes);
      const built = buildWorkflowFromPlanChain(chain, userIntent);
      if (!built.success || !built.workflow) {
        return {
          ok: false,
          error: 'ORCHESTRATOR_VALIDATION_FAILED',
          message: `Deterministic graph build failed: ${built.errors.join('; ')}`,
          stageTrace,
          correlationId,
        };
      }
      workflow = built.workflow;
      proposedEdges = workflow.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: (e.type as ProposedEdge['type']) || 'main',
      }));
      stageTrace.push({
        stage: 'edge_reasoning',
        startedAt: erStart,
        completedAt: Date.now(),
        durationMs: Date.now() - erStart,
        inputSummary: `nodes=${selectedNodes.length},linear=true`,
        outputSummary: `edges=${workflow.edges.length}`,
        llmCall: { model: 'deterministic_linear', temperature: 0, promptTokens: 0, completionTokens: 0 },
      });
    } else {
      const erResult = await runEdgeReasoningStage(
        selectedNodes,
        nodeCatalog,
        userIntent,
        correlationId,
        structuralPrompt,
      );
      stageTrace.push({
        stage: 'edge_reasoning',
        startedAt: erStart,
        completedAt: Date.now(),
        durationMs: erResult.durationMs,
        inputSummary: `nodes=${selectedNodes.length},linear=false`,
        outputSummary: erResult.ok ? `edges=${erResult.workflow.edges.length}` : 'failed',
        llmCall: erResult.ok ? erResult.llmCall : undefined,
        error: erResult.ok ? undefined : erResult.code,
      });
      if (!erResult.ok) {
        return {
          ok: false,
          error: erResult.code,
          message: `Edge reasoning failed: ${erResult.code}`,
          stageTrace,
          correlationId,
        };
      }
      workflow = erResult.workflow;
      proposedEdges = erResult.edges;
    }
    try { onStageComplete?.('edge_reasoning', getStageProgress('edge_reasoning'), STAGE_LOG_LABELS['edge_reasoning'] ?? 'edge_reasoning'); } catch (_) {}

    // ── Step 4: Validation via Gemini ─────────────────────────────────────
    const vsStart = Date.now();
    const vsResult = await runValidationStage(
      workflow,
      nodeCatalog,
      userIntent,
      selectedNodes,
      proposedEdges,
      correlationId,
      structuralPrompt,
    );
    stageTrace.push({
      stage: 'validation',
      startedAt: vsStart,
      completedAt: Date.now(),
      durationMs: vsResult.durationMs,
      inputSummary: `nodes=${workflow.nodes.length},edges=${workflow.edges.length}`,
      outputSummary: vsResult.ok ? `issues=${vsResult.validationIssues.length}` : 'failed',
      llmCall: vsResult.ok ? vsResult.llmCall : undefined,
      error: vsResult.ok ? undefined : vsResult.code,
    });
    if (!vsResult.ok) {
      return {
        ok: false,
        error: vsResult.code,
        message: `Validation failed: ${vsResult.code}`,
        stageTrace,
        correlationId,
      };
    }
    workflow = vsResult.workflow;
    try { onStageComplete?.('validation', getStageProgress('validation'), STAGE_LOG_LABELS['validation'] ?? 'validation'); } catch (_) {}

    // ── Step 5: Property Population via Gemini ────────────────────────────
    const ppStart = Date.now();
    const ppResult = await runPropertyPopulationStage({
      workflow,
      userIntent,
      structuralPrompt,
      correlationId,
    });
    stageTrace.push({
      stage: 'property_population',
      startedAt: ppStart,
      completedAt: Date.now(),
      durationMs: ppResult.durationMs,
      inputSummary: `nodes=${workflow.nodes.length}`,
      outputSummary: `populated=${Object.keys(ppResult.propertyPopulationSummary).length} nodes`,
    });
    workflow = ppResult.workflow;
    try { onStageComplete?.('property_population', getStageProgress('property_population'), STAGE_LOG_LABELS['property_population'] ?? 'property_population'); } catch (_) {}

    // ── Step 6: Deduplication (linear paths only) ─────────────────────────
    if (useLinear) {
      const seenKeys = new Set<string>();
      const toRemove: string[] = [];
      for (const node of workflow.nodes) {
        const nodeType = node.type || (node.data as any)?.type;
        const key = getNodeCapabilityDedupeKey(nodeType);
        if (!key) continue; // skip nodes with no dedup key
        if (seenKeys.has(key)) {
          toRemove.push(node.id);
        } else {
          seenKeys.add(key);
        }
      }
      for (const nodeId of toRemove) {
        const result = unifiedGraphOrchestrator.removeNode(workflow, nodeId);
        workflow = result.workflow;
        logger.info({ event: 'backend_finalizer_dedup', correlationId, removedNodeId: nodeId });
      }
    }

    // ── Step 7: Reconcile after deduplication ─────────────────────────────
    const reconcileResult = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
    workflow = reconcileResult.workflow;

    // ── Step 8: Field Ownership ───────────────────────────────────────────
    const foStart = Date.now();
    const foResult = await runFieldOwnershipStage(workflow, correlationId);
    stageTrace.push({
      stage: 'field_ownership',
      startedAt: foStart,
      completedAt: Date.now(),
      durationMs: foResult.durationMs,
      inputSummary: `nodes=${workflow.nodes.length}`,
      outputSummary: `nodes=${Object.keys(foResult.fieldOwnershipMap).length}`,
    });
    try { onStageComplete?.('field_ownership', getStageProgress('field_ownership'), STAGE_LOG_LABELS['field_ownership'] ?? 'field_ownership'); } catch (_) {}

    // ── Step 9: Credential Discovery (non-blocking) ───────────────────────
    const cdStart = Date.now();
    const cdResult = await runCredentialDiscoveryStage(workflow, userId, correlationId);
    stageTrace.push({
      stage: 'credential_discovery',
      startedAt: cdStart,
      completedAt: Date.now(),
      durationMs: cdResult.durationMs,
      inputSummary: `nodes=${workflow.nodes.length}`,
      outputSummary: cdResult.ok
        ? `required=${cdResult.requiredCredentials.length},missing=${cdResult.missingCredentials.length}`
        : 'failed (non-blocking)',
      error: cdResult.ok ? undefined : cdResult.code,
    });
    try { onStageComplete?.('credential_discovery', getStageProgress('credential_discovery'), STAGE_LOG_LABELS['credential_discovery'] ?? 'credential_discovery'); } catch (_) {}

    // ── Step 10: Final structural validation ──────────────────────────────
    let finalValidation = unifiedGraphOrchestrator.validateWorkflow(workflow);
    if (!finalValidation.valid) {
      // One auto-repair attempt
      const repairResult = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
      workflow = repairResult.workflow;
      finalValidation = unifiedGraphOrchestrator.validateWorkflow(workflow);
      if (!finalValidation.valid) {
        return {
          ok: false,
          error: 'ORCHESTRATOR_VALIDATION_FAILED',
          message: 'Workflow failed structural validation after auto-repair',
          violations: finalValidation.errors,
          stageTrace,
          correlationId,
        };
      }
    }

    // ── Step 11: Seal build manifest ──────────────────────────────────────
    const authorizedNodes = buildAuthorizedEntriesForPipeline(workflow, selectedNodes, useLinear);
    const fieldOwnershipSnapshot = serializeFieldOwnershipSnapshot(foResult.fieldOwnershipMap);

    const manifestDraft = {
      version: WORKFLOW_BUILD_MANIFEST_VERSION,
      correlationId,
      createdAt: new Date().toISOString(),
      userPrompt,
      intent: toManifestStructuredIntent(structuredIntent),
      structuralBlueprint: structuralPrompt,
      authorizedNodes,
      branchingSpec: { mode: (useLinear ? 'linear' : 'branching') as 'linear' | 'branching' },
      graphSpec: useLinear
        ? ({ kind: 'deterministic_plan_chain', planChain: linearPlanChainFromSelection(selectedNodes) } as const)
        : ({ kind: 'llm_seeded', edgeProposalStored: true as const, orderedNodeIds: workflow.nodes.map((n) => n.id) } as const),
      hydrationSpec: {
        populatedNodeIds: Object.keys(ppResult.propertyPopulationSummary),
        populatedFieldsByNodeId: ppResult.propertyPopulationSummary,
      },
      credentialDiscovery: {
        requiredCredentialKeys: (cdResult.ok ? cdResult.requiredCredentials : [])
          .map((c) => String((c as any).vaultKey || (c as any).provider || '').trim())
          .filter((k) => k.length > 0),
      },
      fieldOwnershipSnapshot,
    };

    const buildManifest = sealWorkflowBuildManifest(manifestDraft);

    // Freeze fieldOwnershipSnapshot — read-only after this point
    Object.freeze(buildManifest.fieldOwnershipSnapshot);

    stageTrace.push({
      stage: 'build_manifest',
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 0,
      inputSummary: `authorized=${authorizedNodes.length}`,
      outputSummary: `manifestHash=${buildManifest.integrity.contentHash.slice(0, 16)}`,
    });

    // ── Step 12: Attach canonical pipeline metadata ───────────────────────
    const workflowWithMetadata = attachCanonicalPipelineMetadata(workflow, {
      userPrompt,
      structuralPrompt,
      correlationId,
      buildManifest,
    });

    // Build typed FieldOwnershipMap for Stage3Output
    const fieldOwnershipMap: FieldOwnershipMap = {};
    for (const [nodeId, fields] of Object.entries(foResult.fieldOwnershipMap)) {
      fieldOwnershipMap[nodeId] = {};
      for (const [fieldName, fillMode] of Object.entries(fields)) {
        fieldOwnershipMap[nodeId][fieldName] = {
          mode: fillMode === 'buildtime_ai_once' ? 'ai_built'
              : fillMode === 'runtime_ai' ? 'ai_runtime'
              : 'user',
          fillMode: fillMode as any,
          ownership: 'value',
        };
      }
    }

    logger.info({
      event: 'backend_finalizer_complete',
      correlationId,
      nodes: workflowWithMetadata.nodes.length,
      edges: workflowWithMetadata.edges.length,
    });

    return {
      ok: true,
      workflow: workflowWithMetadata,
      buildManifest,
      fieldOwnershipMap,
      validationIssues: vsResult.validationIssues,
      stageTrace,
    };
  }
}
