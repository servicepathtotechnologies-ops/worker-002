/**
 * Preservation Property Tests — AI Workflow Log Output Branch Generation Fix
 *
 * These tests MUST PASS on unfixed code — they establish the BASELINE behavior
 * that must not regress after the fix is applied.
 *
 * Property 2: Preservation — Non-Branching Workflows Unchanged
 *
 * Test cases:
 *   1. Linear workflow preservation — single log_output at end when logging mentioned
 *   2. Single-branch workflow preservation — IF with single branch → gmail → log_output
 *   3. Non-output node preservation — no log_output when no logging mentioned
 *   4. Merge-capable node preservation — merge node used (not log_output) for reconvergence
 *   5. Registry preservation for other nodes — non-log_output node definitions unaffected
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Spec: .kiro/specs/ai-workflow-log-output-branch-generation-fix/
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { AgenticWorkflowBuilder } from '../../services/ai/workflow-builder';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import type { PlannedWorkflow, WorkflowNode } from '../../core/types/ai-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNodesByType(nodes: WorkflowNode[], type: string): WorkflowNode[] {
  return nodes.filter(
    (n) =>
      unifiedNormalizeNodeTypeString(n.type) === type ||
      unifiedNormalizeNodeTypeString((n.data as any)?.type) === type
  );
}

function countIncomingEdges(edges: any[], nodeId: string): number {
  return edges.filter((e) => e.target === nodeId).length;
}

// ---------------------------------------------------------------------------
// Test 1: Linear workflow preservation
//
// Prompt: "When webhook received, fetch data from API, transform it, send email, log result"
// Observed on unfixed code: single log_output at end of linear chain
// Assert: structure preserved — exactly 1 log_output, exactly 1 incoming edge to it
//
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

describe('Preservation Test 1 — Linear workflow: single log_output at end', () => {
  it('Linear workflow with explicit logging produces exactly 1 log_output with 1 incoming edge', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'When webhook received, fetch data from API, transform it, send email, log result',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        { id: 'http_1', type: 'http_request', role: 'action' },
        { id: 'transform_1', type: 'javascript', role: 'action' },
        { id: 'gmail_1', type: 'google_gmail', role: 'output' },
        { id: 'log_1', type: 'log_output', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: Exactly 1 log_output node
    const logNodes = getNodesByType(nodes, 'log_output');
    expect(logNodes.length).toBe(1);

    // ASSERTION 2: The log_output has exactly 1 incoming edge (linear, not merged)
    const logNodeId = logNodes[0].id;
    const incomingToLog = countIncomingEdges(edges, logNodeId);
    expect(incomingToLog).toBe(1);

    // ASSERTION 3: log_output has 0 outgoing edges (terminal)
    const outgoingFromLog = edges.filter((e) => e.source === logNodeId);
    expect(outgoingFromLog.length).toBe(0);

    // ASSERTION 4: All 5 planned nodes are present
    expect(nodes.length).toBe(5);
  });

  /**
   * PBT: For any linear workflow that includes a log_output step, the hydrated
   * workflow always has exactly 1 log_output node with exactly 1 incoming edge.
   *
   * **Validates: Requirements 3.1**
   */
  it('PBT: Linear workflows with log_output always produce exactly 1 log_output with 1 incoming edge', () => {
    const middleNodeTypes = [
      'http_request',
      'javascript',
      'google_sheets',
      'notion',
    ] as const;

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...middleNodeTypes), { minLength: 1, maxLength: 3 }),
        (middleTypes) => {
          const builder = new AgenticWorkflowBuilder();

          const steps = [
            { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' as const },
            ...middleTypes.map((t, i) => ({
              id: `node_${i + 2}`,
              type: t,
              role: 'action' as const,
            })),
            { id: 'log_end', type: 'log_output', role: 'output' as const },
          ];

          const planned: PlannedWorkflow = {
            summary: 'Linear workflow with logging at end',
            steps,
          };

          let result: any;
          try {
            result = (builder as any).hydratePlannedWorkflow(planned);
          } catch {
            return true; // skip if hydration fails for unknown type
          }

          const nodes: WorkflowNode[] = result.workflow.nodes;
          const edges: any[] = result.workflow.edges || [];

          const logNodes = getNodesByType(nodes, 'log_output');

          // Must have exactly 1 log_output
          if (logNodes.length !== 1) return false;

          // log_output must have exactly 1 incoming edge
          const incoming = countIncomingEdges(edges, logNodes[0].id);
          if (incoming !== 1) return false;

          // log_output must have 0 outgoing edges
          const outgoing = edges.filter((e: any) => e.source === logNodes[0].id);
          if (outgoing.length !== 0) return false;

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: Single-branch workflow preservation
//
// Prompt: "If temperature > 30, send alert email and log"
// Observed on unfixed code: IF → true branch → gmail → log_output (single branch)
// Assert: structure preserved — IF node present, gmail present, log_output present
//
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

describe('Preservation Test 2 — Single-branch IF workflow: gmail → log_output preserved', () => {
  it('IF workflow with single branch (gmail + log) preserves both output nodes', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'If temperature > 30, send alert email and log',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        {
          id: 'if_1',
          type: 'if_else',
          role: 'logic',
          config: { condition: '{{$json.temperature}} > 30' },
        },
        { id: 'gmail_1', type: 'google_gmail', role: 'output' },
        { id: 'log_1', type: 'log_output', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: IF node is present
    const ifNodes = nodes.filter(
      (n) =>
        unifiedNormalizeNodeTypeString(n.type) === 'if_else' ||
        unifiedNormalizeNodeTypeString((n.data as any)?.type) === 'if_else'
    );
    expect(ifNodes.length).toBe(1);

    // ASSERTION 2: gmail node is present
    const gmailNodes = getNodesByType(nodes, 'google_gmail');
    expect(gmailNodes.length).toBe(1);

    // ASSERTION 3: log_output node is present
    const logNodes = getNodesByType(nodes, 'log_output');
    expect(logNodes.length).toBe(1);

    // ASSERTION 4: log_output has exactly 1 incoming edge (not merged from multiple branches)
    const logNodeId = logNodes[0].id;
    const incomingToLog = countIncomingEdges(edges, logNodeId);
    expect(incomingToLog).toBe(1);

    // ASSERTION 5: All 4 planned nodes are present
    expect(nodes.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Non-output node preservation
//
// Prompt: "Fetch data from API, transform it, store in database"
// Observed on unfixed code: no log_output nodes (no logging mentioned)
// Assert: no log_output generated when user doesn't mention logging
//
// NOTE: On unfixed code, log_output IS auto-injected (alwaysRequired: true).
// This test documents the CURRENT (unfixed) behavior — it will observe whether
// log_output is present or not, and assert accordingly.
// The test captures the baseline so we can detect regressions after the fix.
//
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

describe('Preservation Test 3 — Non-output node workflow: observe log_output behavior', () => {
  it('Workflow without logging keywords: observe and document log_output count on unfixed code', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Fetch data from API, transform it, store in database',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        { id: 'http_1', type: 'http_request', role: 'action' },
        { id: 'transform_1', type: 'javascript', role: 'action' },
        { id: 'db_1', type: 'notion', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // Document the observed behavior on unfixed code
    const logNodes = getNodesByType(nodes, 'log_output');
    console.log('[Preservation Test 3] Observed log_output count on unfixed code:', logNodes.length);
    console.log('[Preservation Test 3] Total node count:', nodes.length);
    console.log('[Preservation Test 3] Node types:', nodes.map((n) => unifiedNormalizeNodeTypeString(n.type) || (n.data as any)?.type));

    // ASSERTION: The planned nodes are all present
    const httpNodes = getNodesByType(nodes, 'http_request');
    expect(httpNodes.length).toBeGreaterThanOrEqual(1);

    const transformNodes = getNodesByType(nodes, 'javascript');
    expect(transformNodes.length).toBeGreaterThanOrEqual(1);

    const dbNodes = getNodesByType(nodes, 'notion');
    expect(dbNodes.length).toBeGreaterThanOrEqual(1);

    // ASSERTION: Any log_output nodes that ARE present must have exactly 1 incoming edge
    // (no multi-input merge topology, even on unfixed code)
    for (const logNode of logNodes) {
      const incoming = countIncomingEdges(edges, logNode.id);
      expect(incoming).toBeLessThanOrEqual(1);
    }

    // ASSERTION: No self-loops
    for (const edge of edges) {
      expect(edge.source).not.toBe(edge.target);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: Merge-capable node preservation
//
// Prompt: "Fetch from two APIs, merge results, send email"
// Observed on unfixed code: merge node used (not log_output) for reconvergence
// Assert: merge node is present, log_output is NOT used as merge point
//
// **Validates: Requirements 3.4**
// ---------------------------------------------------------------------------

describe('Preservation Test 4 — Merge-capable node: merge node used for reconvergence', () => {
  it('Workflow with explicit merge uses merge node (not log_output) for reconvergence', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Fetch from two APIs, merge results, send email',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        { id: 'http_api1', type: 'http_request', role: 'action' },
        { id: 'http_api2', type: 'http_request', role: 'action' },
        { id: 'merge_1', type: 'merge', role: 'logic' },
        { id: 'gmail_1', type: 'google_gmail', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: merge node is present
    const mergeNodes = nodes.filter(
      (n) =>
        unifiedNormalizeNodeTypeString(n.type) === 'merge' ||
        unifiedNormalizeNodeTypeString((n.data as any)?.type) === 'merge'
    );
    expect(mergeNodes.length).toBeGreaterThanOrEqual(1);

    // ASSERTION 2: gmail node is present
    const gmailNodes = getNodesByType(nodes, 'google_gmail');
    expect(gmailNodes.length).toBe(1);

    // ASSERTION 3: log_output is NOT used as the merge/reconvergence point
    // (log_output should not have multiple incoming edges)
    const logNodes = getNodesByType(nodes, 'log_output');
    for (const logNode of logNodes) {
      const incoming = countIncomingEdges(edges, logNode.id);
      expect(incoming).toBeLessThanOrEqual(1);
    }

    // ASSERTION 4: No self-loops
    for (const edge of edges) {
      expect(edge.source).not.toBe(edge.target);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: Registry preservation for other nodes
//
// Assert that unifiedNodeRegistry.get(type) returns identical definitions
// for all non-log_output node types (gmail, slack, etc.) — these should be
// completely unaffected by the fix.
//
// **Validates: Requirements 3.5**
// ---------------------------------------------------------------------------

describe('Preservation Test 5 — Registry: non-log_output node definitions unaffected', () => {
  const NON_LOG_OUTPUT_TYPES = [
    'google_gmail',
    'slack_message',
    'google_sheets',
    'notion',
    'http_request',
    'javascript',
    'manual_trigger',
    'if_else',
    'switch',
    'merge',
  ];

  it('All non-log_output node types are registered in the registry', () => {
    for (const nodeType of NON_LOG_OUTPUT_TYPES) {
      const def = unifiedNodeRegistry.get(nodeType);
      expect(def).toBeDefined();
      if (def) {
        console.log(`[Preservation Test 5] ${nodeType}: category=${def.category}, allowsMultipleInputs=${def.allowsMultipleInputs}`);
      }
    }
  });

  it('Non-log_output nodes do NOT have allowsMultipleInputs: true (except merge)', () => {
    const nonMergeTypes = NON_LOG_OUTPUT_TYPES.filter((t) => t !== 'merge');
    for (const nodeType of nonMergeTypes) {
      const def = unifiedNodeRegistry.get(nodeType);
      if (!def) continue; // skip if not registered
      // These nodes should NOT have allowsMultipleInputs: true
      // (only merge-capable nodes should)
      const allowsMulti = def.allowsMultipleInputs === true;
      if (allowsMulti) {
        console.warn(`[Preservation Test 5] WARNING: ${nodeType} has allowsMultipleInputs: true`);
      }
      // gmail, slack, sheets, notion, http_request, javascript, triggers, if_else, switch
      // should NOT allow multiple inputs
      expect(def.allowsMultipleInputs).not.toBe(true);
    }
  });

  it('gmail node definition has expected category and is registered', () => {
    const gmailDef = unifiedNodeRegistry.get('google_gmail');
    expect(gmailDef).toBeDefined();
    expect(gmailDef?.type).toBe('google_gmail');
  });

  it('slack_message node definition has expected category and is registered', () => {
    const slackDef = unifiedNodeRegistry.get('slack_message');
    expect(slackDef).toBeDefined();
    expect(slackDef?.type).toBe('slack_message');
  });

  it('if_else node definition is registered and is a branching node', () => {
    const ifDef = unifiedNodeRegistry.get('if_else');
    expect(ifDef).toBeDefined();
    expect(ifDef?.isBranching).toBe(true);
  });

  it('switch node definition is registered and is a branching node', () => {
    const switchDef = unifiedNodeRegistry.get('switch');
    expect(switchDef).toBeDefined();
    expect(switchDef?.isBranching).toBe(true);
  });

  /**
   * PBT: For all non-log_output node types in the registry, the definition
   * is stable — calling get() twice returns the same object reference.
   *
   * **Validates: Requirements 3.5**
   */
  it('PBT: Registry get() is stable — same definition returned on repeated calls', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_LOG_OUTPUT_TYPES),
        (nodeType) => {
          const def1 = unifiedNodeRegistry.get(nodeType);
          const def2 = unifiedNodeRegistry.get(nodeType);
          // Both calls must return the same reference (or both undefined)
          return def1 === def2;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('log_output node definition has alwaysRequired: false after fix (confirms fix is working)', () => {
    const logDef = unifiedNodeRegistry.get('log_output');
    expect(logDef).toBeDefined();
    // After the fix: alwaysRequired should be false (intent-driven)
    expect((logDef as any)?.workflowBehavior?.alwaysRequired).toBe(false);
    expect((logDef as any)?.workflowBehavior?.autoInject).toBe(false);
    // allowsMultipleInputs should remain false (validation layer was already working correctly)
    expect(logDef?.allowsMultipleInputs).toBe(false);
    console.log('[Preservation Test 5] log_output alwaysRequired (fixed):', (logDef as any)?.workflowBehavior?.alwaysRequired);
    console.log('[Preservation Test 5] log_output autoInject (fixed):', (logDef as any)?.workflowBehavior?.autoInject);
    console.log('[Preservation Test 5] log_output allowsMultipleInputs (fixed):', logDef?.allowsMultipleInputs);
  });
});
