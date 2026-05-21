/**
 * Switch-only: derive persisted cases + expression template from prompt and upstream node.
 * Pure planning — no graph mutation.
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import type { StructuredIntent } from './intent-structurer';

export interface SwitchCasePlanCase {
  value: string;
  label: string;
}

export interface SwitchCasePlanResult {
  cases: SwitchCasePlanCase[];
  /** Template using $json — must resolve to a string matching one of cases[].value */
  expressionTemplate: string;
  /** JSON path segment after $json. (e.g. "response") */
  discriminantField: string;
}

/**
 * Prefer output field names from registry outputSchema for routing; fallback by node type heuristics.
 */
export function getDiscriminantFieldForUpstreamType(
  upstreamNodeType: string | undefined,
  upstreamConfig?: Record<string, any>
): string {
  const t = unifiedNormalizeNodeTypeString(upstreamNodeType || '');

  // For form nodes: the outputSchema is generic. Real field names live in config.fields[].name.
  // Prefer a field whose name contains a routing-signal word (status, type, category, etc.).
  if (t === 'form' && upstreamConfig) {
    const fields: Array<{ name?: string }> =
      Array.isArray(upstreamConfig.fields) ? upstreamConfig.fields : [];
    const routingWords = ['status', 'type', 'category', 'state', 'kind', 'class', 'tier', 'level'];
    for (const word of routingWords) {
      const hit = fields.find(f => f.name?.toLowerCase().includes(word));
      if (hit?.name) return hit.name;
    }
    const first = fields.find(f => f.name && f.name !== 'message');
    if (first?.name) return first.name;
    if (fields[0]?.name) return fields[0].name;
  }

  const def = unifiedNodeRegistry.get(t);
  const props = def?.outputSchema?.properties as Record<string, unknown> | undefined;
  if (props && typeof props === 'object') {
    const keys = Object.keys(props);
    for (const preferred of ['response', 'classification', 'category', 'label', 'result', 'message', 'status', 'value']) {
      if (keys.includes(preferred)) {
        return preferred;
      }
    }
    if (keys.length > 0) {
      return keys[0];
    }
  }
  const fallbacks: Record<string, string> = {
    ollama: 'response',
    ai_chat_model: 'response',
    form: 'message',
    chat_trigger: 'message',
    manual_trigger: 'message',
    webhook: 'body',
  };
  return fallbacks[t] || 'response';
}

/**
 * Registry-driven set of known node type strings to exclude from condition token extraction.
 * Built lazily from the unified node registry so it stays in sync with all registered nodes.
 */
function getKnownNodeTypeStrings(): Set<string> {
  const types = unifiedNodeRegistry.getAllTypes();
  const result = new Set<string>();
  for (const t of types) {
    result.add(t.toLowerCase());
    // Also add the short form (e.g. "gmail" from "google_gmail")
    const parts = t.toLowerCase().split('_');
    if (parts.length > 1) {
      result.add(parts[parts.length - 1]);
    }
  }
  return result;
}

/**
 * Returns true when a normalized token is a valid routing condition value —
 * i.e. it is NOT a known node type string, NOT a routing-intent keyword, and
 * has a reasonable length.
 */
function isValidConditionToken(token: string, knownNodeTypes: Set<string>): boolean {
  if (token.length < 2 || token.length > 48) return false;

  // Exclude known node type strings (registry-driven, no hardcoding)
  if (knownNodeTypes.has(token)) return false;

  // Exclude routing-intent keywords that are not condition values
  const routingKeywords = new Set([
    'route', 'classify', 'bucket', 'label', 'by', 'based', 'on', 'depending',
    'when', 'if', 'status', 'type', 'category', 'as', 'into', 'to', 'the',
    'message', 'messages', 'order', 'orders', 'ticket', 'tickets', 'request',
    'requests', 'item', 'items', 'data', 'input', 'output', 'result', 'results',
    'and', 'or', 'via', 'through', 'using', 'with', 'for', 'from', 'send',
    'trigger', 'go', 'use', 'each', 'all', 'any', 'their', 'its', 'a', 'an',
    'is', 'are', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'not', 'no', 'yes', 'true', 'false', 'null', 'undefined',
  ]);
  if (routingKeywords.has(token)) return false;

  // Exclude tokens that look like compound action phrases (contain verb + destination pattern)
  // e.g. "send_tracking_details_via_gmail" — these are action descriptions, not condition values
  const actionVerbs = ['send', 'notify', 'log', 'trigger', 'route', 'forward', 'post', 'push', 'emit'];
  const tokenParts = token.split('_');
  if (tokenParts.length >= 3 && actionVerbs.includes(tokenParts[0])) return false;

  return true;
}

