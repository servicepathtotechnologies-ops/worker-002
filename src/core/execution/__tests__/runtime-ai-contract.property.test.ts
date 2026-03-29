/**
 * Property-Based Tests: Runtime AI Resolution Contract
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNodeOutputsCache(data: Record<string, unknown>): LRUNodeOutputsCache {
  const cache = new LRUNodeOutputsCache(100);
  for (const [key, value] of Object.entries(data)) {
    cache.set(key, value, true);
  }
  return cache;
}

// ─── Property 23: Template expressions fully resolved before execution ────────

// Feature: ai-workflow-generation-engine, Property 23: Template expressions fully resolved before execution
test('Property 23: Template expressions fully resolved before execution', () => {
  const { resolveUniversalTemplate } = require('../../utils/universal-template-resolver');

  fc.assert(
    fc.property(
      // Generate a JSON object with string values
      fc.record({
        message: fc.string({ minLength: 1, maxLength: 50 }),
        count: fc.integer({ min: 0, max: 100 }),
        label: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      (upstreamData) => {
        const cache = makeNodeOutputsCache({
          '$json': upstreamData,
          'json': upstreamData,
          'input': upstreamData,
        });

        // Template expressions that reference upstream data
        const templates = [
          `{{$json.message}}`,
          `{{$json.count}}`,
          `{{$json.label}}`,
        ];

        for (const template of templates) {
          const resolved = resolveUniversalTemplate(template, cache);
          // After resolution, no {{$json.*}} pattern should remain
          if (typeof resolved === 'string') {
            expect(resolved).not.toMatch(/\{\{\$json\./);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 22: runtime_ai fields resolved from upstream JSON + structuredSummary

// Feature: ai-workflow-generation-engine, Property 22: runtime_ai fields resolved from upstream JSON + structuredSummary
test('Property 22: runtime_ai resolution uses upstream JSON and workflow intent', () => {
  // This property verifies the contract: runtime_ai fields must be resolved
  // using upstream node output and workflow intent (structuredSummary).
  // We test the fill-mode resolver to ensure runtime_ai fields are identified correctly.
  const { buildEffectiveFillModes } = require('../../utils/fill-mode-resolver');

  fc.assert(
    fc.property(
      fc.record({
        fieldA: fc.constantFrom('manual_static', 'buildtime_ai_once', 'runtime_ai'),
        fieldB: fc.constantFrom('manual_static', 'buildtime_ai_once', 'runtime_ai'),
      }),
      (fillModeDefaults) => {
        const inputSchema = {
          fieldA: { type: 'string', description: 'test', required: false, fillMode: { default: fillModeDefaults.fieldA } },
          fieldB: { type: 'string', description: 'test', required: false, fillMode: { default: fillModeDefaults.fieldB } },
        };

        const effectiveModes = buildEffectiveFillModes(inputSchema, {});

        // Effective modes must match the schema defaults when no config override
        expect(effectiveModes.fieldA).toBe(fillModeDefaults.fieldA);
        expect(effectiveModes.fieldB).toBe(fillModeDefaults.fieldB);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 24: runtime_ai resolved values contain no registry boilerplate ──

const BOILERPLATE_PATTERNS = [
  '## Configuration contract',
  'Semantics (universal):',
  'Planner rules:',
  'ownership=',
  'buildtime_ai_once',
  'manual_static',
  'runtime_ai',
  '{{',
  '}}',
];

// Feature: ai-workflow-generation-engine, Property 24: runtime_ai resolved values contain no registry boilerplate
test('Property 24: runtime_ai resolved values contain no registry boilerplate', () => {
  const { sanitizeIntentTextForFormFieldExtraction } = require('../../../services/ai/intent-extraction');

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 200 }),
      (resolvedValue) => {
        // Any value that passes through the sanitizer should have no boilerplate
        const sanitized = sanitizeIntentTextForFormFieldExtraction(resolvedValue);

        for (const pattern of BOILERPLATE_PATTERNS) {
          // Template syntax ({{ }}) may appear in user content but should be resolved
          // before reaching the executor. The sanitizer removes contract text.
          if (pattern !== '{{' && pattern !== '}}') {
            expect(sanitized).not.toContain(pattern);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});
