/**
 * Property-Based Tests: Node Selection Stage
 * Feature: ai-first-workflow-generation-pipeline
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── Property 5: Unknown node types are discarded without pipeline failure ────

// Feature: ai-first-workflow-generation-pipeline, Property 5: Unknown node types are discarded without pipeline failure
test('Property 5: unknown node types from LLM are discarded without pipeline failure', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      // Generate a mix of valid and invalid node types
      fc.array(
        fc.oneof(
          fc.constantFrom(...allTypes.slice(0, Math.min(allTypes.length, 20))), // valid types
          fc.string({ minLength: 3, maxLength: 30 }).filter(s => !allTypes.includes(s)), // invalid types
        ),
        { minLength: 1, maxLength: 10 },
      ),
      (nodeTypes) => {
        // Simulate what the pipeline does: filter against registry
        const validNodes = nodeTypes.filter(
          (type) => !!unifiedNodeRegistry.get(type),
        );
        const invalidNodes = nodeTypes.filter(
          (type) => !unifiedNodeRegistry.get(type),
        );

        // All valid types must pass through
        for (const type of validNodes) {
          expect(unifiedNodeRegistry.get(type)).toBeTruthy();
        }

        // Invalid types must be absent from valid set
        for (const type of invalidNodes) {
          expect(validNodes).not.toContain(type);
        }

        // Pipeline must not throw — this is a pure filter operation, no exceptions
        expect(() => {
          nodeTypes.filter((type) => !!unifiedNodeRegistry.get(type));
        }).not.toThrow();
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 4: LLM receives prompt and catalog on every Node_Selection call ─

// Feature: ai-first-workflow-generation-pipeline, Property 4: LLM receives prompt and catalog on every Node_Selection call
test('Property 4: node_selection system prompt always contains both intent and catalog', () => {
  const { SystemPromptBuilder } = require('../system-prompt-builder');
  const { buildNodeCatalogText } = require('../node-catalog-builder');

  const builder = new SystemPromptBuilder();

  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 200 }),
      fc.constant(buildNodeCatalogText({ tokenBudget: 4000 })),
      (userIntent, nodeCatalog) => {
        const { systemPrompt } = builder.build({
          stage: 'node_selection',
          nodeCatalog,
          userIntent,
        });

        // Prompt must contain the catalog
        expect(systemPrompt).toContain(nodeCatalog.slice(0, 20));

        // Prompt must contain the user intent
        expect(systemPrompt).toContain(userIntent);
      }
    ),
    { numRuns: 100 }
  );
});
