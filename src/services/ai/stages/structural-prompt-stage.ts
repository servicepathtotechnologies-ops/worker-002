/**
 * Structural Prompt Stage — AI-First Pipeline (Stage 2)
 *
 * Generates a plain-language blueprint of the workflow between intent extraction
 * and node selection. The blueprint describes which nodes are needed, how they
 * connect, and what each does in the context of the user's goal.
 *
 * This shared context is passed to all downstream stages (node-selection,
 * edge-reasoning, validation) to improve coherence across the pipeline.
 *
 * Requirements: 2.5
 */

import { geminiOrchestrator } from '../gemini-orchestrator';
import { logger } from '../../../core/logger';
import type { StructuredIntent } from './intent-stage';
import type { NodeCatalogText } from '../node-catalog-builder';
import { runStructuralPromptStageRemote } from './structural-prompt-stage-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StructuralPromptResult {
  ok: true;
  structuralPrompt: string;
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface StructuralPromptError {
  ok: false;
  code: 'INVALID_LLM_RESPONSE';
  rawResponse: string;
  durationMs: number;
}

export type StructuralPromptOutput = StructuralPromptResult | StructuralPromptError;

export interface StructuralPromptConstraints {
  selectedNodeConstraintsByStep?: Record<string, string[]>;
  selectedNodeConstraintsFlat?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract plain text from LLM response — handles string, object with .text/.content, or JSON */
function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.content === 'string') return r.content;
  }
  return '';
}

// ─── Structural Prompt Stage ──────────────────────────────────────────────────

