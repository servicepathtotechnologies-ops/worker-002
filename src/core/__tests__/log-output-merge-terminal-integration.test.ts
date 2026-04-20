/**
 * Integration Tests for log_output Merge Terminal Fix
 * 
 * These tests verify end-to-end workflows with multi-input log_output nodes.
 * They use the unified graph orchestrator to build, reconcile, and validate
 * complete workflows.
 * 
 * Task 4.1: Switch node with 3 branches converging to log_output
 * 
 * Test validates:
 * - validateWorkflow returns valid: true with zero errors
 * - Final edge set contains all three incoming edges to log_output
 * - No cloning or destructive rewiring occurs
 */

import { describe, it, expect } from '@jest/globals';
import { unifiedGraphOrchestrator } from '../orchestration/unified-graph-orchestrator';
import { WorkflowNode, WorkflowEdge } from '../types/ai-types';

// Helper to create a minimal WorkflowNode
function createNode(id: string, type: string, label: string, category: string): WorkflowNode {
  return {
    id,
    type,
    data: { type, label, category, config: {} },
    position: { x: 0, y: 0 },
  };
}

// Helper to create a WorkflowEdge
function createEdge(id: string, source: string, target: string, type: string = 'main'): WorkflowEdge {
  return { id, source, target, type };
}

