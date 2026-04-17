import { buildSyncedGraphPayload, resolveWorkflowGraphState } from '../workflow-graph-state';

describe('workflow graph state sync contract', () => {
  it('prefers columns when graph and columns diverge', () => {
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
