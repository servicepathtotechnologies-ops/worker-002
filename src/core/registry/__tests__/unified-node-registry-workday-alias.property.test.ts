/**
 * Property-Based Tests: Workday Alias Resolution and Provider Inference
 * Feature: workday-node-integration
 *
 * All properties use fast-check with a minimum of 100 iterations.
 * Each test is tagged with the property number from the design document.
 */

import { describe, expect, test } from '@jest/globals';
import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../unified-node-registry';

// ─── Property 4: All workday aliases resolve to the canonical type ────────────
// Feature: workday-node-integration, Property 4: All workday aliases resolve to the canonical type
// Validates: Requirements 7.1, 7.2, 7.3

describe('Property 4: All workday aliases resolve to the canonical type', () => {
  const WORKDAY_ALIASES = [
    'workday',
    'workday_hr',
    'workday_workers',
    'workday_staffing',
    'workday_api',
  ] as const;

  test('each alias resolves to "workday"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WORKDAY_ALIASES),
        (alias) => {
          const resolved = unifiedNodeRegistry.resolveAlias(alias);
          expect(resolved).toBe('workday');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Provider inference covers all workday-prefixed type strings ──
// Feature: workday-node-integration, Property 5: Provider inference covers all workday-prefixed type strings
// Validates: Requirements 7.4

describe('Property 5: Provider inference covers all workday-prefixed type strings', () => {
  const registry = unifiedNodeRegistry as any;

  test('strings containing "workday" always infer provider "workday"', () => {
    fc.assert(
      fc.property(
        // Generate strings that contain 'workday' as a substring
        fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}workday${suffix}`),
        (nodeTypeWithWorkday) => {
          const provider = registry.inferProviderFromNodeType(nodeTypeWithWorkday);
          expect(provider).toBe('workday');
        }
      ),
      { numRuns: 100 }
    );
  });
});
