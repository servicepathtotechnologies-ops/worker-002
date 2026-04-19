/**
 * Bug Condition Exploration Tests for AI Workflow log_output Branch Generation Fix
 * 
 * These tests MUST FAIL on unfixed code to confirm the bug exists.
 * DO NOT fix the code when tests fail — the failures are the evidence.
 * 
 * Bug Condition: AI workflow builder generates branching workflows where multiple branches
 * connect to a SINGLE log_output node, creating an invalid merge topology.
 * 
 * Expected Behavior (after fix):
 * - AI analyzes prompts for branch-specific outputs
 * - Generates SEPARATE log_output nodes for each branch that needs one
 * - Each log_output has exactly ONE incoming edge
 * - No multi-input edges to log_output
 * 
 * Current Behavior (unfixed):
 * - AI generates single log_output for all branches
 * - Registry allows allowsMultipleInputs: true for log_output
 * - DAG validator doesn't emit error for multi-input log_output
 * - Edge reconciliation creates multiple incoming edges to single log_output
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { AgenticWorkflowBuilder } from '../src/services/ai/workflow-builder';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { dagValidator } from '../src/core/validation/dag-validator';
import { graphBranchingValidator } from '../src/core/validation/graph-branching-validator';
import { unifiedNormalizeNodeTypeString } from '../src/core/utils/unified-node-type-normalizer';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../src/core/types/ai-types';

describe('Bug Condition: AI generates branch-specific log_output nodes', () => {
  let workflowBuilder: AgenticWorkflowBuilder;

  beforeAll(() => {
    workflowBuilder = new AgenticWorkflowBuilder();
  });

  /**
   * TEST 1: Switch 3-branch test
   * 
   * Prompt: "Based on user role (admin/editor/viewer), admin sends email, editor updates sheet, viewer logs action"
   * 
   * EXPECTED (after fix):
   * - AI generates Switch with 3 branches
   * - Each branch has its own appropriate output node:
   *   - admin → google_gmail
   *   - editor → google_sheets
   *   - viewer → log_output
   * - Total log_output nodes: 1 (only for viewer branch)
   * - Each log_output has exactly 1 incoming edge
   * 
   * WILL FAIL (unfixed):
   * - AI generates single log_output for all branches
   * - Multiple branches connect to same log_output
   * - log_output has 3 incoming edges (invalid merge topology)
   */
  it('TEST 1: Switch 3-branch - AI should generate separate output nodes per branch', async () => {
    const prompt = 'Based on user role (admin/editor/viewer), admin sends email, editor updates sheet, viewer logs action';
    
    const workflow = await workflowBuilder.generateWorkflowWithGeminiPlanner(prompt);

    // ASSERTION 1: Workflow should have a switch node
    const switchNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'switch';
    });
    expect(switchNodes.length).toBeGreaterThan(0);

    // ASSERTION 2: Should have 3 output nodes (gmail, google_sheets, log_output)
    const gmailNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'google_gmail';
    });
    const sheetsNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'google_sheets';
    });
    const logOutputNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'log_output';
    });

    expect(gmailNodes.length).toBe(1);
    expect(sheetsNodes.length).toBe(1);
    expect(logOutputNodes.length).toBe(1);

    // ASSERTION 3: Each output node should have exactly 1 incoming edge
    for (const node of [...gmailNodes, ...sheetsNodes, ...logOutputNodes]) {
      const incomingEdges = workflow.edges.filter((e: WorkflowEdge) => e.target === node.id);
      expect(incomingEdges.length).toBe(1);
    }

    // ASSERTION 4: log_output should NOT have multiple incoming edges
    for (const logNode of logOutputNodes) {
      const incomingEdges = workflow.edges.filter((e: WorkflowEdge) => e.target === logNode.id);
      expect(incomingEdges.length).toBe(1); // WILL FAIL if unfixed (will be 3)
    }
  }, 30000);

  /**
   * TEST 2: IF both-branch test
   * 
   * Prompt: "If temperature > 30, send alert email, otherwise log the reading"
   * 
   * EXPECTED (after fix):
   * - AI generates IF with 2 branches
   * - true branch → google_gmail
   * - false branch → log_output
   * - Total log_output nodes: 1
   * - log_output has exactly 1 incoming edge (from false branch)
   * 
   * WILL FAIL (unfixed):
   * - Both branches connect to same log_output
   * - log_output has 2 incoming edges
   */
  it('TEST 2: IF both-branch - AI should generate gmail for true, log_output for false', async () => {
    const prompt = 'If temperature > 30, send alert email, otherwise log the reading';
    
    const workflow = await workflowBuilder.generateWorkflowWithGeminiPlanner(prompt);

    // ASSERTION 1: Workflow should have an if_else node
    const ifNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'if_else';
    });
    expect(ifNodes.length).toBeGreaterThan(0);

    // ASSERTION 2: Should have gmail and log_output nodes
    const gmailNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'google_gmail';
    });
    const logOutputNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'log_output';
    });

    expect(gmailNodes.length).toBe(1);
    expect(logOutputNodes.length).toBe(1);

    // ASSERTION 3: log_output should have exactly 1 incoming edge
    const logNode = logOutputNodes[0];
    const incomingEdges = workflow.edges.filter((e: WorkflowEdge) => e.target === logNode.id);
    expect(incomingEdges.length).toBe(1); // WILL FAIL if unfixed (will be 2)

    // ASSERTION 4: The incoming edge should be from false branch
    const incomingEdge = incomingEdges[0];
    expect(incomingEdge.type).toBe('false');
  }, 30000);

  /**
   * TEST 3: Nested switch test
   * 
   * Prompt: "Switch on department (sales/engineering), then switch on priority (high/low). High priority sends Slack, low priority logs"
   * 
   * EXPECTED (after fix):
   * - AI generates nested switches
   * - 2 Slack nodes (one per high priority branch)
   * - 2 log_output nodes (one per low priority branch)
   * - Each log_output has exactly 1 incoming edge
   * 
   * WILL FAIL (unfixed):
   * - All branches connect to single log_output
   * - log_output has 4 incoming edges
   */
  it('TEST 3: Nested switch - AI should generate 2 Slack + 2 log_output nodes', async () => {
    const prompt = 'Switch on department (sales/engineering), then switch on priority (high/low). High priority sends Slack, low priority logs';
    
    const workflow = await workflowBuilder.generateWorkflowWithGeminiPlanner(prompt);

    // ASSERTION 1: Should have switch nodes
    const switchNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'switch';
    });
    expect(switchNodes.length).toBeGreaterThan(0);

    // ASSERTION 2: Should have 2 Slack nodes and 2 log_output nodes
    const slackNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'slack';
    });
    const logOutputNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'log_output';
    });

    expect(slackNodes.length).toBe(2);
    expect(logOutputNodes.length).toBe(2);

    // ASSERTION 3: Each log_output should have exactly 1 incoming edge
    for (const logNode of logOutputNodes) {
      const incomingEdges = workflow.edges.filter((e: WorkflowEdge) => e.target === logNode.id);
      expect(incomingEdges.length).toBe(1); // WILL FAIL if unfixed
    }
  }, 30000);

  /**
   * TEST 4: Single branch logging test
   * 
   * Prompt: "Switch on status: approved sends email, rejected sends Slack, pending logs action"
   * 
   * EXPECTED (after fix):
   * - AI generates Switch with 3 branches
   * - approved → google_gmail
   * - rejected → slack
   * - pending → log_output
   * - Total log_output nodes: 1
   * - log_output has exactly 1 incoming edge
   * 
   * WILL FAIL (unfixed):
   * - All branches connect to same log_output
   * - log_output has 3 incoming edges
   */
  it('TEST 4: Single branch logging - AI should generate gmail, slack, log_output (one per branch)', async () => {
    const prompt = 'Switch on status: approved sends email, rejected sends Slack, pending logs action';
    
    const workflow = await workflowBuilder.generateWorkflowWithGeminiPlanner(prompt);

    // ASSERTION 1: Should have switch node
    const switchNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'switch';
    });
    expect(switchNodes.length).toBeGreaterThan(0);

    // ASSERTION 2: Should have gmail, slack, and log_output nodes
    const gmailNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'google_gmail';
    });
    const slackNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'slack';
    });
    const logOutputNodes = workflow.nodes.filter((n: WorkflowNode) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'log_output';
    });

    expect(gmailNodes.length).toBe(1);
    expect(slackNodes.length).toBe(1);
    expect(logOutputNodes.length).toBe(1);

    // ASSERTION 3: log_output should have exactly 1 incoming edge
    const logNode = logOutputNodes[0];
    const incomingEdges = workflow.edges.filter((e: WorkflowEdge) => e.target === logNode.id);
    expect(incomingEdges.length).toBe(1); // WILL FAIL if unfixed (will be 3)
  }, 30000);

  /**
   * TEST 5: Registry validation test
   * 
   * Verify that log_output registry has allowsMultipleInputs: true on unfixed code
   * 
   * EXPECTED (after fix):
   * - allowsMultipleInputs should be false or undefined
   * 
   * WILL FAIL (unfixed):
   * - allowsMultipleInputs is true
   */
  it('TEST 5: Registry validation - log_output should NOT allow multiple inputs', () => {
    const logOutputDef = unifiedNodeRegistry.get('log_output');
    
    // ASSERTION 1: log_output should be registered
    expect(logOutputDef).toBeDefined();

    // ASSERTION 2: allowsMultipleInputs should NOT be true
    // On unfixed code, this will be true (from previous spec)
    // On fixed code, this should be false or undefined
    expect(logOutputDef?.allowsMultipleInputs).not.toBe(true);
  });

  /**
   * TEST 6: DAG validator test
   * 
   * Build workflow with Switch → 3 branches → single log_output
   * Assert DAG validator emits error
   * 
   * EXPECTED (after fix):
   * - DAG validator emits error for multi-input log_output
   * 
   * WILL FAIL (unfixed):
   * - DAG validator allows multi-input log_output (no error)
   */
  it('TEST 6: DAG validator - should emit error for multi-input log_output', () => {
    const nodes = [
      { id: 'trigger', type: 'manual_trigger' },
      { id: 'switch_node', type: 'switch' },
      { id: 'action_1', type: 'google_sheets' },
      { id: 'action_2', type: 'google_sheets' },
      { id: 'action_3', type: 'google_sheets' },
      { id: 'log_output_node', type: 'log_output' },
    ];

    const connections = [
      { source: 'trigger', target: 'switch_node', type: 'main' },
      { source: 'switch_node', target: 'action_1', type: 'case_1' },
      { source: 'switch_node', target: 'action_2', type: 'case_2' },
      { source: 'switch_node', target: 'action_3', type: 'case_3' },
      { source: 'action_1', target: 'log_output_node', type: 'main' },
      { source: 'action_2', target: 'log_output_node', type: 'main' },
      { source: 'action_3', target: 'log_output_node', type: 'main' },
    ];

    const result = dagValidator.validateStructure({
      nodes,
      connections,
      trigger: 'trigger',
    });

    // ASSERTION 1: Validation should fail (emit error)
    // On unfixed code, this will pass (no error) because allowsMultipleInputs: true
    // On fixed code, this should fail with error about log_output in-degree
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    // ASSERTION 2: Error should mention log_output and in-degree
    const logOutputErrors = result.errors.filter((e: string) => 
      e.includes('log_output') && (e.includes('input') || e.includes('in-degree') || e.includes('incoming'))
    );
    expect(logOutputErrors.length).toBeGreaterThan(0);
  });

  /**
   * TEST 7: Branching validator test
   * 
   * Test graphBranchingValidator.allowsMultipleInputs('log_output')
   * 
   * EXPECTED (after fix):
   * - Returns false
   * 
   * WILL FAIL (unfixed):
   * - Returns true (from previous spec)
   */
  it('TEST 7: Branching validator - allowsMultipleInputs should return false for log_output', () => {
    const allowsMultiple = graphBranchingValidator.allowsMultipleInputs('log_output');
    
    // ASSERTION: Should return false
    // On unfixed code, this will be true
    // On fixed code, this should be false
    expect(allowsMultiple).toBe(false);
  });
});

/**
 * COUNTEREXAMPLE DOCUMENTATION
 * 
 * When these tests FAIL on unfixed code, they will demonstrate:
 * 
 * 1. AI generates single log_output for all branches instead of separate nodes
 *    - TEST 1: log_output has 3 incoming edges (should be 1)
 *    - TEST 2: log_output has 2 incoming edges (should be 1)
 *    - TEST 3: log_output has 4 incoming edges (should be 1 per node)
 *    - TEST 4: log_output has 3 incoming edges (should be 1)
 * 
 * 2. Registry allows allowsMultipleInputs: true for log_output
 *    - TEST 5: allowsMultipleInputs is true (should be false)
 * 
 * 3. DAG validator doesn't emit error for multi-input log_output
 *    - TEST 6: validation passes (should fail with error)
 * 
 * 4. Branching validator allows multi-input for log_output
 *    - TEST 7: allowsMultipleInputs returns true (should be false)
 * 
 * These counterexamples confirm the bug exists and validate the root cause analysis.
 */
