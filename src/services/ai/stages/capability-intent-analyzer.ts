/**
 * Capability Intent Analyzer — Capability-Based Node Selection Flow (Stage 1)
 *
 * Parses the user's natural language prompt into an ordered list of Use_Case_Units
 * using the LLM. No keyword pre-filtering, tag-matching, or deterministic scoring
 * is applied before the LLM call.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { logger } from '../../../core/logger';
import type { NodeCatalogText } from '../node-catalog-builder';
import type {
  UseCaseUnit,
  IntentAnalysisOutput,
  IntentAnalysisError,
} from './capability-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';
const TEMPERATURE = 0.1;
const VALID_SEMANTIC_ROLES: UseCaseUnit['semanticRole'][] = [
  'trigger',
  'data_source',
  'communication',
  'transformation',
  'output',
  'logic',
];
const MIN_UNITS = 1;
const MAX_UNITS = 30; // Increased to support complex nested branching workflows

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(nodeCatalog: NodeCatalogText): string {
  return `You are a workflow intent analyzer. Your job is to parse a user's natural language prompt into an ordered list of discrete use-case units that represent the distinct tasks the workflow must perform.

NODE_CATALOG:
${nodeCatalog}

OUTPUT FORMAT:
Return ONLY a valid JSON array of objects. No markdown, no code fences, no explanation.

Each object in the array must have exactly these fields:
- "unitId": a unique UUID string (generate a new one for each unit)
- "label": a short human-readable label, e.g. "Trigger: new email received"
- "semanticRole": one of exactly: "trigger", "data_source", "communication", "transformation", "output", "logic"
- "description": a natural language description of what this unit must accomplish
- "orderIndex": zero-based integer position in the ordered list

RULES:
1. The list must contain between 1 and 30 units (inclusive).
2. Exactly ONE unit must have semanticRole "trigger". No more, no less.
3. Every unit must have a non-empty label and a non-empty description.
4. Units are ordered by execution sequence (trigger first, then subsequent steps).
5. Do NOT include any node names, node type strings, or implementation details — describe intent only.
6. Do NOT pre-select or suggest specific nodes — that happens in a later stage.

CRITICAL RULE — BRANCHING WORKFLOWS (switch / if-else):
When the user's prompt describes conditional routing (e.g. "if X do A, if Y do B", "route by status", "switch on role"), you MUST:
- Create ONE logic unit for each branching condition (the switch/if-else node itself).
- Create ONE SEPARATE output unit for EACH branch case/path.
- NEVER collapse multiple branch outcomes into a single shared output unit.
- Each branch case must have its own independent output unit with a description specific to that case.

Example — "route by order status: if shipped send email, if processing send Slack, if cancelled send Slack":
CORRECT (3 separate output units, one per case):
  { "label": "Route by order status", "semanticRole": "logic", ... }
  { "label": "Send shipping email (shipped)", "semanticRole": "communication", ... }
  { "label": "Send processing Slack (processing)", "semanticRole": "communication", ... }
  { "label": "Send cancellation Slack (cancelled)", "semanticRole": "communication", ... }

WRONG (collapsed into one unit):
  { "label": "Route by order status", "semanticRole": "logic", ... }
  { "label": "Send notification", "semanticRole": "communication", ... }  ← WRONG: one unit for 3 cases

NESTED BRANCHING — if a branch case itself contains another condition:
- Create a logic unit for the inner condition.
- Create one output unit per inner branch case.
- Example: "if shipped → if express: send email + Slack; if standard: send email only" requires:
  - 1 outer switch unit (route by status)
  - 1 inner switch unit (route by priority, inside the "shipped" branch)
  - 1 output unit for express email
  - 1 output unit for express Slack
  - 1 output unit for standard email

COUNT CHECK: Before returning, verify that the number of output/communication units equals the total number of distinct branch outcomes across all conditions. If a switch has 3 cases, there must be 3 separate output units for that switch.

STRICT SCOPE RULE — EXPLICIT USER INTENT ONLY:
You MUST generate use-case units ONLY for tasks the user EXPLICITLY described in their prompt.
You MUST NOT infer additional units from:
- Data flow descriptions in the node catalog
- Destination metadata (e.g., "Zoom Video", "Amazon SES", "SMTP", "webhook")
- Implicit sources or tangentially related services
- Theoretical alternatives the user did not mention
- Any service not directly named or clearly implied by the user's words

Example — User says "send via Gmail":
CORRECT: Create ONE unit for sending via Gmail
WRONG: Create units for Gmail, Outlook, Amazon SES, SMTP (user only mentioned Gmail)

Example — User says "if age > 18 send confirmation email via Gmail, else send notification via Slack":
CORRECT: Create units for the trigger, the if/else condition, Gmail (true branch), and Slack (false branch) — exactly 4 units
WRONG: Create units for Gmail, Slack, Zoom Video, Amazon SES, webhook (user only mentioned Gmail and Slack)

DEDUPLICATION RULE:
If two branch cases would produce the same type of output (e.g., both send a Slack message), they may share the same use-case unit type but must have distinct labels describing each branch's specific purpose.
Do NOT create separate units for the same service unless the user explicitly named multiple distinct instances.

Example — User says "if condition A send Gmail, if condition B send Gmail":
CORRECT: Create ONE Gmail unit with label "Send Gmail notification" (shared by both branches, or two with distinct labels if the content differs)
WRONG: Create two identical Gmail units with no distinction

Example output:
[
  {
    "unitId": "550e8400-e29b-41d4-a716-446655440000",
    "label": "Trigger: new email received",
    "semanticRole": "trigger",
    "description": "Start the workflow when a new email arrives in the inbox",
    "orderIndex": 0
  },
  {
    "unitId": "550e8400-e29b-41d4-a716-446655440001",
    "label": "Send notification",
    "semanticRole": "communication",
    "description": "Send a Slack message with the email subject and sender",
    "orderIndex": 1
  }
]`;
}

/**
 * Exported for testing only — allows tests to inspect the system prompt content
 * without calling the LLM.
 */
