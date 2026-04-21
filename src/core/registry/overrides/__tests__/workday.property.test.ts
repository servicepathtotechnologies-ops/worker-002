/**
 * Property-Based Tests: Workday Override Tags Superset
 * Feature: workday-node-integration
 *
 * Property 6: Override tags are always a superset of required tags.
 * Validates: Requirements 5.3
 */

import * as fc from 'fast-check';
import { overrideWorkday } from '../workday';
import type { UnifiedNodeDefinition } from '../../../types/unified-node-contract';

const REQUIRED_TAGS = ['workday', 'hr', 'staffing', 'api'] as const;

const mockSchema = { type: 'workday' } as any;

/**
 * Arbitrary that produces a minimal UnifiedNodeDefinition-like object
 * with a random tags field (undefined, empty array, or array of random strings).
 */
const arbNodeDef = fc.record({
  type: fc.constant('workday'),
  label: fc.string(),
  category: fc.constant('data' as const),
  description: fc.string(),
  version: fc.constant('1.0.0'),
  inputSchema: fc.constant({}),
  outputSchema: fc.constant({}),
  requiredInputs: fc.constant([]),
  defaultConfig: fc.constant(() => ({})),
  validateConfig: fc.constant(() => ({ valid: true, errors: [] })),
  execute: fc.constant(async () => ({ success: true })),
  incomingPorts: fc.constant(['default']),
  outgoingPorts: fc.constant(['default']),
  isBranching: fc.constant(false),
  tags: fc.oneof(
    fc.constant(undefined),
    fc.constant([]),
    fc.array(fc.string(), { minLength: 0, maxLength: 10 }),
  ),
}) as fc.Arbitrary<UnifiedNodeDefinition>;

// Feature: workday-node-integration, Property 6: Override tags are always a superset of required tags
test('Property 6: Override tags are always a superset of required tags', () => {
  fc.assert(
    fc.property(arbNodeDef, (def) => {
      const result = overrideWorkday(def, mockSchema);
      const resultTags = result.tags ?? [];

      for (const requiredTag of REQUIRED_TAGS) {
        expect(resultTags).toContain(requiredTag);
      }
    }),
    { numRuns: 100 },
  );
});
