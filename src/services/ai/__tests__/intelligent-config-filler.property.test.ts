/**
 * Property-Based Tests: IntelligentConfigFiller
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { IntelligentConfigFiller } from '../intelligent-config-filler';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMinimalWorkflow(nodeType: string, config: Record<string, any> = {}) {
  const nodeId = 'test-node-1';
  return {
    nodes: [
      {
        id: nodeId,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { type: nodeType, label: nodeType, config },
      },
    ],
    edges: [],
  };
}

// ─── Property 10: Config_Filler only fills buildtime_ai_once fields ──────────

// Feature: ai-workflow-generation-engine, Property 10: Config_Filler only fills buildtime_ai_once fields and skips manual_static and credential fields
test('Property 10: Config_Filler only fills buildtime_ai_once fields and skips manual_static and credential fields', async () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) {
    // Registry not populated in test environment — skip gracefully
    return;
  }

  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...allTypes),
      async (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const filler = new IntelligentConfigFiller();
        const workflow = makeMinimalWorkflow(nodeType);
        const result = await filler.fillConfigurationsFromPrompt(
          workflow as any,
          'test prompt',
          'test prompt'
        );

        const filledNode = result.nodes.find((n: any) => n.data?.type === nodeType);
        if (!filledNode) return;

        const filledConfig = (filledNode as any).data?.config ?? {};
        const inputSchema = def.inputSchema as Record<string, any>;

        // For every field in the schema, verify the gate was respected
        for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
          const fillMode: string = (fieldDef as any)?.fillMode?.default ?? 'manual_static';
          const ownership: string | undefined = (fieldDef as any)?.ownership;

          // manual_static and credential fields must NOT have been AI-filled
          if (fillMode === 'manual_static' || ownership === 'credential') {
            // The filler should not have written a non-metadata value for this field
            // (metadata keys like _fieldModes, _mappingMetadata are allowed)
            const value = filledConfig[fieldName];
            // If the field was already in the original config it's fine; we only care about
            // fields that were empty before and got filled.
            // Since we started with an empty config, any value here would be a violation.
            expect(value).toBeUndefined();
          }
        }
      }
    ),
    { numRuns: 100 }
  );
}, 30000);

// ─── Property 12: Pre-filled fields are marked with _fieldModes ─────────────

// Feature: ai-workflow-generation-engine, Property 12: Pre-filled fields are marked with _fieldModes
test('Property 12: Pre-filled fields are marked with _fieldModes', async () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...allTypes),
      async (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const filler = new IntelligentConfigFiller();
        const workflow = makeMinimalWorkflow(nodeType);
        const result = await filler.fillConfigurationsFromPrompt(
          workflow as any,
          'test prompt',
          'test prompt'
        );

        const filledNode = result.nodes.find((n: any) => n.data?.type === nodeType);
        if (!filledNode) return;

        const filledConfig = (filledNode as any).data?.config ?? {};
        const fieldModes = filledConfig._fieldModes;

        // _fieldModes must be present
        expect(fieldModes).toBeDefined();
        expect(typeof fieldModes).toBe('object');

        const inputSchema = def.inputSchema as Record<string, any>;
        const validModes = new Set(['manual_static', 'buildtime_ai_once', 'runtime_ai']);

        // Every field in inputSchema must have an entry in _fieldModes
        for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
          expect(fieldModes[fieldName]).toBeDefined();
          expect(validModes.has(fieldModes[fieldName])).toBe(true);

          // The recorded mode must match the registry default
          const expectedMode = (fieldDef as any)?.fillMode?.default ?? 'manual_static';
          expect(fieldModes[fieldName]).toBe(expectedMode);
        }
      }
    ),
    { numRuns: 100 }
  );
}, 30000);

// ─── Property 11: Pre-filled values pass field type validation ───────────────

// Feature: ai-workflow-generation-engine, Property 11: Pre-filled values pass field type validation
test('Property 11: Pre-filled values pass field type validation', async () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...allTypes),
      async (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const filler = new IntelligentConfigFiller();
        const workflow = makeMinimalWorkflow(nodeType);
        const result = await filler.fillConfigurationsFromPrompt(
          workflow as any,
          'test prompt',
          'test prompt'
        );

        const filledNode = result.nodes.find((n: any) => n.data?.type === nodeType);
        if (!filledNode) return;

        const filledConfig = (filledNode as any).data?.config ?? {};
        const inputSchema = def.inputSchema as Record<string, any>;

        // For every field that was filled (non-metadata), validate against schema
        for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
          const value = filledConfig[fieldName];
          if (value === undefined || value === null) continue;

          const validationFn = (fieldDef as any)?.validation;
          if (typeof validationFn === 'function') {
            const validationResult = validationFn(value);
            // validation returns true or an error string
            expect(validationResult).toBe(true);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
}, 30000);
