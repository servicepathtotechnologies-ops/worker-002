import { normalizeWorkflowForSave } from '../workflow-save-validator';

describe('switch handle contract normalization', () => {
  it('migrates case_N branch handles to semantic case values', () => {
    const nodes: any[] = [
      {
        id: 'trigger_1',
        type: 'custom',
        data: { type: 'manual_trigger', category: 'trigger', label: 'Trigger', config: {} },
      },
      {
        id: 'switch_1',
        type: 'custom',
        data: {
          type: 'switch',
          category: 'logic',
          label: 'Switch',
          config: { cases: [{ value: 'amount_gt_5000' }, { value: 'amount_le_5000' }] },
        },
      },
      {
        id: 'node_hi',
        type: 'custom',
        data: { type: 'google_gmail', category: 'output', label: 'High', config: {} },
      },
      {
        id: 'node_lo',
        type: 'custom',
        data: { type: 'google_gmail', category: 'output', label: 'Low', config: {} },
      },
    ];
    const edges: any[] = [
      { id: 'e0', source: 'trigger_1', target: 'switch_1', type: 'main' },
      { id: 'e1', source: 'switch_1', target: 'node_hi', type: 'case_1', sourceHandle: 'case_1' },
      { id: 'e2', source: 'switch_1', target: 'node_lo', type: 'case_2', sourceHandle: 'case_2' },
    ];

    const normalized = normalizeWorkflowForSave(nodes, edges, { structuralMode: 'configOnly' });
    const branchHandles = normalized.edges
      .filter((e) => e.source === 'switch_1')
      .map((e) => String(e.sourceHandle));
    const branchTypes = normalized.edges
      .filter((e) => e.source === 'switch_1')
      .map((e) => String((e as any).type));

    expect(branchHandles).toEqual(['amount_gt_5000', 'amount_le_5000']);
    expect(branchTypes).toEqual(['amount_gt_5000', 'amount_le_5000']);
  });
});
