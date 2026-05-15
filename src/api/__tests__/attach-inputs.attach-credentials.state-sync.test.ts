import { buildSyncedGraphPayload, resolveWorkflowGraphState } from '../workflow-graph-state';

describe('workflow graph state sync contract', () => {
  it('prefers columns when graph and columns have the same topology but config diverges', () => {
    const workflow = {
      graph: {
        nodes: [{ id: 'n1', data: { type: 'switch', config: { cases: [{ value: 'old' }] } } }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'old' }],
      },
      nodes: [{ id: 'n1', data: { type: 'switch', config: { cases: [{ value: 'new' }] } } }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'new' }],
    };

    const resolved = resolveWorkflowGraphState(workflow);
    expect(resolved.source).toBe('columns');
    expect(resolved.inSync).toBe(false);
    expect(resolved.needsHealing).toBe(true);
    expect((resolved.nodes[0] as any).data.config.cases[0].value).toBe('new');
    expect((resolved.edges[0] as any).sourceHandle).toBe('new');
  });

  it('prefers graph when columns are a stale thinner topology snapshot', () => {
    const workflow = {
      graph: {
        nodes: [
          { id: 'node_1', data: { type: 'manual_trigger', config: {} } },
          { id: 'node_2', data: { type: 'google_gmail', config: { operation: 'send' } } },
          { id: 'node_3', data: { type: 'log_output', config: {} } },
          { id: 'node_4', data: { type: 'google_gmail', config: { operation: 'list' } } },
          { id: 'node_5', data: { type: 'log_output', config: {} } },
        ],
        edges: [
          { id: 'edge_1', source: 'node_1', target: 'node_2' },
          { id: 'edge_2', source: 'node_2', target: 'node_3' },
          { id: 'edge_3', source: 'node_3', target: 'node_4' },
          { id: 'edge_4', source: 'node_4', target: 'node_5' },
        ],
      },
      nodes: [
        { id: 'node_1', data: { type: 'manual_trigger', config: {} } },
        { id: 'node_4', data: { type: 'google_gmail', config: { operation: 'list' } } },
        { id: 'node_5', data: { type: 'log_output', config: {} } },
      ],
      edges: [
        { id: 'edge_3', source: 'node_1', target: 'node_4' },
        { id: 'edge_4', source: 'node_4', target: 'node_5' },
      ],
    };

    const resolved = resolveWorkflowGraphState(workflow);
    expect(resolved.source).toBe('graph');
    expect(resolved.inSync).toBe(false);
    expect(resolved.needsHealing).toBe(true);
    expect(resolved.nodes.map((node: any) => node.id)).toEqual([
      'node_1',
      'node_2',
      'node_3',
      'node_4',
      'node_5',
    ]);
    expect(resolved.edges).toHaveLength(4);
  });

  it('builds graph payload from canonical nodes and edges', () => {
    const nodes = [{ id: 'n1', data: { type: 'manual_trigger', config: {} } }];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const metadata = { freezeBoundary: { frozen: true } };

    const payload = buildSyncedGraphPayload(nodes, edges, metadata);
    expect(payload).toEqual({
      nodes,
      edges,
      metadata,
    });
  });
});
