/**
 * Capability Grouper Stage — Capability-Based Node Selection Flow (Stage 2)
 *
 * For each Use_Case_Unit, invokes the LLM with the unit description and the
 * Node_Catalog to produce a Capability_Container. All grouping is driven by
 * semantic equivalence as determined by the LLM — no hardcoded mappings, no
 * if/switch on node type strings.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 8.1, 8.3, 8.4, 8.6
 */

import { v4 as uuidv4 } from 'uuid';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { getCredentialVault } from '../../credential-vault';
import { logger } from '../../../core/logger';
import type { NodeCatalogText } from '../node-catalog-builder';
import type {
  UseCaseUnit,
  CandidateNode,
  CapabilityContainer,
  CapabilityGroupingResult,
  CapabilityGroupingError,
} from './capability-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';
const TEMPERATURE = 0.1;

// ─── Semantic Role → Category Filter ─────────────────────────────────────────

/**
 * Maps each semantic role to the registry categories that are valid candidates.
 * This is a defense-in-depth guard: after the LLM returns candidates, we drop any
 * node whose registry category doesn't match the unit's semantic role.
 *
 * Why: the LLM sometimes returns function/javascript nodes for communication use
 * cases (e.g. "Send email via Gmail"), or If/Else for multi-case switch use cases.
 * This filter makes the category constraint deterministic regardless of LLM output.
 */
const SEMANTIC_ROLE_ALLOWED_CATEGORIES: Record<string, string[]> = {
  // trigger: only real trigger-category nodes (registry stores these as 'triggers', plural)
  trigger: ['trigger', 'triggers'],

  // logic: only branching/control-flow nodes
  logic: ['logic'],

  // communication: anything that sends a message, post, or notification
  // 'output' = slack/email/discord; 'social_media' = instagram/twitter/linkedin;
  // 'google' = gmail; 'crm'/'productivity' = CRM messaging, Notion, etc.
  communication: ['communication', 'output', 'social_media', 'google', 'crm', 'productivity'],

  // output: write/send to any external system — broadly permissive
  output: [
    'communication', 'output', 'social_media',
    'data', 'ai', 'utility',
    'google', 'crm', 'productivity',
    'database', 'devops', 'ecommerce', 'payment', 'cms', 'storage', 'http_api',
  ],

  // data_source: read from any external system — broadly permissive
  data_source: [
    'data', 'communication', 'output', 'social_media',
    'ai', 'utility', 'google', 'crm', 'productivity',
    'database', 'devops', 'ecommerce', 'payment', 'cms', 'storage', 'http_api',
  ],

  // transformation: data processing and AI enrichment
  // 'transformation' normalizes to 'data' in registry, so include both
  transformation: ['transformation', 'data', 'ai', 'utility'],
};

