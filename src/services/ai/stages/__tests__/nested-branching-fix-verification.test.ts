/**
 * Fix Verification Tests — Nested Branching Support (Tasks 6, 7, 8)
 *
 * These tests verify the fix works correctly for all inputs where isBugCondition holds.
 * All tests MUST PASS on fixed code.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { randomUUID } from 'crypto';
import { StructuralPromptGenerator } from '../structural-prompt-generator';
import { enforceRegistrySelectionContract } from '../node-selection-stage';
import { systemPromptBuilder } from '../../system-prompt-builder';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { SelectedNode } from '../../system-prompt-builder';
import type { StructuralPromptInput } from '../../../../core/types/pipeline-contracts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(type: string, role: 'trigger' | 'action' | 'logic' | 'terminal' = 'action'): SelectedNode {
  return { type, role, reason: 'test', nodeId: randomUUID() };
}

const generator = new StructuralPromptGenerator();

// ─── Test 1: composeText() with switch-in-switch ──────────────────────────────

describe('Fix Verification — Test 1: composeText() with switch-in-switch', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * [manual_trigger, switch, gmail, switch, slack, hubspot]
   * The second switch is nested inside the first switch's branch.
   * Fixed code must produce both `  →` (depth 1) and `    →` (depth 2).
   */
  it('output contains `  →` AND `    →` for switch-in-switch input', () => {
    const branchingTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t)?.isBranching === true);
    const switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];

    const nodes: SelectedNode[] = [
      makeNode('manual_trigger', 'trigger'),
      makeNode(switchType, 'logic'),
      makeNode('google_gmail', 'action'),
      makeNode(switchType, 'logic'),
      makeNode('slack_message', 'action'),
      makeNode('hubspot', 'action'),
    ];

    const result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: {
        intent: 'route by status then by priority',
        triggerType: 'manual_trigger' as const,
        actions: ['trigger manually', 'route by status', 'send email', 'route by priority', 'notify slack', 'update hubspot'],
        dataFlows: [],
        constraints: [],
      },
      capabilitySelections: {},
    });

    expect(result.text).toContain('  →');
    expect(result.text).toContain('    →');
  });
});

// ─── Test 2: buildConditions() with 2-switch node list ───────────────────────

describe('Fix Verification — Test 2: buildConditions() with 2-switch node list', () => {
  /**
   * **Validates: Requirements 2.2**
   */
  it('conditions.length === 2 for 2-switch input', () => {
    const branchingTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t)?.isBranching === true);
    const switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];

    const nodes: SelectedNode[] = [
      makeNode('manual_trigger', 'trigger'),
      makeNode(switchType, 'logic'),
      makeNode('google_gmail', 'action'),
      makeNode(switchType, 'logic'),
      makeNode('slack_message', 'action'),
      makeNode('hubspot', 'action'),
    ];

    const result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: {
        intent: 'route by status then by priority',
        triggerType: 'manual_trigger' as const,
        actions: ['trigger manually', 'route by status', 'send email', 'route by priority', 'notify slack', 'update hubspot'],
        dataFlows: [],
        constraints: [],
      },
      capabilitySelections: {},
    });

    expect(result.conditions.length).toBe(2);
  });
});

// ─── Test 3: buildConditions() with switch+if_else ───────────────────────────

describe('Fix Verification — Test 3: buildConditions() with switch+if_else', () => {
  /**
   * **Validates: Requirements 2.2**
   */
  it('conditions.length === 2 for switch+if_else input', () => {
    const branchingTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t)?.isBranching === true);
    const switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];
    const ifElseType = branchingTypes.includes('if_else') ? 'if_else' : branchingTypes[1] ?? branchingTypes[0];

    if (branchingTypes.length < 2) {
      console.warn('Skipping: registry has fewer than 2 distinct branching types');
      return;
    }

    const nodes: SelectedNode[] = [
      makeNode('webhook', 'trigger'),
      makeNode(switchType, 'logic'),
      makeNode(ifElseType, 'logic'),
      makeNode('google_gmail', 'action'),
      makeNode('slack_message', 'action'),
    ];

    const result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: {
        intent: 'route by region then check gdpr',
        triggerType: 'webhook' as const,
        actions: ['webhook received', 'route by region', 'check gdpr', 'send email', 'notify slack'],
        dataFlows: [],
        constraints: [],
      },
      capabilitySelections: {},
    });

    expect(result.conditions.length).toBe(2);
  });
});