export function buildSystemPromptForTest(nodeCatalog: NodeCatalogText): string {
  return buildSystemPrompt(nodeCatalog);
}

function buildRetrySystemPrompt(nodeCatalog: NodeCatalogText, violationContext: string): string {
  return buildSystemPrompt(nodeCatalog) + `

CRITICAL — YOUR PREVIOUS RESPONSE HAD THE FOLLOWING VIOLATION:
${violationContext}

Fix the violation and return ONLY the corrected JSON array. No markdown, no explanation.`;
}

// ─── Parsing & Validation ─────────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function tryParseUnits(text: string): UseCaseUnit[] | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return null;
    const arr = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr as UseCaseUnit[];
  } catch {
    return null;
  }
}

interface ValidationResult {
  valid: boolean;
  violation?: string;
}

function validateUnits(units: UseCaseUnit[]): ValidationResult {
  if (units.length === 0) {
    return { valid: false, violation: 'EMPTY_UNIT_LIST: The array is empty. You must return between 1 and 20 units.' };
  }
  if (units.length > MAX_UNITS) {
    return { valid: false, violation: `TOO_MANY_UNITS: The array contains ${units.length} units. Maximum allowed is ${MAX_UNITS}.` };
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.label || typeof u.label !== 'string' || u.label.trim() === '') {
      return { valid: false, violation: `Unit at index ${i} has an empty or missing "label" field.` };
    }
    if (!u.description || typeof u.description !== 'string' || u.description.trim() === '') {
      return { valid: false, violation: `Unit at index ${i} has an empty or missing "description" field.` };
    }
    if (!VALID_SEMANTIC_ROLES.includes(u.semanticRole)) {
      return {
        valid: false,
        violation: `Unit at index ${i} has invalid semanticRole "${u.semanticRole}". Must be one of: ${VALID_SEMANTIC_ROLES.join(', ')}.`,
      };
    }
  }

  const triggerUnits = units.filter(u => u.semanticRole === 'trigger');
  if (triggerUnits.length === 0) {
    return {
      valid: false,
      violation: 'MISSING_TRIGGER: No unit has semanticRole "trigger". Exactly one unit must be the trigger.',
    };
  }
  if (triggerUnits.length > 1) {
    return {
      valid: false,
      violation: `MULTIPLE_TRIGGERS: ${triggerUnits.length} units have semanticRole "trigger". Exactly one unit must be the trigger.`,
    };
  }

  return { valid: true };
}

