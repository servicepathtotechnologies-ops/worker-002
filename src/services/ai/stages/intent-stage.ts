/**
 * Intent Stage — AI-First Pipeline
 *
 * Extracts structured intent from the raw user prompt via LLM.
 * No keyword matching. No hardcoded rules. Pure AI.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { geminiOrchestrator } from '../gemini-orchestrator';
import { systemPromptBuilder } from '../system-prompt-builder';
import { buildNodeCatalogText } from '../node-catalog-builder';
import { logger } from '../../../core/logger';
import type { NodeCatalogText } from '../node-catalog-builder';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StructuredIntent {
  intent: string;
  triggerType: 'schedule' | 'webhook' | 'form' | 'chat_trigger' | 'manual_trigger';
  actions: string[];
  dataFlows: Array<{ from: string; to: string; dataDescription: string }>;
  constraints: string[];
}

export interface IntentStageResult {
  ok: true;
  intent: StructuredIntent;
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface IntentStageError {
  ok: false;
  code: 'INVALID_LLM_RESPONSE';
  rawResponse: string;
  durationMs: number;
}

export type IntentStageOutput = IntentStageResult | IntentStageError;

// ─── Intent Stage ─────────────────────────────────────────────────────────────

export async function runIntentStage(
  userPrompt: string,
  nodeCatalog?: NodeCatalogText,
  correlationId?: string,
): Promise<IntentStageOutput> {
  const catalog = nodeCatalog ?? buildNodeCatalogText();
  const startedAt = Date.now();
  let catalogNodeCount = 0;
  try { catalogNodeCount = JSON.parse(catalog).length; } catch { /* catalog may be plain text */ }
  const inputSummary = `prompt_len=${userPrompt.length}, catalog_nodes=${catalogNodeCount}`;

  logger.info({ event: 'ai_pipeline_stage_start', stage: 'intent', correlationId, inputSummary });

  const { systemPrompt } = systemPromptBuilder.build({
    stage: 'intent',
    nodeCatalog: catalog,
    userIntent: userPrompt,
  });

  const model = 'gemini-2.5-flash';
  const temperature = 0.1;

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'intent', correlationId, model, temperature });

  let text: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'intent-analysis',
      { system: systemPrompt, message: userPrompt },
      { model, temperature, cache: false },
    );
    text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'intent', correlationId, error: 'LLM_CALL_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  const durationMs = Date.now() - startedAt;

  const parsed = tryParseIntent(text);
  if (parsed) {
    const promptTokens = Math.ceil(systemPrompt.length / 4);
    const completionTokens = Math.ceil(text.length / 4);
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'intent', correlationId, outputSummary: `actions=${parsed.actions.length}, dataFlows=${parsed.dataFlows.length}`, durationMs });
    return { ok: true, intent: parsed, durationMs, llmCall: { model, temperature, promptTokens, completionTokens } };
  }

  // Retry once with schema reminder
  logger.warn({ event: 'ai_pipeline_stage_retry', stage: 'intent', correlationId, reason: 'JSON parse failed on first attempt' });

  let text2: string;
  try {
    const retryPrompt = systemPrompt + '\n\nCRITICAL: Your previous response was not valid JSON. Return ONLY the JSON object, nothing else.';
    const raw2 = await geminiOrchestrator.processRequest(
      'intent-analysis',
      { system: retryPrompt, message: userPrompt },
      { model, temperature, cache: false },
    );
    text2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'intent', correlationId, error: 'LLM_RETRY_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  const parsed2 = tryParseIntent(text2);
  if (parsed2) {
    const promptTokens = Math.ceil(systemPrompt.length / 4);
    const completionTokens = Math.ceil(text2.length / 4);
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'intent', correlationId, outputSummary: `actions=${parsed2.actions.length} (retry)`, durationMs: Date.now() - startedAt });
    return { ok: true, intent: parsed2, durationMs: Date.now() - startedAt, llmCall: { model, temperature, promptTokens, completionTokens } };
  }

  logger.error({ event: 'ai_pipeline_stage_error', stage: 'intent', correlationId, error: 'INVALID_LLM_RESPONSE', llmResponse: text2 });
  return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: text2, durationMs: Date.now() - startedAt };
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function tryParseIntent(text: string): StructuredIntent | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      // Attempt partial recovery: JSON may be truncated before the closing brace.
      // If we can extract the required fields from the partial text, salvage them.
      return tryParsePartialIntent(cleaned.substring(start === -1 ? 0 : start));
    }
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    if (!obj.intent || !obj.triggerType || !Array.isArray(obj.actions)) return null;
    return {
      intent: String(obj.intent),
      triggerType: obj.triggerType,
      actions: obj.actions.map(String),
      dataFlows: Array.isArray(obj.dataFlows) ? obj.dataFlows : [],
      constraints: Array.isArray(obj.constraints) ? obj.constraints.map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Partial JSON recovery for truncated Gemini responses.
 * Gemini may hit its output token limit mid-array, leaving the JSON unclosed.
 * If the required fields (intent, triggerType, actions) are already present in
 * the partial text, we extract them via regex rather than failing the whole stage.
 */
function tryParsePartialIntent(partial: string): StructuredIntent | null {
  try {
    // Extract "intent" string
    const intentMatch = partial.match(/"intent"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    // Extract "triggerType" string
    const triggerMatch = partial.match(/"triggerType"\s*:\s*"([^"]+)"/);
    // Extract "actions" array — grab everything between [ and the first ] or end of string
    const actionsMatch = partial.match(/"actions"\s*:\s*\[([\s\S]*?)(?:\]|$)/);

    if (!intentMatch || !triggerMatch || !actionsMatch) return null;

    const rawActions = actionsMatch[1];
    // Parse individual quoted strings from the (possibly incomplete) array
    const actions = [...rawActions.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    if (actions.length === 0) return null;

    const triggerType = triggerMatch[1] as StructuredIntent['triggerType'];
    const validTriggers: StructuredIntent['triggerType'][] = ['schedule', 'webhook', 'form', 'chat_trigger', 'manual_trigger'];
    if (!validTriggers.includes(triggerType)) return null;

    return {
      intent: intentMatch[1],
      triggerType,
      actions,
      dataFlows: [],   // truncated — safe to default to empty
      constraints: [], // truncated — safe to default to empty
    };
  } catch {
    return null;
  }
}
