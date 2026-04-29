/**
 * Capability Structural Prompt Generator — Capability-Based Node Selection Flow (Stage 4)
 *
 * Given the ordered Node_Selections, the original user prompt, and the Node_Catalog,
 * calls Gemini to produce a structured technical-theoretical workflow blueprint.
 * Then hydrates each selected node with registry defaults and constructs the
 * Workflow_Graph via UnifiedGraphOrchestrator.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 7.1, 7.2, 8.5
 */

import { randomUUID } from 'crypto';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { logger } from '../../../core/logger';
import { aiDrivenWorkflowSummaryGenerator } from '../ai-driven-workflow-summary-generator';
import type { WorkflowNode } from '../../../core/types/ai-types';
import type {
  StructuralPromptGenerationInput,
  StructuralPromptGenerationResult,
  StructuralPromptGenerationError,
} from './capability-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';
const TEMPERATURE = 0.1;

// ─── Node Hydration ───────────────────────────────────────────────────────────

function hydrateNode(nodeType: string): WorkflowNode {
  const def = unifiedNodeRegistry.get(nodeType);
  const config = unifiedNodeRegistry.getDefaultConfig(nodeType);
  const label = def?.label ?? nodeType;
  const category = def?.category ?? 'utility';

  return {
    id: `node_${randomUUID()}`,
    type: nodeType,
    data: {
      label,
      type: nodeType,
      category,
      config: { ...config },
    },
  };
}

// ─── Structural Prompt via Gemini ─────────────────────────────────────────────

/**
 * Call Gemini to generate a structured technical-theoretical workflow blueprint.
 *
 * This prompt serves two purposes:
 * 1. Show the user a clear explanation of what will be built
 * 2. Guide the backend to correctly wire edges, branches, operations, and summaryV2 branch/path artifacts
 *
 * Format: WORKFLOW / TRIGGER / FLOW (with branch cases) / CONNECTIONS
 */
async function generateStructuralPromptWithGemini(
  userPrompt: string,
  selectedNodeTypes: string[],
  correlationId?: string,
): Promise<string> {
  try {
    // Use AI-driven summary generator
    const aiInput = {
      userPrompt,
      nodeChain: selectedNodeTypes,
    };
    
    const aiResult = await aiDrivenWorkflowSummaryGenerator.generateSummary(aiInput);
    
    // Summary is already in frontend format - use directly
    const formatted = aiResult.summary;
    
    logger.info({
      event: 'capability_structural_prompt_llm_success',
      correlationId,
      promptLen: formatted.trim().length,
      source: 'ai-driven-generator',
    });
    
    return formatted.trim();
  } catch (err) {
    logger.warn({
      event: 'capability_structural_prompt_llm_failed',
      correlationId,
      error: String(err),
      note: 'Falling back to registry-driven structural prompt',
    });
  }

  // Fallback: registry-driven structured prompt (no LLM)
  return buildFallbackStructuralPrompt(userPrompt, selectedNodeTypes);
}

/**
 * Registry-driven fallback structural prompt — used when Gemini fails.
 * Produces the same WORKFLOW/TRIGGER/FLOW/CONNECTIONS format without an LLM call.
 */
