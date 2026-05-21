import crypto from 'crypto';
import type { Workflow } from '../types/ai-types';
import { unifiedNormalizeNodeType } from './unified-node-type-normalizer';

export type CanonicalFormField = {
  id: string;
  key: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  defaultValue?: string;
};

const MAX_KEY_LENGTH = 32;
const MAX_LABEL_LENGTH = 40;
const RESERVED_KEYS = new Set(['input', 'json', '$json', 'data', 'meta', 'files', 'submitted_at']);

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toTitle(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function shortenLabel(input: string): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_LABEL_LENGTH) return compact;
  return compact.slice(0, MAX_LABEL_LENGTH - 1).trimEnd() + '…';
}

function hashSuffix(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 6);
}

function safeKey(raw: string, used: Set<string>): string {
  let key = toSnakeCase(raw);
  if (!key) key = 'field';
  if (key.length > MAX_KEY_LENGTH) {
    const suffix = hashSuffix(key);
    key = `${key.slice(0, MAX_KEY_LENGTH - 7)}_${suffix}`;
  }
  if (RESERVED_KEYS.has(key) || used.has(key)) {
    const suffix = hashSuffix(raw);
    key = `${key.slice(0, Math.max(1, MAX_KEY_LENGTH - 7))}_${suffix}`;
  }
  while (used.has(key)) {
    const suffix = hashSuffix(`${raw}_${key}`);
    key = `${key.slice(0, Math.max(1, MAX_KEY_LENGTH - 7))}_${suffix}`;
  }
  used.add(key);
  return key;
}

export function normalizeFormFieldIdentity(
  field: Record<string, unknown>,
  usedKeys: Set<string>
): CanonicalFormField {
  const sourceLabel = String(field.label || field.name || field.key || 'Field');
  const sourceKey = String(field.key || field.name || sourceLabel);
  const label = shortenLabel(sourceLabel);

  // ✅ Preserve existing key/name if already valid — only regenerate if missing/invalid
  const existingKey = typeof field.key === 'string' && field.key.trim() ? field.key.trim() : null;
  const existingName = typeof field.name === 'string' && field.name.trim() ? field.name.trim() : null;
  const stableKey = existingKey || existingName || null;

  const key = stableKey && !RESERVED_KEYS.has(stableKey) && !usedKeys.has(stableKey)
    ? (usedKeys.add(stableKey), stableKey)
    : safeKey(sourceKey || sourceLabel, usedKeys);

  // ✅ Preserve existing id — only generate if missing
  const existingId = typeof field.id === 'string' && field.id.trim() ? field.id.trim() : null;

  const type = String(field.type || 'text').toLowerCase();
  const required = field.required !== false;
  return {
    id: existingId || `field_${key}`,
    key,
    name: key,
    label: label || toTitle(key),
    type,
    required,
    options: Array.isArray(field.options) ? (field.options as any) : undefined,
    placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
    defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue : undefined,
  };
}

export function normalizeFormFieldsIdentity(
  fields: Array<Record<string, unknown>>
): CanonicalFormField[] {
  const usedKeys = new Set<string>();
  return fields.map((f) => normalizeFormFieldIdentity(f, usedKeys));
}

export function normalizeWorkflowFormFieldIdentities(workflow: Workflow): Workflow {
  const nodes = (workflow.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (nodeType !== 'form') return node;
    const fields = node.data?.config?.fields;
    if (!Array.isArray(fields) || fields.length === 0) return node;

    // ✅ If fields were set by AI at build time, preserve them exactly as-is.
    // No normalization, no key regeneration, no identity reconstruction.
    const fieldsFillMode = (node.data?.config?._fillMode as Record<string, string> | undefined)?.fields;
    if (fieldsFillMode === 'buildtime_ai_once') return node;

    const normalized = normalizeFormFieldsIdentity(fields as Array<Record<string, unknown>>);
    return {
      ...node,
      data: {
        ...(node.data || {}),
        config: {
          ...(node.data?.config || {}),
          fields: normalized,
        },
      },
    };
  });
  return { ...(workflow as any), nodes } as Workflow;
}
