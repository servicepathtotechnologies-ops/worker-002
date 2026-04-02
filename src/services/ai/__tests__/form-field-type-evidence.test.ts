import { describe, expect, it } from '@jest/globals';
import type { Workflow } from '../../../core/types/ai-types';
import { buildFormFieldTypeEvidence } from '../form-field-type-evidence';
import { inferFormFieldTypeDecision } from '../form-field-type-resolver';

describe('form field type evidence', () => {
  it('infers numeric evidence from if_else comparator', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'Branch',
            category: 'logic',
            config: {
              conditions: [
                {
                  field: '$json.marks',
                  operator: 'greater_than',
                  value: 35,
                },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const evidence = buildFormFieldTypeEvidence(workflow, '');
    expect(evidence.get('marks')?.inferredType).toBe('number');
    expect((evidence.get('marks')?.confidence || 0)).toBeGreaterThan(0.9);
  });

  it('upgrades text to number when strong evidence exists', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'Branch',
            category: 'logic',
            config: {
              conditions: [
                { field: '$json.marks', operator: 'greater_than', value: 50 },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const decision = inferFormFieldTypeDecision({
      key: 'marks',
      currentType: 'text',
      workflow,
      preserveExplicit: true,
    });
    expect(decision.type).toBe('number');
    expect(decision.source).toBe('evidence');
  });

  it('preserves explicit non-text type when evidence is weak', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'Branch',
            category: 'logic',
            config: {
              conditions: [
                { field: '$json.category', operator: 'contains', value: 'science' },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const decision = inferFormFieldTypeDecision({
      key: 'category',
      currentType: 'select',
      workflow,
      preserveExplicit: true,
    });
    expect(decision.type).toBe('select');
    expect(decision.source).toBe('explicit');
  });
});

