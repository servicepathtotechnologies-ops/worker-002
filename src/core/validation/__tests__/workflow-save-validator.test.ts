import { describe, expect, it } from '@jest/globals';
import { validateStructuralReadiness, validateWorkflowForSave } from '../workflow-save-validator';

describe('workflow-save-validator', () => {
  it('flags structural required fields deferred to runtime_ai', () => {
    const nodes: any[] = [
      {
        id: 'f1',
        type: 'form',
        data: {
          label: 'Form',
          type: 'form',
          category: 'trigger',
          config: { fields: [], _fillMode: { fields: 'runtime_ai' } },
        },
      },
    ];
    const edges: any[] = [];
    const result = validateWorkflowForSave(nodes as any, edges as any);
    expect(result.warnings.some((w) => w.includes('missing required structural field "fields"'))).toBe(true);
  });

  it('blocks deferred structural field when fill mode is runtime_ai', () => {
    const nodes: any[] = [
      {
        id: 't1',
        type: 'manual_trigger',
        data: { label: 'Trigger', type: 'manual_trigger', category: 'trigger', config: {} },
      },
      {
        id: 'if1',
        type: 'if_else',
        data: {
          label: 'If',
          type: 'if_else',
          category: 'logic',
          config: { conditions: [], _fillMode: { conditions: 'runtime_ai' } },
        },
      },
    ];
    const edges: any[] = [{ id: 'e1', source: 't1', target: 'if1', sourceHandle: 'output', targetHandle: 'input' }];

    const result = validateWorkflowForSave(nodes as any, edges as any);
    expect(result.valid).toBe(false);
    expect(result.canSave).toBe(false);
    expect(result.warnings.some((w) => w.includes('missing required structural field "conditions"'))).toBe(true);
  });

  it('rejects cyclic graphs and enforces DAG loop policy', () => {
    const nodes: any[] = [
      {
        id: 't1',
        type: 'manual_trigger',
        data: { label: 'Trigger', type: 'manual_trigger', category: 'trigger', config: {} },
      },
      {
        id: 'n1',
        type: 'javascript',
        data: { label: 'Code', type: 'javascript', category: 'transformation', config: {} },
      },
    ];
    const edges: any[] = [
      { id: 'e1', source: 't1', target: 'n1' },
      { id: 'e2', source: 'n1', target: 't1' },
    ];

    const result = validateWorkflowForSave(nodes as any, edges as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('contains a cycle'))).toBe(true);
  });

  it('blocks strict readiness when structural required fields are unresolved', () => {
    const nodes: any[] = [
      {
        id: 'f1',
        type: 'form',
        data: {
          label: 'Form',
          type: 'form',
          category: 'trigger',
          config: { _fillMode: { fields: 'runtime_ai' } },
        },
      },
    ];
    const result = validateStructuralReadiness(nodes as any, { strict: true });
    expect(result.errors.some((e) => e.includes('missing required structural field "fields"'))).toBe(true);
  });

  it('blocks strict readiness when switch structural fields are unresolved', () => {
    const nodes: any[] = [
      {
        id: 's1',
        type: 'switch',
        data: {
          label: 'Switch',
          type: 'switch',
          category: 'logic',
          config: { expression: '', cases: [], _fillMode: { expression: 'runtime_ai', cases: 'runtime_ai' } },
        },
      },
    ];
    const result = validateStructuralReadiness(nodes as any, { strict: true });
    // Switch required structural contract is registry-driven; currently `cases`
    // is required while `expression` is validated separately by config rules.
    expect(result.errors.some((e) => e.includes('missing required structural field "cases"'))).toBe(true);
  });

  it('allows runtime_ai ownership for full branch flow fields', () => {
    const nodes: any[] = [
      { id: 't1', type: 'form', data: { label: 'Form', type: 'form', category: 'trigger', config: { _fillMode: { fields: 'runtime_ai' } } } },
      { id: 'if1', type: 'if_else', data: { label: 'If', type: 'if_else', category: 'logic', config: { _fillMode: { conditions: 'runtime_ai' } } } },
      { id: 'l1', type: 'log_output', data: { label: 'Log', type: 'log_output', category: 'output', config: {} } },
    ];
    const edges: any[] = [
      { id: 'e1', source: 't1', target: 'if1' },
      { id: 'e2', source: 'if1', target: 'l1', sourceHandle: 'true' },
    ];
    const result = validateWorkflowForSave(nodes as any, edges as any);
    expect(result.warnings.some((w) => w.includes('missing required structural field "fields"'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('missing required structural field "conditions"'))).toBe(true);
  });
});
