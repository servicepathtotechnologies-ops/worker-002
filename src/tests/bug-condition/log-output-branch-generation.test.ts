/**
 * Bug Condition Exploration Tests — AI Workflow Log Output Branch Generation Fix
 *
 * These tests MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT fix the code when they fail. The failures ARE the evidence.
 *
 * Bug: AI generates a single log_output node for all branches instead of
 * separate nodes per branch, creating an invalid merge topology.
 *
 * Root causes:
 * 1. Registry has `allowsMultipleInputs: true` for log_output (Phase 1)
 * 2. DAG validator doesn't reject multi-input log_output (Phase 1)
 * 3. AI builder doesn't analyze branch-specific outputs (Phase 2)
 *
 * Expected outcomes:
 * - Tests 1–4: FAIL on unfixed code (confirms AI generation bug)
 * - Test 5:    PASS on unfixed code (confirms Phase 1 registry root cause)
 * - Test 6:    FAIL on unfixed code (confirms DAG validator doesn't catch it)
 *
 * Spec: .kiro/specs/ai-workflow-log-output-branch-generation-fix/
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import { describe, it, expect } from '@jest/globals';
import { AgenticWorkflowBuilder } from '../../services/ai/workflow-builder';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { dagValidator } from '../../core/validation/dag-validator';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import type { PlannedWorkflow, WorkflowNode } from '../../core/types/ai-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count nodes of a given type in a workflow */
function countNodesByType(nodes: WorkflowNode[], type: string): number {
  return nodes.filter(
    (n) => unifiedNormalizeNodeTypeString(n.type) === type ||
           unifiedNormalizeNodeTypeString((n.data as any)?.type) === type
  ).length;
}

/** Count incoming edges to a specific node */
function countIncomingEdges(edges: any[], nodeId: string): number {
  return edges.filter((e) => e.target === nodeId).length;
}

/** Get all nodes of a given type */
function getNodesByType(nodes: WorkflowNode[], type: string): WorkflowNode[] {
  return nodes.filter(
    (n) => unifiedNormalizeNodeTypeString(n.type) === type ||
           unifiedNormalizeNodeTypeString((n.data as any)?.type) === type
  );
}

// ---------------------------------------------------------------------------
// Test 1: Switch 3-branch test
//
// Prompt: "Based on user role (admin/editor/viewer), admin sends email,
//          editor updates sheet, viewer logs action"
//
// EXPECTED (after fix): 3 separate output nodes — gmail, google_sheets, log_output
//                        each with exactly 1 incoming edge
//
// WILL FAIL (unfixed): AI generates single log_output for all branches,
//                       or all branches share one log_output node
//
// **Validates: Requirements 2.1, 2.5**
// ---------------------------------------------------------------------------