function buildFallbackStructuralPrompt(userPrompt: string, selectedNodeTypes: string[]): string {
  if (selectedNodeTypes.length === 0) {
    return `WORKFLOW: ${userPrompt}\n\nTRIGGER: Manual start\n\nFLOW:\n(no nodes selected)\n\nCONNECTIONS: none`;
  }

  const lines: string[] = [];

  // WORKFLOW
  lines.push(`WORKFLOW: Automate the following workflow: ${userPrompt}`);
  lines.push('');

  // TRIGGER
  const triggerType = selectedNodeTypes[0];
  const triggerDef = unifiedNodeRegistry.get(triggerType);
  const triggerLabel = triggerDef?.label ?? triggerType;
  lines.push(`TRIGGER: ${triggerLabel} — starts the workflow and provides input data to downstream nodes`);
  lines.push('');

  // FLOW
  lines.push('FLOW:');
  let stepNum = 1;
  let branchDescribed = false;

  for (let i = 0; i < selectedNodeTypes.length; i++) {
    if (branchDescribed && i > 0) break;

    const type = selectedNodeTypes[i];
    const def = unifiedNodeRegistry.get(type);
    const label = def?.label ?? type;
    const isBranching = def?.isBranching ?? false;

    if (i === 0) {
      lines.push(`${stepNum}. ${label} — collects input data and initiates the workflow`);
    } else if (isBranching) {
      lines.push(`${stepNum}. ${label} — evaluates the routing condition and directs flow to the appropriate branch`);
      const downstream = selectedNodeTypes.slice(i + 1);
      downstream.forEach((downType, idx) => {
        const downDef = unifiedNodeRegistry.get(downType);
        const downLabel = downDef?.label ?? downType;
        lines.push(`  → Case ${idx + 1}: ${downLabel} — performs the designated action for this branch`);
      });
      branchDescribed = true;
    } else {
      lines.push(`${stepNum}. ${label} — processes data and performs its designated operation`);
    }
    stepNum++;
  }
  lines.push('');

  // CONNECTIONS
  const triggerLabel2 = unifiedNodeRegistry.get(selectedNodeTypes[0])?.label ?? selectedNodeTypes[0];
  const branchNodeType = selectedNodeTypes.find(t => unifiedNodeRegistry.get(t)?.isBranching);
  const branchLabel = branchNodeType ? (unifiedNodeRegistry.get(branchNodeType)?.label ?? branchNodeType) : null;

  if (branchLabel) {
    lines.push(`CONNECTIONS: ${triggerLabel2} outputs the input payload → ${branchLabel} reads the routing field to determine which branch executes → each branch node receives the full upstream payload for use in its operation`);
  } else {
    const chain = selectedNodeTypes.map(t => unifiedNodeRegistry.get(t)?.label ?? t).join(' → ');
    lines.push(`CONNECTIONS: Data flows sequentially: ${chain}`);
  }

  return lines.join('\n');
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function runCapabilityStructuralPromptStage(
  input: StructuralPromptGenerationInput,
): Promise<StructuralPromptGenerationResult | StructuralPromptGenerationError> {
  const startedAt = Date.now();
  const { userPrompt, orderedSelections, nodeCatalog, correlationId } = input;

  const selectedNodeTypes = orderedSelections.map((s) => s.selectedNodeType);

  logger.info({
    event: 'capability_structural_prompt_start',
    stage: 'capability-structural-prompt-stage',
    correlationId,
    selectedNodeTypes,
    nodeCount: selectedNodeTypes.length,
  });

  const finalNodeTypes = selectedNodeTypes;

  // Hydrate nodes with registry defaults
  const hydratedNodes: WorkflowNode[] = finalNodeTypes.map((nodeType) => hydrateNode(nodeType));

  // Build a preview-only workflow — no edge wiring at this stage.
  //
  // This workflow is used ONLY for:
  //   1. Showing execution steps in the CapabilityReviewStep UI (workflow.nodes list)
  //   2. Passing to Phase 3 /confirm which rebuilds the graph from scratch after
  //      property population fills in switch cases and if_else conditions.
  //
  // We intentionally skip initializeWorkflow here because it wires nodes linearly
  // and then the EdgeReconciliationEngine removes branching nodes and their downstream
  // nodes as "orphaned" (since it doesn't know the case values yet). The real graph
  // is built in confirm.ts after property population.
  const workflow = { nodes: hydratedNodes, edges: [] };

  // Generate structured prompt via Gemini (with registry fallback)
  const structuralPrompt = await generateStructuralPromptWithGemini(
    userPrompt,
    finalNodeTypes,
    correlationId,
  );

  const nodeCount = workflow.nodes.length;
  const edgeCount = workflow.edges.length;
  const durationMs = Date.now() - startedAt;

  logger.info({
    event: 'capability_structural_prompt_end',
    stage: 'capability-structural-prompt-stage',
    correlationId,
    selectedNodeTypes: finalNodeTypes,
    nodeCount,
    edgeCount,
    durationMs,
  });

  return {
    ok: true,
    structuralPrompt,
    workflow,
    selectedNodeTypes: finalNodeTypes,
    nodeCount,
    edgeCount,
    durationMs,
    llmCall: { model: MODEL, durationMs },
  } satisfies StructuralPromptGenerationResult;
}
