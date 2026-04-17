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
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { logger } from '../../../core/logger';
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
 * 2. Guide the backend to correctly wire edges, branches, and operations
 *
 * Format: WORKFLOW / TRIGGER / FLOW (with branch cases) / CONNECTIONS
 */
async function generateStructuralPromptWithGemini(
  userPrompt: string,
  selectedNodeTypes: string[],
  correlationId?: string,
): Promise<string> {
  const nodeDescriptions = selectedNodeTypes.map((type, idx) => {
    const def = unifiedNodeRegistry.get(type);
    const label = def?.label ?? type;
    const category = def?.category ?? 'utility';
    const isBranching = def?.isBranching ?? false;
    return `${idx + 1}. ${label} (${category}${isBranching ? ', branching node' : ''})`;
  }).join('\n');

  const systemPrompt = `You are a workflow blueprint architect. Generate a precise, structured, technical-theoretical explanation of a workflow based on the user's intent and selected nodes.

This blueprint serves TWO purposes:
1. Show the user a clear human-readable explanation of exactly what will be built
2. Guide the backend AI to correctly wire edges, branches, and operations

## OUTPUT FORMAT (MANDATORY)

Return ONLY plain text in this exact structure — no JSON, no markdown headers, no code blocks:

WORKFLOW: [One sentence describing the overall automation goal — do NOT copy the user's raw prompt]

TRIGGER: [Trigger node display name] — [What event starts this workflow and what data it collects]

FLOW:
[Step number]. [Node display name] — [Specific operation it performs]
[For Switch/If-Else nodes, list EVERY branch case on its own line:]
  → Case "[case value]": [Node display name] — [What specific operation runs in this case]
  → Case "[case value]": [Node display name] — [What specific operation runs in this case]

CONNECTIONS: [Name the exact data field that drives routing decisions and describe what data flows between nodes]

## CRITICAL RULES

1. NEVER copy the user's original prompt text — generate a NEW technical explanation
2. For Switch nodes: ALWAYS list every branch case with its specific downstream action and the exact field value that triggers it (e.g. "status = success", "status = pending", "status = failed")
3. For If/Else nodes: describe the true branch and false branch with their specific actions
4. Use the node's display name (e.g. "Gmail", "Slack", "Switch") — never internal type names like "google_gmail"
5. Describe the SPECIFIC OPERATION each node performs (send confirmation email, post Slack alert, evaluate payment status)
6. The CONNECTIONS section must name the exact data field that drives routing (e.g. "payment_status", "order_status", "age")
7. Be specific — never use generic phrases like "data is passed" or "sends a message"
8. Each branch case must describe a DIFFERENT action — not the same action repeated`;

  const message = `USER_INTENT: ${userPrompt}

SELECTED_NODES (in execution order — these are the ONLY nodes to use):
${nodeDescriptions}

Generate the workflow blueprint for these exact nodes in this exact order. Infer the branch cases and specific operations from the user's intent.`;

  try {
    const raw = await geminiOrchestrator.processRequest(
      'workflow-generation',
      { system: systemPrompt, message },
      { model: MODEL, temperature: TEMPERATURE, cache: false },
    );
    const text = typeof raw === 'string' ? raw : (raw as any)?.text ?? (raw as any)?.content ?? '';
    if (text && text.trim().length > 20) {
      logger.info({
        event: 'capability_structural_prompt_llm_success',
        correlationId,
        promptLen: text.trim().length,
      });
      return text.trim();
    }
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

  // Construct graph via orchestrator — never write edges directly
  let workflow;
  let executionOrder;
  try {
    ({ workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(hydratedNodes));
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error({
      event: 'capability_structural_prompt_error',
      stage: 'capability-structural-prompt-stage',
      correlationId,
      error: 'ORCHESTRATOR_VALIDATION_FAILED',
      message: `initializeWorkflow failed: ${String(err)}`,
      durationMs,
    });
    return {
      ok: false,
      code: 'ORCHESTRATOR_VALIDATION_FAILED',
      message: `Workflow initialization failed: ${String(err)}`,
      durationMs,
    } satisfies StructuralPromptGenerationError;
  }

  // Validate workflow
  const validation = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
  if (!validation.valid) {
    const durationMs = Date.now() - startedAt;
    const violationSummary = validation.errors.join('; ');
    logger.error({
      event: 'capability_structural_prompt_error',
      stage: 'capability-structural-prompt-stage',
      correlationId,
      error: 'ORCHESTRATOR_VALIDATION_FAILED',
      violations: validation.errors,
      durationMs,
    });
    return {
      ok: false,
      code: 'ORCHESTRATOR_VALIDATION_FAILED',
      message: `Workflow validation failed: ${violationSummary}`,
      durationMs,
    } satisfies StructuralPromptGenerationError;
  }

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
