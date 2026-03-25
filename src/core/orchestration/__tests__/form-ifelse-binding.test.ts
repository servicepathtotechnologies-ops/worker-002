import { describe, expect, it } from '@jest/globals';
import {
  findUpstreamFormContextForIfElse,
  validateIfElseConditionsAgainstUpstreamForm,
} from '../form-ifelse-binding';

describe('findUpstreamFormContextForIfElse', () => {
  it('uses graph predecessors when edges connect form to if_else', () => {
    const wf = {
      nodes: [
        {
          id: 'f1',
          data: { type: 'form', config: { fields: [{ name: 'age_field', label: 'Age', type: 'number' }] } },
        },
        { id: 'i1', data: { type: 'if_else', config: { conditions: [] } } },
      ],
      edges: [{ source: 'f1', target: 'i1' }],
    } as any;
    const ctx = findUpstreamFormContextForIfElse(wf, 'i1');
    expect(ctx?.formNodeId).toBe('f1');
    expect(ctx?.fields[0].name).toBe('age_field');
  });

  it('falls back to sole form in workflow when there are no edges', () => {
    const wf = {
      nodes: [
        {
          id: 'f1',
          data: { type: 'form', config: { fields: [{ name: 'x', type: 'text' }] } },
        },
        { id: 'i1', data: { type: 'if_else', config: { conditions: [] } } },
      ],
      edges: [],
    } as any;
    const ctx = findUpstreamFormContextForIfElse(wf, 'i1');
    expect(ctx?.formNodeId).toBe('f1');
  });
});

describe('validateIfElseConditionsAgainstUpstreamForm', () => {
  it('errors when $json key is not a form field', () => {
    const wf = {
      nodes: [
        {
          id: 'f1',
          data: { type: 'form', config: { fields: [{ name: 'only_key', type: 'string' }] } },
        },
        {
          id: 'i1',
          data: {
            type: 'if_else',
            config: {
              conditions: [{ field: '$json.wrong', operator: 'equals', value: 'a' }],
            },
          },
        },
      ],
      edges: [{ source: 'f1', target: 'i1' }],
    } as any;
    const { errors } = validateIfElseConditionsAgainstUpstreamForm(wf);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('$json.wrong');
  });

  it('passes when $json keys match form internal names', () => {
    const wf = {
      nodes: [
        {
          id: 'f1',
          data: { type: 'form', config: { fields: [{ name: 'only_key', type: 'string' }] } },
        },
        {
          id: 'i1',
          data: {
            type: 'if_else',
            config: {
              conditions: [{ field: '$json.only_key', operator: 'equals', value: 'a' }],
            },
          },
        },
      ],
      edges: [{ source: 'f1', target: 'i1' }],
    } as any;
    const { errors } = validateIfElseConditionsAgainstUpstreamForm(wf);
    expect(errors).toEqual([]);
  });
});