function filterBySemanticRole(nodeTypes: string[], semanticRole: UseCaseUnit['semanticRole']): string[] {
  const allowed = SEMANTIC_ROLE_ALLOWED_CATEGORIES[semanticRole];
  if (!allowed) return nodeTypes;
  const filtered = nodeTypes.filter(nodeType => {
    const def = unifiedNodeRegistry.get(nodeType);
    const category = def?.category || 'utility';
    return allowed.includes(category);
  });
  // Always return the filtered result, even if empty.
  // An empty result triggers the retry-with-violation-context path, which tells the LLM
  // exactly which category to look in. Returning wrong-category nodes bypasses that correction.
  return filtered;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(nodeCatalog: NodeCatalogText): string {
  return `You are a workflow capability grouper. Your job is to identify which nodes from the Node_Catalog can fulfill a given use-case unit.

NODE_CATALOG:
${nodeCatalog}

OUTPUT FORMAT:
Return ONLY a valid JSON object. No markdown, no code fences, no explanation.

The object must have exactly these fields:
- "containerId": a unique UUID string (generate a new one)
- "label": a short human-readable label for this capability group that PRESERVES the branch context from the use-case unit label. If the unit label says "(shipped)" or "(processing)" or "(cancelled)", include that parenthetical in your label. Example: use-case label "Send Slack notification (processing)" → container label "Send Slack Notification (Processing)".
- "candidates": an array of node type strings from the Node_Catalog that can fulfill this use-case

RULES:
1. "candidates" must contain only node type strings that appear in the NODE_CATALOG above.
2. Group nodes by semantic equivalence — nodes that accomplish the EXACT same primary action for this use-case.
3. Do NOT include node types that are not in the NODE_CATALOG.
4. Do NOT pre-select or rank candidates — list all semantically equivalent options.
5. Do NOT use hardcoded mappings — derive groupings from the node descriptions in the catalog.
6. "candidates" should contain at least 1 and at most 5 node type strings.

SEMANTIC RELEVANCE RULE — STRICT:
Only include candidates whose PRIMARY PURPOSE directly matches the use-case unit.
"Primary purpose" means: the main thing the node is designed to do, as described in its catalog entry.

Do NOT include a node merely because it is in a related category or could theoretically be used in a workaround.

MANDATORY EXCLUSIONS — never include these unless the use-case EXPLICITLY says so:
- Aggregator / merge nodes (e.g., aggregate, merge_data): only when the use-case says "aggregate", "combine multiple streams", or "merge results"
- Code / script nodes (e.g., code, function, function_item): only when the use-case says "run code", "execute script", or "custom logic"
- HTTP request / generic API nodes (e.g., http_request, graphql): only when the use-case says "call a URL", "HTTP request", or "fetch from endpoint"
- Generic utility nodes (e.g., wait, delay, set, edit_fields, rename_keys): only when the use-case explicitly describes waiting, delaying, or field manipulation
- Do NOT include infrastructure/plumbing nodes that are not the user-facing service for this task

EXAMPLES — correct vs wrong:

Use-case: "Send email notification via Gmail":
CORRECT: google_gmail, outlook, amazon_ses (all send email)
WRONG: zoom_video, slack, webhook, aggregate, http_request

Use-case: "Get data from Google Sheets":
CORRECT: google_sheets, microsoft_excel, airtable (all read spreadsheet/table data)
WRONG: http_request, csv, aggregate, code, google_drive

Use-case: "Summarize text with AI":
CORRECT: openai, anthropic, google_gemini (AI models that can summarize)
WRONG: aggregate, code, edit_fields, http_request

Use-case: "Send Slack notification":
CORRECT: slack (sends Slack messages)
WRONG: google_gmail, zoom_video, aggregate, webhook

Use-case: "Trigger workflow when form is submitted":
CORRECT: form_trigger (form submission trigger)
WRONG: webhook, manual_trigger, schedule_trigger, http_request

Use-case: "Route by multiple cases / switch on a field value (3 or more named cases)":
CORRECT: switch (multi-case routing, one output per named case value)
WRONG: if_else (if_else is ONLY for binary true/false — never use it for 3+ named cases)

Use-case: "Route by true/false binary condition (if X then A else B)":
CORRECT: if_else (binary branching)
WRONG: switch (switch is for 3+ named cases, not binary conditions)

Example output:
{
  "containerId": "550e8400-e29b-41d4-a716-446655440000",
  "label": "Send Email",
  "candidates": ["google_gmail", "outlook", "smtp"]
}`;
}

/**
 * Exported for testing only — allows tests to inspect the grouper system prompt content
 * without calling the LLM.
 */
export function buildGrouperSystemPromptForTest(nodeCatalog: NodeCatalogText): string {
  return buildSystemPrompt(nodeCatalog);
}

function buildRetrySystemPrompt(nodeCatalog: NodeCatalogText, violationContext: string): string {
  return buildSystemPrompt(nodeCatalog) + `

CRITICAL — YOUR PREVIOUS RESPONSE HAD THE FOLLOWING ISSUE:
${violationContext}

Fix the issue and return ONLY the corrected JSON object. No markdown, no explanation.`;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

interface RawLlmContainer {
  containerId?: string;
  label?: string;
  candidates?: unknown[];
}

function tryParseContainer(text: string): RawLlmContainer | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
    return obj as RawLlmContainer;
  } catch {
    return null;
  }
}

