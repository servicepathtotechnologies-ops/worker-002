/**
 * Unit Tests: GeminiOrchestrator — pure helpers and model routing
 * Day 47: covers private logic (via `as any` casting), cache management, and performance metrics.
 * All tests are purely synchronous / in-process; no real LLM calls are made.
 */

import { GeminiOrchestrator, AIRequestType } from '../gemini-orchestrator';
import {
  GEMINI_PRO_MODEL,
  GEMINI_DEFAULT_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_MODELS,
} from '../gemini-models';

function make(): any {
  return new GeminiOrchestrator() as any;
}

// ─── selectOptimalModel ───────────────────────────────────────────────────────

describe('selectOptimalModel', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  const proTypes: AIRequestType[] = [
    'workflow-generation',
    'code-generation',
    'code-assistance',
    'image-understanding',
    'image-comparison',
    'reasoning',
    'node-suggestion',
    'property-population',
  ];

  const liteTypes: AIRequestType[] = [
    'summarization',
    'translation',
    'text-analysis',
    'entity-extraction',
    'text-completion',
  ];

  const defaultTypes: AIRequestType[] = [
    'intent-analysis',
    'workflow-analysis',
    'chat-generation',
    'credential-guidance',
    'error-analysis',
  ];

  proTypes.forEach(type => {
    it(`routes ${type} → Pro model`, () => {
      expect(o.selectOptimalModel(type, {})).toBe(GEMINI_PRO_MODEL);
    });
  });

  liteTypes.forEach(type => {
    it(`routes ${type} → Lite model`, () => {
      expect(o.selectOptimalModel(type, {})).toBe(GEMINI_LITE_MODEL);
    });
  });

  defaultTypes.forEach(type => {
    it(`routes ${type} → Default model`, () => {
      expect(o.selectOptimalModel(type, {})).toBe(GEMINI_DEFAULT_MODEL);
    });
  });
});

// ─── getDefaultTemperature ────────────────────────────────────────────────────

describe('getDefaultTemperature', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('workflow-generation → 0.2', () => {
    expect(o.getDefaultTemperature('workflow-generation')).toBe(0.2);
  });

  it('code-generation → 0.2', () => {
    expect(o.getDefaultTemperature('code-generation')).toBe(0.2);
  });

  it('chat-generation → 0.7', () => {
    expect(o.getDefaultTemperature('chat-generation')).toBe(0.7);
  });

  it('text-completion → 0.7', () => {
    expect(o.getDefaultTemperature('text-completion')).toBe(0.7);
  });

  it('intent-analysis → 0.5 (default)', () => {
    expect(o.getDefaultTemperature('intent-analysis')).toBe(0.5);
  });

  it('property-population → 0.5 (default)', () => {
    expect(o.getDefaultTemperature('property-population')).toBe(0.5);
  });
});

// ─── getDefaultMaxTokens ──────────────────────────────────────────────────────

describe('getDefaultMaxTokens', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('workflow-generation → 16000', () => {
    expect(o.getDefaultMaxTokens('workflow-generation')).toBe(16000);
  });

  it('code-generation → 16000', () => {
    expect(o.getDefaultMaxTokens('code-generation')).toBe(16000);
  });

  it('intent-analysis → 4000', () => {
    expect(o.getDefaultMaxTokens('intent-analysis')).toBe(4000);
  });

  it('summarization → 500', () => {
    expect(o.getDefaultMaxTokens('summarization')).toBe(500);
  });

  it('text-completion → 500', () => {
    expect(o.getDefaultMaxTokens('text-completion')).toBe(500);
  });

  it('chat-generation → 2000 (default)', () => {
    expect(o.getDefaultMaxTokens('chat-generation')).toBe(2000);
  });

  it('property-population → 2000 (default)', () => {
    expect(o.getDefaultMaxTokens('property-population')).toBe(2000);
  });
});

// ─── buildPrompt ──────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('returns string input unchanged', () => {
    expect(o.buildPrompt('intent-analysis', 'hello world')).toBe('hello world');
  });

  it('extracts prompt field from object', () => {
    expect(o.buildPrompt('intent-analysis', { prompt: 'my prompt' })).toBe('my prompt');
  });

  it('concatenates system + message with double newline', () => {
    const result = o.buildPrompt('intent-analysis', { system: 'SYS', message: 'MSG' });
    expect(result).toBe('SYS\n\nMSG');
  });

  it('joins messages array contents', () => {
    const input = { messages: [{ content: 'part1' }, { content: 'part2' }] };
    const result = o.buildPrompt('intent-analysis', input);
    expect(result).toContain('part1');
    expect(result).toContain('part2');
  });

  it('falls back to JSON.stringify for unknown object shape', () => {
    const input = { foo: 'bar', count: 42 };
    const result = o.buildPrompt('intent-analysis', input);
    expect(result).toContain('bar');
    expect(result).toContain('42');
  });
});

// ─── prepareMessages ──────────────────────────────────────────────────────────

describe('prepareMessages', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('returns single user message for plain string prompt', () => {
    const msgs = o.prepareMessages('hello', {});
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('hello');
  });

  it('returns two-element array for system+message input', () => {
    const msgs = o.prepareMessages('ignored', { system: 'SYS', message: 'MSG' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'MSG' });
  });

  it('preserves structured messages array from input', () => {
    const input = {
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
        { role: 'assistant', content: 'ast' },
      ],
    };
    const msgs = o.prepareMessages('ignored', input);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[2].role).toBe('assistant');
  });

  it('normalises unknown roles to user', () => {
    const input = { messages: [{ role: 'unknown', content: 'x' }] };
    const msgs = o.prepareMessages('ignored', input);
    expect(msgs[0].role).toBe('user');
  });
});