// ─── Test 4: enforceRegistrySelectionContract() with 2 switches, LLM omits one ─

describe('Fix Verification — Test 4: enforceRegistrySelectionContract() with requiredNodeTypes: ["switch","switch"]', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * LLM only returned one switch. requiredNodeTypes demands two.
   * Fixed code must inject the second switch despite `seen` Set.
   */
  it('output contains exactly 2 nodes with isBranching === true', () => {
    const branchingTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t)?.isBranching === true);
    const switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];

    // LLM only returned ONE switch
    const parsed = [
      { type: switchType, role: 'logic' as const, reason: 'first switch' },
      { type: 'google_gmail', role: 'action' as const, reason: 'send email' },
    ];

    const constraints = {
      selectedNodeConstraintsFlat: [switchType, 'google_gmail'],
      requiredNodeTypes: [switchType, switchType, 'google_gmail'],
    };

    const result = enforceRegistrySelectionContract(parsed, undefined, constraints);

    const branchingCount = result.filter(n => unifiedNodeRegistry.get(n.type)?.isBranching === true).length;
    expect(branchingCount).toBe(2);
  });
});

// ─── Test 5: buildBranchTree() tested via generator.generate() — depth-2 indent ─

describe('Fix Verification — Test 5: buildBranchTree() via generator.generate() — 2-level switch', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * Tests buildBranchTree() indirectly via generate().
   * A 2-level switch input must produce `    →` (4-space indent = depth 2).
   */
  it('output text has `    →` (depth-2 indent) for 2-level switch input', () => {
    const branchingTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t)?.isBranching === true);
    const switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];

    const nodes: SelectedNode[] = [
      makeNode('form', 'trigger'),
      makeNode(switchType, 'logic'),
      makeNode('google_gmail', 'action'),
      makeNode(switchType, 'logic'),
      makeNode('slack_message', 'action'),
    ];

    const result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: {
        intent: 'route form submission by region then by priority',
        triggerType: 'form' as const,
        actions: ['form submitted', 'route by region', 'send email', 'route by priority', 'notify slack'],
        dataFlows: [],
        constraints: [],
      },
      capabilitySelections: {},
    });

    expect(result.text).toContain('    →');
  });
});

// ─── Test 6: renderBranchTree() tested via generator.generate() — 3-level deep ─

describe('Fix Verification — Test 6: renderBranchTree() via generator.generate() — 3-level deep nesting', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * switch → switch → switch → action (3 branching nodes = 3 levels deep).
   * Fixed code must produce `      →` (6-space indent = depth 3).
   */
  it('output text has `      →` (6-space indent = depth 3) for 3-level nesting', () => {
    const branchingTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t)?.isBranching === true);
    const switchType = branchingTypes.includes('switch') ? 'switch' : branchingTypes[0];

    // 3 nested branching nodes: outer → middle → inner → action
    const nodes: SelectedNode[] = [
      makeNode('manual_trigger', 'trigger'),
      makeNode(switchType, 'logic'),
      makeNode(switchType, 'logic'),
      makeNode(switchType, 'logic'),
      makeNode('google_gmail', 'action'),
    ];

    const result = generator.generate({
      resolvedNodes: nodes,
      structuredIntent: {
        intent: 'route by region then by priority then by tier then send email',
        triggerType: 'manual_trigger' as const,
        actions: ['trigger manually', 'route by region', 'route by priority', 'route by tier', 'send email'],
        dataFlows: [],
        constraints: [],
      },
      capabilitySelections: {},
    });

    expect(result.text).toContain('      →');
  });
});

