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
import type { SelectedNode, ValidationIssue, ProposedEdge } from './system-prompt-builder';
import type { NodeCatalogOptions } from './node-catalog-builder';
import type { CredentialRequirement } from './credential-discovery-phase';
import type { FieldOwnershipMap } from './stages/field-ownership-stage';
import { buildWorkflowFromPlanChain } from './plan-driven-workflow-builder';
import {
  WORKFLOW_BUILD_MANIFEST_VERSION,
  type WorkflowBuildManifestV1,
} from '../../core/types/workflow-build-manifest';
import {
  applyMandatoryNodeFilterToSelection,
  buildAuthorizedEntriesForPipeline,
  inferLinearBranchingFromSelection,
  linearPlanChainFromSelection,
  sealWorkflowBuildManifest,
  serializeFieldOwnershipSnapshot,
  toManifestStructuredIntent,
} from '../../core/utils/workflow-build-manifest-utils';
import { getStageProgress, STAGE_LOG_LABELS } from './stage-progress-map';

const STRUCTURAL_BLUEPRINT_MAX_LEN = 4000;

/**
 * Canonical build-time metadata for save / attach-inputs / resolveWorkflowRuntimeIntent.
 * Does not mutate nodes or edges.
 */
export function attachCanonicalPipelineMetadata(
  workflow: Workflow,
  args: {
    userPrompt: string;
    structuralPrompt: string;
    correlationId: string;
    buildManifest?: WorkflowBuildManifestV1;
  },
): Workflow {
  const prev =
    workflow.metadata && typeof workflow.metadata === 'object' && !Array.isArray(workflow.metadata)
      ? (workflow.metadata as Record<string, unknown>)
      : {};
  const sp = args.structuralPrompt;
  const structuralBlueprintSummary =
    sp.length > STRUCTURAL_BLUEPRINT_MAX_LEN ? `${sp.slice(0, STRUCTURAL_BLUEPRINT_MAX_LEN)}…` : sp;
  return {
    ...workflow,
    metadata: {
      ...prev,
      originalUserPrompt: args.userPrompt.trim(),
      structuralBlueprintSummary,
      aiPipelineCorrelationId: args.correlationId,
      timestamp: (typeof prev.timestamp === 'string' && prev.timestamp ? prev.timestamp : new Date().toISOString()) as string,
      ...(args.buildManifest ? { buildManifest: args.buildManifest } : {}),
    },
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiPipelineInput {
  userPrompt: string;
  userId: string;
  correlationId?: string;
  /**
   * When set (e.g. summarize-layer authoritative chain), node selection is filtered to these registry types.
   */
  mandatoryNodeTypes?: string[];
  /**
   * Optional existing workflow to use as a base for continuation requests.
   * When provided, the pipeline will preserve all non-empty node config field values
   * from the existing workflow rather than regenerating from scratch.
   */
  existingWorkflow?: Workflow;
  /**
   * Optional callback invoked after each named pipeline stage completes.
   * Receives the stage name, its progress percentage, and a human-readable log label.
   * A throwing callback will never abort the pipeline.
   */
  onStageComplete?: (stageName: string, progress: number, log: string) => void;
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
  code:
    | 'NO_VALID_NODES'
    | 'CYCLE_DETECTED'
    | 'INVALID_LLM_RESPONSE'
    | 'ORCHESTRATOR_VALIDATION_FAILED'
    | 'INTENT_FAILED'
    | 'STRUCTURAL_PROMPT_FAILED';
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
    try { input.onStageComplete?.('intent', getStageProgress('intent'), STAGE_LOG_LABELS['intent'] ?? 'intent'); } catch (_) {}

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
    try { input.onStageComplete?.('structural_prompt', getStageProgress('structural_prompt'), STAGE_LOG_LABELS['structural_prompt'] ?? 'structural_prompt'); } catch (_) {}

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
    try { input.onStageComplete?.('node_selection', getStageProgress('node_selection'), STAGE_LOG_LABELS['node_selection'] ?? 'node_selection'); } catch (_) {}

    if (!nsResult.ok) {
      return { ok: false, code: nsResult.code, message: `Node selection failed: ${nsResult.code}`, stageTrace };
    }

    let selectedForGraph = nsResult.selectedNodes;
    const mandatory = input.mandatoryNodeTypes;
    if (mandatory && mandatory.length > 0) {
      const filtered = applyMandatoryNodeFilterToSelection(selectedForGraph, mandatory);
      if (!Array.isArray(filtered)) {
        return {
          ok: false,
          code: 'NO_VALID_NODES',
          message: 'Mandatory node types could not be satisfied by AI node selection',
          stageTrace,
        };
      }
      selectedForGraph = filtered;
    }

    // ✅ UNIVERSAL FIX: Remove nodes not grounded in the user's intent.
    // The intent-stage produces actions as plain strings (e.g. "send email via Gmail").
    // We check each selected node type against the action strings and the user prompt.
    // Nodes whose type cannot be matched to any action or the prompt are removed.
    // This is a lightweight, type-safe filter that doesn't depend on MinimalWorkflowPolicy's
    // incompatible StructuredIntent shape.
    if (selectedForGraph.length > 0) {
      try {
        const intentActions: string[] = Array.isArray(intentResult.intent.actions)
          ? intentResult.intent.actions.map((a: any) => String(a).toLowerCase())
          : [];
        const promptLower = input.userPrompt.toLowerCase();
        const triggerType = String(intentResult.intent.triggerType || '').toLowerCase();

        const filtered = selectedForGraph.filter((sel) => {
          const nodeType = sel.type.toLowerCase();
          const nodeDef = (require('../../core/registry/unified-node-registry') as any).unifiedNodeRegistry.get(sel.type);
          const nodeCategory = String(nodeDef?.category || '').toLowerCase();

          // Always keep trigger nodes
          if (nodeCategory === 'trigger' || nodeDef?.isTrigger === true) return true;
          // Always keep if_else / switch (logic nodes) — they implement conditions
          if (nodeType === 'if_else' || nodeType === 'switch' || nodeCategory === 'logic' || nodeCategory === 'flow') return true;
          // Always keep merge nodes
          if (nodeType === 'merge') return true;

          // Check if node type appears in any action string or the prompt
          const nodeLabel = String(nodeDef?.label || nodeType).toLowerCase();
          const nodeAliases = [nodeType, nodeLabel, ...(nodeDef?.tags || []).map((t: string) => t.toLowerCase())];

          const matchesAction = intentActions.some((action) =>
            nodeAliases.some((alias) => action.includes(alias) || alias.includes(action.replace(/\s+/g, '_')))
          );
          const matchesPrompt = nodeAliases.some((alias) => promptLower.includes(alias.replace(/_/g, ' ')) || promptLower.includes(alias));

          return matchesAction || matchesPrompt;
        });

        if (filtered.length > 0 && filtered.length < selectedForGraph.length) {
          logger.info({
            event: 'ai_pipeline_intent_filter',
            correlationId,
            before: selectedForGraph.length,
            after: filtered.length,
            removed: selectedForGraph.length - filtered.length,
            removedTypes: selectedForGraph.filter((s) => !filtered.includes(s)).map((s) => s.type),
          });
          selectedForGraph = filtered;
        }
      } catch (filterErr) {
        logger.warn({ event: 'ai_pipeline_intent_filter_warn', correlationId, error: String(filterErr) });
      }
    }

    // ✅ UNIVERSAL FIX: Ensure enough branch targets exist for switch/if_else nodes.
    // The LLM sometimes collapses multiple branches into fewer unique node types.
    // For a switch with N cases, we need N downstream nodes (one per branch).
    // For if_else, we need 2 downstream nodes (true + false).
    try {
      const { randomUUID: uuid } = require('crypto') as typeof import('crypto');
      const { unifiedNodeRegistry: reg } = require('../../core/registry/unified-node-registry') as any;
      const branchingNodes = selectedForGraph.filter((sel) => reg.get(sel.type)?.isBranching === true);
      for (const branchNode of branchingNodes) {
        const nodeDef = reg.get(branchNode.type);
        // Determine required branch count
        let requiredBranches = 2; // default for if_else
        if (branchNode.type === 'switch') {
          // Can't know cases yet (not populated until property_population), default to 2
          requiredBranches = 2;
        }
        // Count non-trigger, non-branching nodes after this branching node in selection
        const branchNodeIndex = selectedForGraph.indexOf(branchNode);
        const downstreamNodes = selectedForGraph.slice(branchNodeIndex + 1).filter((sel) => {
          const def = reg.get(sel.type);
          return def?.category !== 'trigger' && def?.isBranching !== true;
        });
        // If fewer downstream nodes than required branches, duplicate the last output node
        if (downstreamNodes.length > 0 && downstreamNodes.length < requiredBranches) {
          const lastNode = downstreamNodes[downstreamNodes.length - 1];
          const missing = requiredBranches - downstreamNodes.length;
          for (let i = 0; i < missing; i++) {
            selectedForGraph.push({ ...lastNode, nodeId: uuid() });
          }
          logger.info({
            event: 'ai_pipeline_branch_pad',
            correlationId,
            branchType: branchNode.type,
            added: missing,
            duplicatedType: lastNode.type,
          });
        }
      }
    } catch (padErr) {
      logger.warn({ event: 'ai_pipeline_branch_pad_warn', correlationId, error: String(padErr) });
    }

    const useLinearDeterministic = inferLinearBranchingFromSelection(selectedForGraph);

    // ── Stage 4: Edge Reasoning (deterministic linear OR LLM) ─────────────
    const erStart = Date.now();
    let erResult: Awaited<ReturnType<typeof runEdgeReasoningStage>>;

    if (useLinearDeterministic) {
      const chain = linearPlanChainFromSelection(selectedForGraph);
      const built = buildWorkflowFromPlanChain(chain, intentResult.intent.intent);
      if (!built.success || !built.workflow) {
        return {
          ok: false,
          code: 'ORCHESTRATOR_VALIDATION_FAILED',
          message: `Deterministic graph build failed: ${built.errors.join('; ')}`,
          stageTrace,
        };
      }
      const linearWf = built.workflow;
      const edges: ProposedEdge[] = linearWf.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: (e.type as ProposedEdge['type']) || 'main',
      }));
      const done = Date.now();
      erResult = {
        ok: true,
        workflow: linearWf,
        orderedNodeIds: linearWf.nodes.map((n) => n.id),
        edges,
        durationMs: done - erStart,
        llmCall: {
          model: 'deterministic_linear',
          temperature: 0,
          promptTokens: 0,
          completionTokens: 0,
        },
      };
    } else {
      erResult = await runEdgeReasoningStage(
        selectedForGraph,
        nodeCatalog,
        intentResult.intent.intent,
        correlationId,
        structuralPrompt,
      );
    }

    stageTrace.push({
      stage: 'edge_reasoning',
      startedAt: erStart,
      completedAt: Date.now(),
      durationMs: erResult.durationMs,
      inputSummary: `nodes=${selectedForGraph.length},linear=${useLinearDeterministic}`,
      outputSummary: erResult.ok ? `edges=${erResult.workflow.edges.length}` : 'failed',
      llmCall: erResult.ok ? erResult.llmCall : undefined,
      error: erResult.ok ? undefined : erResult.code,
    });
    try { input.onStageComplete?.('edge_reasoning', getStageProgress('edge_reasoning'), STAGE_LOG_LABELS['edge_reasoning'] ?? 'edge_reasoning'); } catch (_) {}

    if (!erResult.ok) {
      return { ok: false, code: erResult.code, message: `Edge reasoning failed: ${erResult.code}`, stageTrace };
    }

    // ── Stage 5: Validation ────────────────────────────────────────────────
    const vsStart = Date.now();
    const vsResult = await runValidationStage(
      erResult.workflow,
      nodeCatalog,
      intentResult.intent.intent,
      selectedForGraph,
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
    try { input.onStageComplete?.('validation', getStageProgress('validation'), STAGE_LOG_LABELS['validation'] ?? 'validation'); } catch (_) {}

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
    try { input.onStageComplete?.('property_population', getStageProgress('property_population'), STAGE_LOG_LABELS['property_population'] ?? 'property_population'); } catch (_) {}

    // ── Stage 6b: Existing Workflow Config Merge ───────────────────────────
    // When existingWorkflow is provided (continuation request), merge non-empty config
    // field values from existing nodes into the generated workflow. This preserves
    // AI-assigned values from prior generations rather than discarding them.
    let mergedWorkflow = ppResult.workflow;
    if (input.existingWorkflow && input.existingWorkflow.nodes && input.existingWorkflow.nodes.length > 0) {
      const existingNodesByType = new Map<string, any>();
      const existingNodesById = new Map<string, any>();
      for (const existingNode of input.existingWorkflow.nodes) {
        const nodeType = existingNode.data?.type || existingNode.type;
        if (nodeType) existingNodesByType.set(nodeType, existingNode);
        if (existingNode.id) existingNodesById.set(existingNode.id, existingNode);
      }

      const mergedNodes = mergedWorkflow.nodes.map((generatedNode: any) => {
        const nodeType = generatedNode.data?.type || generatedNode.type;
        // Match by id first, then by type
        const existingNode = existingNodesById.get(generatedNode.id) || existingNodesByType.get(nodeType);
        if (!existingNode) return generatedNode;

        const existingConfig = existingNode.data?.config || {};
        const generatedConfig = { ...(generatedNode.data?.config || {}) };
        let merged = false;

        for (const [field, value] of Object.entries(existingConfig)) {
          // Only copy non-empty values from existing workflow (preserve AI-assigned values)
          if (value !== null && value !== undefined && value !== '') {
            generatedConfig[field] = value;
            merged = true;
          }
        }

        if (!merged) return generatedNode;
        return {
          ...generatedNode,
          data: { ...generatedNode.data, config: generatedConfig },
        };
      });

      mergedWorkflow = { ...mergedWorkflow, nodes: mergedNodes };
      logger.info({ event: 'existing_workflow_config_merged', correlationId, mergedNodes: mergedNodes.length });
    }

    // ── Stage 7: Credential Discovery ─────────────────────────────────────
    const cdStart = Date.now();
    const cdResult = await runCredentialDiscoveryStage(mergedWorkflow, input.userId, correlationId);
    stageTrace.push({
      stage: 'credential_discovery',
      startedAt: cdStart,
      completedAt: Date.now(),
      durationMs: cdResult.durationMs,
      inputSummary: `nodes=${mergedWorkflow.nodes.length}`,
      outputSummary: cdResult.ok
        ? `required=${cdResult.requiredCredentials.length}, missing=${cdResult.missingCredentials.length}`
        : 'failed (non-blocking)',
      error: cdResult.ok ? undefined : cdResult.code,
    });
    try { input.onStageComplete?.('credential_discovery', getStageProgress('credential_discovery'), STAGE_LOG_LABELS['credential_discovery'] ?? 'credential_discovery'); } catch (_) {}

    // Credential discovery is non-blocking — always continue with empty arrays on failure
    const requiredCredentials = cdResult.ok ? cdResult.requiredCredentials : [];
    const missingCredentials = cdResult.ok ? cdResult.missingCredentials : [];

    // ── Stage 7: Field Ownership ───────────────────────────────────────────
    const foStart = Date.now();
    const foResult = await runFieldOwnershipStage(mergedWorkflow, correlationId);
    stageTrace.push({
      stage: 'field_ownership',
      startedAt: foStart,
      completedAt: Date.now(),
      durationMs: foResult.durationMs,
      inputSummary: `nodes=${mergedWorkflow.nodes.length}`,
      outputSummary: `nodes=${Object.keys(foResult.fieldOwnershipMap).length}`,
    });
    try { input.onStageComplete?.('field_ownership', getStageProgress('field_ownership'), STAGE_LOG_LABELS['field_ownership'] ?? 'field_ownership'); } catch (_) {}

      logger.info({ event: 'ai_pipeline_complete', correlationId, nodes: mergedWorkflow.nodes.length, edges: mergedWorkflow.edges.length });

      const graphSpec: WorkflowBuildManifestV1['graphSpec'] = useLinearDeterministic
        ? {
            kind: 'deterministic_plan_chain',
            planChain: linearPlanChainFromSelection(selectedForGraph),
          }
        : {
            kind: 'llm_seeded',
            edgeProposalStored: true,
            orderedNodeIds: erResult.orderedNodeIds,
          };

      const authorizedNodes = buildAuthorizedEntriesForPipeline(
        ppResult.workflow,
        selectedForGraph,
        useLinearDeterministic,
      );

      const manifestDraft: Omit<WorkflowBuildManifestV1, 'integrity'> = {
        version: WORKFLOW_BUILD_MANIFEST_VERSION,
        correlationId,
        createdAt: new Date().toISOString(),
        userPrompt: input.userPrompt.trim(),
        intent: toManifestStructuredIntent(intentResult.intent),
        structuralBlueprint: structuralPrompt,
        authorizedNodes,
        branchingSpec: {
          mode: inferLinearBranchingFromSelection(selectedForGraph) ? 'linear' : 'branching',
        },
        graphSpec,
        hydrationSpec: {
          populatedNodeIds: Object.keys(ppResult.propertyPopulationSummary),
          populatedFieldsByNodeId: ppResult.propertyPopulationSummary,
        },
        credentialDiscovery: {
          requiredCredentialKeys: requiredCredentials
            .map((c) => String(c.vaultKey || c.provider || '').trim())
            .filter((k) => k.length > 0),
        },
        fieldOwnershipSnapshot: serializeFieldOwnershipSnapshot(foResult.fieldOwnershipMap),
      };
      const buildManifest = sealWorkflowBuildManifest(manifestDraft);

      stageTrace.push({
        stage: 'build_manifest',
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        inputSummary: `authorized=${authorizedNodes.length}`,
        outputSummary: `manifestHash=${buildManifest.integrity.contentHash.slice(0, 16)}`,
      });

      const workflowWithMetadata = attachCanonicalPipelineMetadata(mergedWorkflow, {
        userPrompt: input.userPrompt,
        structuralPrompt,
        correlationId,
        buildManifest,
      });

      return {
        ok: true,
        workflow: workflowWithMetadata,
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
