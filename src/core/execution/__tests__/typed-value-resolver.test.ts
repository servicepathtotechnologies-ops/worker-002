import { ExecutionContext } from '../typed-execution-context';
import {
  isBareFieldPathString,
  resolveTypedValue,
  resolveWithSchema,
} from '../typed-value-resolver';

function makeCtx(vars: Record<string, unknown> = {}, lastOutput: unknown = null): ExecutionContext {
  return { variables: vars, nodeOutputs: new Map(), lastOutput };
}

function makeCtxWithNodes(
  vars: Record<string, unknown>,
  nodeOutputs: [string, unknown][],
  lastOutput: unknown = null
): ExecutionContext {
  return { variables: vars, nodeOutputs: new Map(nodeOutputs), lastOutput };
}

// ---------------------------------------------------------------------------
// isBareFieldPathString
// ---------------------------------------------------------------------------
describe('isBareFieldPathString', () => {
  it('returns false for empty string', () => {
    expect(isBareFieldPathString('')).toBe(false);
  });

  it('returns true for a simple identifier', () => {
    expect(isBareFieldPathString('age')).toBe(true);
  });

  it('returns true for a dotted path', () => {
    expect(isBareFieldPathString('data.qty')).toBe(true);
  });

  it('returns true for $json-prefixed path', () => {
    expect(isBareFieldPathString('$json.status')).toBe(true);
  });

  it('returns true for json-prefixed path', () => {
    expect(isBareFieldPathString('json.name')).toBe(true);
  });

  it('returns false for a string containing spaces', () => {
    expect(isBareFieldPathString('hello world')).toBe(false);
  });

  it('returns false for a template expression', () => {
    expect(isBareFieldPathString('{{age}}')).toBe(false);
  });

  it('returns false for a leading digit identifier', () => {
    expect(isBareFieldPathString('1abc')).toBe(false);
  });

  it('returns true for underscore-leading identifier', () => {
    expect(isBareFieldPathString('_field')).toBe(true);
  });

  it('returns true for identifiers with digits inside', () => {
    expect(isBareFieldPathString('field1')).toBe(true);
  });

  it('returns true for whitespace-padded valid path (trim)', () => {
    expect(isBareFieldPathString('  age  ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveTypedValue — no template syntax
// ---------------------------------------------------------------------------
describe('resolveTypedValue – no template syntax', () => {
  it('returns a literal string when path does not match a bare field', () => {
    const ctx = makeCtx({});
    expect(resolveTypedValue('hello world', ctx)).toBe('hello world');
  });

  it('resolves a bare field path to a number from variables', () => {
    const ctx = makeCtx({ age: 25 });
    expect(resolveTypedValue('age', ctx)).toBe(25);
  });

  it('resolves a bare field path to a boolean from variables', () => {
    const ctx = makeCtx({ active: false });
    expect(resolveTypedValue('active', ctx)).toBe(false);
  });

  it('returns the original string when a bare field path is not found', () => {
    const ctx = makeCtx({});
    expect(resolveTypedValue('missingField', ctx)).toBe('missingField');
  });
});

// ---------------------------------------------------------------------------
// resolveTypedValue — single expression
// ---------------------------------------------------------------------------
describe('resolveTypedValue – single expression', () => {
  it('returns a number for a {{field}} resolved to number', () => {
    const ctx = makeCtx({ count: 42 });
    expect(resolveTypedValue('{{count}}', ctx)).toBe(42);
  });

  it('returns a string for a {{field}} resolved to string', () => {
    const ctx = makeCtx({ name: 'Alice' });
    expect(resolveTypedValue('{{name}}', ctx)).toBe('Alice');
  });

  it('returns a boolean for a {{field}} resolved to boolean', () => {
    const ctx = makeCtx({ flag: true });
    expect(resolveTypedValue('{{flag}}', ctx)).toBe(true);
  });

  it('returns an object for a {{field}} resolved to object', () => {
    const ctx = makeCtx({ user: { id: 1 } });
    expect(resolveTypedValue('{{user}}', ctx)).toEqual({ id: 1 });
  });

  it('returns null for a single expression that does not resolve', () => {
    const ctx = makeCtx({});
    expect(resolveTypedValue('{{missing}}', ctx)).toBeNull();
  });

  it('resolves {{nodeId.field}} via nodeOutputs map', () => {
    const ctx = makeCtxWithNodes({}, [['step1', { result: 'ok' }]]);
    expect(resolveTypedValue('{{step1.result}}', ctx)).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// resolveTypedValue — mixed / multi-expression interpolation
// ---------------------------------------------------------------------------
describe('resolveTypedValue – string interpolation', () => {
  it('interpolates multiple expressions into a string', () => {
    const ctx = makeCtx({ first: 'Hello', last: 'World' });
    expect(resolveTypedValue('{{first}} {{last}}', ctx)).toBe('Hello World');
  });

  it('serialises an object value inside a mixed template', () => {
    const ctx = makeCtx({ data: { x: 1 } });
    const result = resolveTypedValue('result: {{data}}', ctx);
    expect(result).toBe('result: {"x":1}');
  });

  it('replaces missing keys with empty string in mixed template', () => {
    const ctx = makeCtx({});
    expect(resolveTypedValue('{{missing}} end', ctx)).toBe(' end');
  });
});

// ---------------------------------------------------------------------------
// resolveWithSchema — no expectedType
// ---------------------------------------------------------------------------
describe('resolveWithSchema – no expectedType', () => {
  it('passes through the resolved value unchanged', () => {
    const ctx = makeCtx({ score: 99 });
    expect(resolveWithSchema('{{score}}', ctx)).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// resolveWithSchema — 'number' casting (toNumber)
// ---------------------------------------------------------------------------
describe('resolveWithSchema – number', () => {
  it('returns a number as-is', () => {
    const ctx = makeCtx({ n: 3 });
    expect(resolveWithSchema('{{n}}', ctx, 'number')).toBe(3);
  });

  it('parses a numeric string', () => {
    const ctx = makeCtx({ n: '3.14' });
    expect(resolveWithSchema('{{n}}', ctx, 'number')).toBe(3.14);
  });

  it('returns 0 for a non-numeric string', () => {
    const ctx = makeCtx({ n: 'abc' });
    expect(resolveWithSchema('{{n}}', ctx, 'number')).toBe(0);
  });

  it('converts boolean true to 1', () => {
    const ctx = makeCtx({ b: true });
    expect(resolveWithSchema('{{b}}', ctx, 'number')).toBe(1);
  });

  it('converts boolean false to 0', () => {
    const ctx = makeCtx({ b: false });
    expect(resolveWithSchema('{{b}}', ctx, 'number')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveWithSchema — 'boolean' casting (toBoolean)
// ---------------------------------------------------------------------------
describe('resolveWithSchema – boolean', () => {
  it('returns a boolean as-is', () => {
    const ctx = makeCtx({ b: true });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(true);
  });

  it('converts string "true" to true', () => {
    const ctx = makeCtx({ b: 'true' });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(true);
  });

  it('converts string "yes" to true', () => {
    const ctx = makeCtx({ b: 'yes' });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(true);
  });

  it('converts string "false" to false', () => {
    const ctx = makeCtx({ b: 'false' });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(false);
  });

  it('converts string "no" to false', () => {
    const ctx = makeCtx({ b: 'no' });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(false);
  });

  it('converts non-zero number to true', () => {
    const ctx = makeCtx({ b: 5 });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(true);
  });

  it('converts 0 to false', () => {
    const ctx = makeCtx({ b: 0 });
    expect(resolveWithSchema('{{b}}', ctx, 'boolean')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveWithSchema — 'string' casting
// ---------------------------------------------------------------------------
describe('resolveWithSchema – string', () => {
  it('stringifies a number', () => {
    const ctx = makeCtx({ n: 42 });
    expect(resolveWithSchema('{{n}}', ctx, 'string')).toBe('42');
  });

  it('stringifies a boolean', () => {
    const ctx = makeCtx({ b: false });
    expect(resolveWithSchema('{{b}}', ctx, 'string')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// resolveWithSchema — 'array' casting (toArray)
// ---------------------------------------------------------------------------
describe('resolveWithSchema – array', () => {
  it('returns an array as-is', () => {
    const ctx = makeCtx({ arr: [1, 2] });
    expect(resolveWithSchema('{{arr}}', ctx, 'array')).toEqual([1, 2]);
  });

  it('extracts .rows when present', () => {
    const ctx = makeCtx({ res: { rows: [{ id: 1 }], count: 1 } });
    expect(resolveWithSchema('{{res}}', ctx, 'array')).toEqual([{ id: 1 }]);
  });

  it('extracts .data when rows not present', () => {
    const ctx = makeCtx({ res: { data: ['x', 'y'] } });
    expect(resolveWithSchema('{{res}}', ctx, 'array')).toEqual(['x', 'y']);
  });

  it('extracts .items when rows and data not present', () => {
    const ctx = makeCtx({ res: { items: [10, 20] } });
    expect(resolveWithSchema('{{res}}', ctx, 'array')).toEqual([10, 20]);
  });

  it('wraps a non-array primitive in an array', () => {
    const ctx = makeCtx({ val: 'hello' });
    expect(resolveWithSchema('{{val}}', ctx, 'array')).toEqual(['hello']);
  });
});

// ---------------------------------------------------------------------------
// resolveWithSchema — 'object' casting (toObject)
// ---------------------------------------------------------------------------
describe('resolveWithSchema – object', () => {
  it('returns a plain object as-is', () => {
    const ctx = makeCtx({ obj: { a: 1 } });
    expect(resolveWithSchema('{{obj}}', ctx, 'object')).toEqual({ a: 1 });
  });

  it('converts an array to an index-keyed object', () => {
    const ctx = makeCtx({ arr: ['x', 'y'] });
    expect(resolveWithSchema('{{arr}}', ctx, 'object')).toEqual({ '0': 'x', '1': 'y' });
  });

  it('wraps a primitive in { value }', () => {
    const ctx = makeCtx({ v: 'hello' });
    expect(resolveWithSchema('{{v}}', ctx, 'object')).toEqual({ value: 'hello' });
  });
});
