/**
 * Property-Based Tests: Node Catalog Builder
 * Feature: ai-first-workflow-generation-pipeline
 */

import * as fc from 'fast-check';
import { buildNodeCatalogText, CompactNodeEntry, NodeCatalogOptions } from '../node-catalog-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── Property 1: Node_Catalog completeness ───────────────────────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 1: Node_Catalog completeness
test('Property 1: every registered node type appears in catalog when budget is sufficient', () => {
  fc.assert(
    fc.property(
      fc.constant(undefined), // no variation needed — registry is the source
      () => {
        const allTypes = unifiedNodeRegistry.getAllTypes();
        if (allTypes.length === 0) return; // nothing to assert

        // Use a very large budget so nothing is truncated
        const catalogText = buildNodeCatalogText({ tokenBudget: 10_000_000 });
        const entries: CompactNodeEntry[] = JSON.parse(catalogText);
        const catalogTypes = new Set(entries.map((e) => e.type));

        for (const type of allTypes) {
          expect(catalogTypes.has(type)).toBe(true);
        }
      }
    ),
    { numRuns: 10 } // registry is deterministic; 10 runs is sufficient
  );
});

// ─── Property 2: Node_Catalog entry schema ───────────────────────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 2: Node_Catalog entry schema
test('Property 2: every catalog entry contains all required fields', () => {
  fc.assert(
    fc.property(
      fc.constant(undefined),
      () => {
        const catalogText = buildNodeCatalogText({ tokenBudget: 10_000_000 });
        const entries: CompactNodeEntry[] = JSON.parse(catalogText);

        for (const entry of entries) {
          expect(typeof entry.type).toBe('string');
          expect(entry.type.length).toBeGreaterThan(0);

          expect(typeof entry.label).toBe('string');
          expect(entry.label.length).toBeGreaterThan(0);

          expect(typeof entry.category).toBe('string');
          expect(entry.category.length).toBeGreaterThan(0);

          expect(typeof entry.description).toBe('string');

          expect(Array.isArray(entry.inputSummary)).toBe(true);
          expect(Array.isArray(entry.outputSummary)).toBe(true);
          expect(Array.isArray(entry.credentials)).toBe(true);

          expect(typeof entry.isTrigger).toBe('boolean');
          expect(typeof entry.isBranching).toBe('boolean');
        }
      }
    ),
    { numRuns: 10 }
  );
});

// ─── Property 3: Token budget enforcement with priority preservation ──────────

// Feature: ai-first-workflow-generation-pipeline, Property 3: Token budget enforcement with priority preservation
test('Property 3: catalog never exceeds token budget and trigger/logic nodes appear before utility nodes are dropped', () => {
  fc.assert(
    fc.property(
      // Generate a variety of token budgets from very small to large
      fc.integer({ min: 200, max: 500_000 }),
      (budget) => {
        const priorityOrder = ['trigger', 'logic', 'data', 'ai', 'communication', 'transformation', 'utility'];
        const options: NodeCatalogOptions = { tokenBudget: budget, priorityOrder };
        const catalogText = buildNodeCatalogText(options);

        // Budget must not be exceeded (a single entry may exceed budget if it's the only one)
        const entries: CompactNodeEntry[] = JSON.parse(catalogText);
        if (entries.length > 1) {
          // With more than one entry, total must be within budget
          expect(catalogText.length).toBeLessThanOrEqual(budget + 50); // +50 for JSON array brackets
        }

        // If any utility node was dropped, no trigger or logic node should be missing
        const allTypes = unifiedNodeRegistry.getAllTypes();
        const includedTypes = new Set(entries.map((e) => e.type));

        // Collect all trigger and logic nodes from registry
        const highPriorityTypes: string[] = [];
        for (const type of allTypes) {
          const def = unifiedNodeRegistry.get(type);
          if (!def) continue;
          if (def.category === 'trigger' || def.category === 'logic') {
            highPriorityTypes.push(type);
          }
        }

        // Collect all utility nodes from registry
        const utilityTypes: string[] = [];
        for (const type of allTypes) {
          const def = unifiedNodeRegistry.get(type);
          if (!def) continue;
          if (def.category === 'utility') {
            utilityTypes.push(type);
          }
        }

        const anyUtilityDropped = utilityTypes.some((t) => !includedTypes.has(t));

        if (anyUtilityDropped) {
          // All high-priority nodes must still be present (unless budget is extremely small)
          const totalHighPrioritySize = highPriorityTypes.reduce((acc, t) => {
            const def = unifiedNodeRegistry.get(t);
            if (!def) return acc;
            return acc + JSON.stringify({ type: t, label: def.label }).length;
          }, 0);

          if (budget >= totalHighPrioritySize) {
            for (const type of highPriorityTypes) {
              expect(includedTypes.has(type)).toBe(true);
            }
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});
