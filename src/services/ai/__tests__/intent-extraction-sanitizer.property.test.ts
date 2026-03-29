/**
 * Property-Based Tests: Intent Extraction Sanitizer
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { sanitizeIntentTextForFormFieldExtraction } from '../intent-extraction';

// ─── Known registry fill contract fragments ──────────────────────────────────

const CONTRACT_FRAGMENTS = [
  '\n## Configuration contract\nsome content',
  '\n**Planner rules:**\nsome rule',
  '\n## Semantics\nsome semantics',
  '\n**Semantics (universal):**\nsome text',
  'ownership=credential',
  'ownership=structural',
  'ownership=value',
  'buildtime_ai_once',
  'manual_static',
  'runtime_ai',
  'role=title_like',
  'role=raw_json',
];

// ─── Property 25: Sanitizer removes registry contract text without altering user content

// Feature: ai-workflow-generation-engine, Property 25: Sanitizer removes registry contract text without altering user content
test('Property 25: Sanitizer removes registry contract text without altering user content', () => {
  fc.assert(
    fc.property(
      // User content that does NOT contain registry boilerplate
      fc.string({ minLength: 1, maxLength: 100 }).filter(
        (s) => !CONTRACT_FRAGMENTS.some((f) => s.includes(f.trim()))
      ),
      fc.constantFrom(...CONTRACT_FRAGMENTS),
      (userContent, contractFragment) => {
        // Combine user content with a contract fragment
        const combined = `${userContent}\n${contractFragment}\nmore user content`;
        const sanitized = sanitizeIntentTextForFormFieldExtraction(combined);

        // The contract fragment should be removed or truncated
        // User content before the fragment should be preserved
        expect(sanitized).toContain(userContent.trim().split('\n')[0]);

        // The specific boilerplate tokens should not appear in the sanitized output
        const boilerplateTokens = [
          'ownership=credential',
          'ownership=structural',
          'ownership=value',
          'buildtime_ai_once',
          'manual_static',
          'runtime_ai',
          'role=title_like',
          'role=raw_json',
        ];
        for (const token of boilerplateTokens) {
          if (contractFragment.includes(token)) {
            expect(sanitized).not.toContain(token);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 26: Sanitizer is idempotent on clean input ─────────────────────

// Feature: ai-workflow-generation-engine, Property 26: Sanitizer is idempotent on clean input
test('Property 26: Sanitizer is idempotent on clean input', () => {
  fc.assert(
    fc.property(
      // Generate strings that don't contain registry boilerplate
      fc.string({ minLength: 0, maxLength: 200 }).filter(
        (s) => !CONTRACT_FRAGMENTS.some((f) => s.includes(f.trim())) &&
               !s.includes('ownership=') &&
               !s.includes('buildtime_ai_once') &&
               !s.includes('manual_static') &&
               !s.includes('runtime_ai')
      ),
      (cleanInput) => {
        const once = sanitizeIntentTextForFormFieldExtraction(cleanInput);
        const twice = sanitizeIntentTextForFormFieldExtraction(once);
        // Idempotent: applying sanitizer twice gives the same result as once
        expect(twice).toBe(once);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Fixture test: known registry fill contract fragment ─────────────────────

test('Fixture: sanitizer removes known registry fill contract fragment without altering adjacent user content', () => {
  const userContent = 'Send an email to the customer with their order details';
  const contractFragment = '\n## Configuration contract\nSemantics (universal):\n- ownership=credential\n- buildtime_ai_once\n- manual_static';
  const adjacentContent = '\nThank you for your order';

  const input = `${userContent}${contractFragment}${adjacentContent}`;
  const sanitized = sanitizeIntentTextForFormFieldExtraction(input);

  // User content before the contract should be preserved
  expect(sanitized).toContain(userContent);
  // Contract text should be removed
  expect(sanitized).not.toContain('ownership=credential');
  expect(sanitized).not.toContain('buildtime_ai_once');
  expect(sanitized).not.toContain('manual_static');
});
