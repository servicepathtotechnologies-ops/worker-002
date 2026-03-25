/**
 * Shared helpers: bind if_else conditions to upstream form field keys ($json.*).
 * Used by structure-materializer, repair pass, and validateWorkflow.
 */

import type { Workflow } from '../types/ai-types';
import { unifiedNormalizeNodeType } from '../utils/unified-node-type-normalizer';

export const FORM_TYPES_FOR_IFELSE = new Set(['form', 'form_trigger']);

export function getNormalizedNodeType(node: { type?: string; data?: { type?: string } }): string {
  return unifiedNormalizeNodeType(node as any);
}

/** All transitive predecessors of targetId (nodes that can reach target via edges reversed). */
export function predecessorsOf(workflow: Workflow, targetId: string): Set<string> {
  const pred = new Map<string, Set<string>>();
  for (const e of workflow.edges || []) {
    const t = String((e as any).target || '');
    const s = String((e as any).source || '');
    if (!t || !s) continue;
    if (!pred.has(t)) pred.set(t, new Set());
    pred.get(t)!.add(s);
  }
  const seen = new Set<string>();
  const stack = [...(pred.get(targetId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of pred.get(id) || []) stack.push(p);
  }
  return seen;
}

export function extractFormFieldList(config: Record<string, any> | undefined): Array<Record<string, unknown>> {
  const fields = config?.fields;
  return Array.isArray(fields) ? fields : [];
}

/** Same normalization as structure-materializer `normalizeFieldKey` for intent operands. */
export function normalizeIntentFieldToken(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Internal storage key for a form field (matches form output / $json).
 */
export function getFormFieldInternalKey(field: Record<string, unknown>): string | null {
  const k = field.name ?? field.key ?? field.id;
  return k != null && String(k).trim() !== '' ? String(k) : null;
}

/**
 * Pick the internal key for age-style comparisons (eligibility, etc.).
 */
export function pickFormFieldKeyForAgeIntent(fields: Array<Record<string, unknown>>): string | null {
  if (fields.length === 0) return null;
  const ageMatch = fields.find((f) => {
    const label = String(f.label || '').toLowerCase();
    const name = String(f.name || f.key || f.id || '').toLowerCase();
    return label.includes('age') || name === 'age' || name.includes('age');
  });
  if (ageMatch) {
    return getFormFieldInternalKey(ageMatch);
  }
  const num = fields.find((f) => String(f.type || '').toLowerCase() === 'number');
  if (num) {
    return getFormFieldInternalKey(num);
  }
  return getFormFieldInternalKey(fields[0] as Record<string, unknown>);
}

/**
 * Map a normalized intent operand (e.g. "age", "user_score") to the form field internal key.
 */
export function resolveFormFieldKeyForConditionOperand(
  leftNormalized: string,
  fields: Array<Record<string, unknown>>
): string | null {
  if (!fields.length || !leftNormalized) return null;

  for (const f of fields) {
    const internal = getFormFieldInternalKey(f);
    if (!internal) continue;
    if (normalizeIntentFieldToken(internal) === leftNormalized) return internal;
  }

  for (const f of fields) {
    for (const cand of [f.name, f.key, f.id]) {
      if (cand == null) continue;
      if (normalizeIntentFieldToken(String(cand)) === leftNormalized) {
        const internal = getFormFieldInternalKey(f);
        if (internal) return internal;
      }
    }
  }

  const labMatch = fields.find((f) => {
    const lab = String(f.label || '').toLowerCase();
    return lab.length > 0 && normalizeIntentFieldToken(lab).includes(leftNormalized);
  });
  if (labMatch) {
    const internal = getFormFieldInternalKey(labMatch);
    if (internal) return internal;
  }

  if (leftNormalized === 'age' || leftNormalized.endsWith('_age')) {
    return pickFormFieldKeyForAgeIntent(fields);
  }

  return null;
}

export type UpstreamFormContext = {
  formNodeId: string;
  fields: Array<Record<string, unknown>>;
};

/**
 * Allowed $json keys for validation (internal keys from form config.fields).
 */
export function allowedJsonKeysFromFormFields(fields: Array<Record<string, unknown>>): Set<string> {
  const out = new Set<string>();
  for (const f of fields) {
    const k = getFormFieldInternalKey(f);
    if (k) out.add(k);
  }
  return out;
}

/**
 * Find form upstream of if_else: graph predecessors first, then single-form fallback.
 */
export function findUpstreamFormContextForIfElse(workflow: Workflow, ifElseNodeId: string): UpstreamFormContext | null {
  const nodes = workflow.nodes || [];
  const nodeById = new Map(nodes.map((n: any) => [String(n.id), n]));

  const tryConfig = (node: any): UpstreamFormContext | null => {
    const nt = getNormalizedNodeType(node);
    if (!FORM_TYPES_FOR_IFELSE.has(nt)) return null;
    const cfg = node.data?.config as Record<string, any> | undefined;
    const fields = extractFormFieldList(cfg);
    if (fields.length === 0) return null;
    return { formNodeId: String(node.id), fields };
  };

  const preds = predecessorsOf(workflow, ifElseNodeId);
  for (const pid of preds) {
    const p = nodeById.get(pid);
    if (!p) continue;
    const ctx = tryConfig(p);
    if (ctx) return ctx;
  }

  const formsWithFields: Array<{ id: string; node: any }> = [];
  for (const n of nodes) {
    const ctx = tryConfig(n);
    if (ctx) formsWithFields.push({ id: ctx.formNodeId, node: n });
  }
  if (formsWithFields.length === 1) {
    const f = formsWithFields[0];
    const fields = extractFormFieldList(f.node.data?.config);
    return { formNodeId: f.id, fields };
  }
  if (formsWithFields.length > 1) {
    const idx = nodes.findIndex((n: any) => String(n.id) === ifElseNodeId);
    const before = formsWithFields.filter((f) => nodes.findIndex((n: any) => String(n.id) === f.id) < idx);
    const pool = before.length > 0 ? before : formsWithFields;
    const chosen = pool.sort(
      (a, b) =>
        nodes.findIndex((n: any) => String(n.id) === a.id) - nodes.findIndex((n: any) => String(n.id) === b.id)
    )[0];
    const fields = extractFormFieldList(chosen.node.data?.config);
    return { formNodeId: chosen.id, fields };
  }

  return null;
}

const INPUT_REF = /\binput\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
const JSON_REF = /\$json\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

/**
 * True if serialized conditions still use input.* placeholders (should be rebound to form keys).
 */
export function conditionsReferenceInputPaths(conditions: unknown): boolean {
  if (conditions === undefined || conditions === null) return false;
  return /\binput\.[a-zA-Z_][a-zA-Z0-9_]*\b/.test(JSON.stringify(conditions));
}

function resetRegex(re: RegExp) {
  re.lastIndex = 0;
}

/**
 * Extract $json.<key> and input.<key> references from condition config strings.
 */
export function extractConditionPathReferences(conditions: unknown): { jsonKeys: string[]; inputKeys: string[] } {
  const jsonKeys: string[] = [];
  const inputKeys: string[] = [];
  const walk = (v: unknown) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      resetRegex(JSON_REF);
      let m: RegExpExecArray | null;
      while ((m = JSON_REF.exec(v)) !== null) {
        jsonKeys.push(m[1]);
      }
      resetRegex(INPUT_REF);
      while ((m = INPUT_REF.exec(v)) !== null) {
        inputKeys.push(m[1]);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(conditions);
  return { jsonKeys, inputKeys };
}

/**
 * Validate if_else conditions against upstream form field keys when a form is reachable.
 */
export function validateIfElseConditionsAgainstUpstreamForm(
  workflow: Workflow
): { errors: string[] } {
  const errors: string[] = [];
  const nodes = workflow.nodes || [];

  for (const node of nodes) {
    const nt = getNormalizedNodeType(node as any);
    if (nt !== 'if_else') continue;

    const ctx = findUpstreamFormContextForIfElse(workflow, String((node as any).id));
    if (!ctx || ctx.fields.length === 0) continue;

    const allowed = allowedJsonKeysFromFormFields(ctx.fields);
    const cond = (node as any).data?.config?.conditions;
    if (cond === undefined || cond === null) continue;

    const { jsonKeys, inputKeys } = extractConditionPathReferences(cond);
    const mode = (node as any).data?.config?._fillMode?.conditions;
    if (mode === 'runtime_ai') continue;

    for (const k of jsonKeys) {
      if (!allowed.has(k)) {
        errors.push(
          `If/Else node "${(node as any).id}": condition references "$json.${k}" but upstream form "${ctx.formNodeId}" has no field with that internal key.`
        );
      }
    }
    for (const k of inputKeys) {
      if (!allowed.has(k)) {
        errors.push(
          `If/Else node "${(node as any).id}": condition references "input.${k}"; form output uses top-level keys — use "$json.<field_name>" matching form fields (allowed: ${[...allowed].join(', ')}).`
        );
      }
    }
  }

  return { errors };
}
