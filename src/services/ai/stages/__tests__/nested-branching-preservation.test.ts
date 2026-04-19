/**
 * Preservation Property Tests — Nested Branching Support (Task 2)
 *
 * These tests MUST PASS on unfixed code — they lock in the baseline behavior
 * that must not regress after the fix is applied.
 *
 * Covers:
 *   - Linear workflow preservation (no branching nodes)
 *   - Single-level switch preservation
 *   - Single-level if_else preservation
 *   - Non-branching duplicate type preservation in enforceRegistrySelectionContract
 *   - Property-based: zero branching nodes → no branch lines
 *   - Property-based: exactly one branching node → single-level branch lines only
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
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

/** Get all non-branching, non-trigger action types from the registry. */
function getNonBranchingActionTypes(): string[] {
  return unifiedNodeRegistry
    .getAllTypes()
    .filter(
      (t) =>
        !unifiedNodeRegistry.get(t)?.isBranching &&
        !unifiedNodeRegistry.isTrigger(t),
    );
}

/** Get all branching types from the registry. */
function getBranchingTypes(): string[] {
  return unifiedNodeRegistry
    .getAllTypes()
    .filter((t) => unifiedNodeRegistry.get(t)?.isBranching === true);
}

/** Pick a random element from an array using a seeded index (deterministic for tests). */
function pickAt<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length];
}

const generator = new StructuralPromptGenerator();

const linearIntent: StructuralPromptInput['structuredIntent'] = {
  intent: 'send email after reading sheet',
  triggerType: 'manual_trigger' as const,
  actions: ['trigger manually', 'read from google sheets', 'send via gmail'],
  dataFlows: [],
  constraints: [],
};

const singleSwitchIntent: StructuralPromptInput['structuredIntent'] = {
  intent: 'route form submission to email or slack',
  triggerType: 'form' as const,
  actions: ['form submitted', 'route by status', 'send email', 'notify slack'],
  dataFlows: [],
  constraints: [],
};

const singleIfElseIntent: StructuralPromptInput['structuredIntent'] = {
  intent: 'conditionally send email or slack on webhook',
  triggerType: 'webhook' as const,
  actions: ['webhook received', 'check condition', 'send email', 'notify slack'],
  dataFlows: [],
  constraints: [],
};

// ─── Test Group 1: Linear workflow preservation ───────────────────────────────

describe('Preservation — Test Group 1: Linear workflow (no branching nodes)', () => {
  let result: ReturnType<StructuralPromptGenerator['generate']>;

  beforeAll(() => {
    const nodes: SelectedNode[] = [
      makeNode('manual_trigger', 'trigger'),
      makeNode('google_sheets', 'action'),
      makeNode('google_gmail', 'action'),
    ];

    result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: linearIntent,
      capabilitySelections: {},
    });
  });

  it('result.text contains no `  →` lines (no branch case lines)', () => {
    // Linear workflows must not produce any branch case lines
    expect(result.text).not.toContain('  →');
  });

  it('result.conditions.length === 0', () => {
    expect(result.conditions.length).toBe(0);
  });

  it('result.steps.length === 3', () => {
    expect(result.steps.length).toBe(3);
  });

  it('result.text snapshot — contains WORKFLOW, TRIGGER, FLOW, CONNECTIONS sections', () => {
    expect(result.text).toContain('WORKFLOW:');
    expect(result.text).toContain('TRIGGER:');
    expect(result.text).toContain('FLOW:');
    expect(result.text).toContain('CONNECTIONS:');
  });

  it('result.text snapshot — contains numbered steps (1., 2., 3.) with no indented branch arrows', () => {
    expect(result.text).toMatch(/1\./);
    expect(result.text).toMatch(/2\./);
    expect(result.text).toMatch(/3\./);
    // Confirm no branch case lines at any depth (two-space indent is the branch marker)
    expect(result.text).not.toContain('  →');
  });
});

// ─── Test Group 2: Single-level switch preservation ───────────────────────────

describe('Preservation — Test Group 2: Single-level switch (exactly one switch)', () => {
  let result: ReturnType<StructuralPromptGenerator['generate']>;
  let switchType: string;

  beforeAll(() => {
    const branchingTypes = getBranchingTypes();
    switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];

    const nodes: SelectedNode[] = [
      makeNode('form', 'trigger'),
      makeNode(switchType, 'logic'),
      makeNode('google_gmail', 'action'),
      makeNode('slack_message', 'action'),
    ];

    result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: singleSwitchIntent,
      capabilitySelections: {},
    });
  });

  it('result.text contains `  →` (single-level branch cases exist)', () => {
    expect(result.text).toContain('  →');
  });

  it('result.text does NOT contain `    →` (no depth-2 indent)', () => {
    // Single-level switch must not produce nested indentation
    expect(result.text).not.toContain('    →');
  });

  it('result.conditions.length === 1', () => {
    expect(result.conditions.length).toBe(1);
  });

  it('result.conditions[0].branchNodeType matches the switch type', () => {
    expect(result.conditions[0].branchNodeType).toBe(switchType);
  });
});

