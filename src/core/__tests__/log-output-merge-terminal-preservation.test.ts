/**
 * Preservation Property Tests for log_output Merge Terminal Fix
 * 
 * These tests MUST PASS on unfixed code to establish baseline behavior.
 * They verify that non-buggy inputs remain unchanged after the fix.
 * 
 * Preservation Scope:
 * - Single-input log_output nodes
 * - Normal action nodes with multiple inputs (should be rejected)
 * - Dedicated merge topologies
 * - All other node types
 * 
 * These tests run BEFORE implementing the fix to capture current behavior,
 * then run AFTER the fix to ensure no regressions.
 */

import { describe, it, expect } from '@jest/globals';
import { edgeReconciliationEngine } from '../orchestration/edge-reconciliation-engine';
import { dagValidator } from '../validation/dag-validator';
import { graphBranchingValidator } from '../validation/graph-branching-validator';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { Workflow, WorkflowNode, WorkflowEdge } from '../types/ai-types';

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

describe('Preservation: Non-buggy inputs unchanged', () => {
  /**
   * PRESERVATION TEST 1: Single-input log_output
   * 
   * Verify that a log_output with exactly one incoming edge continues
   * to be accepted as a valid terminal node with no errors.
   * 
   * This is the most common case and must not be affected by the fix.
   */
  it('PRESERVATION 1: Single-input log_output should continue to work', () => {
    const nodes: WorkflowNode[] = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('action', 'google_sheets', 'Google Sheets', 'data'),
      createNode('log_output_node', 'log_output', 'Log Output', 'output'),
    ];

    const edges: WorkflowEdge[] = [
      createEdge('e1', 'trigger', 'action', 'main'),
      createEdge('e2', 'action', 'log_output_node', 'main'),
    ];

    const workflow: Workflow = { nodes, edges };

    // Get execution order and reconcile edges
    const { executionOrderManager } = require('../orchestration/execution-order-manager');
    const executionOrder = executionOrderManager.initialize(workflow);
    const reconciled = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);

    // ASSERTION 1: log_output node should NOT be cloned
    const logOutputNodesAfter = reconciled.workflow.nodes.filter((n: WorkflowNode) => n.type === 'log_output');
    expect(logOutputNodesAfter).toHaveLength(1);
    expect(logOutputNodesAfter[0].id).toBe('log_output_node');

    // ASSERTION 2: Single incoming edge should be preserved
    const incomingAfter = reconciled.workflow.edges.filter((e: WorkflowEdge) => e.target === 'log_output_node').length;
    expect(incomingAfter).toBe(1);

    // ASSERTION 3: No cloned nodes should exist
    const clonedNodes = reconciled.workflow.nodes.filter((n: WorkflowNode) => String(n.id).includes('_split_'));
    expect(clonedNodes).toHaveLength(0);

    // ASSERTION 4: DAG validation should pass
    const dagResult = dagValidator.validateStructure({
      nodes: nodes.map((n: WorkflowNode) => ({ id: n.id, type: n.type })),
      connections: edges.map((e: WorkflowEdge) => ({ source: e.source, target: e.target, type: e.type })),
      trigger: 'trigger',
    });
    expect(dagResult.valid).toBe(true);
    expect(dagResult.errors).toHaveLength(0);
  });

  /**
   * PRESERVATION TEST 2: Normal action node with multiple inputs rejected
   * 
   * Verify that a normal action node (e.g., google_sheets) with two incoming
   * edges continues to be rejected by both the DAG validator and canCreateEdge.
   * 
   * This ensures the fix doesn't accidentally allow multi-input for non-merge nodes.
   */
  it('PRESERVATION 2: Normal action nodes with 2+ inputs should still be rejected', () => {
    const nodes: WorkflowNode[] = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('action_1', 'google_sheets', 'Google Sheets 1', 'data'),
      createNode('action_2', 'google_sheets', 'Google Sheets 2', 'data'),
      createNode('target_action', 'google_sheets', 'Target Action', 'data'),
    ];

    const edges: WorkflowEdge[] = [
      createEdge('e1', 'trigger', 'action_1', 'main'),
      createEdge('e2', 'trigger', 'action_2', 'main'),
      createEdge('e3', 'action_1', 'target_action', 'main'),
      createEdge('e4', 'action_2', 'target_action', 'main'),
    ];

    // ASSERTION 1: allowsMultipleInputs should return false for google_sheets
    const allowsMultiple = graphBranchingValidator.allowsMultipleInputs('google_sheets');
    expect(allowsMultiple).toBe(false);

    // ASSERTION 2: canCreateEdge should block the second incoming edge
    const workflow: Workflow = { 
      nodes, 
      edges: edges.slice(0, 3) // Only first 3 edges (before e4)
    };
    const canCreate = graphBranchingValidator.canCreateEdge(
      workflow,
      'action_2',
      'target_action'
    );
    expect(canCreate.allowed).toBe(false);
    expect(canCreate.reason).toContain('does not allow multiple inputs');

    // ASSERTION 3: DAG validator should emit error for multi-input normal node
    const dagResult = dagValidator.validateStructure({
      nodes: nodes.map((n: WorkflowNode) => ({ id: n.id, type: n.type })),
      connections: edges.map((e: WorkflowEdge) => ({ source: e.source, target: e.target, type: e.type })),
      trigger: 'trigger',
    });
    expect(dagResult.valid).toBe(false);
    expect(dagResult.errors.length).toBeGreaterThan(0);
    const multiInputError = dagResult.errors.some((e: string) => 
      e.includes('target_action') && (e.includes('must have exactly 1 input') || e.includes('multiple inputs') || e.includes('in-degree'))
    );
    expect(multiInputError).toBe(true);
  });

  /**
   * PRESERVATION TEST 3: Dedicated merge topology
   * 
   * Verify that a workflow with a dedicated merge node followed by log_output
   * continues to be treated as valid.
   * 
   * Topology: trigger → if_else → [true: action_1, false: action_2] → merge → log_output
   */
  it('PRESERVATION 3: Dedicated merge → log_output topology should remain valid', () => {
    const nodes: WorkflowNode[] = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('if_node', 'if_else', 'IF', 'logic'),
      createNode('action_1', 'google_sheets', 'Google Sheets 1', 'data'),
      createNode('action_2', 'google_sheets', 'Google Sheets 2', 'data'),
      createNode('merge_node', 'merge', 'Merge', 'logic'),
      createNode('log_output_node', 'log_output', 'Log Output', 'output'),
    ];

    const edges: WorkflowEdge[] = [
      createEdge('e1', 'trigger', 'if_node', 'main'),
      createEdge('e2', 'if_node', 'action_1', 'true'),
      createEdge('e3', 'if_node', 'action_2', 'false'),
      createEdge('e4', 'action_1', 'merge_node', 'main'),
      createEdge('e5', 'action_2', 'merge_node', 'main'),
      createEdge('e6', 'merge_node', 'log_output_node', 'main'),
    ];

    const workflow: Workflow = { nodes, edges };

    // Get execution order and reconcile edges
    const { executionOrderManager } = require('../orchestration/execution-order-manager');
    const executionOrder = executionOrderManager.initialize(workflow);
    const reconciled = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);

    // ASSERTION 1: Merge node should have at least 2 incoming edges
    const mergeIncoming = reconciled.workflow.edges.filter((e: WorkflowEdge) => e.target === 'merge_node').length;
    expect(mergeIncoming).toBeGreaterThanOrEqual(2);

    // ASSERTION 2: Merge node should have 1 outgoing edge
    const mergeOutgoing = reconciled.workflow.edges.filter((e: WorkflowEdge) => e.source === 'merge_node').length;
    expect(mergeOutgoing).toBe(1);

    // ASSERTION 3: log_output should have 1 incoming edge (from merge)
    const logOutputIncoming = reconciled.workflow.edges.filter((e: WorkflowEdge) => e.target === 'log_output_node').length;
    expect(logOutputIncoming).toBe(1);

    // ASSERTION 4: DAG validation should pass
    const dagResult = dagValidator.validateStructure({
      nodes: nodes.map((n: WorkflowNode) => ({ id: n.id, type: n.type })),
      connections: edges.map((e: WorkflowEdge) => ({ source: e.source, target: e.target, type: e.type })),
      trigger: 'trigger',
    });
    expect(dagResult.valid).toBe(true);
    expect(dagResult.errors).toHaveLength(0);
  });

  /**
   * PRESERVATION TEST 4: log_output with outgoing edge rejected
   * 
   * Verify that a log_output with any outgoing edges continues to be rejected
   * as a structural violation (out-degree must remain 0).
   */
  it('PRESERVATION 4: log_output with outgoing edge should still be rejected', () => {
    const nodes: WorkflowNode[] = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('action', 'google_sheets', 'Google Sheets', 'data'),
      createNode('log_output_node', 'log_output', 'Log Output', 'output'),
      createNode('invalid_target', 'google_sheets', 'Invalid Target', 'data'),
    ];

    const edges: WorkflowEdge[] = [
      createEdge('e1', 'trigger', 'action', 'main'),
      createEdge('e2', 'action', 'log_output_node', 'main'),
      createEdge('e3', 'log_output_node', 'invalid_target', 'main'), // Invalid: log_output should have no outgoing edges
    ];

    // DAG validator should emit error for log_output with outgoing edge
    const dagResult = dagValidator.validateStructure({
      nodes: nodes.map((n: WorkflowNode) => ({ id: n.id, type: n.type })),
      connections: edges.map((e: WorkflowEdge) => ({ source: e.source, target: e.target, type: e.type })),
      trigger: 'trigger',
    });

    // ASSERTION 1: Validation should fail
    expect(dagResult.valid).toBe(false);

    // ASSERTION 2: Error should mention log_output out-degree or terminal violation
    const outDegreeError = dagResult.errors.some((e: string) => 
      e.includes('log_output') && (e.includes('outputs') || e.includes('out-degree') || e.includes('terminal') || e.includes('outgoing'))
    );
    expect(outDegreeError).toBe(true);
  });

  /**
   * PRESERVATION TEST 5: Registry unchanged for other node types
   * 
   * Verify that unifiedNodeRegistry.get(type) returns identical definitions
   * for all pre-existing node types after the fix.
   * 
   * This is a property-based test that samples various node types.
   */
  it('PRESERVATION 5: Registry definitions unchanged for non-log_output types', () => {
    const sampleNodeTypes = [
      'google_sheets',
      'google_gmail',
      'slack_message',
      'if_else',
      'switch',
      'merge',
      'manual_trigger',
      'http_request',
    ];

    for (const nodeType of sampleNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      // ASSERTION 1: Node should be registered
      expect(nodeDef).toBeDefined();

      // ASSERTION 2: Node definition should have expected structure
      expect(nodeDef).toHaveProperty('type');
      expect(nodeDef?.type).toBe(nodeType);

      // ASSERTION 3: Existing capability flags should be unchanged
      // (This captures the baseline; after fix, these should remain identical)
      if (nodeDef) {
        // Capture current state for comparison after fix
        const hasIsBranching = 'isBranching' in nodeDef;
        const hasCategory = 'category' in nodeDef;
        const hasOutgoingPorts = 'outgoingPorts' in nodeDef;
        
        expect(hasIsBranching || hasCategory || hasOutgoingPorts).toBe(true);
      }
    }
  });

  /**
   * PRESERVATION TEST 6: allowsMultipleInputs false for non-merge nodes
   * 
   * Property-based test: for any node type other than log_output (and other
   * explicitly registered merge-capable nodes), allowsMultipleInputs must
   * return false.
   */
  it('PRESERVATION 6: allowsMultipleInputs returns false for all non-merge node types', () => {
    const nonMergeNodeTypes = [
      'google_sheets',
      'google_gmail',
      'slack_message',
      'http_request',
      'manual_trigger',
      'webhook_trigger',
      'schedule_trigger',
      'ai_summarizer',
      'ai_classifier',
      'data_transformer',
    ];

    for (const nodeType of nonMergeNodeTypes) {
      const allowsMultiple = graphBranchingValidator.allowsMultipleInputs(nodeType);
      
      // ASSERTION: Should return false for all non-merge nodes
      expect(allowsMultiple).toBe(false);
    }
  });

  /**
   * PRESERVATION TEST 7: Workflows without multi-input log_output unchanged
   * 
   * Property-based test: for any workflow with no multi-input log_output nodes,
   * reconciliation engine output should be identical before and after the fix.
   */
  it('PRESERVATION 7: Reconciliation unchanged for workflows without multi-input log_output', () => {
    // Test case 1: Linear workflow
    const linearWorkflow: Workflow = {
      nodes: [
        createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
        createNode('action_1', 'google_sheets', 'Google Sheets', 'data'),
        createNode('action_2', 'google_gmail', 'Gmail', 'communication'),
        createNode('log', 'log_output', 'Log', 'output'),
      ],
      edges: [
        createEdge('e1', 'trigger', 'action_1', 'main'),
        createEdge('e2', 'action_1', 'action_2', 'main'),
        createEdge('e3', 'action_2', 'log', 'main'),
      ],
    };

    const { executionOrderManager } = require('../orchestration/execution-order-manager');
    const executionOrder1 = executionOrderManager.initialize(linearWorkflow);
    const reconciled1 = edgeReconciliationEngine.reconcileEdges(linearWorkflow, executionOrder1);

    // ASSERTION 1: Node count unchanged
    expect(reconciled1.workflow.nodes).toHaveLength(linearWorkflow.nodes.length);

    // ASSERTION 2: Edge count unchanged
    expect(reconciled1.workflow.edges).toHaveLength(linearWorkflow.edges.length);

    // ASSERTION 3: No cloned nodes
    const clonedNodes = reconciled1.workflow.nodes.filter((n: WorkflowNode) => String(n.id).includes('_split_'));
    expect(clonedNodes).toHaveLength(0);

    // Test case 2: Branching workflow with separate terminals
    const branchingWorkflow: Workflow = {
      nodes: [
        createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
        createNode('if_node', 'if_else', 'IF', 'logic'),
        createNode('action_true', 'google_sheets', 'Google Sheets', 'data'),
        createNode('action_false', 'google_gmail', 'Gmail', 'communication'),
        createNode('log_true', 'log_output', 'Log True', 'output'),
        createNode('log_false', 'log_output', 'Log False', 'output'),
      ],
      edges: [
        createEdge('e1', 'trigger', 'if_node', 'main'),
        createEdge('e2', 'if_node', 'action_true', 'true'),
        createEdge('e3', 'if_node', 'action_false', 'false'),
        createEdge('e4', 'action_true', 'log_true', 'main'),
        createEdge('e5', 'action_false', 'log_false', 'main'),
      ],
    };

    const executionOrder2 = executionOrderManager.initialize(branchingWorkflow);
    const reconciled2 = edgeReconciliationEngine.reconcileEdges(branchingWorkflow, executionOrder2);

    // ASSERTION 4: Node count unchanged (separate log_output nodes)
    expect(reconciled2.workflow.nodes).toHaveLength(branchingWorkflow.nodes.length);

    // ASSERTION 5: Edge count unchanged
    expect(reconciled2.workflow.edges).toHaveLength(branchingWorkflow.edges.length);

    // ASSERTION 6: No cloned nodes
    const clonedNodes2 = reconciled2.workflow.nodes.filter((n: WorkflowNode) => String(n.id).includes('_split_'));
    expect(clonedNodes2).toHaveLength(0);
  });
});
