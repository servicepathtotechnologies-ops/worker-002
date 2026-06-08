import { describe, expect, it } from '@jest/globals';
import { areTypesCompatible, convertToType } from '../type-converter';

describe('type converter', () => {
  it('preserves compatible string subtype values with target metadata', () => {
    expect(convertToType('ada@example.com', 'email')).toEqual({
      success: true,
      value: 'ada@example.com',
      originalType: 'string',
      convertedType: 'email',
    });
  });

  it('uses safe target defaults for nullish values', () => {
    expect(convertToType(null, 'array')).toEqual({
      success: true,
      value: [],
      originalType: 'null',
      convertedType: 'array',
    });
    expect(convertToType(undefined, 'number')).toEqual({
      success: true,
      value: 0,
      originalType: 'null',
      convertedType: 'number',
    });
  });

  it('converts numeric strings and falls back to zero for invalid numbers', () => {
    expect(convertToType(' 42.5 ', 'number')).toMatchObject({
      success: true,
      value: 42.5,
      originalType: 'string',
      convertedType: 'number',
    });
    expect(convertToType('not-a-number', 'number')).toMatchObject({
      success: true,
      value: 0,
      originalType: 'string',
      convertedType: 'number',
    });
  });

  it('converts common boolean text and numeric values', () => {
    expect(convertToType('yes', 'boolean').value).toBe(true);
    expect(convertToType('0', 'boolean').value).toBe(false);
    expect(convertToType(2, 'boolean').value).toBe(true);
  });

  it('converts arrays and objects into stable target shapes', () => {
    expect(convertToType(['alpha', 2], 'string').value).toBe('alpha, 2');
    expect(convertToType({ first: 'a', second: 'b' }, 'array').value).toEqual(['a', 'b']);
    expect(convertToType([{ id: 1 }], 'object').value).toEqual({ id: 1 });
  });

  it('parses JSON inputs and wraps invalid JSON as an object value', () => {
    expect(convertToType('[1,2]', 'array').value).toEqual([1, 2]);
    expect(convertToType('{"enabled":true}', 'object').value).toEqual({ enabled: true });
    expect(convertToType('not json', 'json').value).toEqual({ value: 'not json' });
  });

  it('converts Date objects to datetime strings', () => {
    const date = new Date('2024-01-02T03:04:05.000Z');

    expect(convertToType(date, 'datetime')).toEqual({
      success: true,
      value: '2024-01-02T03:04:05.000Z',
      originalType: 'date',
      convertedType: 'datetime',
    });
  });

  it('reports unknown target types as failed conversions', () => {
    expect(convertToType('value', 'unsupported' as any)).toEqual({
      success: false,
      value: 'value',
      originalType: 'string',
      convertedType: 'unsupported',
      error: 'Unknown target type: unsupported',
    });
  });

  it('reports compatibility for supported source and target pairs', () => {
    expect(areTypesCompatible('string', 'number')).toBe(true);
    expect(areTypesCompatible('object', 'json')).toBe(true);
    expect(areTypesCompatible('number', 'array')).toBe(false);
  });
});
