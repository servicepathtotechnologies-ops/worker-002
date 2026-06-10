import {
  isValidJSON,
  safeDeepClone,
  safeParse,
  safeParseWithDefault,
  safeStringify,
} from '../safe-json';

describe('safe-json utilities', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('parses valid JSON and returns the supplied default for malformed input', () => {
    expect(safeParse<{ enabled: boolean; count: number }>('{"enabled":true,"count":2}')).toEqual({
      enabled: true,
      count: 2,
    });

    expect(safeParse('not json', { fallback: true })).toEqual({ fallback: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns a non-null default through safeParseWithDefault', () => {
    const fallback = { retry: false };

    expect(safeParseWithDefault('{"retry":true}', fallback)).toEqual({ retry: true });
    expect(safeParseWithDefault('not json', fallback)).toBe(fallback);
  });

  it('stringifies serializable values and falls back when JSON.stringify throws', () => {
    const circular: Record<string, unknown> = { id: 'root' };
    circular.self = circular;

    expect(safeStringify({ id: 'workflow', enabled: true })).toBe('{"id":"workflow","enabled":true}');
    expect(safeStringify(circular, 'fallback')).toBe('fallback');
  });

  it('deep clones serializable values and returns null for circular references', () => {
    const source = { nested: { value: 1 } };
    const clone = safeDeepClone(source);

    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone?.nested).not.toBe(source.nested);

    const circular: Record<string, unknown> = { id: 'root' };
    circular.self = circular;
    expect(safeDeepClone(circular)).toBeNull();
  });

  it('detects valid JSON strings without leaking parse errors', () => {
    expect(isValidJSON('{"ok":true}')).toBe(true);
    expect(isValidJSON('[1,2,3]')).toBe(true);
    expect(isValidJSON('not json')).toBe(false);
    expect(isValidJSON('')).toBe(false);
  });
});
