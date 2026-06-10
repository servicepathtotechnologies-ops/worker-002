import { ExecutionContext } from '../typed-execution-context';
import { Condition, evaluateCondition } from '../typed-condition-evaluator';

function makeCtx(vars: Record<string, unknown> = {}, lastOutput: unknown = null): ExecutionContext {
  return { variables: vars, nodeOutputs: new Map(), lastOutput };
}

// ---------------------------------------------------------------------------
// Condition object — numeric comparisons
// ---------------------------------------------------------------------------
describe('evaluateCondition — numeric comparisons', () => {
  it('equals: same numbers → true', () => {
    const cond: Condition = { leftValue: 5, operation: 'equals', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('equals: different numbers → false', () => {
    const cond: Condition = { leftValue: 5, operation: 'equals', rightValue: 10 };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('not_equals: 5 !== 10 → true', () => {
    const cond: Condition = { leftValue: 5, operation: 'not_equals', rightValue: 10 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('not_equals: 5 !== 5 → false', () => {
    const cond: Condition = { leftValue: 5, operation: 'not_equals', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('greater_than: 20 > 10 → true', () => {
    const cond: Condition = { leftValue: 20, operation: 'greater_than', rightValue: 10 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('greater_than: 5 > 10 → false', () => {
    const cond: Condition = { leftValue: 5, operation: 'greater_than', rightValue: 10 };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('less_than: 5 < 10 → true', () => {
    const cond: Condition = { leftValue: 5, operation: 'less_than', rightValue: 10 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('less_than: 10 < 5 → false', () => {
    const cond: Condition = { leftValue: 10, operation: 'less_than', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('greater_than_or_equal: equal values → true', () => {
    const cond: Condition = { leftValue: 5, operation: 'greater_than_or_equal', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('greater_than_or_equal: greater value → true', () => {
    const cond: Condition = { leftValue: 6, operation: 'greater_than_or_equal', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('greater_than_or_equal: lesser value → false', () => {
    const cond: Condition = { leftValue: 4, operation: 'greater_than_or_equal', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('less_than_or_equal: equal values → true', () => {
    const cond: Condition = { leftValue: 5, operation: 'less_than_or_equal', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('less_than_or_equal: lesser value → true', () => {
    const cond: Condition = { leftValue: 4, operation: 'less_than_or_equal', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('less_than_or_equal: greater value → false', () => {
    const cond: Condition = { leftValue: 6, operation: 'less_than_or_equal', rightValue: 5 };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('handles floating-point values', () => {
    const cond: Condition = { leftValue: 3.14, operation: 'greater_than', rightValue: 3 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Condition object — coerceLiteralScalar (string literal coercion)
// ---------------------------------------------------------------------------
describe('evaluateCondition — coerceLiteralScalar', () => {
  it('numeric string "10" > "5" coerced to numbers → true', () => {
    const cond: Condition = { leftValue: '10', operation: 'greater_than', rightValue: '5' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('numeric string "10" > "20" → false', () => {
    // Without coercion "10" > "20" would be true (lexicographic), with coercion → false
    const cond: Condition = { leftValue: '10', operation: 'greater_than', rightValue: '20' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('negative numeric string "-3.14" < "0" → true', () => {
    const cond: Condition = { leftValue: '-3.14', operation: 'less_than', rightValue: '0' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('mixed: string "10" equals number 10 → true', () => {
    const cond: Condition = { leftValue: '10', operation: 'equals', rightValue: 10 };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('bool string "true" equals "true" coerced to booleans → true', () => {
    const cond: Condition = { leftValue: 'true', operation: 'equals', rightValue: 'true' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('bool string "true" not_equals "false" → true', () => {
    const cond: Condition = { leftValue: 'true', operation: 'not_equals', rightValue: 'false' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('non-numeric mixed string "10px" stays string (equals)', () => {
    const cond: Condition = { leftValue: '10px', operation: 'equals', rightValue: '10px' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('non-numeric mixed string "10px" not_equals "20px" → true', () => {
    const cond: Condition = { leftValue: '10px', operation: 'not_equals', rightValue: '20px' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Condition object — string comparisons
// ---------------------------------------------------------------------------
describe('evaluateCondition — string comparisons', () => {
  it('equals: same strings → true', () => {
    const cond: Condition = { leftValue: 'hello', operation: 'equals', rightValue: 'hello' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('equals: different strings → false', () => {
    const cond: Condition = { leftValue: 'hello', operation: 'equals', rightValue: 'world' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('not_equals: different strings → true', () => {
    const cond: Condition = { leftValue: 'hello', operation: 'not_equals', rightValue: 'world' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('contains: substring present → true', () => {
    const cond: Condition = { leftValue: 'hello world', operation: 'contains', rightValue: 'world' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('contains: substring absent → false', () => {
    const cond: Condition = { leftValue: 'hello', operation: 'contains', rightValue: 'xyz' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('not_contains: absent → true', () => {
    const cond: Condition = { leftValue: 'hello', operation: 'not_contains', rightValue: 'xyz' };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('not_contains: present → false', () => {
    const cond: Condition = { leftValue: 'hello world', operation: 'not_contains', rightValue: 'world' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('greater_than on strings → false (core contract: no lexicographic ordering)', () => {
    const cond: Condition = { leftValue: 'z', operation: 'greater_than', rightValue: 'a' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('less_than on strings → false (core contract)', () => {
    const cond: Condition = { leftValue: 'a', operation: 'less_than', rightValue: 'z' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('greater_than_or_equal on strings → false (core contract)', () => {
    const cond: Condition = { leftValue: 'z', operation: 'greater_than_or_equal', rightValue: 'a' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('less_than_or_equal on strings → false (core contract)', () => {
    const cond: Condition = { leftValue: 'a', operation: 'less_than_or_equal', rightValue: 'z' };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Condition object — boolean comparisons
// ---------------------------------------------------------------------------
describe('evaluateCondition — boolean comparisons', () => {
  it('equals: true === true → true', () => {
    const cond: Condition = { leftValue: true, operation: 'equals', rightValue: true };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('equals: true === false → false', () => {
    const cond: Condition = { leftValue: true, operation: 'equals', rightValue: false };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });

  it('not_equals: true !== false → true', () => {
    const cond: Condition = { leftValue: true, operation: 'not_equals', rightValue: false };
    expect(evaluateCondition(cond, makeCtx())).toBe(true);
  });

  it('not_equals: true !== true → false', () => {
    const cond: Condition = { leftValue: true, operation: 'not_equals', rightValue: true };
    expect(evaluateCondition(cond, makeCtx())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Condition object — template variable resolution
// ---------------------------------------------------------------------------
describe('evaluateCondition — template variable resolution', () => {
  it('resolves $json.count in leftValue for numeric comparison', () => {
    const ctx = makeCtx({ $json: { count: 20 } });
    const cond: Condition = { leftValue: '{{$json.count}}', operation: 'greater_than', rightValue: 10 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('resolves $json.count in leftValue → equal to right', () => {
    const ctx = makeCtx({ $json: { count: 5 } });
    const cond: Condition = { leftValue: '{{$json.count}}', operation: 'equals', rightValue: 5 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('resolves template in rightValue', () => {
    const ctx = makeCtx({ $json: { threshold: 5 } });
    const cond: Condition = { leftValue: 10, operation: 'greater_than', rightValue: '{{$json.threshold}}' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('resolves $json.status in leftValue for string equals', () => {
    const ctx = makeCtx({ $json: { status: 'active' } });
    const cond: Condition = { leftValue: '{{$json.status}}', operation: 'equals', rightValue: 'active' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('resolves $json.status not_equals mismatch', () => {
    const ctx = makeCtx({ $json: { status: 'inactive' } });
    const cond: Condition = { leftValue: '{{$json.status}}', operation: 'not_equals', rightValue: 'active' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// String expression form
// ---------------------------------------------------------------------------
describe('evaluateCondition — string expression form (simple booleans)', () => {
  it('"true" → true', () => {
    expect(evaluateCondition('true', makeCtx())).toBe(true);
  });

  it('"false" → false', () => {
    expect(evaluateCondition('false', makeCtx())).toBe(false);
  });

  it('"1" → true', () => {
    expect(evaluateCondition('1', makeCtx())).toBe(true);
  });

  it('"0" → false', () => {
    expect(evaluateCondition('0', makeCtx())).toBe(false);
  });
});

describe('evaluateCondition — string expression form (comparison expressions)', () => {
  it('"10 > 5" → true', () => {
    expect(evaluateCondition('10 > 5', makeCtx())).toBe(true);
  });

  it('"5 > 10" → false', () => {
    expect(evaluateCondition('5 > 10', makeCtx())).toBe(false);
  });

  it('"10 === 10" → true', () => {
    expect(evaluateCondition('10 === 10', makeCtx())).toBe(true);
  });

  it('"10 >= 10" → true', () => {
    expect(evaluateCondition('10 >= 10', makeCtx())).toBe(true);
  });

  it('"9 >= 10" → false', () => {
    expect(evaluateCondition('9 >= 10', makeCtx())).toBe(false);
  });

  it('"9 <= 10" → true', () => {
    expect(evaluateCondition('9 <= 10', makeCtx())).toBe(true);
  });

  it('"11 <= 10" → false', () => {
    expect(evaluateCondition('11 <= 10', makeCtx())).toBe(false);
  });

  it('"10 < 20" → true', () => {
    expect(evaluateCondition('10 < 20', makeCtx())).toBe(true);
  });

  it('"10 == 10" (double equals) → true', () => {
    expect(evaluateCondition('10 == 10', makeCtx())).toBe(true);
  });

  it('"10 != 5" (double not-equals) → true', () => {
    expect(evaluateCondition('10 != 5', makeCtx())).toBe(true);
  });
});

describe('evaluateCondition — string expression form (template expressions)', () => {
  it('"{{$json.count}} > 0" with count=5 → true', () => {
    const ctx = makeCtx({ $json: { count: 5 } });
    expect(evaluateCondition('{{$json.count}} > 0', ctx)).toBe(true);
  });

  it('"{{$json.count}} > 0" with count=0 → false', () => {
    const ctx = makeCtx({ $json: { count: 0 } });
    expect(evaluateCondition('{{$json.count}} > 0', ctx)).toBe(false);
  });

  it('"{{$json.score}} >= 50" with score=75 → true', () => {
    const ctx = makeCtx({ $json: { score: 75 } });
    expect(evaluateCondition('{{$json.score}} >= 50', ctx)).toBe(true);
  });

  it('"{{$json.score}} >= 50" with score=49 → false', () => {
    const ctx = makeCtx({ $json: { score: 49 } });
    expect(evaluateCondition('{{$json.score}} >= 50', ctx)).toBe(false);
  });
});

describe('evaluateCondition — string expression form (modulo expressions)', () => {
  it('"20 % 2 === 0" → true (even number)', () => {
    expect(evaluateCondition('20 % 2 === 0', makeCtx())).toBe(true);
  });

  it('"21 % 2 === 0" → false (odd number)', () => {
    expect(evaluateCondition('21 % 2 === 0', makeCtx())).toBe(false);
  });

  it('"21 % 2 === 1" → true (odd number remainder)', () => {
    expect(evaluateCondition('21 % 2 === 1', makeCtx())).toBe(true);
  });

  it('"9 % 3 === 0" → true (divisible by 3)', () => {
    expect(evaluateCondition('9 % 3 === 0', makeCtx())).toBe(true);
  });
});
