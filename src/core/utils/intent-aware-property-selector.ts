/**
 * Intent-Aware Property Selector (Deterministic)
 *
 * Given a user intent (usually the original prompt) and a node output payload,
 * select only the relevant property values when the intent specifies a field/column.
 *
 * This is deterministic (no LLM calls) and schema-agnostic.
 */

import { getNestedValue } from './object-utils';

export interface PropertySelectionResult {
  /** The matched key from the runtime data (exact key from objects) */
  matchedKey: string | null;
  /** Extracted values for the matched key (e.g., ["101", "102"]) */
  values: unknown[] | null;
  /** Human-readable reason (for debugging) */
  reason: string;
}

function normalizeToken(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '') // collapse separators
    .replace(/[^a-z0-9]/g, ''); // strip punctuation
}

function tokenizeCandidate(s: string): string[] {
  const cleaned = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  // keep both phrase and words
  const parts = cleaned.split(' ').filter(Boolean);
  return Array.from(new Set([cleaned, ...parts]));
}

// Deterministic similarity: Dice coefficient over bigrams
function diceCoefficient(a: string, b: string): number {
  const A = normalizeToken(a);
  const B = normalizeToken(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return A === B ? 1 : 0;

  const bigrams = (s: string) => {
    const res: string[] = [];
    for (let i = 0; i < s.length - 1; i++) res.push(s.slice(i, i + 2));
    return res;
  };

  const aBigrams = bigrams(A);
  const bBigrams = bigrams(B);
  const aCounts = new Map<string, number>();
  aBigrams.forEach(bg => aCounts.set(bg, (aCounts.get(bg) || 0) + 1));

  let intersection = 0;
  for (const bg of bBigrams) {
    const count = aCounts.get(bg) || 0;
    if (count > 0) {
      intersection++;
      aCounts.set(bg, count - 1);
    }
  }
  return (2 * intersection) / (aBigrams.length + bBigrams.length);
}

/**
 * Extract candidate field names from a user intent string.
 * Examples:
 * - "Get resume column and summarize it" -> ["resume", "resume column"]
 * - "Get roll number from sheets" -> ["roll number", "roll", "number"]
 */
export function extractFieldCandidatesFromIntent(intent: unknown): string[] {
  const text = typeof intent === 'string' ? intent : '';
  const lower = text.toLowerCase();

  const candidates: string[] = [];

  // Common patterns: "<field> column/field/property"
  const patterns: RegExp[] = [
    /\b(?:get|fetch|read|extract|summarize|send)\s+(?:the\s+)?(.+?)\s+(?:column|field|property|key|attribute)s?\b/i,
    /\b(?:column|field|property|key|attribute)\s+(?:named|called)?\s*["']?([a-z0-9 _-]+?)["']?\b/i,
    /\bfrom\s+the\s+(.+?)\s+(?:column|field|property)\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      tokenizeCandidate(m[1]).forEach(c => candidates.push(c));
    }
  }

  // If no explicit pattern matched, fall back to a small set of salient tokens
  // (helps for prompts like "summarize resume" or "email rollnumber summary")
  if (candidates.length === 0) {
    const hints = ['resume', 'roll number', 'rollnumber', 'email', 'country', 'segment', 'name'];
    for (const h of hints) {
      if (lower.includes(h)) tokenizeCandidate(h).forEach(c => candidates.push(c));
    }
  }

  return Array.from(new Set(candidates)).filter(Boolean);
}

/**
 * Given an array of objects, determine the best matching key based on intent.
 */
export function matchIntentToObjectKey(
  intent: unknown,
  items: Array<Record<string, unknown>>
): { key: string | null; score: number; candidate?: string } {
  if (!Array.isArray(items) || items.length === 0) return { key: null, score: 0 };
  const sample = items.find(v => v && typeof v === 'object' && !Array.isArray(v)) || items[0];
  const keys = Object.keys(sample || {});
  if (keys.length === 0) return { key: null, score: 0 };

  const candidates = extractFieldCandidatesFromIntent(intent);
  if (candidates.length === 0) return { key: null, score: 0 };

  let bestKey: string | null = null;
  let bestScore = 0;
  let bestCandidate: string | undefined;

  for (const candidate of candidates) {
    for (const key of keys) {
      const score = diceCoefficient(candidate, key);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
        bestCandidate = candidate;
      }
    }
  }

  return { key: bestKey, score: bestScore, candidate: bestCandidate };
}

/**
 * Select a single property (column) from a node output that contains `items` / `rows`.
 * Returns null when intent doesn't specify a property confidently.
 */
export function selectPropertyValuesFromOutput(
  intent: unknown,
  output: unknown,
  containerPath: string
): PropertySelectionResult {
  // Resolve container (e.g., "rows" or "items") from output
  const container = (output && typeof output === 'object')
    ? getNestedValue(output as Record<string, unknown>, containerPath)
    : undefined;

  if (!Array.isArray(container)) {
    return { matchedKey: null, values: null, reason: `Container ${containerPath} is not an array` };
  }

  const objects = container.filter(v => v && typeof v === 'object' && !Array.isArray(v)) as Array<Record<string, unknown>>;
  if (objects.length === 0) {
    return { matchedKey: null, values: null, reason: `Container ${containerPath} has no object rows` };
  }

  const match = matchIntentToObjectKey(intent, objects);
  // Threshold tuned to avoid accidental matches; deterministic.
  if (!match.key || match.score < 0.62) {
    return { matchedKey: null, values: null, reason: 'No confident key match from intent' };
  }

  const values = objects.map(obj => (match.key! in obj ? (obj as any)[match.key!] : null)).filter(v => v !== null && v !== undefined);
  return {
    matchedKey: match.key,
    values,
    reason: `Matched intent to key "${match.key}" (score=${match.score.toFixed(3)}; candidate="${match.candidate || ''}")`,
  };
}