// ─── postprocessResult ────────────────────────────────────────────────────────

describe('postprocessResult', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('parses a valid JSON object string', () => {
    const result = o.postprocessResult('intent-analysis', '{"foo":"bar"}');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('parses a valid JSON array string', () => {
    const result = o.postprocessResult('intent-analysis', '[1,2,3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns non-JSON string unchanged', () => {
    const result = o.postprocessResult('intent-analysis', 'plain text');
    expect(result).toBe('plain text');
  });

  it('returns invalid-JSON string unchanged', () => {
    const result = o.postprocessResult('intent-analysis', '{broken json}');
    expect(typeof result).toBe('string');
    expect(result).toContain('broken');
  });

  it('unwraps content wrapper', () => {
    const result = o.postprocessResult('intent-analysis', { content: 'unwrapped' });
    expect(result).toBe('unwrapped');
  });

  it('unwraps text wrapper', () => {
    const result = o.postprocessResult('intent-analysis', { text: 'text-value' });
    expect(result).toBe('text-value');
  });

  it('passes through plain object with no recognised wrapper', () => {
    const obj = { arbitrary: 'data' };
    const result = o.postprocessResult('intent-analysis', obj);
    expect(result).toEqual(obj);
  });
});

// ─── getCacheKey ──────────────────────────────────────────────────────────────

describe('getCacheKey', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('starts with gemini:', () => {
    const key = o.getCacheKey('intent-analysis', 'hello');
    expect(key.startsWith('gemini:')).toBe(true);
  });

  it('includes the request type', () => {
    const key = o.getCacheKey('intent-analysis', 'hello');
    expect(key).toContain('intent-analysis');
  });

  it('produces different keys for different types', () => {
    const k1 = o.getCacheKey('intent-analysis', 'hello');
    const k2 = o.getCacheKey('workflow-generation', 'hello');
    expect(k1).not.toBe(k2);
  });

  it('produces different keys for different inputs', () => {
    const k1 = o.getCacheKey('intent-analysis', 'hello');
    const k2 = o.getCacheKey('intent-analysis', 'world');
    expect(k1).not.toBe(k2);
  });

  it('produces same key for identical type+input', () => {
    const k1 = o.getCacheKey('intent-analysis', 'same');
    const k2 = o.getCacheKey('intent-analysis', 'same');
    expect(k1).toBe(k2);
  });
});

// ─── cache management ─────────────────────────────────────────────────────────

describe('cache management', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('getCacheStats returns size 0 for fresh instance', () => {
    expect(o.getCacheStats().size).toBe(0);
  });

  it('clearCache empties the cache', () => {
    // Manually inject a cache entry
    o.cache.set('test-key', { result: 'x', timestamp: Date.now() });
    expect(o.getCacheStats().size).toBe(1);
    o.clearCache();
    expect(o.getCacheStats().size).toBe(0);
  });

  it('getCacheStats returns an object with size and hitRate', () => {
    const stats = o.getCacheStats();
    expect(typeof stats.size).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
  });
});

// ─── initializeModelPerformance / getPerformanceMetrics ──────────────────────

describe('initializeModelPerformance and getPerformanceMetrics', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('creates an entry for every Gemini model', () => {
    const metrics = o.getPerformanceMetrics();
    for (const model of GEMINI_MODELS) {
      expect(metrics.has(model)).toBe(true);
    }
  });

  it('initialises usageCount to 0', () => {
    const metrics = o.getPerformanceMetrics();
    for (const model of GEMINI_MODELS) {
      expect(metrics.get(model).usageCount).toBe(0);
    }
  });

  it('initialises successRate to 100', () => {
    const metrics = o.getPerformanceMetrics();
    for (const model of GEMINI_MODELS) {
      expect(metrics.get(model).successRate).toBe(100);
    }
  });

  it('getPerformanceMetrics returns a copy (not the internal map)', () => {
    const m1 = o.getPerformanceMetrics();
    const m2 = o.getPerformanceMetrics();
    expect(m1).not.toBe(m2); // different Map instances
  });
});

// ─── updateModelPerformance ───────────────────────────────────────────────────

describe('updateModelPerformance', () => {
  let o: any;
  beforeEach(() => { o = make(); });

  it('increments usageCount on each call', () => {
    o.updateModelPerformance(GEMINI_DEFAULT_MODEL, 100, true);
    o.updateModelPerformance(GEMINI_DEFAULT_MODEL, 200, true);
    const m = o.getPerformanceMetrics().get(GEMINI_DEFAULT_MODEL);
    expect(m.usageCount).toBe(2);
  });

  it('success call updates averageLatency', () => {
    o.updateModelPerformance(GEMINI_DEFAULT_MODEL, 100, true);
    const m = o.getPerformanceMetrics().get(GEMINI_DEFAULT_MODEL);
    expect(m.averageLatency).toBe(100);
  });

  it('failure call lowers successRate', () => {
    // Two calls: first success (50%), then failure (50%)
    o.updateModelPerformance(GEMINI_DEFAULT_MODEL, 100, true);
    o.updateModelPerformance(GEMINI_DEFAULT_MODEL, 100, false);
    const m = o.getPerformanceMetrics().get(GEMINI_DEFAULT_MODEL);
    expect(m.successRate).toBeLessThan(100);
  });

  it('ignores unknown model gracefully', () => {
    expect(() => o.updateModelPerformance('nonexistent-model', 100, true)).not.toThrow();
  });
});
