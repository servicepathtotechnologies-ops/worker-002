/**
 * Preservation Property Tests — Form Node Intent-Driven Fields
 * Feature: form-node-intent-driven-fields
 *
 * These tests MUST PASS on unfixed code — they capture the baseline behavior
 * that must not regress after the fix is applied.
 *
 * Tag: // Feature: form-node-intent-driven-fields, Property 2: Preservation
 */

import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import {
  isPlaceholderFormFields,
  buildFormFieldRecordsFromKeys,
  deriveOrderedFieldKeysForForm,
  inferFieldTypeFromKey,
} from '../intent-extraction';
import type { Workflow } from '../../../core/types/ai-types';

// Feature: form-node-intent-driven-fields, Property 2: Preservation

const EMPTY_WORKFLOW: Workflow = { nodes: [], edges: [] };

// ─── Preservation A: isPlaceholderFormFields correctly identifies placeholder ─

describe('Preservation A — isPlaceholderFormFields: placeholder detection', () => {
  it('returns true for the standard placeholder field', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const placeholder = [{ id: 'field_response_placeholder', key: 'response', name: 'response', label: 'Response', type: 'textarea', required: false }];
    const result = isPlaceholderFormFields(placeholder);
    console.log('[PRESERVATION A] isPlaceholderFormFields(placeholder):', result);
    expect(result).toBe(true);
  });

  it('returns false for a real non-placeholder field', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const realField = [{ id: 'field_name', key: 'name', name: 'name', label: 'Name', type: 'text', required: true }];
    const result = isPlaceholderFormFields(realField);
    console.log('[PRESERVATION A] isPlaceholderFormFields(realField):', result);
    expect(result).toBe(false);
  });

  it('returns false for multi-field arrays', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const multiFields = [
      { id: 'field_name', key: 'name', label: 'Name', type: 'text', required: true },
      { id: 'field_email', key: 'email', label: 'Email', type: 'email', required: true },
    ];
    expect(isPlaceholderFormFields(multiFields)).toBe(false);
  });
});

// ─── Preservation B: buildFormFieldRecordsFromKeys preserves required:true and id prefix ─

describe('Preservation B — buildFormFieldRecordsFromKeys: required:true and id prefix', () => {
  it('always sets required:true for all generated fields', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const keys = ['name', 'email', 'message'];
    const records = buildFormFieldRecordsFromKeys(keys);
    console.log('[PRESERVATION B] records:', JSON.stringify(records, null, 2));
    for (const r of records) {
      expect(r.required).toBe(true);
    }
  });

  it('always prefixes id with "field_"', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const keys = ['name', 'email'];
    const records = buildFormFieldRecordsFromKeys(keys);
    for (const r of records) {
      expect(String(r.id)).toMatch(/^field_/);
    }
  });

  it('property: for any array of valid keys, all records have required:true and id starting with "field_"', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const validKeys = fc.constantFrom('name', 'email', 'message', 'phone', 'age', 'description');
    fc.assert(
      fc.property(
        fc.array(validKeys, { minLength: 1, maxLength: 4 }),
        (keys) => {
          const records = buildFormFieldRecordsFromKeys(keys);
          for (const r of records) {
            expect(r.required).toBe(true);
            expect(String(r.id)).toMatch(/^field_/);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── Preservation C: default type behavior (evidence-driven upgrade happens later) ─

describe('Preservation C — inferFieldTypeFromKey: safe default before evidence', () => {
  const keys = ['email', 'age', 'count', 'phone', 'mobile', 'description', 'comment', 'notes', 'file', 'attachment'];

  it.each(keys)('inferFieldTypeFromKey("%s") defaults to text', (key) => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const result = inferFieldTypeFromKey(key);
    expect(result).toBe('text');
  });
});

// ─── Preservation D: empty intent text returns empty keys ─

describe('Preservation D — deriveOrderedFieldKeysForForm: empty intent returns empty', () => {
  it('returns [] for empty intent text', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const result = deriveOrderedFieldKeysForForm('', EMPTY_WORKFLOW);
    console.log('[PRESERVATION D] empty intent result:', result);
    expect(result).toEqual([]);
  });

  it('returns [] for intent text with no collection phrases', () => {
    // Feature: form-node-intent-driven-fields, Property 2: Preservation
    const result = deriveOrderedFieldKeysForForm('send an email via gmail', EMPTY_WORKFLOW);
    console.log('[PRESERVATION D] no-form intent result:', result);
    expect(result).toEqual([]);
  });
});
