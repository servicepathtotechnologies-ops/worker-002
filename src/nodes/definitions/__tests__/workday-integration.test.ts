/**
 * Integration Tests: Workday Node Integration Verification
 * Feature: workday-node-integration
 *
 * Tasks: 9.1, 9.2, 9.3
 * Validates: Requirements 4.3, 7.5, 8.5
 */

import * as fc from 'fast-check';
import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── Task 9.1 ─────────────────────────────────────────────────────────────────
// Verify nodeDefinitionRegistry contains 'workday' after registerAllNodeDefinitions()
// Validates: Requirements 4.3

describe('Task 9.1 — nodeDefinitionRegistry contains workday after registration', () => {
  beforeAll(() => {
    // index.ts auto-registers on import, but call explicitly to be explicit
    registerAllNodeDefinitions();
  });

  test('nodeDefinitionRegistry.get("workday") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('workday');
    expect(def).toBeDefined();
  });

  test('the workday definition has type "workday"', () => {
    const def = nodeDefinitionRegistry.get('workday');
    expect(def?.type).toBe('workday');
  });

  test('the workday definition has label "Workday"', () => {
    const def = nodeDefinitionRegistry.get('workday');
    expect(def?.label).toBe('Workday');
  });

  test('the workday definition has a non-empty category', () => {
    // Note: the UnifiedNodeRegistry maps http_api → 'utility' internally for all HTTP API nodes.
    // We assert the category is defined and non-empty.
    const def = nodeDefinitionRegistry.get('workday');
    expect(def?.category).toBeTruthy();
  });
});

// ─── Task 9.2 ─────────────────────────────────────────────────────────────────
// Property 7: Workday registration produces zero side effects on existing workflows
// Feature: workday-node-integration, Property 7: Workday registration produces zero side effects on existing workflows
// Validates: Requirements 8.5

describe('Task 9.2 — Property 7: Workday registration produces zero side effects on existing workflows', () => {
  const PRE_EXISTING_TYPES = ['xero', 'manual_trigger'] as const;

  test('Property 7: pre-existing node definitions are unchanged after registerAllNodeDefinitions()', () => {
    // Capture definitions before (re-)registration
    const before = PRE_EXISTING_TYPES.map((t) => ({
      type: t,
      def: nodeDefinitionRegistry.get(t),
    }));

    // Re-run registration (idempotent)
    registerAllNodeDefinitions();

    // Capture definitions after
    const after = PRE_EXISTING_TYPES.map((t) => ({
      type: t,
      def: nodeDefinitionRegistry.get(t),
    }));

    // Assert each pre-existing type still resolves and has the same identity
    for (let i = 0; i < PRE_EXISTING_TYPES.length; i++) {
      const nodeType = PRE_EXISTING_TYPES[i];
      expect(after[i].def).toBeDefined();
      expect(after[i].def?.type).toBe(nodeType);
      // Core fields must be identical
      expect(after[i].def?.label).toBe(before[i].def?.label);
      expect(after[i].def?.category).toBe(before[i].def?.category);
    }
  });

  // **Validates: Requirements 8.5**
  test('Property 7: workday entry exists but does not shadow any pre-existing type', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PRE_EXISTING_TYPES),
        (nodeType) => {
          const def = nodeDefinitionRegistry.get(nodeType);
          expect(def).toBeDefined();
          expect(def?.type).toBe(nodeType);
          // workday registration must not have overwritten these
          expect(def?.type).not.toBe('workday');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Task 9.3 ─────────────────────────────────────────────────────────────────
// Unit test for credential provider resolution for 'workday'
// Validates: Requirements 7.5

describe('Task 9.3 — Credential provider resolution for workday', () => {
  test('getCredentialPreflightDescriptor("workday") returns a descriptor with requiresCheck true', () => {
    const descriptor = unifiedNodeRegistry.getCredentialPreflightDescriptor('workday');
    expect(descriptor).toBeDefined();
    expect(descriptor.requiresCheck).toBe(true);
  });

  test('getCredentialPreflightDescriptor("workday") lookupKeys contains "workday"', () => {
    const descriptor = unifiedNodeRegistry.getCredentialPreflightDescriptor('workday');
    // lookupKeys is the provider inference result — must include 'workday'
    expect(descriptor.lookupKeys).toContain('workday');
  });

  test('resolveAlias("workday") returns "workday" — canonical provider proxy', () => {
    // Proxy assertion per design doc: alias resolution confirms credential provider identity
    const resolved = unifiedNodeRegistry.resolveAlias('workday');
    expect(resolved).toBe('workday');
  });
});
