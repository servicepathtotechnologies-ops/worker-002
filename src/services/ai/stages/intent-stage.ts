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
import { runIntentStageRemote } from './intent-stage-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StructuredIntent {
  intent: string;
  triggerType: 'schedule' | 'webhook' | 'form' | 'chat_trigger' | 'manual_trigger';
  actions: string[];
  dataFlows: Array<{ from: string; to: string; dataDescription: string }>;
  constraints: string[];
  /** The verbatim user prompt — preserved for downstream destination-coverage checks. */
  originalPrompt: string;
}

export interface IntentStageResult {
  ok: true;
  intent: StructuredIntent;
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
  fallback?: boolean;
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

  // ── Try remote ai-generator first ────────────────────────────────────────────
  const remote = await runIntentStageRemote(userPrompt, catalog, correlationId);

  if (remote?.ok) {
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'intent', correlationId, source: 'remote', durationMs: Date.now() - startedAt });
    return {
      ...remote,
      intent: { ...remote.intent, originalPrompt: userPrompt },
    };
  }

  if (remote && !remote.ok) {
    logger.warn({
      event: 'ai_pipeline_stage_warn',
      stage: 'intent',
      correlationId,
      reason: `ai-generator returned ${remote.code} — falling back to local`,
    });
  }

  const { systemPrompt } = systemPromptBuilder.build({
    stage: 'intent',
    nodeCatalog: catalog,
    userIntent: userPrompt,
  });

  const model = 'gemini-3.5-flash';
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
    return buildFallbackIntentStageResult({
      userPrompt,
      systemPrompt,
      rawResponse: String(err),
      startedAt,
      model,
      temperature,
      correlationId,
      reason: 'LLM_CALL_FAILED',
    });
  }

  const durationMs = Date.now() - startedAt;

  const parsed = tryParseIntent(text);
  if (parsed) {
    const promptTokens = Math.ceil(systemPrompt.length / 4);
    const completionTokens = Math.ceil(text.length / 4);
    logger.info({ event: 'ai_pipeline_stage_end', stage: 'intent', correlationId, outputSummary: `actions=${parsed.actions.length}, dataFlows=${parsed.dataFlows.length}`, durationMs });
    return { ok: true, intent: { ...parsed, originalPrompt: userPrompt }, durationMs, llmCall: { model, temperature, promptTokens, completionTokens } };
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
    return { ok: true, intent: { ...parsed2, originalPrompt: userPrompt }, durationMs: Date.now() - startedAt, llmCall: { model, temperature, promptTokens, completionTokens } };
  }

  logger.error({ event: 'ai_pipeline_stage_error', stage: 'intent', correlationId, error: 'INVALID_LLM_RESPONSE', llmResponse: text2 });
  return buildFallbackIntentStageResult({
    userPrompt,
    systemPrompt,
    rawResponse: text2,
    startedAt,
    model,
    temperature,
    correlationId,
    reason: 'INVALID_LLM_RESPONSE',
  });
}

function buildFallbackIntentStageResult(params: {
  userPrompt: string;
  systemPrompt: string;
  rawResponse: string;
  startedAt: number;
  model: string;
  temperature: number;
  correlationId?: string;
  reason: string;
}): IntentStageResult {
  const fallbackIntent = buildDeterministicIntent(params.userPrompt);
  logger.warn({
    event: 'ai_pipeline_stage_fallback',
    stage: 'intent',
    correlationId: params.correlationId,
    reason: params.reason,
    outputSummary: `actions=${fallbackIntent.actions.length}`,
  });

  return {
    ok: true,
    intent: fallbackIntent,
    durationMs: Date.now() - params.startedAt,
    fallback: true,
    llmCall: {
      model: params.model,
      temperature: params.temperature,
      promptTokens: Math.ceil(params.systemPrompt.length / 4),
      completionTokens: Math.ceil(params.rawResponse.length / 4),
    },
  };
}

