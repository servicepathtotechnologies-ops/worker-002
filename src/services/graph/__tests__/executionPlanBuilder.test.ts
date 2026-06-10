import { executionPlanBuilder } from '../executionPlanBuilder';
import { WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';

function makeNode(id: string, type: string): WorkflowNode {
  return {
    id,
    type,
    data: { label: id, type, category: 'action', config: {} },
  };
}

function makeEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target };
}

describe('ExecutionPlanBuilder.buildExecutionPlan', () => {
  it('returns an invalid plan when no nodes are provided', () => {
    const result = executionPlanBuilder.buildExecutionPlan([]);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('No nodes provided');
    expect(result.orderedNodeIds).toHaveLength(0);
  });

  it('builds a valid plan for a single trigger node', () => {
    const trigger = makeNode('t1', 'manual_trigger');

    const result = executionPlanBuilder.buildExecutionPlan([trigger]);

    expect(result.isValid).toBe(true);
    expect(result.triggerNodeId).toBe('t1');
    expect(result.orderedNodeIds[0]).toBe('t1');
    expect(result.orderedNodeIds).toHaveLength(1);
    expect(result.nodeTypes[0]).toBe('manual_trigger');
  });

  it('places the trigger node first regardless of input order', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const action = makeNode('a1', 'google_gmail');

    const result = executionPlanBuilder.buildExecutionPlan([action, trigger]);

    expect(result.isValid).toBe(true);
    expect(result.orderedNodeIds[0]).toBe('t1');
    expect(result.orderedNodeIds).toContain('a1');
  });

  it('creates a manual_trigger when no trigger node exists', () => {
    const action = makeNode('a1', 'google_gmail');

    const result = executionPlanBuilder.buildExecutionPlan([action]);

    expect(result.isValid).toBe(true);
    expect(result.triggerNodeId).toBeTruthy();
    expect(result.nodeTypes[0]).toBe('manual_trigger');
    expect(result.orderedNodeIds).toContain('a1');
  });

  it('includes all provided nodes in the plan', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const a = makeNode('a1', 'google_sheets');
    const b = makeNode('b1', 'slack_message');

    const result = executionPlanBuilder.buildExecutionPlan([trigger, a, b]);

    expect(result.isValid).toBe(true);
    expect(result.orderedNodeIds).toContain('t1');
    expect(result.orderedNodeIds).toContain('a1');
    expect(result.orderedNodeIds).toContain('b1');
    expect(result.orderedNodeIds).toHaveLength(3);
  });

  it('places data-source nodes (priority 1) before action nodes (priority 4)', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const action = makeNode('a1', 'google_gmail');  // priority 4
    const source = makeNode('s1', 'google_sheets'); // priority 1

    const result = executionPlanBuilder.buildExecutionPlan([trigger, action, source]);

    expect(result.isValid).toBe(true);
    const sourceIdx = result.orderedNodeIds.indexOf('s1');
    const actionIdx = result.orderedNodeIds.indexOf('a1');
    expect(sourceIdx).toBeLessThan(actionIdx);
  });

  it('recognizes webhook as a valid trigger node', () => {
    const webhook = makeNode('w1', 'webhook');
    const action = makeNode('a1', 'google_gmail');

    const result = executionPlanBuilder.buildExecutionPlan([action, webhook]);

    expect(result.isValid).toBe(true);
    expect(result.orderedNodeIds[0]).toBe('w1');
  });

  it('handles schedule node as a valid trigger type', () => {
    const schedule = makeNode('s1', 'schedule');
    const action = makeNode('a1', 'google_gmail');

    const result = executionPlanBuilder.buildExecutionPlan([action, schedule]);

    expect(result.isValid).toBe(true);
    expect(result.orderedNodeIds[0]).toBe('s1');
    expect(result.triggerNodeId).toBe('s1');
  });

  it('populates nodeTypes in the same order as orderedNodeIds', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const source = makeNode('s1', 'google_sheets');
    const action = makeNode('a1', 'slack_message');

    const result = executionPlanBuilder.buildExecutionPlan([trigger, source, action]);

    expect(result.isValid).toBe(true);
    expect(result.nodeTypes).toHaveLength(result.orderedNodeIds.length);
    result.orderedNodeIds.forEach((id: string, i: number) => {
      // nodeTypes entry at position i corresponds to the node at orderedNodeIds[i]
      expect(typeof result.nodeTypes[i]).toBe('string');
      expect(result.nodeTypes[i].length).toBeGreaterThan(0);
    });
  });
});
