import { describe, expect, it } from '@jest/globals';
import {
  pickFormFieldKeyForAgeIntent,
  repairIfElseConditionsFromUpstreamForm,
} from '../repair-ifelse-form-conditions';

describe('pickFormFieldKeyForAgeIntent', () => {
  it('prefers field whose label or name suggests age', () => {
    const key = pickFormFieldKeyForAgeIntent([
      { name: 'details_through_a_form_including_age', label: 'Details Through A Form Including Age', type: 'number' },
    ]);
    expect(key).toBe('details_through_a_form_including_age');
  });

  it('falls back to first number field', () => {
    const key = pickFormFieldKeyForAgeIntent([
      { name: 'qty', type: 'number' },
      { name: 'title', type: 'string' },
    ]);
    expect(key).toBe('qty');
  });
});

describe('repairIfElseConditionsFromUpstreamForm', () => {
  it('rewrites input.age to $json.<internalKey> when form is upstream', () => {
    const wf = repairIfElseConditionsFromUpstreamForm({
      nodes: [
        {
          id: 'form1',
          type: 'custom',
          data: {
            type: 'form',
            config: {
              fields: [{ name: 'my_age_field', label: 'Age', type: 'number' }],
            },
          },
        },
        {
          id: 'if1',
          type: 'custom',
          data: {
            type: 'if_else',
            config: {
              conditions: [{ field: 'input.age', operator: 'greater_than', value: 18 }],
            },
          },
        },
      ],
      edges: [{ source: 'form1', target: 'if1' }],
    } as any);

    const ifNode = wf.nodes.find((n: any) => n.id === 'if1') as any;
    expect(ifNode).toBeDefined();
    expect(ifNode.data.config.conditions[0].field).toBe('$json.my_age_field');
  });

  it('rewrites input.status to $json.<internalKey> when name matches', () => {
    const wf = repairIfElseConditionsFromUpstreamForm({
      nodes: [
        {
          id: 'form1',
          type: 'custom',
          data: {
            type: 'form',
            config: {
              fields: [{ name: 'user_status', label: 'Status', type: 'string' }],
            },
          },
        },
        {
          id: 'if1',
          type: 'custom',
          data: {
            type: 'if_else',
            config: {
              conditions: [{ field: 'input.status', operator: 'equals', value: 'active' }],
            },
          },
        },
      ],
      edges: [{ source: 'form1', target: 'if1' }],
    } as any);

    const ifNode = wf.nodes.find((n: any) => n.id === 'if1') as any;
    expect(ifNode.data.config.conditions[0].field).toBe('$json.user_status');
  });

  it('does not change conditions when no input.age', () => {
    const original = [{ field: '$json.status', operator: 'equals', value: 'x' }];
    const wf = repairIfElseConditionsFromUpstreamForm({
      nodes: [
        {
          id: 'form1',
          type: 'custom',
          data: { type: 'form', config: { fields: [{ name: 'status', type: 'string' }] } },
        },
        {
          id: 'if1',
          type: 'custom',
          data: { type: 'if_else', config: { conditions: JSON.parse(JSON.stringify(original)) } },
        },
      ],
      edges: [{ source: 'form1', target: 'if1' }],
    } as any);

    const ifNode = wf.nodes.find((n: any) => n.id === 'if1') as any;
    expect(ifNode).toBeDefined();
    expect(ifNode.data.config.conditions[0].field).toBe('$json.status');
  });

  it('keeps malformed conditions untouched instead of crashing', () => {
    const wf = repairIfElseConditionsFromUpstreamForm({
      nodes: [
        {
          id: 'form1',
          type: 'custom',
          data: { type: 'form', config: { fields: [{ name: 'age', type: 'number' }] } },
        },
        {
          id: 'if1',
          type: 'custom',
          data: { type: 'if_else', config: { conditions: ['invalid_shape'] } },
        },
      ],
      edges: [{ source: 'form1', target: 'if1' }],
    } as any);

    const ifNode = wf.nodes.find((n: any) => n.id === 'if1') as any;
    expect(ifNode.data.config.conditions).toEqual(['invalid_shape']);
  });
});
