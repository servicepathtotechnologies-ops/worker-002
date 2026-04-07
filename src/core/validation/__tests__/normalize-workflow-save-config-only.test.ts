import { describe, expect, it } from 'vitest';
import { normalizeWorkflowForSave } from '../workflow-save-validator';

describe('normalizeWorkflowForSave configOnly', () => {
  it('does not remove duplicate triggers when structuralMode is configOnly', () => {
    const nodes = [
      {
        id: 't1',
        type: 'custom',
        data: {
          label: 'T1',
          type: 'chat_trigger',
          category: 'trigger',
          config: {},
        },
      },
      {
        id: 't2',
        type: 'custom',
        data: {
          label: 'T2',
          type: 'chat_trigger',
          category: 'trigger',
          config: {},
        },
      },
    ] as any[];
    const edges: any[] = [];

    const full = normalizeWorkflowForSave(nodes, edges, { structuralMode: 'full' });
    const cfg = normalizeWorkflowForSave(nodes, edges, { structuralMode: 'configOnly' });

    expect(full.nodes.length).toBe(1);
    expect(cfg.nodes.length).toBe(2);
  });
});