// ─── Registry Validation ──────────────────────────────────────────────────────

/**
 * Validate candidate node type identifiers against the registry.
 * Invalid identifiers are discarded with a warning log (Req 2.5).
 * Returns the list of valid node type strings.
 */
function validateCandidates(
  rawCandidates: unknown[],
  unitId: string,
  correlationId: string | undefined,
): string[] {
  const valid: string[] = [];
  for (const candidate of rawCandidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      logger.warn({
        event: 'capability_grouper_invalid_candidate',
        stage: 'capability-grouper-stage',
        correlationId,
        unitId,
        candidate,
        reason: 'Not a non-empty string',
      });
      continue;
    }
    const nodeType = candidate.trim();
    if (!unifiedNodeRegistry.has(nodeType)) {
      logger.warn({
        event: 'capability_grouper_invalid_candidate',
        stage: 'capability-grouper-stage',
        correlationId,
        unitId,
        candidate: nodeType,
        reason: 'Not found in unifiedNodeRegistry',
      });
      continue;
    }
    valid.push(nodeType);
  }
  return valid;
}

// ─── Metadata Hydration ───────────────────────────────────────────────────────

/**
 * Hydrate a valid node type into a CandidateNode by reading all metadata
 * from the registry and checking the credential vault for the userId.
 * No hardcoded values — all metadata comes from the registry (Req 2.9, 8.1, 8.6).
 */
async function hydrateCandidateNode(
  nodeType: string,
  userId: string,
): Promise<CandidateNode> {
  const def = unifiedNodeRegistry.get(nodeType);
  // Registry is the single source of truth — label and description come from there.
  const label = def?.label ?? nodeType;
  const description = def?.description ?? '';

  // credentialRequirements: read from registry (Req 8.1, 8.6)
  const requirements = unifiedNodeRegistry.getRequiredCredentials(nodeType);
  const credentialRequirements = requirements.map((req) => req.category);

  // hasCredentials: check vault for each required credential (Req 8.6)
  let hasCredentials = false;
  if (requirements.length === 0) {
    // No credentials required — always satisfied
    hasCredentials = true;
  } else {
    try {
      const vault = getCredentialVault();
      // A user "has credentials" if at least one required credential key exists in the vault.
      // We check the provider as the vault key (consistent with credential-resolver.ts pattern).
      const checks = await Promise.all(
        requirements.map((req) =>
          vault.exists({ userId } as any, req.provider).catch(() => false),
        ),
      );
      hasCredentials = checks.some(Boolean);
    } catch {
      hasCredentials = false;
    }
  }

  return {
    nodeType,
    label,
    description,
    credentialRequirements,
    hasCredentials,
  };
}

// ─── Single-Unit Grouping ─────────────────────────────────────────────────────

/**
 * Call the LLM for a single Use_Case_Unit and return a validated, hydrated
 * CapabilityContainer. Handles parse failures and empty-container retries.
 */