// ─── Test Group 3: Single-level if_else preservation ─────────────────────────

describe('Preservation — Test Group 3: Single-level if_else (exactly one if_else)', () => {
  let result: ReturnType<StructuralPromptGenerator['generate']>;
  let ifElseType: string;

  beforeAll(() => {
    const branchingTypes = getBranchingTypes();
    ifElseType = branchingTypes.includes('if_else') ? 'if_else' : branchingTypes[0];

    const nodes: SelectedNode[] = [
      makeNode('webhook', 'trigger'),
      makeNode(ifElseType, 'logic'),
      makeNode('google_gmail', 'action'),
      makeNode('slack_message', 'action'),
    ];

    result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: singleIfElseIntent,
      capabilitySelections: {},
    });
  });

  it('result.text contains `  →`', () => {
    expect(result.text).toContain('  →');
  });

  it('result.text does NOT contain `    →` (no depth-2 indent)', () => {
    expect(result.text).not.toContain('    →');
  });

  it('result.conditions.length === 1', () => {
    expect(result.conditions.length).toBe(1);
  });

  it('result.conditions[0].branchNodeType matches the if_else type', () => {
    expect(result.conditions[0].branchNodeType).toBe(ifElseType);
  });
});

// ─── Test Group 4: Non-branching duplicate type preservation ──────────────────

describe('Preservation — Test Group 4: Non-branching duplicate type in enforceRegistrySelectionContract', () => {
  it('preserves exactly 2 google_gmail nodes when both are in parsed and allowed', () => {
    const parsed = [
      { type: 'google_gmail', role: 'action' as const, reason: 'branch A email' },
      { type: 'google_gmail', role: 'action' as const, reason: 'branch B email' },
    ];

    const constraints = {
      selectedNodeConstraintsFlat: ['google_gmail'],
      requiredNodeTypes: ['google_gmail', 'google_gmail'],
    };

    const result = enforceRegistrySelectionContract(parsed, undefined, constraints);

    // Both gmail nodes must survive — they are needed for separate branches
    const gmailCount = result.filter((n) => n.type === 'google_gmail').length;
    expect(gmailCount).toBe(2);
  });

  it('non-branching duplicates are NOT deduplicated when both appear in parsed list', () => {
    // This confirms the existing behavior: the `kept` loop passes both through
    // because allowedSet contains 'google_gmail' and both pass the filter.
    const parsed = [
      { type: 'google_gmail', role: 'action' as const, reason: 'first gmail' },
      { type: 'google_gmail', role: 'action' as const, reason: 'second gmail' },
    ];

    const constraints = {
      selectedNodeConstraintsFlat: ['google_gmail'],
      requiredNodeTypes: ['google_gmail'],
    };

    const result = enforceRegistrySelectionContract(parsed, undefined, constraints);

    // Both survive from the `kept` loop (allowedSet check passes for both)
    const gmailCount = result.filter((n) => n.type === 'google_gmail').length;
    expect(gmailCount).toBe(2);
  });
});

// ─── Test Group 5: Property-based — zero branching nodes ─────────────────────

describe('Preservation — Test Group 5 (Property-based): Zero branching nodes', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any node list with zero branching nodes, the generator must produce:
   *   - conditions.length === 0
   *   - text with no `  →` lines
   */

  let nonBranchingTypes: string[];
  let triggerTypes: string[];

  beforeAll(() => {
    nonBranchingTypes = getNonBranchingActionTypes();
    triggerTypes = unifiedNodeRegistry
      .getAllTypes()
      .filter((t) => unifiedNodeRegistry.isTrigger(t));
  });

  it('registry has non-branching action types available for property tests', () => {
    expect(nonBranchingTypes.length).toBeGreaterThan(0);
  });

  // Generate 8 distinct node lists with zero branching nodes
  const testCases = [
    // [triggerIdx, ...actionIdxs]
    [0, 0, 1],
    [0, 1, 2],
    [1, 0, 2, 3],
    [0, 3, 4],
    [1, 5, 6, 7],
    [0, 0, 1, 2, 3],
    [1, 2, 4, 6],
    [0, 8, 9],
  ];

  testCases.forEach((idxs, caseNum) => {
    it(`case ${caseNum + 1}: zero-branching node list → conditions.length === 0 and no '  →' in text`, () => {
      const [triggerIdx, ...actionIdxs] = idxs;
      const trigger = pickAt(triggerTypes, triggerIdx);
      const actions = actionIdxs.map((i) => pickAt(nonBranchingTypes, i));

      const nodes: SelectedNode[] = [
        makeNode(trigger, 'trigger'),
        ...actions.map((t) => makeNode(t, 'action')),
      ];

      const intent: StructuralPromptInput['structuredIntent'] = {
        intent: `test linear workflow case ${caseNum}`,
        triggerType: trigger as any,
        actions: actions.map((t) => `process with ${t}`),
        dataFlows: [],
        constraints: [],
      };

      const result = generator.generate({
        resolvedNodes: nodes,
        structuredIntent: intent,
        capabilitySelections: {},
      });

      // Core preservation assertions
      expect(result.conditions.length).toBe(0);
      expect(result.text).not.toContain('  →');
    });
  });
});

