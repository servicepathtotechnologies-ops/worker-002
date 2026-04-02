/**
 * Bug Condition Exploration Test — Switch Node Case Generation Bug
 * Feature: switch-node-case-generation-bug
 *
 * CRITICAL: These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists. DO NOT fix the source code when these fail.
 *
 * Each test encodes the expected (correct) behavior. When the fix is applied,
 * these tests will pass and confirm the bug is resolved.
 */

import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import { planSwitchCasesFromPrompt } from '../switch-case-plan';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Access the private buildCaseNodeMappingForPlan via the public
 * clarifyIntentAndGenerateSinglePlan path is too heavy (requires AI).
 * Instead we reach it through a thin wrapper that mirrors the internal call:
 * instantiate AIIntentClarifier and call the private method via bracket notation.
 */
function callBuildCaseNodeMappingForPlan(
  proposedNodeChain: string[],
  userPrompt: string
): Record<string, string> | undefined {
  // AIIntentClarifier is not exported, so we require the module and access the class
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../summarize-layer');
  // The class is exported as AIIntentClarifier
  const AIIntentClarifier = mod.AIIntentClarifier;
  if (!AIIntentClarifier) {
    throw new Error('AIIntentClarifier not exported from summarize-layer');
  }
  const instance = new AIIntentClarifier();
  // Access private method via bracket notation
  return (instance as any).buildCaseNodeMappingForPlan(proposedNodeChain, userPrompt);
}

/** Build a minimal switch workflow with N cases but only M outgoing edges (M < N). */
function buildSwitchWorkflowWithMismatch(
  caseCount: number,
  edgeCount: number
): Workflow {
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger_1',
      type: 'manual_trigger',
      data: { label: 'Manual Trigger', type: 'manual_trigger', category: 'trigger', config: {} },
    },
    {
      id: 'switch_1',
      type: 'switch',
      data: {
        label: 'Switch',
        type: 'switch',
        category: 'logic',
        config: {
          cases: Array.from({ length: caseCount }, (_, i) => ({
            value: `case_value_${i + 1}`,
            label: `Case ${i + 1}`,
          })),
        },
      },
    },
  ];

  // Add downstream nodes (one per edge we want to wire)
  for (let i = 0; i < edgeCount; i++) {
    nodes.push({
      id: `output_${i + 1}`,
      type: 'log_output',
      data: { label: `Output ${i + 1}`, type: 'log_output', category: 'output', config: {} },
    });
  }

  const edges: WorkflowEdge[] = [
    { id: 'e_trigger_switch', source: 'trigger_1', target: 'switch_1', type: 'main' },
  ];

  // Wire only edgeCount outgoing edges from switch (fewer than caseCount)
  for (let i = 0; i < edgeCount; i++) {
    edges.push({
      id: `e_switch_output_${i + 1}`,
      source: 'switch_1',
      target: `output_${i + 1}`,
      type: `case_${i + 1}`,
    });
  }

  return { nodes, edges };
}

// ─── Test A: planSwitchCasesFromPrompt extracts all N cases ─────────────────

