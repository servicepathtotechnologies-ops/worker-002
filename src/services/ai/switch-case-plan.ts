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
export function getDiscriminantFieldForUpstreamType(upstreamNodeType: string | undefined): string {
  const t = unifiedNormalizeNodeTypeString(upstreamNodeType || '');
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
 * Extract enumerated cases from natural language (e.g. "sales, support, or general").
 */
function extractEnumeratedCasesFromPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const out: string[] = [];

  const classifyIntro = prompt.match(
    /\b(?:classify|categories|category|route|bucket|label)\s+(?:the\s+)?(?:message\s+)?(?:as|into|to)\s+([^.\n]+)/i
  );
  if (classifyIntro && classifyIntro[1]) {
    const segment = classifyIntro[1];
    const parts = segment
      .split(/(?:,|\/|\bor\b|\band\b|\n)/i)
      .map(s =>
        s
          .trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^(or|and)\s+/i, '')
      )
      .filter(Boolean);
    for (const p of parts) {
      const normalized = p
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      if (normalized.length >= 2 && normalized.length <= 48) {
        out.push(normalized);
      }
    }
  }

  const commonTriples = ['sales', 'support', 'general'];
  const hits = commonTriples.filter(k => lower.includes(k));
  if (hits.length >= 2) {
    for (const h of hits) {
      if (!out.includes(h)) {
        out.push(h);
      }
    }
  }

  return [...new Set(out)].filter(Boolean);
}

/**
 * Build case plan from user prompt and optional intent. Does not mutate workflows.
 */
export function planSwitchCasesFromPrompt(
  originalPrompt: string,
  upstreamNodeType: string | undefined,
  intent?: StructuredIntent
): SwitchCasePlanResult {
  const discriminantField = getDiscriminantFieldForUpstreamType(upstreamNodeType);
  const expressionTemplate = `{{$json.${discriminantField}}}`;

  const cases: SwitchCasePlanCase[] = [];
  const caseToLabel = (v: string) =>
    v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const promptLower = originalPrompt.toLowerCase();

  const enumerated = extractEnumeratedCasesFromPrompt(originalPrompt);
  for (const v of enumerated) {
    const value = v.toLowerCase().replace(/\s+/g, '_');
    if (!cases.some(c => c.value === value)) {
      cases.push({ value, label: caseToLabel(value) });
    }
  }

  const casePattern = /(\w+)\s+statuses?\s+(?:send|trigger|route|go to|use)\s+(?:notifications?|alerts?|messages?|emails?|logs?)?\s*(?:via|through|to|using)\s+(\w+)/gi;
  let match: RegExpExecArray | null;
  while ((match = casePattern.exec(originalPrompt)) !== null) {
    const caseValue = match[1].toLowerCase();
    if (!cases.some(c => c.value === caseValue)) {
      cases.push({ value: caseValue, label: caseToLabel(caseValue) });
    }
  }

  const ifPattern = /(?:if|when)\s+(?:\w+\s+)?(?:is|equals|==)\s+["']?(\w+)["']?\s+(?:route|send|go|use)\s+(?:to|via|through)\s+(\w+)/gi;
  while ((match = ifPattern.exec(originalPrompt)) !== null) {
    const caseValue = match[1].toLowerCase();
    if (!cases.some(c => c.value === caseValue)) {
      cases.push({ value: caseValue, label: caseToLabel(caseValue) });
    }
  }

  if (cases.length === 0 && intent?.actions) {
    const statusKeywords = ['active', 'pending', 'completed', 'success', 'failed', 'error', 'new', 'old'];
    for (const action of intent.actions) {
      const actionType = action.type.toLowerCase();
      for (const keyword of statusKeywords) {
        if (actionType.includes(keyword) && !cases.some(c => c.value === keyword)) {
          cases.push({ value: keyword, label: caseToLabel(keyword) });
        }
      }
    }
  }

  if (cases.length === 0 && /\b(one word|single word|return only)\b/i.test(originalPrompt)) {
    const m = promptLower.match(/\b(?:as|into)\s+([a-z_,\s]+(?:general|support|sales)[a-z_,\s]*)/i);
    if (m) {
      const parts = m[1].split(/,/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        const value = p.replace(/\s+/g, '_').toLowerCase();
        if (value.length >= 2 && !cases.some(c => c.value === value)) {
          cases.push({ value, label: caseToLabel(value) });
        }
      }
    }
  }

  return {
    cases,
    expressionTemplate,
    discriminantField,
  };
}
