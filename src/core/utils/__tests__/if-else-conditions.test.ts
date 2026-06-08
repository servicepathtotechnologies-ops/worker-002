import {
  normalizeIfElseConditions,
  normalizeIfElseConfig,
  validateCanonicalIfElseConditions,
} from '../if-else-conditions';

// ── normalizeIfElseConditions ──────────────────────────────────────────────

describe('normalizeIfElseConditions — null / undefined inputs', () => {
  it('returns [] for null', () => {
    expect(normalizeIfElseConditions(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(normalizeIfElseConditions(undefined)).toEqual([]);
  });
});

describe('normalizeIfElseConditions — canonical object shape', () => {
  it('passes through a valid {field, operator, value} object', () => {
    const input = { field: 'status', operator: 'equals', value: 'active' };
    expect(normalizeIfElseConditions(input)).toEqual([
      { field: 'status', operator: 'equals', value: 'active' },
    ]);
  });

  it('resolves the === alias to equals', () => {
    const input = { field: 'status', operator: '===', value: 'done' };
    const [cond] = normalizeIfElseConditions(input);
    expect(cond.operator).toBe('equals');
  });

  it('resolves the >= alias to greater_than_or_equal', () => {
    const input = { field: 'score', operator: '>=', value: 90 };
    const [cond] = normalizeIfElseConditions(input);
    expect(cond.operator).toBe('greater_than_or_equal');
  });

  it('resolves the != alias to not_equals', () => {
    const input = { field: 'state', operator: '!=', value: 'error' };
    const [cond] = normalizeIfElseConditions(input);
    expect(cond.operator).toBe('not_equals');
  });

  it('drops conditions with an unrecognised operator', () => {
    const input = { field: 'x', operator: 'between', value: 5 };
    expect(normalizeIfElseConditions(input)).toEqual([]);
  });
});

describe('normalizeIfElseConditions — n8n leftValue/operation shape', () => {
  it('maps leftValue+operation+rightValue to canonical form', () => {
    const input = { leftValue: 'price', operation: '>', rightValue: 100 };
    expect(normalizeIfElseConditions(input)).toEqual([
      { field: 'price', operator: 'greater_than', value: 100 },
    ]);
  });

  it('handles operation alias <=', () => {
    const input = { leftValue: 'qty', operation: '<=', rightValue: 0 };
    const [cond] = normalizeIfElseConditions(input);
    expect(cond.operator).toBe('less_than_or_equal');
  });
});

describe('normalizeIfElseConditions — string expression parsing', () => {
  it('parses "score >= 90" into a condition', () => {
    const [cond] = normalizeIfElseConditions('score >= 90');
    expect(cond).toMatchObject({ operator: 'greater_than_or_equal', value: 90 });
    expect(cond.field).toContain('score');
  });

  it('strips {{ }} template syntax from the field', () => {
    const [cond] = normalizeIfElseConditions('{{$json.status}} === active');
    expect(cond.field).toBe('$json.status');
    expect(cond.operator).toBe('equals');
  });

  it('parses a quoted string value correctly', () => {
    const [cond] = normalizeIfElseConditions("status === 'done'");
    expect(cond.value).toBe('done');
  });

  it('parses boolean literal true', () => {
    const [cond] = normalizeIfElseConditions('isActive === true');
    expect(cond.value).toBe(true);
  });
});

describe('normalizeIfElseConditions — array inputs', () => {
  it('returns multiple conditions from a flat array', () => {
    const input = [
      { field: 'a', operator: 'equals', value: 1 },
      { field: 'b', operator: 'contains', value: 'x' },
    ];
    const result = normalizeIfElseConditions(input);
    expect(result).toHaveLength(2);
    expect(result[0].field).toBe('a');
    expect(result[1].field).toBe('b');
  });

  it('flattens array-of-arrays one level (AI pipeline nested groups)', () => {
    const input = [
      [{ field: 'x', operator: 'greater_than', value: 5 }],
      [{ field: 'y', operator: 'less_than', value: 10 }],
    ];
    const result = normalizeIfElseConditions(input);
    expect(result).toHaveLength(2);
    expect(result[0].field).toBe('x');
    expect(result[1].field).toBe('y');
  });
});

describe('normalizeIfElseConditions — JSON string input', () => {
  it('parses a JSON string containing a condition object', () => {
    const json = JSON.stringify({ field: 'level', operator: '<', value: 3 });
    const result = normalizeIfElseConditions(json);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ field: 'level', operator: 'less_than', value: 3 });
  });
});

// ── normalizeIfElseConfig ──────────────────────────────────────────────────

describe('normalizeIfElseConfig', () => {
  it('renames singular "condition" key to "conditions"', () => {
    const input = { condition: { field: 'x', operator: 'equals', value: 1 } };
    const result = normalizeIfElseConfig(input);
    expect(result).not.toHaveProperty('condition');
    expect(Array.isArray(result.conditions)).toBe(true);
  });

  it('normalises combineOperation to uppercase OR', () => {
    const result = normalizeIfElseConfig({
      conditions: [],
      combineOperation: 'or',
    });
    expect(result.combineOperation).toBe('OR');
  });

  it('defaults combineOperation to AND when absent', () => {
    const result = normalizeIfElseConfig({ conditions: [] });
    expect(result.combineOperation).toBe('AND');
  });

  it('preserves AND when combineOperation is mixed-case', () => {
    const result = normalizeIfElseConfig({
      conditions: [],
      combineOperation: 'And',
    });
    expect(result.combineOperation).toBe('AND');
  });
});

// ── validateCanonicalIfElseConditions ─────────────────────────────────────

describe('validateCanonicalIfElseConditions', () => {
  it('returns no errors for a valid single condition', () => {
    const errors = validateCanonicalIfElseConditions([
      { field: 'status', operator: 'equals', value: 'active' },
    ]);
    expect(errors).toEqual([]);
  });

  it('errors when input is not an array', () => {
    const errors = validateCanonicalIfElseConditions({ field: 'x' });
    expect(errors).toContain('conditions must be an array');
  });

  it('errors when array is empty', () => {
    const errors = validateCanonicalIfElseConditions([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors when field is missing', () => {
    const errors = validateCanonicalIfElseConditions([
      { operator: 'equals', value: 1 },
    ]);
    expect(errors.some((e) => e.includes('field'))).toBe(true);
  });

  it('errors when operator is invalid', () => {
    const errors = validateCanonicalIfElseConditions([
      { field: 'x', operator: 'between', value: 5 },
    ]);
    expect(errors.some((e) => e.includes('operator'))).toBe(true);
  });

  it('errors when value property is absent', () => {
    const errors = validateCanonicalIfElseConditions([
      { field: 'x', operator: 'equals' },
    ]);
    expect(errors.some((e) => e.includes('value'))).toBe(true);
  });

  it('collects errors from multiple invalid conditions', () => {
    const errors = validateCanonicalIfElseConditions([
      { operator: 'equals', value: 1 },
      { field: 'y', operator: 'bad_op', value: 2 },
    ]);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