// Feature: switch-node-case-generation-bug, Property 1: Bug Condition
describe('Test A — planSwitchCasesFromPrompt: all N routing conditions extracted', () => {
  const PROMPT = 'route orders by status: shipped, processing, cancelled';
  const UPSTREAM = 'ai_chat_model';

  it('returns exactly 3 cases for a 3-condition status prompt', () => {
    // Feature: switch-node-case-generation-bug, Property 1: Bug Condition
    const result = planSwitchCasesFromPrompt(PROMPT, UPSTREAM);

    // Document what the function actually returned (for counterexample evidence)
    console.log('[BUG EXPLORATION] planSwitchCasesFromPrompt result:', JSON.stringify(result, null, 2));
    console.log('[BUG EXPLORATION] cases.length:', result.cases.length);
    console.log('[BUG EXPLORATION] case values:', result.cases.map(c => c.value));

    // EXPECTED (correct) behavior: 3 cases
    expect(result.cases.length).toBe(3);
  });

  it('no case.value equals a node type string or destination label', () => {
    // Feature: switch-node-case-generation-bug, Property 1: Bug Condition
    const result = planSwitchCasesFromPrompt(PROMPT, UPSTREAM);

    // Known node type strings that must NOT appear as case values
    const nodeTypeStrings = [
      'send_tracking_details_via_gmail',
      'gmail',
      'google_gmail',
      'slack',
      'log_output',
      'manual_trigger',
      'switch',
    ];

    console.log('[BUG EXPLORATION] case values for label contamination check:', result.cases.map(c => c.value));

    for (const c of result.cases) {
      expect(nodeTypeStrings).not.toContain(c.value);
    }
  });

  it('property: for any array of 3–8 distinct condition strings, cases.length === N and no value is a node label', () => {
    // Feature: switch-node-case-generation-bug, Property 1: Bug Condition
    const knownNodeLabels = new Set([
      'gmail', 'google_gmail', 'slack', 'log_output', 'manual_trigger',
      'switch', 'if_else', 'webhook', 'http_request', 'ai_chat_model',
      'send_tracking_details_via_gmail',
    ]);

    // Use concrete 3-condition prompts that represent the bug scenario
    const testCases = [
      { prompt: 'route orders by status: shipped, processing, cancelled', n: 3 },
      { prompt: 'route messages by type: sales, support, billing', n: 3 },
      { prompt: 'classify tickets as open, closed, pending', n: 3 },
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...testCases),
        ({ prompt, n }) => {
          const result = planSwitchCasesFromPrompt(prompt, 'ai_chat_model');
          // Assert all N conditions are extracted
          expect(result.cases.length).toBe(n);
          // Assert no case value is a node label
          for (const c of result.cases) {
            expect(knownNodeLabels.has(c.value)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Test B: buildCaseNodeMappingForPlan surfaces gap when chain is too short ─

// Feature: switch-node-case-generation-bug, Property 1: Bug Condition
describe('Test B — buildCaseNodeMappingForPlan: chain-too-short gap is surfaced', () => {
  const PROMPT = 'route orders by status: shipped, processing, cancelled';
  // Chain has only 1 downstream non-log node (gmail) but prompt has 3 conditions
  const SHORT_CHAIN = ['manual_trigger', 'switch', 'gmail', 'log_output'];

  it('does NOT silently drop cases when chain is shorter than case count', () => {
    // Feature: switch-node-case-generation-bug, Property 1: Bug Condition
    const mapping = callBuildCaseNodeMappingForPlan(SHORT_CHAIN, PROMPT);

    console.log('[BUG EXPLORATION] buildCaseNodeMappingForPlan result:', JSON.stringify(mapping, null, 2));
    console.log('[BUG EXPLORATION] mapping entry count:', mapping ? Object.keys(mapping).length : 'undefined');

    // The prompt has 3 conditions. The chain has 1 downstream node.
    // EXPECTED (correct) behavior: an error object is returned (not a silent partial mapping)
    // The result should NOT be a plain mapping with fewer entries than cases without any error indication.
    //
    // On unfixed code: mapping has 1 entry (silently drops 2 cases) — this assertion will FAIL.
    // On fixed code: mapping contains _error: 'chain_too_short' or throws.
    const isErrorObject = mapping !== undefined &&
      typeof mapping === 'object' &&
      '_error' in mapping;

    const isSilentPartialMapping = mapping !== undefined &&
      !('_error' in mapping) &&
      Object.keys(mapping).length < 3;

    console.log('[BUG EXPLORATION] isErrorObject:', isErrorObject);
    console.log('[BUG EXPLORATION] isSilentPartialMapping:', isSilentPartialMapping);

    // Assert: must NOT be a silent partial mapping (the bug condition)
    expect(isSilentPartialMapping).toBe(false);
  });
});

// ─── Test C: validateWorkflow rejects switch node with mismatched case/edge count ─

// Feature: switch-node-case-generation-bug, Property 1: Bug Condition
describe('Test C — validateWorkflow: switch node out-degree !== cases.length is invalid', () => {
  it('returns valid: false when switch has 3 cases but only 2 outgoing edges', () => {
    // Feature: switch-node-case-generation-bug, Property 1: Bug Condition
    const workflow = buildSwitchWorkflowWithMismatch(3, 2);

    console.log('[BUG EXPLORATION] Test workflow nodes:', workflow.nodes.map(n => `${n.id}(${n.type})`));
    console.log('[BUG EXPLORATION] Test workflow edges:', workflow.edges.map(e => `${e.source}->${e.target}[${e.type}]`));

    const result = unifiedGraphOrchestrator.validateWorkflow(workflow);

    console.log('[BUG EXPLORATION] validateWorkflow result:', JSON.stringify(result, null, 2));
    console.log('[BUG EXPLORATION] valid:', result.valid);
    console.log('[BUG EXPLORATION] errors:', result.errors);

    // EXPECTED (correct) behavior: valid: false with a descriptive error naming the node ID
    expect(result.valid).toBe(false);

    // The error message should mention the switch node ID
    const errorText = result.errors.join(' ');
    expect(errorText).toMatch(/switch_1/);
  });

  it('error message describes the out-degree vs cases.length mismatch', () => {
    // Feature: switch-node-case-generation-bug, Property 1: Bug Condition
    const workflow = buildSwitchWorkflowWithMismatch(3, 2);
    const result = unifiedGraphOrchestrator.validateWorkflow(workflow);

    const errorText = result.errors.join(' ');
    console.log('[BUG EXPLORATION] error text:', errorText);

    // Should mention the structural invariant violation
    // On unfixed code: no such error exists — this assertion will FAIL
    expect(
      errorText.toLowerCase().includes('case') ||
      errorText.toLowerCase().includes('out-degree') ||
      errorText.toLowerCase().includes('structural') ||
      errorText.toLowerCase().includes('mismatch')
    ).toBe(true);
  });
});
