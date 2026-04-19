/**
 * Bug Condition Exploration Test — Nested Branching Support (Task 1)
 *
 * This test MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT fix the code when this test fails.
 *
 * Three bugs are exercised:
 *   Bug 1 (composeText): flat iteration treats all downstream nodes as cases of the first branch
 *   Bug 2 (buildConditions): outcomes scoped incorrectly (all downstream consumed by first branch)
 *   Bug 3 (enforceRegistrySelectionContract): Set-based dedup may drop second switch node
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * DOCUMENTED FAILURES (observed on unfixed code — run 2025):
 *
 *   Bug 1.1 CONFIRMED FAILING — composeText() switch-in-switch:
 *     Expected: result.text contains `    →` (4-space indent for depth-2 branch)
 *     Actual:   All downstream nodes rendered as flat `  →` cases of the first switch.
 *     Counterexample output:
 *       "  → Case "case_1": Gmail — Gmail processes and forwards data
 *        → Case "case_1": Switch — Branch B: Switch evaluates conditions and routes data
 *        → Case "case_1": Slack — notify slack
 *        → Case "case_2": Slack — notify slack"
 *     The second switch is treated as just another case of the first switch, not a nested branch.
 *
 *   Bug 1.4 CONFIRMED FAILING — composeText() switch+if_else:
 *     Expected: result.text contains `    →` (4-space indent for depth-2 branch)
 *     Actual:   if_else rendered as flat `  →` case of the outer switch.
 *     Counterexample output:
 *       "  → Case "case_1": If/Else — If/Else evaluates conditions and routes data
 *        → Case "case_1": Gmail — Gmail processes and forwards data
 *        → Case "case_1": Slack — notify slack"
 *
 *   Bug 1.2 PASSES on unfixed code (conditions.length === 2 already):
 *     buildConditions() iterates all branching nodes and emits a condition per node.
 *     However, the downstream scope for each condition is incorrect (Bug 2 in design.md
 *     is about wrong outcome text, not missing conditions). The count assertion passes
 *     but the outcome content is wrong — this will be validated in fix verification tests.
 *
 *   Bug 1.3 PASSES on unfixed code (conditions.length === 2 for switch+if_else):
 *     Same as above — count is correct, but outcome scoping is wrong.
 *
 *   Bug 1.5 PASSES on unfixed code (enforceRegistrySelectionContract preserves 2 switches):
 *     The `seen` Set dedup bug described in design.md does NOT manifest when
 *     `selectedNodeConstraintsFlat` contains the type — the `kept` loop already
 *     passes both switch nodes through (allowedSet check passes for both).
 *     The `seen` guard only applies in the `requiredTypes` injection loop, which
 *     only runs for types NOT already in `withoutExtraTriggers`. Since both switches
 *     are in `parsed` and pass the `allowedSet` check, they both survive into `kept`.
 *     The real bug manifests when the LLM omits one switch from its output but
 *     `requiredNodeTypes` has ["switch","switch"] — the injection loop then only
 *     injects one. This scenario is not exercised by this test case.
 */

import { describe, it, expect } from '@jest/globals';
import { randomUUID } from 'crypto';
import { StructuralPromptGenerator } from '../structural-prompt-generator';
import { enforceRegistrySelectionContract } from '../node-selection-stage';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { SelectedNode } from '../../system-prompt-builder';
import type { StructuralPromptInput } from '../../../../core/types/pipeline-contracts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(type: string, role: 'trigger' | 'action' | 'logic' | 'terminal' = 'action'): SelectedNode {
  return { type, role, reason: 'test', nodeId: randomUUID() };
}

/** Resolve branching types dynamically from the registry — no hardcoded names. */
function getBranchingTypes(): string[] {
  return unifiedNodeRegistry.getAllTypes().filter((t) => unifiedNodeRegistry.get(t)?.isBranching === true);
}