async function groupSingleUnit(
  unit: UseCaseUnit,
  nodeCatalog: NodeCatalogText,
  userId: string,
  correlationId: string | undefined,
): Promise<CapabilityContainer | CapabilityGroupingError> {
  const userMessage = `Use-case unit to group:\nLabel: ${unit.label}\nSemantic role: ${unit.semanticRole}\nDescription: ${unit.description}`;

  // ── First LLM attempt ─────────────────────────────────────────────────────
  let rawText: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'intent-analysis',
      { system: buildSystemPrompt(nodeCatalog), message: userMessage },
      { model: MODEL, temperature: TEMPERATURE, cache: false },
    );
    rawText = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    logger.error({
      event: 'capability_grouper_llm_error',
      stage: 'capability-grouper-stage',
      correlationId,
      unitId: unit.unitId,
      error: 'LLM_CALL_FAILED',
      message: String(err),
    });
    return {
      ok: false,
      code: 'LLM_CALL_FAILED',
      failedUnitId: unit.unitId,
      message: `LLM call failed for unit "${unit.label}": ${String(err)}`,
      durationMs: 0, // caller tracks overall duration
    };
  }

  let parsed = tryParseContainer(rawText);

  // ── Parse failure → retry with schema reminder ────────────────────────────
  if (!parsed) {
    logger.warn({
      event: 'capability_grouper_retry',
      stage: 'capability-grouper-stage',
      correlationId,
      unitId: unit.unitId,
      reason: 'JSON parse failed on first attempt — retrying with schema reminder',
    });

    const retryPrompt = buildRetrySystemPrompt(
      nodeCatalog,
      'Your previous response could not be parsed as a JSON object. Return ONLY a valid JSON object with "containerId", "label", and "candidates" fields — no markdown, no code fences, no explanation.',
    );

    let rawText2: string;
    try {
      const raw2 = await geminiOrchestrator.processRequest(
        'intent-analysis',
        { system: retryPrompt, message: userMessage },
        { model: MODEL, temperature: TEMPERATURE, cache: false },
      );
      rawText2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
    } catch (err) {
      logger.error({
        event: 'capability_grouper_llm_error',
        stage: 'capability-grouper-stage',
        correlationId,
        unitId: unit.unitId,
        error: 'LLM_RETRY_FAILED',
        message: String(err),
      });
      return {
        ok: false,
        code: 'LLM_CALL_FAILED',
        failedUnitId: unit.unitId,
        message: `LLM retry call failed for unit "${unit.label}": ${String(err)}`,
        durationMs: 0,
      };
    }

    parsed = tryParseContainer(rawText2);
    if (!parsed) {
      logger.error({
        event: 'capability_grouper_error',
        stage: 'capability-grouper-stage',
        correlationId,
        unitId: unit.unitId,
        error: 'INVALID_LLM_RESPONSE',
        message: 'JSON parse failed after retry',
      });
      return {
        ok: false,
        code: 'INVALID_LLM_RESPONSE',
        failedUnitId: unit.unitId,
        message: `LLM response could not be parsed as a JSON object after retry for unit "${unit.label}".`,
        durationMs: 0,
      };
    }
  }

  // ── Registry validation of candidates ────────────────────────────────────
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  let validNodeTypes = validateCandidates(rawCandidates, unit.unitId, correlationId);

  // ── Semantic role filter: drop nodes whose category doesn't match the unit role ──
  // This prevents e.g. Function/JavaScript appearing for communication use cases.
  validNodeTypes = filterBySemanticRole(validNodeTypes, unit.semanticRole);

  // ── Empty container → re-prompt once (Req 2.6) ───────────────────────────
  if (validNodeTypes.length === 0) {
    const allowedCategories = SEMANTIC_ROLE_ALLOWED_CATEGORIES[unit.semanticRole]?.join(', ') || 'any';
    const invalidList = rawCandidates.filter((c) => typeof c === 'string').join(', ') || '(none returned)';
    const violationContext = `All candidate node types you returned were either invalid (not in registry) or wrong category for this use-case. This unit has semanticRole="${unit.semanticRole}", so candidates MUST come from registry categories: [${allowedCategories}]. The nodes you returned were: [${invalidList}]. Look for nodes in the NODE_CATALOG with category matching [${allowedCategories}].`;

    logger.warn({
      event: 'capability_grouper_retry',
      stage: 'capability-grouper-stage',
      correlationId,
      unitId: unit.unitId,
      reason: `All candidates invalid after registry validation — retrying with violation context`,
      invalidCandidates: rawCandidates,
    });

    const retryPrompt = buildRetrySystemPrompt(nodeCatalog, violationContext);

    let rawText3: string;
    try {
      const raw3 = await geminiOrchestrator.processRequest(
        'intent-analysis',
        { system: retryPrompt, message: userMessage },
        { model: MODEL, temperature: TEMPERATURE, cache: false },
      );
      rawText3 = typeof raw3 === 'string' ? raw3 : JSON.stringify(raw3);
    } catch (err) {
      logger.error({
        event: 'capability_grouper_llm_error',
        stage: 'capability-grouper-stage',
        correlationId,
        unitId: unit.unitId,
        error: 'LLM_RETRY_FAILED',
        message: String(err),
      });
      return {
        ok: false,
        code: 'LLM_CALL_FAILED',
        failedUnitId: unit.unitId,
        message: `LLM retry call failed for unit "${unit.label}": ${String(err)}`,
        durationMs: 0,
      };
    }

    const parsed3 = tryParseContainer(rawText3);
    if (parsed3) {
      const rawCandidates3 = Array.isArray(parsed3.candidates) ? parsed3.candidates : [];
      validNodeTypes = filterBySemanticRole(
        validateCandidates(rawCandidates3, unit.unitId, correlationId),
        unit.semanticRole,
      );
      if (parsed3.label && typeof parsed3.label === 'string') {
        parsed.label = parsed3.label;
      }
      if (parsed3.containerId && typeof parsed3.containerId === 'string') {
        parsed.containerId = parsed3.containerId;
      }
    }

    // Still empty after retry → EMPTY_CONTAINER error (Req 2.6)
    if (validNodeTypes.length === 0) {
      logger.error({
        event: 'capability_grouper_error',
        stage: 'capability-grouper-stage',
        correlationId,
        unitId: unit.unitId,
        error: 'EMPTY_CONTAINER',
        message: 'No valid candidates after registry validation retry',
      });
      return {
        ok: false,
        code: 'EMPTY_CONTAINER',
        failedUnitId: unit.unitId,
        message: `No valid candidate nodes found for use-case unit "${unit.label}" after retry.`,
        durationMs: 0,
      };
    }
  }

  // ── Hydrate candidates from registry (Req 2.9, 8.1, 8.6) ─────────────────
  const candidates: CandidateNode[] = await Promise.all(
    validNodeTypes.map((nodeType) => hydrateCandidateNode(nodeType, userId)),
  );

  // ── Build container (Req 2.2, 2.7 — no pre-selection) ────────────────────
  const container: CapabilityContainer = {
    // Always generate a fresh UUID — never trust the LLM's containerId (it may duplicate)
    containerId: uuidv4(),
    label: (parsed.label && typeof parsed.label === 'string' && parsed.label.trim())
      ? parsed.label.trim()
      : unit.label,
    useCaseUnit: unit,
    candidates, // no selected flag — Req 2.7
  };

  return container;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * For each Use_Case_Unit, invoke the LLM to produce a Capability_Container.
 * Returns containers in the same order as the input unit list (Req 2.1, 2.2).
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 8.1, 8.3, 8.4, 8.6
 */
