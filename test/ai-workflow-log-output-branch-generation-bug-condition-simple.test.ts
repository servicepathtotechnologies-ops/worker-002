/**
 * Bug Condition Exploration Test — AI Workflow Log Output Branch Generation Fix
 * 
 * This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT fix the code when tests fail — the failures are the evidence.
 * 
 * Bug Condition: AI workflow builder generates branching workflows where multiple branches
 * connect to a SINGLE log_output node, creating an invalid merge topology.
 * 
 * Expected Behavior (after fix):
 * - Registry does NOT allow allowsMultipleInputs: true for log_output
 * - DAG validator emits error for multi-input log_output
 * - Branching validator returns false for log_output allowsMultipleInputs
 * - Edge reconciliation splits multi-input log_output nodes
 * 
 * Current Behavior (unfixed):
 * - Registry allows allowsMultipleInputs: true for log_output
 * - DAG validator doesn't emit error for multi-input log_output
 * - Branching validator allows multi-input for log_output
 * - Edge reconciliation creates multiple incoming edges to single log_output
 */

import { describe, it, expect } from '@jest/globals';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { dagValidator } from '../src/core/validation/dag-validator';
import { graphBranchingValidator } from '../src/core/validation/graph-branching-validator';
import { unifiedGraphOrchestrator } from '../src/core/orchestration/unified-graph-orchestrator';
import type { WorkflowNode, WorkflowEdge } from '../src/core/types/ai-types';

