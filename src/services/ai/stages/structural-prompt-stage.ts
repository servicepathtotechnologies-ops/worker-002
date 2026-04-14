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
): Promise<StructuralPromptOutput> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'structural_prompt',
    correlationId,
    inputSummary: `actions=${intent.actions.length}`,
  });

  const model = 'gemini-2.5-flash';
  const temperature = 0.2;

  const systemPrompt = `You are a workflow architect. Given a structured user intent and a node catalog, produce a concise plain-language blueprint of the workflow.

The blueprint must describe:
1. Which nodes are needed and why
2. How they connect in sequence
3. What each node does in the context of the user's goal

Return ONLY a plain-language paragraph (no JSON, no markdown, no bullet points). Be specific and concrete.`;

  const message = `STRUCTURED_INTENT:\n${JSON.stringify(intent, null, 2)}\n\nNODE_CATALOG:\n${nodeCatalog}`;
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
        { system: systemPrompt + '\n\nCRITICAL: Return a non-empty plain-language paragraph describing the workflow blueprint.', message },
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
