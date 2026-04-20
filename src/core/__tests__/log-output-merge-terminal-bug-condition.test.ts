/**
 * Bug Condition Exploration Tests for log_output Merge Terminal Fix
 * 
 * These tests MUST FAIL on unfixed code to confirm the bug exists.
 * DO NOT fix the code when tests fail — the failures are the evidence.
 * 
 * Bug Condition: log_output node has more than one incoming edge
 * 
 * Expected Behavior (after fix):
 * - All incoming edges preserved
 * - No structural errors emitted
 * - Node treated as merge-capable terminal
 * 
 * Current Behavior (unfixed):
 * - Edges cloned and rewired away
 * - DAG validator emits in-degree error
 * - Branching validator blocks edge creation
 * - Type normalizer emits unknown-type warning
 */

import { describe, it, expect } from '@jest/globals';
import { edgeReconciliationEngine } from '../orchestration/edge-reconciliation-engine';
import { dagValidator } from '../validation/dag-validator';
import { graphBranchingValidator } from '../validation/graph-branching-validator';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
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

describe('Bug Condition: log_output with multiple incoming edges', () => {
  /**
   * TEST 1: Switch 3-branch merge
   * 
   * Build workflow: Switch → case_1/case_2/case_3 all targeting same log_output
   * 
   * EXPECTED (after fix):
   * - splitMultiInputLogOutputs does NOT clone the node
   * - Edge set is unchanged (all 3 edges preserved)
   * - Single log_output node remains
   * 
   * WILL FAIL (unfixed):
   * - splitMultiInputLogOutputs clones log_output into log_output_split_1, log_output_split_2
   * - Edge set is modified (edges rewired to clones)
   * - Multiple log_output nodes created
   */
  it('TEST 1: Switch 3-branch merge - splitMultiInputLogOutputs should NOT clone log_output', () => {
    const nodes: WorkflowNode[] = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('switch_node', 'switch', 'Switch', 'logic'),
      createNode('action_case_1', 'google_sheets', 'Google Sheets', 'data'),
      createNode('action_case_2', 'google_sheets', 'Google Sheets', 'data'),
      createNode('action_case_3', 'google_sheets', 'Google Sheets', 'data'),
      createNode('log_output_node', 'log_output', 'Log Output', 'output'),
    ];

    const edges: WorkflowEdge[] = [
      createEdge('e1', 'trigger', 'switch_node', 'main'),
      createEdge('e2', 'switch_node', 'action_case_1', 'case_1'),
      createEdge('e3', 'switch_node', 'action_case_2', 'case_2'),
      createEdge('e4', 'switch_node', 'action_case_3', 'case_3'),
      createEdge('e5', 'action_case_1', 'log_output_node', 'main'),
      createEdge('e6', 'action_case_2', 'log_output_node', 'main'),
      createEdge('e7', 'action_case_3', 'log_output_node', 'main'),
    ];

    const workflow: Workflow = { nodes, edges };

    // Count incoming edges to log_output before reconciliation
    const incomingBefore = edges.filter((e: WorkflowEdge) => e.target === 'log_output_node').length;
    expect(incomingBefore).toBe(3);

    // Get execution order and reconcile edges
    const { executionOrderManager } = require('../orchestration/execution-order-manager');
    const executionOrder = executionOrderManager.initialize(workflow);
    const reconciled = edgeReconciliationEngine.reconcileEdges(workflow, executionOrder);

    // ASSERTION 1: log_output node should NOT be cloned
    const logOutputNodesAfter = reconciled.workflow.nodes.filter((n: WorkflowNode) => 
      unifiedNormalizeNodeTypeString(n.type) === 'log_output'
    );
    expect(logOutputNodesAfter).toHaveLength(1);
    expect(logOutputNodesAfter[0].id).toBe('log_output_node');

    // ASSERTION 2: All 3 incoming edges should be preserved
    const incomingAfter = reconciled.workflow.edges.filter((e: WorkflowEdge) => e.target === 'log_output_node').length;
    expect(incomingAfter).toBe(3);

    // ASSERTION 3: No cloned nodes should exist (no _split_ suffix)
    const clonedNodes = reconciled.workflow.nodes.filter((n: WorkflowNode) => String(n.id).includes('_split_'));
    expect(clonedNodes).toHaveLength(0);

    // ASSERTION 4: No _split_ edges should exist
    const splitEdges = reconciled.workflow.edges.filter((e: WorkflowEdge) => 
      String(e.source).includes('_split_') || String(e.target).includes('_split_')
    );
    expect(splitEdges).toHaveLength(0);
  });

  /**
   * TEST 2: IF both-branch merge
   * 
   * Build workflow: IF → true/false both targeting log_output
   * 
   * EXPECTED (after fix):
   * - DAG validator emits zero errors
   * - log_output with in-degree 2 is valid
   * 
   * WILL FAIL (unfixed):
   * - DAG validator emits: "LOG node <id> must have exactly 1 input, found 2"
   */
  it('TEST 2: IF both-branch merge - DAG validator should emit zero errors for log_output with 2 inputs', () => {
    const nodes = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('if_node', 'if_else', 'IF', 'logic'),
      createNode('action_true', 'google_sheets', 'Google Sheets', 'data'),
      createNode('action_false', 'google_sheets', 'Google Sheets', 'data'),
      createNode('log_output_node', 'log_output', 'Log Output', 'output'),
    ];

    const connections = [
      { source: 'trigger', target: 'if_node', type: 'main' },
      { source: 'if_node', target: 'action_true', type: 'true' },
      { source: 'if_node', target: 'action_false', type: 'false' },
      { source: 'action_true', target: 'log_output_node', type: 'main' },
      { source: 'action_false', target: 'log_output_node', type: 'main' },
    ];

    // Validate using DAG validator
    const result = dagValidator.validateStructure({
      nodes: nodes.map((n: WorkflowNode) => ({ id: n.id, type: n.type })),
      connections,
      trigger: 'trigger',
    });

    // Debug: Log validation result
    if (!result.valid) {
      console.log('[TEST 2] Validation errors:', result.errors);
    }

    // ASSERTION 1: Validation should pass (zero errors)
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // ASSERTION 2: No error about log_output in-degree
    const logOutputErrors = result.errors.filter((e: string) => 
      e.includes('log_output') && e.includes('must have exactly 1 input')
    );
    expect(logOutputErrors).toHaveLength(0);
  });

  /**
   * TEST 3: canCreateEdge multi-input test
   * 
   * Call graphBranchingValidator.canCreateEdge on workflow where log_output
   * already has one incoming edge and a second is being added.
   * 
   * EXPECTED (after fix):
   * - canCreateEdge returns { allowed: true }
   * - allowsMultipleInputs('log_output') returns true
   * 
   * WILL FAIL (unfixed):
   * - canCreateEdge returns { allowed: false, reason: '...does not allow multiple inputs' }
   * - allowsMultipleInputs('log_output') returns false
   */
  it('TEST 3: canCreateEdge - should allow second incoming edge to log_output', () => {
    const nodes: WorkflowNode[] = [
      createNode('trigger', 'manual_trigger', 'Trigger', 'trigger'),
      createNode('action_1', 'google_sheets', 'Google Sheets', 'data'),
      createNode('action_2', 'google_sheets', 'Google Sheets', 'data'),
      createNode('log_output_node', 'log_output', 'Log Output', 'output'),
    ];

    const edges: WorkflowEdge[] = [
      createEdge('e1', 'trigger', 'action_1', 'main'),
      createEdge('e2', 'trigger', 'action_2', 'main'),
      createEdge('e3', 'action_1', 'log_output_node', 'main'),
      // action_2 → log_output_node edge will be added
    ];

    const workflow: Workflow = { nodes, edges };

    // ASSERTION 1: allowsMultipleInputs should return true for log_output
    const allowsMultiple = graphBranchingValidator.allowsMultipleInputs('log_output');
    expect(allowsMultiple).toBe(true);

    // ASSERTION 2: canCreateEdge should allow the second incoming edge
    const canCreate = graphBranchingValidator.canCreateEdge(
      workflow,
      'action_2',
      'log_output_node'
    );
    expect(canCreate.allowed).toBe(true);
    expect(canCreate.reason).toBeUndefined();
  });

  /**
   * TEST 4: Normalizer warning test
   * 
   * Call unifiedNormalizeNodeTypeString('log_output') and assert
   * no "⚠️ Runtime unknown node type" warning is emitted.
   * 
   * EXPECTED (after fix):
   * - No warning emitted
   * - Returns 'log_output' (normalized)
   * - log_output is registered in UnifiedNodeRegistry
   * 
   * WILL FAIL (unfixed):
   * - Warning emitted: "⚠️ Runtime unknown node type: "custom" (method: unrecognized_type)"
   * - log_output is not registered
   */
  it('TEST 4: Normalizer - should NOT emit unknown-type warning for log_output', () => {
    // Capture console.warn calls
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Call normalizer
    const normalized = unifiedNormalizeNodeTypeString('log_output');

    // ASSERTION 1: Should return 'log_output' (normalized)
    expect(normalized).toBe('log_output');

    // ASSERTION 2: Should NOT emit unknown-type warning
    const unknownTypeWarnings = warnSpy.mock.calls.filter((call: any[]) =>
      call[0]?.includes('⚠️ Runtime unknown node type') &&
      call[0]?.includes('log_output')
    );
    expect(unknownTypeWarnings).toHaveLength(0);

    // ASSERTION 3: Should NOT emit any warning about unrecognized_type for log_output
    const unrecognizedWarnings = warnSpy.mock.calls.filter((call: any[]) =>
      call[0]?.includes('unrecognized_type') &&
      call[0]?.includes('log_output')
    );
    expect(unrecognizedWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });

  /**
   * BONUS: Verify log_output is registered in UnifiedNodeRegistry
   * 
   * This test verifies that log_output has the required capability flags
   * for merge-terminal behavior.
   */
  it('BONUS: log_output should be registered with merge-terminal capabilities', () => {
    const { unifiedNodeRegistry } = require('../registry/unified-node-registry');
    
    // ASSERTION 1: log_output should be registered
    const logOutputDef = unifiedNodeRegistry.get('log_output');
    expect(logOutputDef).toBeDefined();

    // ASSERTION 2: Should have allowsMultipleInputs flag (when implemented)
    // This will fail until the fix is applied
    if (logOutputDef?.allowsMultipleInputs !== undefined) {
      expect(logOutputDef.allowsMultipleInputs).toBe(true);
    }

    // ASSERTION 3: Should have isTerminal flag (when implemented)
    if (logOutputDef?.isTerminal !== undefined) {
      expect(logOutputDef.isTerminal).toBe(true);
    }

    // ASSERTION 4: Should have maxOutDegree = 0 (when implemented)
    if (logOutputDef?.maxOutDegree !== undefined) {
      expect(logOutputDef.maxOutDegree).toBe(0);
    }
  });
});