export async function runCapabilityGrouping(
  units: UseCaseUnit[],
  nodeCatalog: NodeCatalogText,
  userId: string,
  correlationId?: string,
): Promise<CapabilityGroupingResult | CapabilityGroupingError> {
  const startedAt = Date.now();

  logger.info({
    event: 'capability_grouper_start',
    stage: 'capability-grouper-stage',
    correlationId,
    unitCount: units.length,
  });

  const containers: CapabilityContainer[] = [];

  // Process units sequentially to preserve order (Req 2.1)
  for (const unit of units) {
    const result = await groupSingleUnit(unit, nodeCatalog, userId, correlationId);

    if (!('containerId' in result)) {
      // It's a CapabilityGroupingError — propagate immediately
      const durationMs = Date.now() - startedAt;
      logger.error({
        event: 'capability_grouper_end',
        stage: 'capability-grouper-stage',
        correlationId,
        error: result.code,
        failedUnitId: result.failedUnitId,
        durationMs,
      });
      return { ...result, durationMs };
    }

    containers.push(result);
  }

  const durationMs = Date.now() - startedAt;

  logger.info({
    event: 'capability_grouper_end',
    stage: 'capability-grouper-stage',
    correlationId,
    containerCount: containers.length,
    durationMs,
  });

  return {
    ok: true,
    containers,
    durationMs,
  };
}
