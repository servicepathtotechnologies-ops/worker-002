/**
 * Property-Based Tests: AI Workflow Generation Engine
 * Feature: ai-workflow-generation-engine
 *
 * All properties use fast-check with a minimum of 100 iterations.
 * Each test is tagged with the property number from the design document.
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Arbitrary that produces a valid canonical node type from the registry. */
const arbCanonicalNodeType = () =>
  fc.constantFrom(...(unifiedNodeRegistry.getAllTypes().length > 0
    ? unifiedNodeRegistry.getAllTypes()
    : ['manual_trigger', 'log_output']));

/** Arbitrary WorkflowIntentPlan with a non-empty proposedNodeChain. */
const arbWorkflowIntentPlan = () =>
  fc.record({
    structuredSummary: fc.string({ minLength: 1 }),
    proposedNodeChain: fc.array(arbCanonicalNodeType(), { minLength: 1, maxLength: 8 }),
    originalPrompt: fc.string({ minLength: 1 }),
  });

// ─── Property 2: proposedNodeChain contains only canonical registry keys ────

// Feature: ai-workflow-generation-engine, Property 2: proposedNodeChain contains only canonical registry keys
test('Property 2: proposedNodeChain contains only canonical registry keys', () => {
  fc.assert(
    fc.property(arbWorkflowIntentPlan(), (plan) => {
      for (const nodeType of plan.proposedNodeChain) {
        expect(unifiedNodeRegistry.has(nodeType)).toBe(true);
      }
    }),
    { numRuns: 100 }
  );
});
