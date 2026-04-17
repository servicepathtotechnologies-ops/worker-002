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

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(nodeCatalog: NodeCatalogText): string {
  return `You are a workflow capability grouper. Your job is to identify which nodes from the Node_Catalog can fulfill a given use-case unit.

NODE_CATALOG:
${nodeCatalog}

OUTPUT FORMAT:
Return ONLY a valid JSON object. No markdown, no code fences, no explanation.

The object must have exactly these fields:
- "containerId": a unique UUID string (generate a new one)
- "label": a short human-readable label for this capability group, e.g. "Send Email"
- "candidates": an array of node type strings from the Node_Catalog that can fulfill this use-case

RULES:
1. "candidates" must contain only node type strings that appear in the NODE_CATALOG above.
2. Group nodes by semantic equivalence — nodes that can accomplish the same job for this use-case.
3. Do NOT include node types that are not in the NODE_CATALOG.
4. Do NOT pre-select or rank candidates — list all semantically equivalent options.
5. Do NOT use hardcoded mappings — derive groupings from the node descriptions in the catalog.
6. "candidates" should contain at least 1 and at most 10 node type strings.

Example output:
{
  "containerId": "550e8400-e29b-41d4-a716-446655440000",
  "label": "Send Email",
  "candidates": ["google_gmail", "outlook", "smtp"]
}`;
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

  // ── Empty container → re-prompt once (Req 2.6) ───────────────────────────
  if (validNodeTypes.length === 0) {
    const invalidList = rawCandidates.filter((c) => typeof c === 'string').join(', ') || '(none returned)';
    const violationContext = `All candidate node types you returned were invalid (not found in the registry): [${invalidList}]. You must return node type strings that exist in the NODE_CATALOG. Check the catalog carefully and return only exact type strings from it.`;

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
      validNodeTypes = validateCandidates(rawCandidates3, unit.unitId, correlationId);
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