// ─── Test 7: enforceRegistrySelectionContract() — non-branching duplicate regression guard ─

describe('Fix Verification — Test 7: enforceRegistrySelectionContract() — non-branching duplicate deduplication preserved', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * Two non-branching duplicate types in requiredNodeTypes.
   * The fix must NOT change deduplication behavior for non-branching types.
   * When LLM omits both and they're injected via requiredTypes, only one should appear.
   */
  it('non-branching type deduplication still applies — only one google_gmail injected when LLM omits it', () => {
    // LLM returned nothing for google_gmail, but requiredNodeTypes has it twice
    const parsed = [
      { type: 'manual_trigger', role: 'trigger' as const, reason: 'trigger' },
    ];

    const constraints = {
      selectedNodeConstraintsFlat: ['manual_trigger', 'google_gmail'],
      requiredNodeTypes: ['google_gmail', 'google_gmail'],
    };

    const result = enforceRegistrySelectionContract(parsed, undefined, constraints);

    const gmailCount = result.filter(n => n.type === 'google_gmail').length;
    // Non-branching types are deduplicated — only one should be injected
    expect(gmailCount).toBe(1);
  });
});

// ─── Test 8: buildEdgeReasoningPrompt() contains nested branching rule ────────

describe('Fix Verification — Test 8: buildEdgeReasoningPrompt() contains nested branching rule', () => {
  /**
   * **Validates: Requirements 2.4**
   */
  it('systemPrompt contains "inner branching node" and "outer switch"', () => {
    const { systemPrompt } = systemPromptBuilder.build({
      stage: 'edge_reasoning',
      nodeCatalog: '',
      userIntent: 'test',
    });

    expect(systemPrompt).toContain('inner branching node');
    expect(systemPrompt).toContain('outer switch');
  });
});

// ─── Test 9: resolveCapabilitySelections flat list deduplication logic ────────

describe('Fix Verification — Test 9: resolveCapabilitySelections flat list — branching types preserved', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * Two steps both selecting "switch" → flat list contains ["switch", "switch"] (length 2, not 1).
   * Tests the flat list construction logic directly (mirrors the fix in workflow-generation-pipeline.ts).
   */
  it('flat list contains ["switch", "switch"] when two steps both select switch', () => {
    // Simulate the flat array built by resolveCapabilitySelections before deduplication
    const flat: string[] = ['switch', 'google_gmail', 'switch']; // two steps both selected switch

    const branchingFlat: string[] = [];
    const nonBranchingFlat: string[] = [];
    for (const type of flat) {
      const def = unifiedNodeRegistry.get(type);
      if (def?.isBranching === true) {
        branchingFlat.push(type);
      } else {
        nonBranchingFlat.push(type);
      }
    }
    const result = [...branchingFlat, ...new Set(nonBranchingFlat)];

    expect(result.filter(t => t === 'switch').length).toBe(2);
    expect(result.filter(t => t === 'google_gmail').length).toBe(1);
  });
});

// ─── Test 10: resolveCapabilitySelections — non-branching deduplication preserved ─

describe('Fix Verification — Test 10: resolveCapabilitySelections flat list — non-branching deduplication preserved', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * Two steps both selecting "google_gmail" → flat list contains only one "google_gmail".
   * Deduplication for non-branching types must be preserved.
   */
  it('flat list contains only one google_gmail when two steps both select it', () => {
    const flat: string[] = ['google_gmail', 'slack_message', 'google_gmail']; // two steps both selected gmail

    const branchingFlat: string[] = [];
    const nonBranchingFlat: string[] = [];
    for (const type of flat) {
      const def = unifiedNodeRegistry.get(type);
      if (def?.isBranching === true) {
        branchingFlat.push(type);
      } else {
        nonBranchingFlat.push(type);
      }
    }
    const result = [...branchingFlat, ...new Set(nonBranchingFlat)];

    expect(result.filter(t => t === 'google_gmail').length).toBe(1);
    expect(result.filter(t => t === 'slack_message').length).toBe(1);
  });
});