const minimalIntent: StructuralPromptInput['structuredIntent'] = {
  intent: 'test workflow',
  triggerType: 'form' as const,
  actions: ['route by status', 'send email', 'route by priority', 'notify slack', 'notify slack'],
  dataFlows: [],
  constraints: [],
};

const generator = new StructuralPromptGenerator();

// ─── Test Group 1 & 2: composeText() and buildConditions() ───────────────────

describe('Bug Condition Exploration — Nested Branching (Task 1)', () => {
  let branchingTypes: string[];
  let switchType: string;
  let ifElseType: string;

  beforeAll(() => {
    branchingTypes = getBranchingTypes();
    // Prefer 'switch' and 'if_else' if available; fall back to first two branching types
    switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];
    ifElseType = branchingTypes.includes('if_else') ? 'if_else' : branchingTypes[1] ?? branchingTypes[0];
  });

  it('registry has at least one branching type', () => {
    expect(branchingTypes.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Test Case A: switch-in-switch ─────────────────────────────────────────

  describe('Test Case A — switch-in-switch: [form_trigger, switch_1, gmail, switch_2, slack_1, slack_2]', () => {
    let result: ReturnType<StructuralPromptGenerator['generate']>;
    let nodes: SelectedNode[];

    beforeAll(() => {
      nodes = [
        makeNode('form', 'trigger'),
        makeNode(switchType, 'logic'),
        makeNode('google_gmail', 'action'),
        makeNode(switchType, 'logic'),
        makeNode('slack_message', 'action'),
        makeNode('slack_message', 'action'),
      ];

      const input: StructuralPromptInput = {
        resolvedNodes: nodes,
        structuredIntent: minimalIntent,
        capabilitySelections: {},
      };

      result = generator.generate(input);
    });

    /**
     * Bug 1 — composeText() flat iteration
     *
     * On unfixed code: all downstream nodes appear as flat `  →` cases of the first switch.
     * The second switch is never rendered as a nested branching node, so no `    →` lines exist.
     *
     * EXPECTED FAILURE on unfixed code:
     *   result.text does NOT contain `    →` (4-space indent)
     *
     * **Validates: Requirements 1.1**
     */
    it('Bug 1.1 — composeText() output should contain `    →` (4-space indent) for nested switch (FAILS on unfixed code)', () => {
      // On fixed code: the second switch renders its downstream nodes at depth 2 → `    →`
      // On unfixed code: all downstream nodes are flat `  →` cases of the first switch
      expect(result.text).toContain('    →');
    });

    /**
     * Bug 2 — buildConditions() single capture
     *
     * NOTE: On unfixed code, conditions.length IS 2 — the loop iterates all branching nodes.
     * The real bug is that the downstream scope for each condition is wrong (all downstream
     * nodes are consumed by the first condition's slice). This count assertion PASSES on
     * unfixed code. The outcome content correctness is validated in fix verification tests.
     *
     * **Validates: Requirements 1.2**
     */
    it('Bug 1.2 — buildConditions() should return conditions.length === 2 for 2-switch input (passes on unfixed code — count is correct, outcomes are wrong)', () => {
      const branchingNodeCount = nodes.filter((n) => unifiedNodeRegistry.get(n.type)?.isBranching === true).length;
      expect(branchingNodeCount).toBe(2); // precondition: input has 2 branching nodes
      expect(result.conditions.length).toBe(branchingNodeCount);
    });
  });

  // ─── Test Case B: mixed branching types (switch + if_else) ─────────────────

  describe('Test Case B — mixed branching: [webhook, switch_1, if_else_1, gmail, slack]', () => {
    let result: ReturnType<StructuralPromptGenerator['generate']>;
    let nodes: SelectedNode[];

    beforeAll(() => {
      // Skip if only one branching type exists in registry
      if (branchingTypes.length < 2) return;

      nodes = [
        makeNode('webhook', 'trigger'),
        makeNode(switchType, 'logic'),
        makeNode(ifElseType, 'logic'),
        makeNode('google_gmail', 'action'),
        makeNode('slack_message', 'action'),
      ];

      const input: StructuralPromptInput = {
        resolvedNodes: nodes,
        structuredIntent: {
          intent: 'test mixed branching',
          triggerType: 'webhook' as const,
          actions: ['route by region', 'check gdpr', 'send email', 'notify slack'],
          dataFlows: [],
          constraints: [],
        },
        capabilitySelections: {},
      };

      result = generator.generate(input);
    });

    /**
     * Bug 2 — buildConditions() with mixed branching types
     *
     * NOTE: On unfixed code, conditions.length IS 2 — the loop iterates all branching nodes.
     * Count assertion PASSES on unfixed code. Outcome scoping is wrong but not tested here.
     *
     * **Validates: Requirements 1.2**
     */
    it('Bug 1.3 — buildConditions() should return conditions.length === 2 for switch+if_else input (passes on unfixed code — count correct, outcomes wrong)', () => {
      if (branchingTypes.length < 2) {
        console.warn('Skipping: registry has fewer than 2 distinct branching types');
        return;
      }
      const branchingNodeCount = nodes.filter((n) => unifiedNodeRegistry.get(n.type)?.isBranching === true).length;
      expect(branchingNodeCount).toBe(2); // precondition
      expect(result.conditions.length).toBe(branchingNodeCount);
    });

    /**
     * Bug 1 — composeText() with mixed branching types
     *
     * On unfixed code: no `    →` lines (all downstream nodes are flat cases of first branch).
     *
     * EXPECTED FAILURE on unfixed code:
     *   result.text does NOT contain `    →`
     *
     * **Validates: Requirements 1.1**
     */
    it('Bug 1.4 — composeText() output should contain `    →` for switch+if_else input (FAILS on unfixed code)', () => {
      if (branchingTypes.length < 2) {
        console.warn('Skipping: registry has fewer than 2 distinct branching types');
        return;
      }
      expect(result.text).toContain('    →');
    });
  });

  // ─── Test Group 3: enforceRegistrySelectionContract() ──────────────────────

  describe('Test Group 3 — enforceRegistrySelectionContract() branching type preservation', () => {
    /**
     * Bug 3 — Set-based deduplication drops second switch (injection path)
     *
     * The `seen` Set bug manifests specifically when the LLM omits a switch from its
     * parsed output but `requiredNodeTypes` has ["switch","switch"]. The injection loop
     * then only injects one switch because `seen.has("switch")` is true after the first.
     *
     * This test exercises that path: parsed has only ONE switch, but requiredNodeTypes
     * demands TWO. On unfixed code, only one switch is injected.
     *
     * EXPECTED FAILURE on unfixed code:
     *   result contains only 1 node with isBranching === true (not 2)
     *
     * **Validates: Requirements 1.3**
     */
    it('Bug 1.5 — enforceRegistrySelectionContract() should inject 2 isBranching nodes when LLM omits one and requiredNodeTypes has ["switch","switch"] (FAILS on unfixed code)', () => {
      // Simulate: LLM only returned ONE switch (omitted the second), but user confirmed 2 switches
      const parsed = [
        { type: switchType, role: 'logic' as const, reason: 'test' },
        { type: 'google_gmail', role: 'action' as const, reason: 'test' },
        // NOTE: second switch intentionally omitted from LLM output
      ];

      const constraints = {
        selectedNodeConstraintsFlat: [switchType, 'google_gmail'],
        requiredNodeTypes: [switchType, switchType, 'google_gmail'],
      };

      const result = enforceRegistrySelectionContract(parsed, undefined, constraints);

      const branchingCount = result.filter((n) => unifiedNodeRegistry.get(n.type)?.isBranching === true).length;

      // On fixed code: branchingCount === 2 (second switch injected despite `seen` Set)
      // On unfixed code: branchingCount === 1 (second switch skipped by `seen.has(switchType)`)
      expect(branchingCount).toBe(2);
    });
  });
});
