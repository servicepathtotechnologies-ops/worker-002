/**
 * Preservation Property Tests — Switch Node Case Generation Bug
 * Feature: switch-node-case-generation-bug
 *
 * These tests MUST PASS on unfixed code — they capture the baseline behavior
 * that must not regress after the fix is applied.
 *
 * Tag: // Feature: switch-node-case-generation-bug, Property 2: Preservation
 */

import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import { planSwitchCasesFromPrompt } from '../switch-case-plan';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Access the private buildCaseNodeMappingForPlan via bracket notation on AIIntentClarifier,
 * mirroring the pattern used in the exploration test.
 */
function callBuildCaseNodeMappingForPlan(
  proposedNodeChain: string[],
  userPrompt: string
): Record<string, unknown> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../summarize-layer');
  const AIIntentClarifier = mod.AIIntentClarifier;
  if (!AIIntentClarifier) {
    throw new Error('AIIntentClarifier not exported from summarize-layer');
  }
  const instance = new AIIntentClarifier();
  return (instance as any).buildCaseNodeMappingForPlan(proposedNodeChain, userPrompt);
}

/** Build a minimal if_else workflow with true/false outgoing edges. */
function buildIfElseWorkflow(): Workflow {
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger_1',
      type: 'manual_trigger',
      data: { label: 'Manual Trigger', type: 'manual_trigger', category: 'trigger', config: {} },
    },
    {
      id: 'if_else_1',
      type: 'if_else',
      data: {
        label: 'If/Else',
        type: 'if_else',
        category: 'logic',
        config: { condition: '{{$json.value}} > 0' },
      },
    },
    {
      id: 'output_true',
      type: 'log_output',
      data: { label: 'Log True', type: 'log_output', category: 'output', config: {} },
    },
    {
      id: 'output_false',
      type: 'log_output',
      data: { label: 'Log False', type: 'log_output', category: 'output', config: {} },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e_trigger_if', source: 'trigger_1', target: 'if_else_1', type: 'main' },
    { id: 'e_if_true', source: 'if_else_1', target: 'output_true', type: 'true' },
    { id: 'e_if_false', source: 'if_else_1', target: 'output_false', type: 'false' },
  ];

  return { nodes, edges };
}

/** Build a minimal switch workflow with N matching cases and N downstream nodes. */
function buildMatchingSwitchWorkflow(caseValues: string[]): Workflow {
  const N = caseValues.length;
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
          cases: caseValues.map((v, i) => ({ value: v, label: `Case ${i + 1}` })),
        },
      },
    },
  ];

  for (let i = 0; i < N; i++) {
    nodes.push({
      id: `output_${i + 1}`,
      type: 'log_output',
      data: { label: `Output ${i + 1}`, type: 'log_output', category: 'output', config: {} },
    });
  }

  const edges: WorkflowEdge[] = [
    { id: 'e_trigger_switch', source: 'trigger_1', target: 'switch_1', type: 'main' },
  ];

  for (let i = 0; i < N; i++) {
    edges.push({
      id: `e_switch_output_${i + 1}`,
      source: 'switch_1',
      target: `output_${i + 1}`,
      type: `case_${i + 1}`,
    });
  }

  return { nodes, edges };
}

// ─── Preservation A: Linear workflow — buildCaseNodeMappingForPlan returns undefined ─

