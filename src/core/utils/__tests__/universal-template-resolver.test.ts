import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';
import {
  resolveUniversalTemplate,
  resolveConfigTemplates,
  resolveArrayTemplates,
} from '../universal-template-resolver';

jest.mock('../intent-aware-property-selector', () => ({
  intentAwarePropertySelect: jest.fn(() => ({ mode: 'pass-through' })),
}));

jest.mock('../type-converter', () => ({
  convertToType: jest.fn((value: unknown) => ({ success: true, value })),
}));

function makeCache(entries: Record<string, unknown> = {}): LRUNodeOutputsCache {
  const cache = new LRUNodeOutputsCache();
  for (const [k, v] of Object.entries(entries)) {
    cache.set(k, v);
  }
  return cache;
}

describe('resolveUniversalTemplate', () => {
  test('non-string values are returned as-is', () => {
    const cache = makeCache();
    expect(resolveUniversalTemplate(42, cache)).toBe(42);
    expect(resolveUniversalTemplate(null, cache)).toBeNull();
    expect(resolveUniversalTemplate({ x: 1 }, cache)).toEqual({ x: 1 });
    expect(resolveUniversalTemplate(false, cache)).toBe(false);
  });

  test('{{$json.field}} resolves field from previous node output', () => {
    const cache = makeCache({ node1: { name: 'Alice', age: 30 } });
    expect(resolveUniversalTemplate('{{$json.name}}', cache)).toBe('Alice');
    expect(resolveUniversalTemplate('{{$json.age}}', cache)).toBe(30);
  });

  test('{{$json.a.b.c}} resolves deeply nested path', () => {
    const cache = makeCache({ node1: { user: { profile: { city: 'London' } } } });
    expect(resolveUniversalTemplate('{{$json.user.profile.city}}', cache)).toBe('London');
  });

  test('unresolvable template returns original template string', () => {
    const cache = makeCache({ node1: { name: 'Alice' } });
    expect(resolveUniversalTemplate('{{$json.missing}}', cache)).toBe('{{$json.missing}}');
  });

  test('bare $json.field (no braces) resolves correctly', () => {
    const cache = makeCache({ node1: { score: 99 } });
    expect(resolveUniversalTemplate('$json.score', cache)).toBe(99);
  });

  test('{{trigger.field}} resolves from trigger key in cache', () => {
    const cache = makeCache();
    cache.set('trigger', { webhook: { body: { event: 'push' } } });
    expect(resolveUniversalTemplate('{{trigger.webhook.body.event}}', cache)).toBe('push');
  });

  test('{{input.field}} resolves from input key in cache', () => {
    const cache = makeCache();
    cache.set('input', { message: 'hello world' });
    expect(resolveUniversalTemplate('{{input.message}}', cache)).toBe('hello world');
  });

  test('{{nodeName.field}} resolves named node output by cache key', () => {
    const cache = makeCache();
    cache.set('google_sheets', { count: 7 });
    expect(resolveUniversalTemplate('{{google_sheets.count}}', cache)).toBe(7);
  });

  test('interpolated string resolves multiple {{...}} segments', () => {
    const cache = makeCache({ node1: { name: 'Alice', count: 5 } });
    const result = resolveUniversalTemplate(
      'Hello {{$json.name}}, you have {{$json.count}} items',
      cache
    );
    expect(result).toBe('Hello Alice, you have 5 items');
  });

  test('interpolated string keeps original token when expression is unresolvable', () => {
    const cache = makeCache({ node1: { name: 'Bob' } });
    const result = resolveUniversalTemplate(
      '{{$json.name}} sent {{$json.missing}}',
      cache
    );
    expect(result).toBe('Bob sent {{$json.missing}}');
  });
});

describe('resolveConfigTemplates', () => {
  test('resolves template keys and skips _ prefixed keys unchanged', () => {
    const cache = makeCache({ node1: { value: 'resolved' } });
    const result = resolveConfigTemplates(
      {
        prompt: '{{$json.value}}',
        _internal: '{{$json.value}}',
        staticField: 'no-template',
      },
      cache
    );
    expect(result.prompt).toBe('resolved');
    expect(result._internal).toBe('{{$json.value}}');
    expect(result.staticField).toBe('no-template');
  });
});

describe('resolveArrayTemplates', () => {
  test('resolves each array item independently', () => {
    const cache = makeCache({ node1: { a: 1, b: 2 } });
    const result = resolveArrayTemplates(['{{$json.a}}', '{{$json.b}}', 'static'], cache);
    expect(result).toEqual([1, 2, 'static']);
  });
});
