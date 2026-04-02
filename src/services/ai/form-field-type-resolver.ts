/**
 * Single source of truth for form field type inference.
 * Shared across deterministic extraction and LLM-assisted fallback paths.
 */

import type { Workflow } from '../../core/types/ai-types';
import type { FormTypeEvidence } from './form-field-type-evidence';
import { buildFormFieldTypeEvidence } from './form-field-type-evidence';

export const FORM_ALLOWED_TYPES = new Set([
  'text',
  'email',
  'number',
  'tel',
  'textarea',
  'file',
  'select',
  'checkbox',
  'date',
  'url',
  'password',
]);

export interface InferFormFieldTypeInput {
  key: string;
  currentType?: string | null;
  intentText?: string;
  workflow?: Workflow;
  evidenceByField?: Map<string, FormTypeEvidence>;
  preserveExplicit?: boolean;
}

export interface FormFieldTypeDecision {
  type: string;
  confidence: number;
  reason: string;
  source: 'evidence' | 'explicit' | 'default';
}

export function inferFormFieldTypeDecision(input: InferFormFieldTypeInput | string): FormFieldTypeDecision {
  const normalizedInput: InferFormFieldTypeInput =
    typeof input === 'string' ? { key: input } : input;
  const key = String(normalizedInput.key || '').trim();
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const currentType = String(normalizedInput.currentType || '').toLowerCase().trim();
  const preserveExplicit = normalizedInput.preserveExplicit !== false;

  const evidenceMap =
    normalizedInput.evidenceByField ||
    (normalizedInput.workflow
      ? buildFormFieldTypeEvidence(normalizedInput.workflow, normalizedInput.intentText || '')
      : undefined);
  const evidence = evidenceMap?.get(normalizedKey);
  if (evidence && FORM_ALLOWED_TYPES.has(evidence.inferredType)) {
    const explicitLocked =
      preserveExplicit &&
      currentType &&
      FORM_ALLOWED_TYPES.has(currentType) &&
      currentType !== 'text' &&
      evidence.confidence < 0.95;
    if (!explicitLocked) {
      return {
        type: evidence.inferredType,
        confidence: evidence.confidence,
        reason: evidence.reason,
        source: 'evidence',
      };
    }
  }

  if (preserveExplicit && currentType && FORM_ALLOWED_TYPES.has(currentType)) {
    return {
      type: currentType,
      confidence: 0.92,
      reason: 'preserving explicit field type',
      source: 'explicit',
    };
  }

  return {
    type: 'text',
    confidence: 0.55,
    reason: `default fallback (no strong evidence) for "${key}"`,
    source: 'default',
  };
}

export function inferFormFieldTypeFromKey(input: InferFormFieldTypeInput | string): string {
  return inferFormFieldTypeDecision(input).type;
}

