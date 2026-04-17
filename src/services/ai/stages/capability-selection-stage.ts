import { logger } from '../../../core/logger';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { semanticNodeEquivalenceRegistry } from '../../../core/registry/semantic-node-equivalence-registry';
import type { StructuredIntent } from './intent-stage';

export type CapabilityIntentClass =
  | 'trigger'
  | 'data_source'
  | 'communication'
  | 'logic'
  | 'transformation'
  | 'generic_action';

export interface CapabilitySelectionPolicy {
  multiSelectAllowed: boolean;
  required: boolean;
}

export interface CapabilityOptionStep {
  stepId: string;
  stepText: string;
  intentClass: CapabilityIntentClass;
  candidateNodeTypes: string[];
  defaultSuggestedNodeType: string | null;
  selectionPolicy: CapabilitySelectionPolicy;
}

export interface CapabilitySelectionResult {
  ok: true;
  steps: CapabilityOptionStep[];
  durationMs: number;
}

export interface CapabilitySelectionError {
  ok: false;
  code: 'CAPABILITY_SELECTION_FAILED';
  durationMs: number;
  message: string;
}

export type CapabilitySelectionOutput = CapabilitySelectionResult | CapabilitySelectionError;

const MAX_CANDIDATES_PER_STEP = 8;
const MIN_FALLBACK_CANDIDATES = 3;
/**
 * Minimum score gap between rank-1 and rank-2 candidates for the AI to be
 * considered "confident" about a step. When the gap is below this threshold
 * the step is ambiguous and the Node_Selection_UI will be shown.
 */
const CONFIDENCE_SCORE_GAP_THRESHOLD = 3;
const TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'into',
  'onto',
  'this',
  'that',
  'your',
  'data',
  'task',
  'workflow',
  'node',
  'service',
  'provider',
  'google',
  'microsoft',
  'meta',
  'api',
]);
const GENERIC_ACTION_TOKENS = new Set([
  'get',
  'fetch',
  'read',
  'list',
  'load',
  'send',
  'write',
  'create',
  'update',
  'post',
  'notify',
  'process',
  'run',
  'execute',
  'use',
]);

interface CandidateScore {
  nodeType: string;
  canonicalType: string;
  score: number;
  specificMatchCount: number;
  matchedTokens: string[];
}