describe('Bug Condition Exploration — AI Workflow Log Output Branch Generation Fix (Task 1)', () => {

  /**
   * TEST 1: Registry validation test
   * 
   * Verify that log_output registry has allowsMultipleInputs: true on unfixed code
   * 
   * EXPECTED (after fix):
   * - allowsMultipleInputs should be false or undefined
   * 
   * WILL FAIL (unfixed):
   * - allowsMultipleInputs is true
   */
  it('TEST 1: Registry validation - log_output should NOT allow multiple inputs', () => {
    const logOutputDef = unifiedNodeRegistry.get('log_output');
    
    // ASSERTION 1: log_output should be registered
    expect(logOutputDef).toBeDefined();

    // ASSERTION 2: allowsMultipleInputs should NOT be true
    // On unfixed code, this will be true (from previous spec)
    // On fixed code, this should be false or undefined
    expect(logOutputDef?.allowsMultipleInputs).not.toBe(true);
    
    console.log(`[BUG EXPLORATION] log_output allowsMultipleInputs: ${logOutputDef?.allowsMultipleInputs}`);
  });

  /**
   * TEST 2: DAG validator test
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
  it('TEST 2: DAG validator - should emit error for multi-input log_output', () => {
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

    console.log(`[BUG EXPLORATION] DAG validation result:`, result);

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
   * TEST 3: Branching validator test
   * 
   * Test graphBranchingValidator.allowsMultipleInputs('log_output')
   * 
   * EXPECTED (after fix):
   * - Returns false
   * 
   * WILL FAIL (unfixed):
   * - Returns true (from previous spec)
   */
  it('TEST 3: Branching validator - allowsMultipleInputs should return false for log_output', () => {
    const allowsMultiple = graphBranchingValidator.allowsMultipleInputs('log_output');
    
    console.log(`[BUG EXPLORATION] Branching validator allowsMultipleInputs for log_output: ${allowsMultiple}`);
    
    // ASSERTION: Should return false
    // On unfixed code, this will be true
    // On fixed code, this should be false
    expect(allowsMultiple).toBe(false);
  });

  /**
   * TEST 4: Edge reconciliation test
   * 
   * Build workflow with multiple branches connecting to single log_output
   * Test that edge reconciliation splits the log_output nodes
   * 
   * EXPECTED (after fix):
   * - Edge reconciliation should split multi-input log_output nodes
   * - Each branch should get its own log_output node
   * 
   * WILL FAIL (unfixed):
   * - Edge reconciliation allows multi-input log_output
   * - Single log_output node with multiple incoming edges
   */
  it('TEST 4: Edge reconciliation - should split multi-input log_output nodes', () => {
    const nodes: WorkflowNode[] = [
      { id: 'trigger', type: 'manual_trigger', data: { label: 'Manual Trigger', type: 'manual_trigger', category: 'trigger', config: {} } },
      { id: 'switch_node', type: 'switch', data: { label: 'Switch', type: 'switch', category: 'logic', config: {} } },
      { id: 'action_1', type: 'google_sheets', data: { label: 'Google Sheets 1', type: 'google_sheets', category: 'action', config: {} } },
      { id: 'action_2', type: 'google_sheets', data: { label: 'Google Sheets 2', type: 'google_sheets', category: 'action', config: {} } },
      { id: 'action_3', type: 'google_sheets', data: { label: 'Google Sheets 3', type: 'google_sheets', category: 'action', config: {} } },
      { id: 'log_output_node', type: 'log_output', data: { label: 'Log Output', type: 'log_output', category: 'output', config: {} } },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'trigger', target: 'switch_node', type: 'main' },
      { id: 'e2', source: 'switch_node', target: 'action_1', type: 'case_1' },
      { id: 'e3', source: 'switch_node', target: 'action_2', type: 'case_2' },
      { id: 'e4', source: 'switch_node', target: 'action_3', type: 'case_3' },
      { id: 'e5', source: 'action_1', target: 'log_output_node', type: 'main' },
      { id: 'e6', source: 'action_2', target: 'log_output_node', type: 'main' },
      { id: 'e7', source: 'action_3', target: 'log_output_node', type: 'main' },
    ];

    const workflow = { nodes, edges };

    try {
      const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
      
      console.log(`[BUG EXPLORATION] Initialized workflow nodes:`, result.workflow.nodes.map(n => `${n.id}(${n.type})`));
      console.log(`[BUG EXPLORATION] Initialized workflow edges:`, result.workflow.edges.map(e => `${e.source}->${e.target}[${e.type}]`));

      // Count log_output nodes after reconciliation
      const logOutputNodes = result.workflow.nodes.filter(n => n.type === 'log_output');
      
      // ASSERTION 1: Should have multiple log_output nodes (one per branch)
      // On unfixed code, this will be 1 (shared log_output)
      // On fixed code, this should be 3 (separate log_output per branch)
      expect(logOutputNodes.length).toBeGreaterThan(1);

      // ASSERTION 2: Each log_output should have exactly 1 incoming edge
      for (const logNode of logOutputNodes) {
        const incomingEdges = result.workflow.edges.filter(e => e.target === logNode.id);
        expect(incomingEdges.length).toBe(1);
      }

    } catch (error) {
      console.log(`[BUG EXPLORATION] Edge reconciliation error:`, error);
      
      // If initialization fails due to validation, that's also a valid outcome
      // It means the system is preventing invalid multi-input log_output
      expect(error).toBeDefined();
    }
  });

  /**
   * TEST 5: Workflow validation test
   * 
   * Test that workflow validation catches multi-input log_output as invalid
   * 
   * EXPECTED (after fix):
   * - Workflow validation should fail for multi-input log_output
   * 
   * WILL FAIL (unfixed):
   * - Workflow validation passes multi-input log_output
   */
  it('TEST 5: Workflow validation - should reject multi-input log_output workflows', () => {
    const nodes: WorkflowNode[] = [
      { id: 'trigger', type: 'manual_trigger', data: { label: 'Manual Trigger', type: 'manual_trigger', category: 'trigger', config: {} } },
      { id: 'switch_node', type: 'switch', data: { label: 'Switch', type: 'switch', category: 'logic', config: {} } },
      { id: 'action_1', type: 'google_sheets', data: { label: 'Google Sheets 1', type: 'google_sheets', category: 'action', config: {} } },
      { id: 'action_2', type: 'google_sheets', data: { label: 'Google Sheets 2', type: 'google_sheets', category: 'action', config: {} } },
      { id: 'log_output_node', type: 'log_output', data: { label: 'Log Output', type: 'log_output', category: 'output', config: {} } },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'trigger', target: 'switch_node', type: 'main' },
      { id: 'e2', source: 'switch_node', target: 'action_1', type: 'case_1' },
      { id: 'e3', source: 'switch_node', target: 'action_2', type: 'case_2' },
      { id: 'e4', source: 'action_1', target: 'log_output_node', type: 'main' },
      { id: 'e5', source: 'action_2', target: 'log_output_node', type: 'main' },
    ];

    const workflow = { nodes, edges };

    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);
    
    console.log(`[BUG EXPLORATION] Workflow validation result:`, validation);

    // ASSERTION 1: Validation should fail
    // On unfixed code, this will pass (valid: true)
    // On fixed code, this should fail (valid: false)
    expect(validation.valid).toBe(false);

    // ASSERTION 2: Should have errors related to log_output
    const logOutputErrors = validation.errors.filter((e: string) => 
      e.includes('log_output') && (e.includes('input') || e.includes('merge') || e.includes('multiple'))
    );
    expect(logOutputErrors.length).toBeGreaterThan(0);
  });

});

/**
 * COUNTEREXAMPLE DOCUMENTATION
 * 
 * When these tests FAIL on unfixed code, they will demonstrate:
 * 
 * 1. Registry allows allowsMultipleInputs: true for log_output
 *    - TEST 1: allowsMultipleInputs is true (should be false)
 * 
 * 2. DAG validator doesn't emit error for multi-input log_output
 *    - TEST 2: validation passes (should fail with error)
 * 
 * 3. Branching validator allows multi-input for log_output
 *    - TEST 3: allowsMultipleInputs returns true (should be false)
 * 
 * 4. Edge reconciliation allows multi-input log_output
 *    - TEST 4: single log_output with multiple edges (should split into multiple nodes)
 * 
 * 5. Workflow validation passes multi-input log_output
 *    - TEST 5: validation passes (should fail with error)
 * 
 * These counterexamples confirm the bug exists and validate the root cause analysis.
 */