// Feature: switch-node-case-generation-bug, Property 2: Preservation
describe('Preservation A — linear workflow: buildCaseNodeMappingForPlan returns undefined', () => {
  it('returns undefined for a simple linear chain with no switch node', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const chain = ['manual_trigger', 'gmail', 'log_output'];
    const result = callBuildCaseNodeMappingForPlan(chain, 'send an email via gmail');
    console.log('[PRESERVATION A] result for linear chain:', result);
    expect(result).toBeUndefined();
  });

  it('property: returns undefined for any random linear chain without a switch node', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const linearNodeTypes = fc.constantFrom(
      'gmail', 'slack', 'log_output', 'google_sheets', 'http_request',
      'ai_chat_model', 'webhook', 'notion', 'airtable'
    );

    fc.assert(
      fc.property(
        // Generate a linear chain: manual_trigger + 1-3 action nodes (no 'switch')
        fc.array(linearNodeTypes, { minLength: 1, maxLength: 3 }),
        (middleNodes) => {
          const chain = ['manual_trigger', ...middleNodes, 'log_output'];
          const result = callBuildCaseNodeMappingForPlan(chain, 'do something with data');
          // Must return undefined — no switch node in chain
          expect(result).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── Preservation B: N=2 switch prompt — cases.length === 2 with correct values ─

// Feature: switch-node-case-generation-bug, Property 2: Preservation
describe('Preservation B — N=2 switch prompt: planSwitchCasesFromPrompt returns 2 cases', () => {
  it('returns exactly 2 cases for "route messages as sales or support"', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const result = planSwitchCasesFromPrompt(
      'route messages as sales or support',
      'ai_chat_model'
    );
    console.log('[PRESERVATION B] N=2 result:', JSON.stringify(result, null, 2));
    expect(result.cases.length).toBe(2);
    const values = result.cases.map(c => c.value);
    expect(values).toContain('sales');
    expect(values).toContain('support');
  });

  it('property: 2-condition prompts always return cases.length === 2', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const twoCasePairs = fc.constantFrom(
      { prompt: 'route messages as sales or support', expected: ['sales', 'support'] },
      { prompt: 'classify as sales or general', expected: ['sales', 'general'] },
      { prompt: 'route as support or general', expected: ['support', 'general'] },
      { prompt: 'classify messages as sales or support', expected: ['sales', 'support'] },
    );

    fc.assert(
      fc.property(
        twoCasePairs,
        ({ prompt, expected }) => {
          const result = planSwitchCasesFromPrompt(prompt, 'ai_chat_model');
          expect(result.cases.length).toBe(2);
          const values = result.cases.map(c => c.value);
          for (const e of expected) {
            expect(values).toContain(e);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── Preservation C: if_else workflow passes validateWorkflow ─

// Feature: switch-node-case-generation-bug, Property 2: Preservation
describe('Preservation C — if_else workflow: validateWorkflow returns valid: true', () => {
  it('a well-formed if_else workflow with true/false edges passes validation', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const workflow = buildIfElseWorkflow();

    console.log('[PRESERVATION C] if_else workflow nodes:', workflow.nodes.map(n => `${n.id}(${n.type})`));
    console.log('[PRESERVATION C] if_else workflow edges:', workflow.edges.map(e => `${e.source}->${e.target}[${e.type}]`));

    const result = unifiedGraphOrchestrator.validateWorkflow(workflow);

    console.log('[PRESERVATION C] validateWorkflow result:', JSON.stringify(result, null, 2));

    // Must pass — the switch case count invariant (added by the fix) must NOT affect if_else
    expect(result.valid).toBe(true);
  });
});

// ─── Preservation D: expressionTemplate format is always {{$json.<field>}} ─

// Feature: switch-node-case-generation-bug, Property 2: Preservation
describe('Preservation D — expressionTemplate: always {{$json.<field>}} for any upstream node type', () => {
  it('returns expressionTemplate in {{$json.<field>}} form for ai_chat_model', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const result = planSwitchCasesFromPrompt(
      'route messages as sales or support',
      'ai_chat_model'
    );
    console.log('[PRESERVATION D] expressionTemplate:', result.expressionTemplate);
    expect(result.expressionTemplate).toMatch(/^\{\{\$json\.\w+\}\}$/);
  });

  it('property: expressionTemplate is always {{$json.<field>}} for any upstream node type string', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const upstreamNodeTypes = fc.constantFrom(
      'ai_chat_model', 'ollama', 'form', 'chat_trigger', 'manual_trigger',
      'webhook', 'google_sheets', 'http_request', 'gmail', 'slack',
      'notion', 'airtable', 'hubspot', 'javascript', 'unknown_node_type'
    );

    fc.assert(
      fc.property(
        upstreamNodeTypes,
        (upstreamType) => {
          const result = planSwitchCasesFromPrompt(
            'route messages as sales or support',
            upstreamType
          );
          // expressionTemplate must always be {{$json.<something>}}
          expect(result.expressionTemplate).toMatch(/^\{\{\$json\.\w+\}\}$/);
          // discriminantField must be a non-empty string
          expect(typeof result.discriminantField).toBe('string');
          expect(result.discriminantField.length).toBeGreaterThan(0);
          // expressionTemplate must embed discriminantField
          expect(result.expressionTemplate).toBe(`{{$json.${result.discriminantField}}}`);
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Preservation E — case mapping supports optional targetNodeId descriptors', () => {
  it('emits targetNodeId when downstream chain uses descriptor token format', () => {
    const chain = [
      'form',
      'switch',
      'google_gmail#gmail_node_1',
      'slack_message#slack_node_1',
      'slack_message#slack_node_2',
      'log_output',
      'log_output',
    ];
    const mapping = callBuildCaseNodeMappingForPlan(
      chain,
      'if status is success send gmail, if pending send slack, if failed send slack'
    );

    expect(mapping).toBeDefined();
    const entries = Object.values(mapping || {}) as Array<any>;
    expect(entries.some((e) => e?.targetNodeId === 'gmail_node_1')).toBe(true);
    expect(entries.some((e) => e?.targetNodeId === 'slack_node_1')).toBe(true);
    expect(entries.some((e) => e?.targetNodeId === 'slack_node_2')).toBe(true);
    expect(entries.every((e) => typeof e?.slot === 'string')).toBe(true);
  });
});

// ─── Preservation E: N=2 switch with matching chain returns 2-entry mapping ─

// Feature: switch-node-case-generation-bug, Property 2: Preservation
describe('Preservation E — N=2 switch with matching chain: buildCaseNodeMappingForPlan returns 2-entry mapping', () => {
  it('returns a 2-entry mapping for a 2-condition prompt with 2 downstream nodes', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    // Chain: trigger → switch → gmail → slack → log_output
    // 2 downstream non-log nodes: gmail, slack
    const chain = ['manual_trigger', 'switch', 'gmail', 'slack', 'log_output'];
    const prompt = 'route messages as sales or support';

    const mapping = callBuildCaseNodeMappingForPlan(chain, prompt);

    console.log('[PRESERVATION E] N=2 mapping:', JSON.stringify(mapping, null, 2));
    console.log('[PRESERVATION E] entry count:', mapping ? Object.keys(mapping).length : 'undefined/null');

    // Must return a mapping (not undefined) with exactly 2 entries
    expect(mapping).toBeDefined();
    expect(mapping).not.toBeNull();
    expect(Object.keys(mapping!).length).toBe(2);
  });

  it('the 2-entry mapping keys are deterministic structural case slots', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const chain = ['manual_trigger', 'switch', 'gmail', 'slack', 'log_output'];
    const prompt = 'route messages as sales or support';

    const mapping = callBuildCaseNodeMappingForPlan(chain, prompt);

    expect(mapping).toBeDefined();
    const keys = Object.keys(mapping!);
    // Universal mode: keys are prompt-independent structural slots.
    expect(keys).toContain('case_1');
    expect(keys).toContain('case_2');
  });

  it('a N=2 switch workflow with matching edges passes validateWorkflow', () => {
    // Feature: switch-node-case-generation-bug, Property 2: Preservation
    const workflow = buildMatchingSwitchWorkflow(['sales', 'support']);

    console.log('[PRESERVATION E] N=2 switch workflow nodes:', workflow.nodes.map(n => `${n.id}(${n.type})`));
    console.log('[PRESERVATION E] N=2 switch workflow edges:', workflow.edges.map(e => `${e.source}->${e.target}[${e.type}]`));

    const result = unifiedGraphOrchestrator.validateWorkflow(workflow);

    console.log('[PRESERVATION E] validateWorkflow result:', JSON.stringify(result, null, 2));

    // N=2 switch with matching edges must pass validation (no regression)
    expect(result.valid).toBe(true);
  });
});