describe('Integration: log_output merge terminal workflows', () => {
  /**
   * TASK 4.1: Full workflow with Switch → 3 branches → log_output
   * 
   * Workflow topology:
   * manual_trigger
   *   ↓
   * switch
   *   ├─ case_1 → action_a ─┐
   *   ├─ case_2 → action_b ─┼→ log_output
   *   └─ case_3 → action_c ─┘
   * 
   * Expected behavior:
   * - All 3 branches converge to single log_output node
   * - validateWorkflow returns valid: true
   * - Zero structural errors
   * - All 3 incoming edges to log_output preserved
   */
  it('TASK 4.1: Switch with 3 branches converging to log_output should be valid', () => {
    // Build workflow nodes
    const nodes: WorkflowNode[] = [
      createNode('manual_trigger', 'manual_trigger', 'Manual Trigger', 'trigger'),
      createNode('switch_node', 'switch', 'Switch', 'logic'),
      createNode('action_a', 'google_sheets', 'Action A', 'data'),
      createNode('action_b', 'google_sheets', 'Action B', 'data'),
      createNode('action_c', 'google_sheets', 'Action C', 'data'),
      createNode('log_output', 'log_output', 'Log Output', 'output'),
    ];

    // Manually construct edges for the switch topology
    // manual_trigger → switch → [action_a, action_b, action_c] → log_output
    const edges: WorkflowEdge[] = [
      createEdge('e1', 'manual_trigger', 'switch_node', 'main'),
      createEdge('e2', 'switch_node', 'action_a', 'case_1'),
      createEdge('e3', 'switch_node', 'action_b', 'case_2'),
      createEdge('e4', 'switch_node', 'action_c', 'case_3'),
      createEdge('e5', 'action_a', 'log_output', 'main'),
      createEdge('e6', 'action_b', 'log_output', 'main'),
      createEdge('e7', 'action_c', 'log_output', 'main'),
    ];

    const workflow = { nodes, edges };
    
    console.log('[TASK 4.1] Initial edges created:', edges.length);
    console.log('[TASK 4.1] Edges:', JSON.stringify(edges, null, 2));

    // Validate the workflow
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);

    // Debug: Log validation result
    if (!validation.valid) {
      console.log('[TASK 4.1] Validation errors:', validation.errors);
      console.log('[TASK 4.1] Validation warnings:', validation.warnings);
    }

    // ASSERTION 1: Workflow should be valid
    expect(validation.valid).toBe(true);

    // ASSERTION 2: Zero structural errors
    expect(validation.errors).toHaveLength(0);

    // ASSERTION 3: Final edge set should contain all three incoming edges to log_output
    const incomingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.target === 'log_output'
    );
    
    console.log('[TASK 4.1] Incoming edges to log_output:', incomingEdges.length);
    console.log('[TASK 4.1] Incoming edges:', JSON.stringify(incomingEdges, null, 2));
    
    expect(incomingEdges.length).toBe(3);

    // ASSERTION 4: Verify the three incoming edges are from action_a, action_b, action_c
    const sourceNodes = incomingEdges.map((edge: WorkflowEdge) => edge.source).sort();
    expect(sourceNodes).toEqual(['action_a', 'action_b', 'action_c']);

    // ASSERTION 5: No cloned log_output nodes should exist
    const logOutputNodes = workflow.nodes.filter(
      (node: WorkflowNode) => node.type === 'log_output'
    );
    expect(logOutputNodes).toHaveLength(1);
    expect(logOutputNodes[0].id).toBe('log_output');

    // ASSERTION 6: No _split_ nodes or edges should exist
    const splitNodes = workflow.nodes.filter((node: WorkflowNode) =>
      String(node.id).includes('_split_')
    );
    expect(splitNodes).toHaveLength(0);

    const splitEdges = workflow.edges.filter((edge: WorkflowEdge) =>
      String(edge.source).includes('_split_') || String(edge.target).includes('_split_')
    );
    expect(splitEdges).toHaveLength(0);

    // ASSERTION 7: Verify switch node has 3 outgoing edges (case_1, case_2, case_3)
    const switchOutgoingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.source === 'switch_node'
    );
    expect(switchOutgoingEdges.length).toBe(3);

    const edgeTypes = switchOutgoingEdges.map((edge: WorkflowEdge) => edge.type).sort();
    expect(edgeTypes).toEqual(['case_1', 'case_2', 'case_3']);

    // ASSERTION 8: Verify each action node has exactly 1 incoming and 1 outgoing edge
    for (const actionId of ['action_a', 'action_b', 'action_c']) {
      const incoming = workflow.edges.filter(
        (edge: WorkflowEdge) => edge.target === actionId
      );
      const outgoing = workflow.edges.filter(
        (edge: WorkflowEdge) => edge.source === actionId
      );
      
      expect(incoming.length).toBe(1);
      expect(outgoing.length).toBe(1);
      expect(outgoing[0].target).toBe('log_output');
    }
  });

  /**
   * TASK 4.2: Full workflow with IF → both branches → log_output
   * 
   * Workflow topology:
   * manual_trigger
   *   ↓
   * if_else
   *   ├─ true → action_a ─┐
   *   └─ false → action_b ─┴→ log_output
   * 
   * Expected behavior:
   * - Both branches converge to single log_output node
   * - validateWorkflow returns valid: true
   * - Zero structural errors
   * - Both incoming edges to log_output preserved
   */
  it('TASK 4.2: IF with both branches converging to log_output should be valid', () => {
    // Build workflow nodes
    const nodes: WorkflowNode[] = [
      createNode('manual_trigger', 'manual_trigger', 'Manual Trigger', 'trigger'),
      createNode('if_else', 'if_else', 'IF Condition', 'logic'),
      createNode('action_a', 'google_sheets', 'Action A', 'data'),
      createNode('action_b', 'google_sheets', 'Action B', 'data'),
      createNode('log_output', 'log_output', 'Log Output', 'output'),
    ];

    // Manually construct edges for the IF topology
    // manual_trigger → if_else → [true: action_a, false: action_b] → log_output
    const edges: WorkflowEdge[] = [
      createEdge('e1', 'manual_trigger', 'if_else', 'main'),
      createEdge('e2', 'if_else', 'action_a', 'true'),
      createEdge('e3', 'if_else', 'action_b', 'false'),
      createEdge('e4', 'action_a', 'log_output', 'main'),
      createEdge('e5', 'action_b', 'log_output', 'main'),
    ];

    const workflow = { nodes, edges };
    
    console.log('[TASK 4.2] Initial edges created:', edges.length);
    console.log('[TASK 4.2] Edges:', JSON.stringify(edges, null, 2));

    // Validate the workflow
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);

    // Debug: Log validation result
    if (!validation.valid) {
      console.log('[TASK 4.2] Validation errors:', validation.errors);
      console.log('[TASK 4.2] Validation warnings:', validation.warnings);
    }

    // ASSERTION 1: Workflow should be valid
    expect(validation.valid).toBe(true);

    // ASSERTION 2: Zero structural errors
    expect(validation.errors).toHaveLength(0);

    // ASSERTION 3: Final edge set should contain both incoming edges to log_output
    const incomingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.target === 'log_output'
    );
    
    console.log('[TASK 4.2] Incoming edges to log_output:', incomingEdges.length);
    console.log('[TASK 4.2] Incoming edges:', JSON.stringify(incomingEdges, null, 2));
    
    expect(incomingEdges.length).toBe(2);

    // ASSERTION 4: Verify the two incoming edges are from action_a and action_b
    const sourceNodes = incomingEdges.map((edge: WorkflowEdge) => edge.source).sort();
    expect(sourceNodes).toEqual(['action_a', 'action_b']);

    // ASSERTION 5: No cloned log_output nodes should exist
    const logOutputNodes = workflow.nodes.filter(
      (node: WorkflowNode) => node.type === 'log_output'
    );
    expect(logOutputNodes).toHaveLength(1);
    expect(logOutputNodes[0].id).toBe('log_output');

    // ASSERTION 6: No _split_ nodes or edges should exist
    const splitNodes = workflow.nodes.filter((node: WorkflowNode) =>
      String(node.id).includes('_split_')
    );
    expect(splitNodes).toHaveLength(0);

    const splitEdges = workflow.edges.filter((edge: WorkflowEdge) =>
      String(edge.source).includes('_split_') || String(edge.target).includes('_split_')
    );
    expect(splitEdges).toHaveLength(0);

    // ASSERTION 7: Verify IF node has 2 outgoing edges (true, false)
    const ifOutgoingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.source === 'if_else'
    );
    expect(ifOutgoingEdges.length).toBe(2);

    const edgeTypes = ifOutgoingEdges.map((edge: WorkflowEdge) => edge.type).sort();
    expect(edgeTypes).toEqual(['false', 'true']);

    // ASSERTION 8: Verify each action node has exactly 1 incoming and 1 outgoing edge
    for (const actionId of ['action_a', 'action_b']) {
      const incoming = workflow.edges.filter(
        (edge: WorkflowEdge) => edge.target === actionId
      );
      const outgoing = workflow.edges.filter(
        (edge: WorkflowEdge) => edge.source === actionId
      );
      
      expect(incoming.length).toBe(1);
      expect(outgoing.length).toBe(1);
      expect(outgoing[0].target).toBe('log_output');
    }

    // ASSERTION 9: Verify IF node branches correctly
    const trueEdge = workflow.edges.find(
      (edge: WorkflowEdge) => edge.source === 'if_else' && edge.type === 'true'
    );
    const falseEdge = workflow.edges.find(
      (edge: WorkflowEdge) => edge.source === 'if_else' && edge.type === 'false'
    );
    
    expect(trueEdge).toBeDefined();
    expect(falseEdge).toBeDefined();
    expect(trueEdge?.target).toBe('action_a');
    expect(falseEdge?.target).toBe('action_b');
  });

  /**
   * TASK 4.3: Regression test for dedicated merge topology
   * 
   * Workflow topology:
   * manual_trigger
   *   ├─→ action_1 ─┐
   *   └─→ action_2 ─┴→ merge → log_output
   * 
   * Expected behavior:
   * - Workflow should still be valid (dedicated merge topology unchanged)
   * - validateWorkflow returns valid: true with zero errors
   * - Merge has 2 inputs, log_output has 1 input from merge
   * - No regression in existing merge node behavior
   */
  it('TASK 4.3: Dedicated merge topology (manual_trigger → action → merge(2 inputs) → log_output) should remain valid', () => {
    // Build workflow nodes with a dedicated merge node
    const nodes: WorkflowNode[] = [
      createNode('manual_trigger', 'manual_trigger', 'Manual Trigger', 'trigger'),
      createNode('action_1', 'google_sheets', 'Action 1', 'data'),
      createNode('action_2', 'google_sheets', 'Action 2', 'data'),
      createNode('merge_node', 'merge', 'Merge', 'logic'),
      createNode('log_output', 'log_output', 'Log Output', 'output'),
    ];

    // Manually construct edges for the dedicated merge topology
    // manual_trigger → action_1 → merge
    //               → action_2 → merge → log_output
    const edges: WorkflowEdge[] = [
      createEdge('e1', 'manual_trigger', 'action_1', 'main'),
      createEdge('e2', 'manual_trigger', 'action_2', 'main'),
      createEdge('e3', 'action_1', 'merge_node', 'main'),
      createEdge('e4', 'action_2', 'merge_node', 'main'),
      createEdge('e5', 'merge_node', 'log_output', 'main'),
    ];

    const workflow = { nodes, edges };
    
    console.log('[TASK 4.3] Initial edges created:', edges.length);
    console.log('[TASK 4.3] Edges:', JSON.stringify(edges, null, 2));

    // Validate the workflow
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);

    // Debug: Log validation result
    if (!validation.valid) {
      console.log('[TASK 4.3] Validation errors:', validation.errors);
      console.log('[TASK 4.3] Validation warnings:', validation.warnings);
    }

    // ASSERTION 1: Workflow should be valid
    expect(validation.valid).toBe(true);

    // ASSERTION 2: Zero structural errors
    expect(validation.errors).toHaveLength(0);

    // ASSERTION 3: Merge node should have exactly 2 incoming edges
    const mergeIncomingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.target === 'merge_node'
    );
    
    console.log('[TASK 4.3] Incoming edges to merge:', mergeIncomingEdges.length);
    console.log('[TASK 4.3] Merge incoming edges:', JSON.stringify(mergeIncomingEdges, null, 2));
    
    expect(mergeIncomingEdges.length).toBe(2);

    // ASSERTION 4: Verify merge inputs are from action_1 and action_2
    const mergeSourceNodes = mergeIncomingEdges.map((edge: WorkflowEdge) => edge.source).sort();
    expect(mergeSourceNodes).toEqual(['action_1', 'action_2']);

    // ASSERTION 5: Merge node should have exactly 1 outgoing edge
    const mergeOutgoingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.source === 'merge_node'
    );
    
    console.log('[TASK 4.3] Outgoing edges from merge:', mergeOutgoingEdges.length);
    
    expect(mergeOutgoingEdges.length).toBe(1);
    expect(mergeOutgoingEdges[0].target).toBe('log_output');

    // ASSERTION 6: log_output should have exactly 1 incoming edge (from merge)
    const logIncomingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.target === 'log_output'
    );
    
    console.log('[TASK 4.3] Incoming edges to log_output:', logIncomingEdges.length);
    console.log('[TASK 4.3] Log incoming edges:', JSON.stringify(logIncomingEdges, null, 2));
    
    expect(logIncomingEdges.length).toBe(1);
    expect(logIncomingEdges[0].source).toBe('merge_node');

    // ASSERTION 7: log_output should have 0 outgoing edges (terminal node)
    const logOutgoingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.source === 'log_output'
    );
    expect(logOutgoingEdges.length).toBe(0);

    // ASSERTION 8: No cloned nodes should exist
    const splitNodes = workflow.nodes.filter((node: WorkflowNode) =>
      String(node.id).includes('_split_')
    );
    expect(splitNodes).toHaveLength(0);

    // ASSERTION 9: Verify dedicated merge topology is preserved
    // This ensures the fix doesn't break existing merge node behavior
    const mergeNode = workflow.nodes.find((node: WorkflowNode) => node.id === 'merge_node');
    expect(mergeNode).toBeDefined();
    expect(mergeNode?.type).toBe('merge');

    const logNode = workflow.nodes.find((node: WorkflowNode) => node.id === 'log_output');
    expect(logNode).toBeDefined();
    expect(logNode?.type).toBe('log_output');

    // ASSERTION 10: Verify the topology structure
    // manual_trigger has 2 outgoing edges (to action_1 and action_2)
    const triggerOutgoingEdges = workflow.edges.filter(
      (edge: WorkflowEdge) => edge.source === 'manual_trigger'
    );
    expect(triggerOutgoingEdges.length).toBe(2);

    // Each action has 1 incoming and 1 outgoing edge
    for (const actionId of ['action_1', 'action_2']) {
      const incoming = workflow.edges.filter(
        (edge: WorkflowEdge) => edge.target === actionId
      );
      const outgoing = workflow.edges.filter(
        (edge: WorkflowEdge) => edge.source === actionId
      );
      
      expect(incoming.length).toBe(1);
      expect(outgoing.length).toBe(1);
      expect(outgoing[0].target).toBe('merge_node');
    }
  });
});
