import { describe, expect, it } from '@jest/globals';
import { normalizeWorkflowGraph } from '../workflow-graph-normalizer';

describe('workflow-graph-normalizer branching safety', () => {
  it('preserves branching edges when if_else handles are present', () => {
    const graph: any = {
      nodes: [
        { id: 't1', type: 'form', data: { type: 'form', category: 'triggers', label: 'Form' } },
        { id: 'if1', type: 'if_else', data: { type: 'if_else', category: 'logic', label: 'If' } },
        { id: 'g1', type: 'google_gmail', data: { type: 'google_gmail', category: 'communication', label: 'Gmail' } },
        { id: 's1', type: 'slack_message', data: { type: 'slack_message', category: 'communication', label: 'Slack' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'if1', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'if1', target: 'g1', sourceHandle: 'true', targetHandle: 'input' },
        { id: 'e3', source: 'if1', target: 's1', sourceHandle: 'false', targetHandle: 'input' },
      ],
    };

    const out = normalizeWorkflowGraph(graph);
    const branchEdges = out.edges.filter((e: any) => e.source === 'if1');
    expect(branchEdges.some((e: any) => e.sourceHandle === 'true' && e.target === 'g1')).toBe(true);
    expect(branchEdges.some((e: any) => e.sourceHandle === 'false' && e.target === 's1')).toBe(true);
  });

  it('does not collapse multiple branch logs into one log_output', () => {
    const graph: any = {
      nodes: [
        { id: 't1', type: 'form', data: { type: 'form', category: 'triggers', label: 'Form' } },
        { id: 'if1', type: 'if_else', data: { type: 'if_else', category: 'logic', label: 'If' } },
        { id: 'g1', type: 'google_gmail', data: { type: 'google_gmail', category: 'communication', label: 'Gmail' } },
        { id: 's1', type: 'slack_message', data: { type: 'slack_message', category: 'communication', label: 'Slack' } },
        { id: 'l1', type: 'log_output', data: { type: 'log_output', category: 'communication', label: 'Log 1' } },
        { id: 'l2', type: 'log_output', data: { type: 'log_output', category: 'communication', label: 'Log 2' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'if1', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'if1', target: 'g1', sourceHandle: 'true', targetHandle: 'input' },
        { id: 'e3', source: 'if1', target: 's1', sourceHandle: 'false', targetHandle: 'input' },
        { id: 'e4', source: 'g1', target: 'l1', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e5', source: 's1', target: 'l2', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };

    const out = normalizeWorkflowGraph(graph);
    const logNodes = out.nodes.filter((n: any) => (n.data?.type || n.type) === 'log_output');
    expect(logNodes.length).toBe(2);
    expect(out.edges.some((e: any) => e.source === 'g1' && e.target === 'l1')).toBe(true);
    expect(out.edges.some((e: any) => e.source === 's1' && e.target === 'l2')).toBe(true);
    // Ensure no forced collapse to only first log.
    expect(out.edges.some((e: any) => e.source === 's1' && e.target === 'l1')).toBe(false);
  });
});

