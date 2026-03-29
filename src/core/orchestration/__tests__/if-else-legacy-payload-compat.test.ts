import { describe, expect, it } from '@jest/globals';
import {
  normalizeIfElseConditions,
  validateCanonicalIfElseConditions,
} from '../../utils/if-else-conditions';

describe('if_else legacy payload compatibility', () => {
  it('converts expression objects to canonical conditions', () => {
    const normalized = normalizeIfElseConditions([
      { expression: '{{$json.age}} >= 18' },
    ]);
    expect(normalized).toEqual([
      { field: '$json.age', operator: 'greater_than_or_equal', value: 18 },
    ]);
  });

  it('converts legacy leftValue/operation/rightValue format', () => {
    const normalized = normalizeIfElseConditions([
      { leftValue: '$json.status', operation: 'equals', rightValue: 'active' },
    ]);
    expect(normalized).toEqual([
      { field: '$json.status', operator: 'equals', value: 'active' },
    ]);
  });

  it('parses nested stringified JSON expressions safely', () => {
    const normalized = normalizeIfElseConditions([
      {
        expression:
          '[{"field":"$json.details_through_a_form_including_age","operator":"greater_than","value":18}]',
      },
    ]);
    expect(normalized).toEqual([
      {
        field: '$json.details_through_a_form_including_age',
        operator: 'greater_than',
        value: 18,
      },
    ]);
  });

  it('returns validation errors for malformed conditions', () => {
    const errors = validateCanonicalIfElseConditions([{ operator: 'equals', value: 1 }]);
    expect(errors).toContain('conditions[0].field must be a non-empty string');
  });
});