function normalizeUnits(units: UseCaseUnit[]): UseCaseUnit[] {
  return units.map((u, i) => ({
    unitId: u.unitId && typeof u.unitId === 'string' ? u.unitId : uuidv4(),
    label: String(u.label).trim(),
    semanticRole: u.semanticRole,
    description: String(u.description).trim(),
    orderIndex: typeof u.orderIndex === 'number' ? u.orderIndex : i,
  }));
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Parse the user's prompt into an ordered list of Use_Case_Units.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
export async function runIntentAnalysis(
  userPrompt: string,
  nodeCatalog: NodeCatalogText,
  correlationId?: string,
): Promise<IntentAnalysisOutput> {
  const startedAt = Date.now();

  // Req 1.6 — SHA-256 of input prompt for structured logging
  const promptHash = createHash('sha256').update(userPrompt).digest('hex');

  logger.info({
    event: 'capability_intent_analysis_start',
    stage: 'capability-intent-analyzer',
    correlationId,
    promptHash,
    promptLength: userPrompt.length,
  });

  const systemPrompt = buildSystemPrompt(nodeCatalog);

  // ── First attempt ──────────────────────────────────────────────────────────
  let rawText: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'intent-analysis',
      { system: systemPrompt, message: userPrompt },
      { model: MODEL, temperature: TEMPERATURE, cache: false },
    );
    rawText = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error({
      event: 'capability_intent_analysis_error',
      stage: 'capability-intent-analyzer',
      correlationId,
      promptHash,
      error: 'LLM_CALL_FAILED',
      message: String(err),
      durationMs,
    });
    return {
      ok: false,
      code: 'LLM_CALL_FAILED',
      message: `LLM call failed: ${String(err)}`,
      durationMs,
    } satisfies IntentAnalysisError;
  }

  const parsed = tryParseUnits(rawText);

  // ── Parse failure → retry with schema reminder ─────────────────────────────
  if (!parsed) {
    logger.warn({
      event: 'capability_intent_analysis_retry',
      stage: 'capability-intent-analyzer',
      correlationId,
      promptHash,
      reason: 'JSON parse failed on first attempt — retrying with schema reminder',
    });

    const retrySystemPrompt = buildRetrySystemPrompt(
      nodeCatalog,
      'Your previous response could not be parsed as a JSON array. Return ONLY a valid JSON array of UseCaseUnit objects — no markdown, no code fences, no explanation.',
    );

    let rawText2: string;
    try {
      const raw2 = await geminiOrchestrator.processRequest(
        'intent-analysis',
        { system: retrySystemPrompt, message: userPrompt },
        { model: MODEL, temperature: TEMPERATURE, cache: false },
      );
      rawText2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: 'LLM_RETRY_FAILED',
        message: String(err),
        durationMs,
      });
      return {
        ok: false,
        code: 'LLM_CALL_FAILED',
        message: `LLM retry call failed: ${String(err)}`,
        durationMs,
      } satisfies IntentAnalysisError;
    }

    const parsed2 = tryParseUnits(rawText2);
    if (!parsed2) {
      const durationMs = Date.now() - startedAt;
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: 'INVALID_LLM_RESPONSE',
        message: 'JSON parse failed after retry',
        durationMs,
      });
      return {
        ok: false,
        code: 'INVALID_LLM_RESPONSE',
        message: 'LLM response could not be parsed as a JSON array after retry.',
        durationMs,
      } satisfies IntentAnalysisError;
    }

    // Validate the retry result
    const validation2 = validateUnits(parsed2);
    if (!validation2.valid) {
      const durationMs = Date.now() - startedAt;
      const code = parsed2.length === 0 ? 'EMPTY_UNIT_LIST' : 'INVALID_LLM_RESPONSE';
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: code,
        violation: validation2.violation,
        durationMs,
      });
      return {
        ok: false,
        code,
        message: validation2.violation ?? 'Validation failed after retry.',
        durationMs,
      } satisfies IntentAnalysisError;
    }

    const normalized2 = normalizeUnits(parsed2);
    const durationMs2 = Date.now() - startedAt;
    logger.info({
      event: 'capability_intent_analysis_end',
      stage: 'capability-intent-analyzer',
      correlationId,
      promptHash,
      unitCount: normalized2.length,
      durationMs: durationMs2,
      retried: true,
    });
    return {
      ok: true,
      units: normalized2,
      promptHash,
      durationMs: durationMs2,
      llmCall: { model: MODEL, durationMs: durationMs2 },
    };
  }

  // ── Validation failure → retry with violation context ──────────────────────
  const validation = validateUnits(parsed);
  if (!validation.valid) {
    // Empty list is a terminal error — no retry
    if (parsed.length === 0) {
      const durationMs = Date.now() - startedAt;
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: 'EMPTY_UNIT_LIST',
        durationMs,
      });
      return {
        ok: false,
        code: 'EMPTY_UNIT_LIST',
        message: 'LLM returned an empty unit list.',
        durationMs,
      } satisfies IntentAnalysisError;
    }

    logger.warn({
      event: 'capability_intent_analysis_retry',
      stage: 'capability-intent-analyzer',
      correlationId,
      promptHash,
      reason: `Validation failed — retrying with violation context: ${validation.violation}`,
    });

    const retrySystemPrompt = buildRetrySystemPrompt(nodeCatalog, validation.violation!);

    let rawText3: string;
    try {
      const raw3 = await geminiOrchestrator.processRequest(
        'intent-analysis',
        { system: retrySystemPrompt, message: userPrompt },
        { model: MODEL, temperature: TEMPERATURE, cache: false },
      );
      rawText3 = typeof raw3 === 'string' ? raw3 : JSON.stringify(raw3);
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: 'LLM_RETRY_FAILED',
        message: String(err),
        durationMs,
      });
      return {
        ok: false,
        code: 'LLM_CALL_FAILED',
        message: `LLM retry call failed: ${String(err)}`,
        durationMs,
      } satisfies IntentAnalysisError;
    }

    const parsed3 = tryParseUnits(rawText3);
    if (!parsed3) {
      const durationMs = Date.now() - startedAt;
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: 'INVALID_LLM_RESPONSE',
        message: 'JSON parse failed on validation-retry',
        durationMs,
      });
      return {
        ok: false,
        code: 'INVALID_LLM_RESPONSE',
        message: 'LLM response could not be parsed as a JSON array on validation retry.',
        durationMs,
      } satisfies IntentAnalysisError;
    }

    const validation3 = validateUnits(parsed3);
    if (!validation3.valid) {
      const durationMs = Date.now() - startedAt;
      const code = parsed3.length === 0 ? 'EMPTY_UNIT_LIST' : 'INVALID_LLM_RESPONSE';
      logger.error({
        event: 'capability_intent_analysis_error',
        stage: 'capability-intent-analyzer',
        correlationId,
        promptHash,
        error: code,
        violation: validation3.violation,
        durationMs,
      });
      return {
        ok: false,
        code,
        message: validation3.violation ?? 'Validation failed after retry.',
        durationMs,
      } satisfies IntentAnalysisError;
    }

    const normalized3 = normalizeUnits(parsed3);
    const durationMs3 = Date.now() - startedAt;
    // Req 1.6 — structured log entry
    logger.info({
      event: 'capability_intent_analysis_end',
      stage: 'capability-intent-analyzer',
      correlationId,
      promptHash,
      unitCount: normalized3.length,
      durationMs: durationMs3,
      retried: true,
    });
    return {
      ok: true,
      units: normalized3,
      promptHash,
      durationMs: durationMs3,
      llmCall: { model: MODEL, durationMs: durationMs3 },
    };
  }

  // ── Success on first attempt ───────────────────────────────────────────────
  const normalized = normalizeUnits(parsed);
  const durationMs = Date.now() - startedAt;

  // Req 1.6 — structured log entry with promptHash, unitCount, durationMs
  logger.info({
    event: 'capability_intent_analysis_end',
    stage: 'capability-intent-analyzer',
    correlationId,
    promptHash,
    unitCount: normalized.length,
    durationMs,
  });

  return {
    ok: true,
    units: normalized,
    promptHash,
    durationMs,
    llmCall: { model: MODEL, durationMs },
  };
}