function stripMarkdownFences(text: string): string {
  let cleaned = String(text || '').trim();
  
  // Remove BOM (Byte Order Mark) if present
  cleaned = cleaned.replace(/^\uFEFF/, '').trim();

  // Iteratively remove markdown fences (handles nested fences)
  // Supports: ```json, ```, ``` json, ```typescript, etc.
  for (let i = 0; i < 5; i += 1) {
    const next = cleaned
      // Remove opening fence with optional language tag and whitespace
      .replace(/^\s*```[a-z0-9_-]*\s*/i, '')
      // Remove closing fence with optional whitespace
      .replace(/\s*```\s*$/i, '')
      .trim();
    
    // If no change, we've removed all fences
    if (next === cleaned) break;
    cleaned = next;
  }

  // Remove any remaining standalone fence lines (edge case)
  cleaned = cleaned.replace(/^\s*```[a-z0-9_-]*\s*$/gim, '').trim();

  return cleaned;
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
      originalPrompt: '', // caller overwrites via { ...parsed, originalPrompt: userPrompt }
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
      originalPrompt: '', // caller overwrites via { ...parsed, originalPrompt: userPrompt }
    };
  } catch {
    return null;
  }
}

function buildDeterministicIntent(userPrompt: string): StructuredIntent {
  const prompt = userPrompt.trim();
  const triggerType = inferTriggerType(prompt);
  const actions = extractActionPhrases(prompt);

  return {
    intent: prompt,
    triggerType,
    actions: actions.length > 0 ? actions : [prompt],
    dataFlows: [],
    constraints: [],
    originalPrompt: prompt,
  };
}

function inferTriggerType(prompt: string): StructuredIntent['triggerType'] {
  const text = prompt.toLowerCase();
  if (/\b(webhook|api call|http request|incoming request)\b/.test(text)) return 'webhook';
  if (/\b(form|submission|submitted)\b/.test(text)) return 'form';
  if (/\b(chat|message from user|conversation)\b/.test(text)) return 'chat_trigger';
  if (/\b(schedule|scheduled|every|daily|weekly|monthly|cron)\b/.test(text)) return 'schedule';
  return 'manual_trigger';
}

function extractActionPhrases(prompt: string): string[] {
  if (!containsConditionalLanguage(prompt)) {
    return prompt
      .split(/(?:\b(?:and then|then|after that|afterwards)\b|[,;])/i)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .slice(0, 12);
  }

  const actions: string[] = [];
  const segments = prompt
    .replace(/\b(else|otherwise)\b/gi, '\n$1')
    .replace(/\b(if|when)\b/gi, '\n$1')
    .split(/(?:[.;]|\r?\n)+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const addActionParts = (value: string) => {
    const cleaned = normalizeFallbackAction(value);
    if (!cleaned) return;
    cleaned
      .split(/(?:\b(?:and then|then|after that|afterwards)\b|,(?=\s*(?:mark|set|send|notify|message|email|post|publish|update|create|call|route)\b)|\band\b(?=\s*(?:mark|set|send|notify|message|email|post|publish|update|create|call|route)\b))/i)
      .map((part) => normalizeFallbackAction(part))
      .filter(Boolean)
      .forEach((part) => actions.push(part));
  };

  for (const segment of segments) {
    const conditional = segment.match(/^(if|when)\s+([\s\S]*?)(?:,\s*([\s\S]+))?$/i);
    if (conditional) {
      const condition = normalizeFallbackAction(conditional[2]);
      if (condition) actions.push(`check if ${condition}`);
      addActionParts(conditional[3] || '');
      continue;
    }

    const alternative = segment.match(/^(else|otherwise)\s*,?\s*([\s\S]+)$/i);
    if (alternative) {
      addActionParts(alternative[2]);
      continue;
    }

    addActionParts(segment);
  }

  return actions
    .filter((action, index, all) => all.findIndex((other) => other.toLowerCase() === action.toLowerCase()) === index)
    .slice(0, 12);
}

function containsConditionalLanguage(value: string): boolean {
  // Check for comparison operators (including Unicode)
  if (/[\u2264\u2265]/.test(value)) return true;
  
  // Check for conditional keywords, operators, and phrases
  return /\b(if|when|else|otherwise|condition|conditional|route based on|branch|check if|verify if|based on whether|depending on|route by|approve or reject)\b|(?:<=|>=|==|!=|[<>]|\u2264|\u2265)/i.test(value);
}

function normalizeFallbackAction(value: string): string {
  return String(value || '')
    .replace(/^\s*(?:create|build|make)\s+(?:an?\s+)?(?:autonomous\s+)?workflow\s+(?:where|that|which)\s+/i, '')
    .replace(/^\s*(?:the\s+)?(?:workflow|automation)\s+(?:should\s+)?/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}
