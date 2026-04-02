/**
 * Bug Condition Exploration Test — Form Node Intent-Driven Fields
 * Feature: form-node-intent-driven-fields
 *
 * CRITICAL: These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists. DO NOT fix the source code when these fail.
 *
 * Each test encodes the expected (correct) behavior. When the fix is applied,
 * these tests will pass and confirm the bug is resolved.
 */

import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import {
  extractFieldNamesFromIntent,
  deriveOrderedFieldKeysForForm,
  buildFormFieldRecordsFromKeys,
  inferFieldTypeFromKey,
} from '../intent-extraction';
import type { Workflow } from '../../../core/types/ai-types';

// Feature: form-node-intent-driven-fields, Property 1: Bug Condition

const EMPTY_WORKFLOW: Workflow = { nodes: [], edges: [] };

// ─── Test A: extractFieldNamesFromIntent extracts single-token "as input" fields ─

describe('Test A — extractFieldNamesFromIntent: single-token "collects X as input" extraction', () => {
  it('extracts "status" from "A form that collects order status as input"', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const result = extractFieldNamesFromIntent('A form that collects order status as input');
    console.log('[BUG EXPLORATION] extractFieldNamesFromIntent result:', result);
    // EXPECTED (correct): ["status"]
    // On unfixed code: [] — this assertion will FAIL
    expect(result).toContain('status');
  });

  it('extracts "email" from "A form that captures customer email as input"', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const result = extractFieldNamesFromIntent('A form that captures customer email as input');
    console.log('[BUG EXPLORATION] captures email result:', result);
    expect(result).toContain('email');
  });

  it('property: for any single-word field name in common set, "collects order <word> as input" extracts that word', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const fieldNames = fc.constantFrom(
      'status', 'category', 'date', 'url', 'quantity',
      'price', 'amount', 'subject', 'title', 'priority'
    );

    fc.assert(
      fc.property(fieldNames, (word) => {
        const intentText = `A form that collects order ${word} as input`;
        const result = extractFieldNamesFromIntent(intentText);
        console.log(`[BUG EXPLORATION] word="${word}" result:`, result);
        expect(result).toContain(word);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Test B: deriveOrderedFieldKeysForForm end-to-end ─

describe('Test B — deriveOrderedFieldKeysForForm: end-to-end single-token extraction', () => {
  it('returns ["status"] for "collects order status as input"', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const result = deriveOrderedFieldKeysForForm(
      'A form that collects order status as input',
      EMPTY_WORKFLOW
    );
    console.log('[BUG EXPLORATION] deriveOrderedFieldKeysForForm result:', result);
    expect(result).toContain('status');
  });
});

// ─── Test C: buildFormFieldRecordsFromKeys produces correct field records ─

describe('Test C — buildFormFieldRecordsFromKeys: correct key, type, required', () => {
  it('produces key="status", type="text", required=true for ["status"]', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const records = buildFormFieldRecordsFromKeys(['status']);
    console.log('[BUG EXPLORATION] buildFormFieldRecordsFromKeys(["status"]):', JSON.stringify(records, null, 2));
    expect(records.length).toBe(1);
    expect(records[0].key).toBe('status');
    expect(records[0].type).toBe('text');
    expect(records[0].required).toBe(true);
  });

  it('uses safe default type for key "date" before evidence', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const records = buildFormFieldRecordsFromKeys(['date']);
    console.log('[BUG EXPLORATION] buildFormFieldRecordsFromKeys(["date"]):', JSON.stringify(records, null, 2));
    expect(records[0].type).toBe('text');
  });

  it('uses safe default type for key "url" before evidence', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const records = buildFormFieldRecordsFromKeys(['url']);
    console.log('[BUG EXPLORATION] buildFormFieldRecordsFromKeys(["url"]):', JSON.stringify(records, null, 2));
    expect(records[0].type).toBe('text');
  });

  it('uses safe default type for key "quantity" before evidence', () => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const records = buildFormFieldRecordsFromKeys(['quantity']);
    console.log('[BUG EXPLORATION] buildFormFieldRecordsFromKeys(["quantity"]):', JSON.stringify(records, null, 2));
    expect(records[0].type).toBe('text');
  });
});

// ─── Test D: inferFieldTypeFromKey type inference ─

describe('Test D — inferFieldTypeFromKey: default behavior', () => {
  const keys = [
    'status',
    'category',
    'priority',
    'subject',
    'title',
    'date',
    'deadline',
    'url',
    'link',
    'website',
    'password',
    'quantity',
    'amount',
    'price',
    'cost',
    'rating',
    'score',
  ];

  it.each(keys)('inferFieldTypeFromKey("%s") defaults to "text"', (key) => {
    // Feature: form-node-intent-driven-fields, Property 1: Bug Condition
    const result = inferFieldTypeFromKey(key);
    console.log(`[BUG EXPLORATION] inferFieldTypeFromKey("${key}") = "${result}" (expected "text")`);
    expect(result).toBe('text');
  });
});