/**
 * Extract enumerated cases from natural language using a greedy general enumeration extractor.
 * Finds all comma/slash/or/and/newline-separated tokens after any routing-intent keyword.
 */
function extractEnumeratedCasesFromPrompt(prompt: string): string[] {
  const knownNodeTypes = getKnownNodeTypeStrings();
  const candidates: string[] = [];

  // Pattern 1: routing verbs followed by optional connector words then the enumeration
  // e.g. "classify ... as X, Y, Z" / "route ... by status: X, Y, Z" / "bucket into X, Y, Z"
  const routingVerbPattern =
    /\b(?:route|classify|bucket|label)\b[^.]*?\b(?:as|into|by|to)\b\s*(?:\w+\s*[:\-]\s*)?([^.]+)/gi;

  // Pattern 2: "by <field>: X, Y, Z" or "based on <field>: X, Y, Z" or "depending on <field>: X, Y, Z"
  const byFieldPattern =
    /\b(?:by|based\s+on|depending\s+on)\s+\w+\s*[:\-]\s*([^.]+)/gi;

  // Pattern 3: "status/type/category: X, Y, Z"
  const fieldColonPattern =
    /\b(?:status|type|category)\s*[:\-]\s*([^.]+)/gi;

  // Pattern 4: repeated "when/if <field> is <value>" — capture one routing value per clause
  // (avoid greedy [^.]+ which merges multiple sentences into one bogus token)
  const whenIfPattern =
    /\b(?:when|if)\s+\w+\s+(?:is|equals?)\s+([a-z0-9_]+)/gi;

  // Pattern 4b: abbreviated "If <value>," after a sentence boundary (e.g. ". If medium, ...")
  // Comma is required so we do not capture "priority" from "If priority is high,".
  const abbreviatedIfValuePattern = /(?:^|[.!?]\s+)if\s+([a-z0-9_]+)\s*,/gi;

  // Pattern 5: "cases X, Y, Z" or "with cases X, Y, Z" — explicit case list
  const casesListPattern =
    /\b(?:with\s+)?cases?\s+([a-z0-9][^.]+)/gi;

  const allPatterns = [
    routingVerbPattern,
    byFieldPattern,
    fieldColonPattern,
    whenIfPattern,
    abbreviatedIfValuePattern,
    casesListPattern,
  ];

  for (const pattern of allPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prompt)) !== null) {
      const segment = match[1];
      // Split on comma, slash, "or", "and", newline
      const tokens = segment.split(/(?:,|\/|\bor\b|\band\b|\n)/i);
      for (const raw of tokens) {
        const normalized = raw
          .trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^(or|and)\s+/i, '')
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        if (isValidConditionToken(normalized, knownNodeTypes)) {
          candidates.push(normalized);
        }
      }
    }
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * Build case plan from user prompt and optional intent. Does not mutate workflows.
 */
export function planSwitchCasesFromPrompt(
  originalPrompt: string,
  upstreamNodeType: string | undefined,
  intent?: StructuredIntent,
  upstreamConfig?: Record<string, any>
): SwitchCasePlanResult {
  const discriminantField = getDiscriminantFieldForUpstreamType(upstreamNodeType, upstreamConfig);
  const expressionTemplate = `{{$json.${discriminantField}}}`;

  const cases: SwitchCasePlanCase[] = [];
  const caseToLabel = (v: string) =>
    v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const enumerated = extractEnumeratedCasesFromPrompt(originalPrompt);
  for (const v of enumerated) {
    if (!cases.some(c => c.value === v)) {
      cases.push({ value: v, label: caseToLabel(v) });
    }
  }

  return {
    cases,
    expressionTemplate,
    discriminantField,
  };
}