export async function runStructuralPromptStage(
  intent: StructuredIntent,
  nodeCatalog: NodeCatalogText,
  correlationId?: string,
  constraints?: StructuralPromptConstraints,
): Promise<StructuralPromptOutput> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'structural_prompt',
    correlationId,
    inputSummary: `actions=${intent.actions.length}`,
  });

  // ── Try remote ai-generator first ────────────────────────────────────────────
  const remote = await runStructuralPromptStageRemote(intent, nodeCatalog, correlationId, constraints);

  if (remote?.ok) {
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'structural_prompt', correlationId, source: 'remote', durationMs: Date.now() - startedAt });
    return remote;
  }

  if (remote && !remote.ok) {
    logger.warn({
      event: 'ai_pipeline_stage_warn',
      stage: 'structural_prompt',
      correlationId,
      reason: `ai-generator returned ${remote.code} — falling back to local`,
    });
  }

  const model = 'gemini-3.5-flash';
  const temperature = 0.2;

  const selectedNodes = (constraints?.selectedNodeConstraintsFlat || []).join(', ') || 'nodes from intent';

  const systemPrompt = `You are a workflow blueprint architect. Your job is to generate a precise, structured, technical-theoretical explanation of a workflow based on the user's intent and selected nodes.

This blueprint serves TWO purposes:
1. Show the user a clear human-readable explanation of exactly what will be built
2. Guide the backend AI to correctly wire edges, branches, and operations

## OUTPUT FORMAT (MANDATORY)

Return ONLY plain text in this exact structure — no JSON, no markdown headers, no code blocks:

WORKFLOW: [One sentence describing the overall automation goal]

TRIGGER: [Trigger node name] — [What event starts this workflow and what data it collects]

FLOW:
[Step number]. [Node display name] — [Specific operation it performs, e.g. "sends a confirmation email to {{recipient}}"] 
[For branching nodes, describe each case on its own line:]
  → Case "[case value]": [Node display name] — [What operation runs in this case]
  → Case "[case value]": [Node display name] — [What operation runs in this case]
  → Case "[case value]": [Node display name] — [What operation runs in this case]

CONNECTIONS: [Describe the exact data flow — what data passes from each node to the next, and which field drives branching decisions]

## CRITICAL RULES

1. NEVER repeat the user's original prompt text — generate a NEW technical explanation
2. For Switch/If-Else nodes: ALWAYS list every branch case with its specific downstream action
3. Use the node's display name (e.g. "Gmail", "Slack", "Switch") not internal type names
4. Describe the SPECIFIC OPERATION each node performs (send email, post message, evaluate condition)
5. For branching: state EXACTLY which field value routes to which branch (e.g. "when status = success → Gmail sends confirmation")
6. The CONNECTIONS section must describe the data field that drives routing decisions
7. Be specific about what data flows between nodes — not generic "data is passed"
8. Include explicit branch path mapping for every branch node (if_else/switch) and list each case outcome
9. Ensure each step states node responsibility and expected output effect so backend can compile summaryV2 fields

## EXAMPLE OUTPUT (for a payment status workflow):

WORKFLOW: Route payment notifications based on transaction status using a form submission trigger.

TRIGGER: Form Trigger — collects payment_status and order_id fields from form submission.

FLOW:
1. Switch — evaluates the payment_status field from the form submission
  → Case "success": Gmail — sends a payment confirmation email to the customer
  → Case "pending": Slack — posts a pending payment reminder to the #payments channel
  → Case "failed": Slack — posts a payment failure alert to the #alerts channel

CONNECTIONS: Form Trigger outputs payment_status and order_id → Switch reads payment_status to route → each branch receives the full form payload for use in message content.

If USER_SELECTED_NODE_CONSTRAINTS are provided, the blueprint MUST only use those node types.`;

  const message = `USER_INTENT:\n${intent.intent}\n\nTRIGGER_TYPE: ${intent.triggerType}\n\nACTIONS:\n${intent.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nDATA_FLOWS:\n${intent.dataFlows.map(f => `${f.from} → ${f.to}: ${f.dataDescription}`).join('\n') || 'none specified'}\n\nSELECTED_NODES: ${selectedNodes}\n\nUSER_SELECTED_NODE_CONSTRAINTS:\n${JSON.stringify({
    selectedNodeConstraintsByStep: constraints?.selectedNodeConstraintsByStep || {},
    selectedNodeConstraintsFlat: constraints?.selectedNodeConstraintsFlat || [],
  }, null, 2)}`;
  const promptTokens = Math.ceil((systemPrompt.length + message.length) / 4);

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'structural_prompt', correlationId, model, temperature });

  let text: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'workflow-generation',
      { system: systemPrompt, message },
      { model, temperature, cache: false },
    );
    text = extractText(raw);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'structural_prompt', correlationId, error: 'LLM_CALL_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  if (!text || text.trim().length === 0) {
    // Retry once with explicit reminder
    logger.warn({ event: 'ai_pipeline_stage_retry', stage: 'structural_prompt', correlationId });
    let text2: string;
    try {
      const raw2 = await geminiOrchestrator.processRequest(
        'workflow-generation',
        { system: systemPrompt + '\n\nCRITICAL: You MUST return the workflow blueprint in the exact format specified. Start with "WORKFLOW:" and include TRIGGER:, FLOW:, and CONNECTIONS: sections. Describe every branch case explicitly.', message },
        { model, temperature, cache: false },
      );
      text2 = extractText(raw2);
    } catch (err) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'structural_prompt', correlationId, error: 'LLM_RETRY_FAILED', message: String(err) });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
    }

    if (!text2 || text2.trim().length === 0) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'structural_prompt', correlationId, error: 'INVALID_LLM_RESPONSE' });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: text2 ?? '', durationMs: Date.now() - startedAt };
    }

    const durationMs2 = Date.now() - startedAt;
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'structural_prompt', correlationId, outputSummary: `len=${text2.length}`, durationMs: durationMs2 });
    return { ok: true, structuralPrompt: text2.trim(), durationMs: durationMs2, llmCall: { model, temperature, promptTokens, completionTokens: Math.ceil(text2.length / 4) } };
  }

  const durationMs = Date.now() - startedAt;
  logger.info({ event: 'ai_pipeline_stage_end', stage: 'structural_prompt', correlationId, outputSummary: `len=${text.length}`, durationMs });

  return {
    ok: true,
    structuralPrompt: text.trim(),
    durationMs,
    llmCall: { model, temperature, promptTokens, completionTokens: Math.ceil(text.length / 4) },
  };
}
