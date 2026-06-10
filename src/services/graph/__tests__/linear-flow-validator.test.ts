import {
  validateLinearFlow,
  validateRequiredNodesInLinearPath,
} from '../linear-flow-validator';
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

describe('validateLinearFlow', () => {
  it('reports error when no trigger node is present', () => {
    const nodes = [makeNode('n1', 'google_sheets'), makeNode('n2', 'slack_message')];
    const edges = [makeEdge('n1', 'n2')];

    const result = validateLinearFlow(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.isLinear).toBe(false);
    expect(result.errors).toContain('No trigger node found');
  });

  it('returns valid for a simple linear flow', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const action1 = makeNode('a1', 'google_sheets');
    const action2 = makeNode('a2', 'slack_message');
    const nodes = [trigger, action1, action2];
    const edges = [makeEdge('t1', 'a1'), makeEdge('a1', 'a2')];

    const result = validateLinearFlow(nodes, edges);

    expect(result.valid).toBe(true);
    expect(result.isLinear).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.linearPath[0]).toBe('t1');
    expect(result.linearPath).toContain('a1');
    expect(result.linearPath).toContain('a2');
  });

  it('reports disconnected nodes as invalid', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const action1 = makeNode('a1', 'google_sheets');
    const orphan = makeNode('o1', 'slack_message');
    const nodes = [trigger, action1, orphan];
    const edges = [makeEdge('t1', 'a1')];

    const result = validateLinearFlow(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.disconnectedNodes).toContain('o1');
    expect(result.errors.some(e => e.includes('not in linear path'))).toBe(true);
  });

  it('records branch warning but does not error for if_else node', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const ifNode = makeNode('if1', 'if_else');
    const yes = makeNode('y1', 'email');
    const no = makeNode('n1', 'slack_message');
    const nodes = [trigger, ifNode, yes, no];
    const edges = [
      makeEdge('t1', 'if1'),
      makeEdge('if1', 'y1'),
      makeEdge('if1', 'n1'),
    ];

    const result = validateLinearFlow(nodes, edges);

    expect(result.errors).toHaveLength(0);
  });

  it('reports no disconnected nodes when all nodes reachable', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const a1 = makeNode('a1', 'http_request');
    const nodes = [trigger, a1];
    const edges = [makeEdge('t1', 'a1')];

    const result = validateLinearFlow(nodes, edges);

    expect(result.disconnectedNodes).toHaveLength(0);
    expect(result.details.totalNodes).toBe(2);
    expect(result.details.totalEdges).toBe(1);
    expect(result.details.pathLength).toBe(2);
  });

  it('populates details with node and edge counts', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const nodes = [trigger];
    const edges: WorkflowEdge[] = [];

    const result = validateLinearFlow(nodes, edges);

    expect(result.details.totalNodes).toBe(1);
    expect(result.details.totalEdges).toBe(0);
  });
});

describe('validateRequiredNodesInLinearPath', () => {
  it('returns valid when all required types are in the path', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const sheets = makeNode('a1', 'google_sheets');
    const slack = makeNode('a2', 'slack_message');
    const nodes = [trigger, sheets, slack];
    const edges = [makeEdge('t1', 'a1'), makeEdge('a1', 'a2')];
    const required = new Set(['manual_trigger', 'google_sheets', 'slack_message']);

    const result = validateRequiredNodesInLinearPath(nodes, edges, required);

    expect(result.valid).toBe(true);
    expect(result.missingNodes).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing required node types', () => {
    const trigger = makeNode('t1', 'manual_trigger');
    const sheets = makeNode('a1', 'google_sheets');
    const nodes = [trigger, sheets];
    const edges = [makeEdge('t1', 'a1')];
    const required = new Set(['manual_trigger', 'google_sheets', 'slack_message']);

    const result = validateRequiredNodesInLinearPath(nodes, edges, required);

    expect(result.valid).toBe(false);
    expect(result.missingNodes).toContain('slack_message');
  });

  it('returns early error when linear flow itself is invalid', () => {
    const sheets = makeNode('a1', 'google_sheets');
    const nodes = [sheets];
    const edges: WorkflowEdge[] = [];
    const required = new Set(['google_sheets']);

    const result = validateRequiredNodesInLinearPath(nodes, edges, required);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Linear flow validation failed');
  });
});
