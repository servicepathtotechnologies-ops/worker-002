/**
 * Property-Based Tests: Registry Field Fill Mode Completeness
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../unified-node-registry';
import { buildRegistryStructuralFillContractSection } from '../../../services/ai/registry-structural-fill-contract';

const VALID_FILL_MODES = new Set(['manual_static', 'buildtime_ai_once', 'runtime_ai']);

// ─── Property 7: All registry fields have a declared fillMode.default ─────────

// Feature: ai-workflow-generation-engine, Property 7: All registry fields have a declared fillMode.default
test('Property 7: All registry fields have a declared fillMode.default', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes),
      (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const inputSchema = def.inputSchema as Record<string, any>;
        for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
          const fillMode = (fieldDef as any)?.fillMode?.default;
          expect(fillMode).toBeDefined();
          expect(VALID_FILL_MODES.has(fillMode)).toBe(true);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 8: Credential fields are always manual_static ──────────────────

// Feature: ai-workflow-generation-engine, Property 8: Credential fields are always manual_static
test('Property 8: Credential fields are always manual_static', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes),
      (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const inputSchema = def.inputSchema as Record<string, any>;
        for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
          const ownership = (fieldDef as any)?.ownership;
          const fillMode = (fieldDef as any)?.fillMode?.default;

          if (ownership === 'credential') {
            // Credential fields must always be manual_static
            expect(fillMode).toBe('manual_static');
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 9: Fill_Contract output is deterministic ───────────────────────

// Feature: ai-workflow-generation-engine, Property 9: Fill_Contract output is deterministic
test('Property 9: Fill_Contract output is deterministic', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...allTypes), { minLength: 1, maxLength: 5 }),
      (nodeTypes) => {
        const uniqueTypes = [...new Set(nodeTypes)];
        const result1 = buildRegistryStructuralFillContractSection(uniqueTypes);
        const result2 = buildRegistryStructuralFillContractSection(uniqueTypes);
        // Same input → same output (deterministic)
        expect(result1).toBe(result2);
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 10: requiredInputs are always present in inputSchema', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes),
      (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;
        const schemaKeys = new Set(Object.keys((def.inputSchema || {}) as Record<string, unknown>));
        for (const req of def.requiredInputs || []) {
          expect(schemaKeys.has(req)).toBe(true);
        }
      }
    ),
    { numRuns: 100 }
  );
});