export function runCapabilitySelectionStage(
  intent: StructuredIntent,
  correlationId?: string,
): CapabilitySelectionOutput {
  const startedAt = Date.now();
  try {
    const steps: CapabilityOptionStep[] = [];

    const triggerType = unifiedNodeRegistry.resolveAlias(intent.triggerType) || intent.triggerType;
    steps.push(buildTriggerStep(triggerType));

    const actions = Array.isArray(intent.actions) ? intent.actions : [];
    const actionStepIdCounts = new Map<string, number>();
    actions.forEach((actionText) => {
      const stepText = String(actionText || '').trim();
      if (!stepText) return;
      const baseStepId = buildStableActionStepId(stepText);
      const seen = actionStepIdCounts.get(baseStepId) || 0;
      actionStepIdCounts.set(baseStepId, seen + 1);
      const stepId = seen === 0 ? baseStepId : `${baseStepId}_${seen + 1}`;
      steps.push(buildActionStep(stepId, stepText));
    });

    logger.info({
      event: 'ai_pipeline_stage_end',
      stage: 'capability_selection',
      correlationId,
      outputSummary: `steps=${steps.length}`,
      durationMs: Date.now() - startedAt,
    });

    return {
      ok: true,
      steps,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({
      event: 'ai_pipeline_stage_error',
      stage: 'capability_selection',
      correlationId,
      error: 'CAPABILITY_SELECTION_FAILED',
      message,
    });
    return {
      ok: false,
      code: 'CAPABILITY_SELECTION_FAILED',
      durationMs: Date.now() - startedAt,
      message,
    };
  }
}

function buildTriggerStep(triggerType: string): CapabilityOptionStep {
  const triggerCandidates = unifiedNodeRegistry
    .getAllTypes()
    .filter((type) => unifiedNodeRegistry.isTrigger(type))
    .sort();
  const defaultTrigger = triggerCandidates.includes(triggerType) ? triggerType : triggerCandidates[0] || null;
  return {
    stepId: 'trigger',
    stepText: `Trigger via ${triggerType || 'manual_trigger'}`,
    intentClass: 'trigger',
    candidateNodeTypes: triggerCandidates,
    defaultSuggestedNodeType: defaultTrigger,
    selectionPolicy: { multiSelectAllowed: false, required: true },
  };
}

function buildActionStep(stepId: string, stepText: string): CapabilityOptionStep {
  const explicitCanonical = resolveExplicitNodeType(stepText);
  const operationHint = inferOperationHint(stepText);
  const categoryHint = explicitCanonical
    ? String(unifiedNodeRegistry.getCategory(explicitCanonical) || '').toLowerCase()
    : undefined;
  const candidatePool = getCandidatePool(categoryHint, explicitCanonical);
  const ranked = rankCandidates(stepText, candidatePool, explicitCanonical, operationHint, categoryHint);
  const allCandidates = finalizeCandidates(
    ranked,
    candidatePool,
    explicitCanonical,
    operationHint,
    categoryHint,
  );

  // ── Confidence threshold ──────────────────────────────────────────────────
  // If the score gap between rank-1 and rank-2 is >= CONFIDENCE_SCORE_GAP_THRESHOLD,
  // the AI is confident: collapse to a single candidate so Node_Selection_UI is skipped.
  // If only one candidate exists it is always confident.
  let candidateNodeTypes: string[];
  if (allCandidates.length <= 1) {
    candidateNodeTypes = allCandidates;
  } else {
    const rank1Score = ranked.find((r) => r.nodeType === allCandidates[0])?.score ?? 0;
    const rank2Score = ranked.find((r) => r.nodeType === allCandidates[1])?.score ?? 0;
    const gap = rank1Score - rank2Score;
    if (gap >= CONFIDENCE_SCORE_GAP_THRESHOLD) {
      // Confident — single candidate, UI will not be shown for this step
      candidateNodeTypes = [allCandidates[0]];
    } else {
      // Ambiguous — keep all candidates, UI will be shown
      candidateNodeTypes = allCandidates;
    }
  }

  const topNodeType = candidateNodeTypes[0];
  const intentClass = classifyStep(stepText, explicitCanonical, topNodeType);
  const uiStepText = normalizeStepText(stepText);

  return {
    stepId,
    stepText: uiStepText,
    intentClass,
    candidateNodeTypes,
    defaultSuggestedNodeType: candidateNodeTypes[0] || null,
    selectionPolicy: { multiSelectAllowed: true, required: true },
  };
}

function classifyStep(text: string, explicitCanonical?: string, topNodeType?: string): CapabilityIntentClass {
  if (explicitCanonical) {
    return mapRegistryCategoryToIntentClass(String(unifiedNodeRegistry.getCategory(explicitCanonical) || ''));
  }
  if (topNodeType) {
    return mapRegistryCategoryToIntentClass(String(unifiedNodeRegistry.getCategory(topNodeType) || ''));
  }
  const lower = normalizeForIntentMatching(text);
  if (/\b(if|switch|condition|branch|else|case|when)\b/.test(lower)) return 'logic';
  if (/\b(summarize|transform|convert|parse|format|clean|analy[sz]e)\b/.test(lower)) return 'transformation';
  if (/\b(send|email|mail|notify|message|slack|teams|telegram|outlook|whatsapp|sms)\b/.test(lower)) {
    return 'communication';
  }
  if (/\b(get|fetch|read|from|import|load|collect|sheet|sheets|excel|database|table|source)\b/.test(lower)) {
    return 'data_source';
  }
  return 'generic_action';
}

function getCandidatePool(categoryHint?: string, explicitCanonical?: string): string[] {
  const all = unifiedNodeRegistry.getAllTypes();
  if (explicitCanonical && unifiedNodeRegistry.get(explicitCanonical)) {
    const category = String(unifiedNodeRegistry.getCategory(explicitCanonical) || '').toLowerCase();
    const scoped = all.filter((type) => String(unifiedNodeRegistry.getCategory(type) || '').toLowerCase() === category);
    if (scoped.length > 0) return scoped;
  }
  if (categoryHint) {
    const scoped = all.filter((type) => String(unifiedNodeRegistry.getCategory(type) || '').toLowerCase() === categoryHint);
    if (scoped.length > 0) return scoped;
  }
  return all.filter((type) => {
    if (unifiedNodeRegistry.isTrigger(type)) return false;
    const c = String(unifiedNodeRegistry.getCategory(type) || '').toLowerCase();
    return c !== 'utility';
  });
}

function rankCandidates(
  stepText: string,
  pool: string[],
  explicitCanonical?: string,
  operationHint?: string,
  categoryHint?: string,
): CandidateScore[] {
  const tokens = tokenize(normalizeForIntentMatching(stepText));
  const specificQueryTokens = tokens.filter((t) => !GENERIC_ACTION_TOKENS.has(t) && !TOKEN_STOPWORDS.has(t));

  return pool
    .map((nodeType) => {
      const def = unifiedNodeRegistry.get(nodeType);
      if (!def) return { nodeType, canonicalType: nodeType, score: 0, specificMatchCount: 0, matchedTokens: [] };
      const lexicon = [
        ...tokenize(nodeType.replace(/_/g, ' ')),
        ...tokenize(String(def.label || '')),
        ...tokenize(String(def.description || '')),
        ...(def.tags || []).flatMap((tag) => tokenize(String(tag))),
        ...(def.capabilities || []).flatMap((cap) => tokenize(String(cap))),
        ...((def.aiSelectionCriteria?.keywords || []).flatMap((x) => tokenize(String(x)))),
        ...((def.aiSelectionCriteria?.useCases || []).flatMap((x) => tokenize(String(x)))),
        ...((def.aiSelectionCriteria?.whenToUse || []).flatMap((x) => tokenize(String(x)))),
        ...Object.keys(def.inputSchema || {}).flatMap((key) => tokenize(String(key))),
      ];
      const lexiconSet = new Set(lexicon.filter((x) => !TOKEN_STOPWORDS.has(x)));
      let score = 0;
      const specificMatched = new Set<string>();
      const matchedTokens = new Set<string>();

      const canonicalType = nodeType.toLowerCase().trim();
      if (explicitCanonical && canonicalType === explicitCanonical.toLowerCase().trim()) {
        score += 12;
      }

      for (const token of tokens) {
        if (!token) continue;
        if (TOKEN_STOPWORDS.has(token)) continue;
        if (lexiconSet.has(token)) {
          score += 3;
          matchedTokens.add(token);
          if (!GENERIC_ACTION_TOKENS.has(token)) specificMatched.add(token);
          continue;
        }
        for (const lx of lexiconSet) {
          if (lx.startsWith(token) || token.startsWith(lx)) {
            score += 1;
            matchedTokens.add(token);
            if (!GENERIC_ACTION_TOKENS.has(token)) specificMatched.add(token);
            break;
          }
        }
      }

      // Prefer candidates that match at least one specific (non-generic) query token.
      for (const token of specificQueryTokens) {
        if (lexiconSet.has(token)) {
          score += 2;
          specificMatched.add(token);
        }
      }

      return {
        nodeType,
        canonicalType: semanticNodeEquivalenceRegistry.getCanonicalType(
          nodeType,
          operationHint,
          categoryHint || String(unifiedNodeRegistry.getCategory(nodeType) || '').toLowerCase(),
        ) || nodeType,
        score,
        specificMatchCount: specificMatched.size,
        matchedTokens: [...matchedTokens],
      };
    })
    .sort((a, b) => b.score - a.score || a.nodeType.localeCompare(b.nodeType));
}

function finalizeCandidates(
  ranked: CandidateScore[],
  pool: string[],
  explicitCanonical?: string,
  operationHint?: string,
  categoryHint?: string,
): string[] {
  const explicit = explicitCanonical && unifiedNodeRegistry.get(explicitCanonical) ? explicitCanonical : null;
  const grouped = new Map<string, CandidateScore[]>();
  for (const item of ranked) {
    if (item.score <= 0) continue;
    const key = item.canonicalType || item.nodeType;
    const row = grouped.get(key) || [];
    row.push(item);
    grouped.set(key, row);
  }

  const explicitCanonicalType = explicit
    ? (semanticNodeEquivalenceRegistry.getCanonicalType(
        explicit,
        operationHint,
        categoryHint || String(unifiedNodeRegistry.getCategory(explicit) || '').toLowerCase(),
      ) || explicit)
    : null;

  const rankedGroups = [...grouped.entries()]
    .map(([canonical, items]) => ({
      canonical,
      items: items.sort((a, b) => b.score - a.score || a.nodeType.localeCompare(b.nodeType)),
      groupScore: Math.max(...items.map((i) => i.score)),
    }))
    .sort((a, b) => b.groupScore - a.groupScore || a.canonical.localeCompare(b.canonical));

  const chosenGroup =
    (explicitCanonicalType && rankedGroups.find((g) => g.canonical === explicitCanonicalType)) ||
    rankedGroups[0];

  let picked: string[] = [];
  if (chosenGroup) {
    const equivalents = semanticNodeEquivalenceRegistry.getEquivalents(
      chosenGroup.canonical,
      operationHint,
      categoryHint,
    );
    const candidates = [...new Set([chosenGroup.canonical, ...equivalents, ...chosenGroup.items.map((i) => i.nodeType)])];
    picked = candidates
      .map((type) => unifiedNodeRegistry.resolveAlias(type) || type)
      .filter((type) => !!unifiedNodeRegistry.get(type))
      .slice(0, MAX_CANDIDATES_PER_STEP);
  }

  if (picked.length === 0) {
    picked = ranked
      .filter((r) => r.score > 0)
      .slice(0, MIN_FALLBACK_CANDIDATES)
      .map((r) => r.nodeType);
  }
  if (picked.length === 0) {
    picked = pool.slice(0, MIN_FALLBACK_CANDIDATES);
  }
  if (explicit && !picked.includes(explicit)) {
    picked = [explicit, ...picked].slice(0, MAX_CANDIDATES_PER_STEP);
  }
  // Final registry guard (safety belt).
  const registryOnly = picked.filter((nodeType) => !!unifiedNodeRegistry.get(nodeType));
  if (registryOnly.length > 0) return [...new Set(registryOnly)];
  return pool.slice(0, MIN_FALLBACK_CANDIDATES);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
}

function normalizeForIntentMatching(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStepText(value: string): string {
  const text = String(value || '').trim();
  if (!text) return text;
  return text.includes('_') ? text.replace(/_/g, ' ') : text;
}

function buildStableActionStepId(stepText: string): string {
  const normalized = normalizeForIntentMatching(stepText)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return normalized.length > 0 ? `action_${normalized}` : 'action_generic';
}

function resolveExplicitNodeType(stepText: string): string | undefined {
  const raw = String(stepText || '').trim();
  if (!raw) return undefined;
  const variants = [
    raw.toLowerCase(),
    raw.toLowerCase().replace(/\s+/g, '_'),
    raw.toLowerCase().replace(/-/g, '_'),
    raw.toLowerCase().replace(/[_-]+/g, ' '),
  ];
  for (const v of variants) {
    const canonical = unifiedNodeRegistry.resolveAlias(v);
    if (canonical && unifiedNodeRegistry.get(canonical)) return canonical;
  }
  return undefined;
}

function inferOperationHint(stepText: string): string | undefined {
  const text = normalizeForIntentMatching(stepText);
  if (/\b(send|notify|message|post|publish|share)\b/.test(text)) return 'send';
  if (/\b(read|get|fetch|list|query|retrieve|load)\b/.test(text)) return 'read';
  if (/\b(create|insert|add)\b/.test(text)) return 'create';
  if (/\b(update|edit|modify|upsert)\b/.test(text)) return 'update';
  if (/\b(delete|remove)\b/.test(text)) return 'delete';
  if (/\b(transform|parse|convert|format|summari[sz]e|analy[sz]e|classify)\b/.test(text)) return 'process';
  return undefined;
}

function mapRegistryCategoryToIntentClass(category: string): CapabilityIntentClass {
  const c = String(category || '').toLowerCase();
  if (c === 'trigger') return 'trigger';
  if (c === 'communication') return 'communication';
  if (c === 'logic') return 'logic';
  if (c === 'transformation' || c === 'ai') return 'transformation';
  if (c === 'data') return 'data_source';
  return 'generic_action';
}

