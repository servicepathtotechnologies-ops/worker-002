import { describe, expect, it } from '@jest/globals';
import { normalizeWorkflowForSave, validateStructuralReadiness, validateWorkflowForSave } from '../workflow-save-validator';
import {
  diffWorkflowProtectedConfig,
  fingerprintWorkflowProtectedConfig,
} from '../../utils/workflow-topology-fingerprint';

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

  it('warns when switch case count does not match non-main outgoing edges', () => {
    const nodes: any[] = [
      {
        id: 't1',
        type: 'manual_trigger',
        data: { label: 'T', type: 'manual_trigger', category: 'triggers', config: {} },
      },
      {
        id: 'sw1',
        type: 'switch',
        data: {
          label: 'Sw',
          type: 'switch',
          category: 'logic',
          config: {
            expression: '{{$json.x}}',
            cases: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
          },
        },
      },
      { id: 'n1', type: 'log_output', data: { label: 'L', type: 'log_output', category: 'output', config: {} } },
    ];
    const edges: any[] = [
      { id: 'e1', source: 't1', target: 'sw1' },
      { id: 'e2', source: 'sw1', target: 'n1', type: 'case_1' },
    ];
    const result = validateWorkflowForSave(nodes as any, edges as any);
    expect(result.warnings.some((w) => w.includes('defines 3 case(s)') && w.includes('non-main outgoing'))).toBe(
      true
    );
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

  it('rejects shared branch fan-in to a single log_output', () => {
    const nodes: any[] = [
      { id: 't1', type: 'form', data: { label: 'Form', type: 'form', category: 'trigger', config: {} } },
      { id: 'if1', type: 'if_else', data: { label: 'If', type: 'if_else', category: 'logic', config: { conditions: [] } } },
      { id: 'g1', type: 'google_gmail', data: { label: 'Gmail', type: 'google_gmail', category: 'output', config: {} } },
      { id: 's1', type: 'slack_message', data: { label: 'Slack', type: 'slack_message', category: 'output', config: {} } },
      { id: 'l1', type: 'log_output', data: { label: 'Log', type: 'log_output', category: 'output', config: {} } },
    ];
    const edges: any[] = [
      { id: 'e1', source: 't1', target: 'if1' },
      { id: 'e2', source: 'if1', target: 'g1', sourceHandle: 'true', type: 'true' },
      { id: 'e3', source: 'if1', target: 's1', sourceHandle: 'false', type: 'false' },
      { id: 'e4', source: 'g1', target: 'l1' },
      { id: 'e5', source: 's1', target: 'l1' },
    ];
    const result = validateWorkflowForSave(nodes as any, edges as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('only one log_output terminal'))).toBe(true);
    expect(result.errors.some((e) => e.includes('single-input'))).toBe(true);
  });

  it('post_freeze_readonly normalization does not mutate topology/config', () => {
    const nodes: any[] = [
      {
        id: 'f1',
        type: 'form',
        data: { label: 'Form', type: 'form', category: 'trigger', config: { fields: [{ id: 'x', label: 'X', type: 'text' }] } },
      },
      {
        id: 's1',
        type: 'switch',
        data: { label: 'Switch', type: 'switch', category: 'logic', config: { expression: '{{$json.status}}', rules: [{ value: 'ok', output: 'ok' }] } },
      },
    ];
    const edges: any[] = [{ id: 'e1', source: 'f1', target: 's1' }];
    const normalized = normalizeWorkflowForSave(nodes as any, edges as any, {
      structuralMode: 'post_freeze_readonly',
    });
    expect(normalized.nodes).toEqual(nodes);
    expect(normalized.edges).toEqual(edges);
    expect(normalized.migrationsApplied).toEqual([]);
  });

  it('protected-config fingerprint drift detects changed structural config', () => {
    const baseNodes: any[] = [
      {
        id: 'form_1',
        type: 'form',
        data: {
          label: 'Form',
          type: 'form',
          category: 'trigger',
          config: {
            fields: [{ id: 'orderId', label: 'Order ID', type: 'text' }],
            credentialId: 'google_oauth_gmail',
          },
        },
      },
    ];
    const changedNodes = JSON.parse(JSON.stringify(baseNodes));
    changedNodes[0].data.config.fields = [{ id: 'response', label: 'Response', type: 'text' }];
    changedNodes[0].data.config.credentialId = 'different_credential';
    const baseFp = fingerprintWorkflowProtectedConfig(baseNodes);
    const changedFp = fingerprintWorkflowProtectedConfig(changedNodes);
    const diff = diffWorkflowProtectedConfig(baseFp, changedFp);
    expect(baseFp.fingerprint).not.toEqual(changedFp.fingerprint);
    expect(diff.equal).toBe(false);
    expect(diff.changedNodeIds).toContain('form_1');
  });
});