describe('Test 1 — Switch 3-branch: separate output nodes per branch', () => {
  it('Switch with admin/editor/viewer branches produces gmail, google_sheets, log_output (one each)', () => {
    const builder = new AgenticWorkflowBuilder();

    // Simulate what the AI planner should produce for this prompt
    const planned: PlannedWorkflow = {
      summary: 'Role-Based Workflow: Admin Sends Email, Editor Updates Sheet, Viewer Logs Action',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        {
          id: 'switch_1',
          type: 'switch',
          role: 'logic',
          config: {
            expression: '{{$json.role}}',
            cases: [
              { value: 'admin', label: 'Admin' },
              { value: 'editor', label: 'Editor' },
              { value: 'viewer', label: 'Viewer' },
            ],
          },
        },
        // Branch-specific outputs — what the AI SHOULD generate
        { id: 'gmail_admin', type: 'google_gmail', role: 'output' },
        { id: 'sheets_editor', type: 'google_sheets', role: 'output' },
        { id: 'log_viewer', type: 'log_output', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: Must have exactly 1 gmail node
    const gmailNodes = getNodesByType(nodes, 'google_gmail');
    expect(gmailNodes.length).toBe(1);

    // ASSERTION 2: Must have exactly 1 google_sheets node
    const sheetsNodes = getNodesByType(nodes, 'google_sheets');
    expect(sheetsNodes.length).toBe(1);

    // ASSERTION 3: Must have exactly 1 log_output node
    const logNodes = getNodesByType(nodes, 'log_output');
    expect(logNodes.length).toBe(1);

    // ASSERTION 4: Each output node must have exactly 1 incoming edge
    // (no shared/merged log_output)
    if (logNodes.length > 0) {
      const logNodeId = logNodes[0].id;
      const incomingToLog = countIncomingEdges(edges, logNodeId);
      expect(incomingToLog).toBe(1);
    }

    if (gmailNodes.length > 0) {
      const gmailNodeId = gmailNodes[0].id;
      const incomingToGmail = countIncomingEdges(edges, gmailNodeId);
      expect(incomingToGmail).toBe(1);
    }

    if (sheetsNodes.length > 0) {
      const sheetsNodeId = sheetsNodes[0].id;
      const incomingToSheets = countIncomingEdges(edges, sheetsNodeId);
      expect(incomingToSheets).toBe(1);
    }

    // ASSERTION 5: No log_output node should have more than 1 incoming edge
    const allLogNodes = getNodesByType(nodes, 'log_output');
    for (const logNode of allLogNodes) {
      const incoming = countIncomingEdges(edges, logNode.id);
      expect(incoming).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: IF both-branch test
//
// Prompt: "If temperature > 30, send alert email, otherwise log the reading"
//
// EXPECTED (after fix): true branch → gmail, false branch → log_output
//                        each with exactly 1 incoming edge
//
// WILL FAIL (unfixed): both branches connect to single log_output
//
// **Validates: Requirements 2.1, 2.4**
// ---------------------------------------------------------------------------

describe('Test 2 — IF both-branch: true → gmail, false → log_output', () => {
  it('IF workflow produces gmail for true branch and log_output for false branch (separate nodes)', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Temperature Alert: Send Email If Hot, Log Otherwise',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        {
          id: 'if_1',
          type: 'if_else',
          role: 'logic',
          config: {
            condition: '{{$json.temperature}} > 30',
          },
        },
        // Branch-specific outputs — what the AI SHOULD generate
        { id: 'gmail_alert', type: 'google_gmail', role: 'output' },
        { id: 'log_reading', type: 'log_output', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: Must have exactly 1 gmail node (for true branch)
    const gmailNodes = getNodesByType(nodes, 'google_gmail');
    expect(gmailNodes.length).toBe(1);

    // ASSERTION 2: Must have exactly 1 log_output node (for false branch)
    const logNodes = getNodesByType(nodes, 'log_output');
    expect(logNodes.length).toBe(1);

    // ASSERTION 3: log_output must have exactly 1 incoming edge (not shared)
    if (logNodes.length > 0) {
      const logNodeId = logNodes[0].id;
      const incomingToLog = countIncomingEdges(edges, logNodeId);
      expect(incomingToLog).toBe(1);
    }

    // ASSERTION 4: gmail must have exactly 1 incoming edge
    if (gmailNodes.length > 0) {
      const gmailNodeId = gmailNodes[0].id;
      const incomingToGmail = countIncomingEdges(edges, gmailNodeId);
      expect(incomingToGmail).toBe(1);
    }

    // ASSERTION 5: The IF node must have exactly 2 outgoing edges (true/false)
    const ifNodes = nodes.filter(
      (n) => unifiedNormalizeNodeTypeString(n.type) === 'if_else' ||
             unifiedNormalizeNodeTypeString((n.data as any)?.type) === 'if_else'
    );
    if (ifNodes.length > 0) {
      const ifNodeId = ifNodes[0].id;
      const outgoingFromIf = edges.filter((e) => e.source === ifNodeId);
      expect(outgoingFromIf.length).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: Nested switch test
//
// Prompt: "Switch on department (sales/engineering), then switch on priority
//          (high/low). High priority sends Slack, low priority logs"
//
// EXPECTED (after fix): 2 Slack nodes + 2 log_output nodes (one per terminal branch)
//
// WILL FAIL (unfixed): all 4 terminal branches → single log_output
//
// **Validates: Requirements 2.1, 2.6**
// ---------------------------------------------------------------------------

describe('Test 3 — Nested switch: 2 Slack + 2 log_output nodes', () => {
  it('Nested switch produces 2 separate Slack nodes and 2 separate log_output nodes', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Department Priority Router: Slack For High Priority, Log For Low Priority',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        {
          id: 'switch_dept',
          type: 'switch',
          role: 'logic',
          config: {
            expression: '{{$json.department}}',
            cases: [
              { value: 'sales', label: 'Sales' },
              { value: 'engineering', label: 'Engineering' },
            ],
          },
        },
        // Sales branch: nested switch on priority
        {
          id: 'switch_priority_sales',
          type: 'switch',
          role: 'logic',
          config: {
            expression: '{{$json.priority}}',
            cases: [
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
            ],
          },
        },
        { id: 'slack_sales_high', type: 'slack_message', role: 'output' },
        { id: 'log_sales_low', type: 'log_output', role: 'output' },
        // Engineering branch: nested switch on priority
        {
          id: 'switch_priority_eng',
          type: 'switch',
          role: 'logic',
          config: {
            expression: '{{$json.priority}}',
            cases: [
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
            ],
          },
        },
        { id: 'slack_eng_high', type: 'slack_message', role: 'output' },
        { id: 'log_eng_low', type: 'log_output', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: Must have exactly 2 Slack nodes
    const slackNodes = getNodesByType(nodes, 'slack_message');
    expect(slackNodes.length).toBe(2);

    // ASSERTION 2: Must have exactly 2 log_output nodes
    const logNodes = getNodesByType(nodes, 'log_output');
    expect(logNodes.length).toBe(2);

    // ASSERTION 3: Each log_output node must have exactly 1 incoming edge
    for (const logNode of logNodes) {
      const incoming = countIncomingEdges(edges, logNode.id);
      expect(incoming).toBe(1);
    }

    // ASSERTION 4: Each Slack node must have exactly 1 incoming edge
    for (const slackNode of slackNodes) {
      const incoming = countIncomingEdges(edges, slackNode.id);
      expect(incoming).toBe(1);
    }

    // ASSERTION 5: All log_output nodes must have distinct IDs
    const logIds = logNodes.map((n) => n.id);
    expect(new Set(logIds).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Single branch logging test
//
// Prompt: "Switch on status: approved sends email, rejected sends Slack,
//          pending logs action"
//
// EXPECTED (after fix): gmail (approved), slack (rejected), log_output (pending)
//                        — one per branch, no shared log_output
//
// WILL FAIL (unfixed): all branches get log_output added automatically
//
// **Validates: Requirements 2.1, 2.7**
// ---------------------------------------------------------------------------

describe('Test 4 — Single branch logging: only pending branch gets log_output', () => {
  it('Switch with approved/rejected/pending produces gmail, slack, log_output (one each, no extras)', () => {
    const builder = new AgenticWorkflowBuilder();

    const planned: PlannedWorkflow = {
      summary: 'Status Router: Email Approved, Slack Rejected, Log Pending',
      steps: [
        { id: 'trigger_1', type: 'manual_trigger', role: 'trigger' },
        {
          id: 'switch_status',
          type: 'switch',
          role: 'logic',
          config: {
            expression: '{{$json.status}}',
            cases: [
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'pending', label: 'Pending' },
            ],
          },
        },
        // Branch-specific outputs — what the AI SHOULD generate
        { id: 'gmail_approved', type: 'google_gmail', role: 'output' },
        { id: 'slack_rejected', type: 'slack_message', role: 'output' },
        { id: 'log_pending', type: 'log_output', role: 'output' },
      ],
    };

    const result = (builder as any).hydratePlannedWorkflow(planned);
    const { workflow } = result;
    const nodes: WorkflowNode[] = workflow.nodes;
    const edges: any[] = workflow.edges || [];

    // ASSERTION 1: Must have exactly 1 gmail node
    const gmailNodes = getNodesByType(nodes, 'google_gmail');
    expect(gmailNodes.length).toBe(1);

    // ASSERTION 2: Must have exactly 1 slack node
    const slackNodes = getNodesByType(nodes, 'slack_message');
    expect(slackNodes.length).toBe(1);

    // ASSERTION 3: Must have exactly 1 log_output node (only for pending branch)
    const logNodes = getNodesByType(nodes, 'log_output');
    expect(logNodes.length).toBe(1);

    // ASSERTION 4: The single log_output must have exactly 1 incoming edge
    if (logNodes.length > 0) {
      const logNodeId = logNodes[0].id;
      const incomingToLog = countIncomingEdges(edges, logNodeId);
      expect(incomingToLog).toBe(1);
    }

    // ASSERTION 5: No log_output node should have more than 1 incoming edge
    for (const logNode of logNodes) {
      const incoming = countIncomingEdges(edges, logNode.id);
      expect(incoming).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: Registry validation test
//
// Assert `unifiedNodeRegistry.get('log_output')?.workflowBehavior?.alwaysRequired === true`
// on unfixed code.
//
// EXPECTED OUTCOME: PASSES on unfixed code — confirms the real root cause.
// This test documents the incorrect registry state that enables automatic injection.
//
// **Validates: Requirements 2.1 (root cause confirmation)**
// ---------------------------------------------------------------------------

describe('Test 5 — Registry: log_output now has alwaysRequired: false (fix confirmed)', () => {
  it('unifiedNodeRegistry.get("log_output")?.workflowBehavior?.alwaysRequired === false after fix (confirms bug is fixed)', () => {
    const logOutputDef = unifiedNodeRegistry.get('log_output');

    // ASSERTION: log_output must be registered
    expect(logOutputDef).toBeDefined();

    // ASSERTION: After the fix, alwaysRequired should be false (intent-driven)
    expect((logOutputDef as any)?.workflowBehavior?.alwaysRequired).toBe(false);

    // ASSERTION: After the fix, autoInject should be false (intent-driven)
    expect((logOutputDef as any)?.workflowBehavior?.autoInject).toBe(false);

    // ASSERTION: allowsMultipleInputs should already be false (validation layer is correct)
    expect(logOutputDef?.allowsMultipleInputs).toBe(false);

    // Document the fixed state
    console.log('[Test 5] log_output registry state (fixed):');
    console.log('  allowsMultipleInputs:', logOutputDef?.allowsMultipleInputs);
    console.log('  workflowBehavior.alwaysRequired:', (logOutputDef as any)?.workflowBehavior?.alwaysRequired);
    console.log('  workflowBehavior.autoInject:', (logOutputDef as any)?.workflowBehavior?.autoInject);
  });
});

// ---------------------------------------------------------------------------
// Test 6: DAG validator test
//
// Build a workflow with Switch → 3 branches → single log_output.
// Assert DAG validator emits error.
//
// EXPECTED OUTCOME: FAILS on unfixed code — no error emitted because
// allowsMultipleInputs === true bypasses the check.
//
// **Validates: Requirements 2.1, 2.5**
// ---------------------------------------------------------------------------

describe('Test 6 — DAG validator: should reject Switch → 3 branches → single log_output', () => {
  it('DAG validator emits error when 3 switch branches connect to a single log_output node', () => {
    // Build a workflow: switch → case_1/case_2/case_3 all targeting same log_output
    const structure = {
      nodes: [
        { id: 'trigger', type: 'manual_trigger' },
        { id: 'switch_1', type: 'switch' },
        { id: 'action_1', type: 'google_sheets' },
        { id: 'action_2', type: 'google_sheets' },
        { id: 'action_3', type: 'google_sheets' },
        { id: 'log_output_1', type: 'log_output' },
      ],
      connections: [
        { source: 'trigger', target: 'switch_1', type: 'main' },
        { source: 'switch_1', target: 'action_1', type: 'case_1' },
        { source: 'switch_1', target: 'action_2', type: 'case_2' },
        { source: 'switch_1', target: 'action_3', type: 'case_3' },
        // All 3 branches converge on a SINGLE log_output — this is the bug
        { source: 'action_1', target: 'log_output_1', type: 'main' },
        { source: 'action_2', target: 'log_output_1', type: 'main' },
        { source: 'action_3', target: 'log_output_1', type: 'main' },
      ],
      trigger: 'trigger',
    };

    const result = dagValidator.validateStructure(structure);

    // Log the actual result for documentation
    console.log('[Test 6] DAG validator result (unfixed):');
    console.log('  valid:', result.valid);
    console.log('  errors:', result.errors);
    console.log('  warnings:', result.warnings);

    // ASSERTION: DAG validator MUST emit an error for multi-input log_output
    // On unfixed code: result.valid === true (no error) — this assertion FAILS
    // After fix: result.valid === false (error emitted) — this assertion PASSES
    expect(result.valid).toBe(false);

    // ASSERTION: Error must mention log_output and multi-input/merge issue
    const errorText = result.errors.join(' ').toLowerCase();
    const hasLogOutputError =
      errorText.includes('log_output') ||
      errorText.includes('terminal') ||
      errorText.includes('merge') ||
      errorText.includes('multiple') ||
      errorText.includes('paths') ||
      errorText.includes('input');

    expect(hasLogOutputError).toBe(true);
  });
});