// ─── Test Group 6: Property-based — exactly one branching node ────────────────

describe('Preservation — Test Group 6 (Property-based): Exactly one branching node', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any node list with exactly one branching node, the generator must produce:
   *   - conditions.length === 1
   *   - text contains `  →` (single-level branch cases)
   *   - text does NOT contain `    →` (no depth-2 indent)
   */

  let nonBranchingTypes: string[];
  let branchingTypes: string[];
  let triggerTypes: string[];

  beforeAll(() => {
    nonBranchingTypes = getNonBranchingActionTypes();
    branchingTypes = getBranchingTypes();
    triggerTypes = unifiedNodeRegistry
      .getAllTypes()
      .filter((t) => unifiedNodeRegistry.isTrigger(t));
  });

  it('registry has at least one branching type for property tests', () => {
    expect(branchingTypes.length).toBeGreaterThan(0);
  });

  // Test cases: [triggerIdx, branchingTypeIdx, branchPosition, ...actionIdxs]
  // branchPosition: 0 = immediately after trigger, 1 = after one action, etc.
  const testCases: Array<{ triggerIdx: number; branchingIdx: number; branchPos: number; actionIdxs: number[] }> = [
    { triggerIdx: 0, branchingIdx: 0, branchPos: 0, actionIdxs: [0, 1] },
    { triggerIdx: 0, branchingIdx: 0, branchPos: 1, actionIdxs: [2, 3] },
    { triggerIdx: 1, branchingIdx: 0, branchPos: 0, actionIdxs: [4, 5] },
    { triggerIdx: 0, branchingIdx: 0, branchPos: 2, actionIdxs: [0, 1, 2] },
    { triggerIdx: 1, branchingIdx: 0, branchPos: 1, actionIdxs: [3, 4, 5] },
    { triggerIdx: 0, branchingIdx: 0, branchPos: 0, actionIdxs: [6, 7, 8] },
    { triggerIdx: 0, branchingIdx: 0, branchPos: 3, actionIdxs: [0, 2, 4, 6] },
    { triggerIdx: 1, branchingIdx: 0, branchPos: 0, actionIdxs: [1, 3] },
  ];

  testCases.forEach(({ triggerIdx, branchingIdx, branchPos, actionIdxs }, caseNum) => {
    it(`case ${caseNum + 1}: single branching node at position ${branchPos} → conditions.length === 1, single-level '  →' only`, () => {
      const trigger = pickAt(triggerTypes, triggerIdx);
      const branchingType = pickAt(branchingTypes, branchingIdx);
      const actions = actionIdxs.map((i) => pickAt(nonBranchingTypes, i));

      // Build node list: trigger, [pre-branch actions], branching node, [post-branch actions]
      const preActions = actions.slice(0, branchPos);
      const postActions = actions.slice(branchPos);

      const nodes: SelectedNode[] = [
        makeNode(trigger, 'trigger'),
        ...preActions.map((t) => makeNode(t, 'action')),
        makeNode(branchingType, 'logic'),
        ...postActions.map((t) => makeNode(t, 'action')),
      ];

      const intent: StructuralPromptInput['structuredIntent'] = {
        intent: `test single-branch workflow case ${caseNum}`,
        triggerType: trigger as any,
        actions: [
          `trigger via ${trigger}`,
          ...preActions.map((t) => `process with ${t}`),
          `route by condition`,
          ...postActions.map((t) => `handle with ${t}`),
        ],
        dataFlows: [],
        constraints: [],
      };

      const result = generator.generate({
        resolvedNodes: nodes,
        structuredIntent: intent,
        capabilitySelections: {},
      });

      // Core preservation assertions
      expect(result.conditions.length).toBe(1);
      expect(result.text).toContain('  →');
      expect(result.text).not.toContain('    →');
    });
  });
});
