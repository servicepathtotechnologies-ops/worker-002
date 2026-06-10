import {
  stripSystemKeys,
  stripRoutingMeta,
  SYSTEM_META_KEYS,
  ROUTING_INTERNAL_KEYS,
} from '../system-key-filter';

describe('system-key-filter', () => {
  describe('stripSystemKeys', () => {
    it('returns empty object for null', () => {
      expect(stripSystemKeys(null)).toEqual({});
    });

    it('returns empty object for undefined', () => {
      expect(stripSystemKeys(undefined)).toEqual({});
    });

    it('returns empty object for a non-object primitive', () => {
      expect(stripSystemKeys('hello')).toEqual({});
      expect(stripSystemKeys(42)).toEqual({});
    });

    it('returns empty object for an array', () => {
      expect(stripSystemKeys(['a', 'b'])).toEqual({});
    });

    it('removes __ prefixed keys', () => {
      const result = stripSystemKeys({ __audit: true, __debug: 'x', value: 1 });
      expect(result).toEqual({ value: 1 });
    });

    it('removes SYSTEM_META_KEYS members', () => {
      const payload: Record<string, unknown> = {
        nodeId: 'n1',
        nodeType: 'manual_trigger',
        rollout: {},
        kpis: [],
        runtimeMarker: 'x',
        data: 'keep me',
      };
      const result = stripSystemKeys(payload);
      expect(result).toEqual({ data: 'keep me' });
    });

    it('keeps business data keys untouched', () => {
      const result = stripSystemKeys({ email: 'a@b.com', subject: 'Hi', body: 'Hello' });
      expect(result).toEqual({ email: 'a@b.com', subject: 'Hi', body: 'Hello' });
    });

    it('strips all known SYSTEM_META_KEYS', () => {
      const payload: Record<string, unknown> = {};
      for (const key of SYSTEM_META_KEYS) {
        payload[key] = 'value';
      }
      expect(stripSystemKeys(payload)).toEqual({});
    });

    it('does not strip keys that are substrings of system keys', () => {
      const result = stripSystemKeys({ nodeIds: ['n1'], runtimeMarkerId: 'x' });
      expect(result).toEqual({ nodeIds: ['n1'], runtimeMarkerId: 'x' });
    });

    it('does not recursively strip nested objects', () => {
      const result = stripSystemKeys({
        user: { nodeId: 'inner', email: 'x@y.com' },
        name: 'outer',
      });
      expect(result).toEqual({
        user: { nodeId: 'inner', email: 'x@y.com' },
        name: 'outer',
      });
    });

    it('returns empty object for an empty input object', () => {
      expect(stripSystemKeys({})).toEqual({});
    });

    it('strips both __ keys and SYSTEM_META_KEYS in one pass', () => {
      const result = stripSystemKeys({
        __trace: 'debug',
        nodeId: 'n1',
        capturedAt: 1000,
        userId: 'u1',
        payload: { ok: true },
      });
      expect(result).toEqual({ userId: 'u1', payload: { ok: true } });
    });
  });

  describe('stripRoutingMeta', () => {
    it('removes ROUTING_INTERNAL_KEYS members', () => {
      const result = stripRoutingMeta({
        expression: '{{x > 0}}',
        expressionValue: true,
        cases: [],
        answer: 42,
      });
      expect(result).toEqual({ answer: 42 });
    });

    it('keeps business data untouched when no routing keys present', () => {
      const result = stripRoutingMeta({ email: 'a@b.com', count: 3 });
      expect(result).toEqual({ email: 'a@b.com', count: 3 });
    });

    it('strips all known ROUTING_INTERNAL_KEYS', () => {
      const payload: Record<string, unknown> = {};
      for (const key of ROUTING_INTERNAL_KEYS) {
        payload[key] = 'value';
      }
      expect(stripRoutingMeta(payload)).toEqual({});
    });

    it('returns empty object when only routing keys are present', () => {
      expect(stripRoutingMeta({ matchedCase: 'A', matchedLabel: 'Branch A' })).toEqual({});
    });

    it('returns empty object for an empty input', () => {
      expect(stripRoutingMeta({})).toEqual({});
    });

    it('handles _switchRecoveredVia key', () => {
      const result = stripRoutingMeta({ _switchRecoveredVia: 'fallback', result: 'ok' });
      expect(result).toEqual({ result: 'ok' });
    });

    it('does not strip keys that are substrings of routing keys', () => {
      const result = stripRoutingMeta({ expressionId: 'x', conditionKey: 'y', data: 1 });
      expect(result).toEqual({ expressionId: 'x', conditionKey: 'y', data: 1 });
    });
  });

  describe('constant sets', () => {
    it('SYSTEM_META_KEYS contains expected entries', () => {
      expect(SYSTEM_META_KEYS.has('nodeId')).toBe(true);
      expect(SYSTEM_META_KEYS.has('nodeType')).toBe(true);
      expect(SYSTEM_META_KEYS.has('runtimeMarker')).toBe(true);
      expect(SYSTEM_META_KEYS.has('schemaValidationFailures')).toBe(true);
    });

    it('ROUTING_INTERNAL_KEYS contains expected entries', () => {
      expect(ROUTING_INTERNAL_KEYS.has('expression')).toBe(true);
      expect(ROUTING_INTERNAL_KEYS.has('cases')).toBe(true);
      expect(ROUTING_INTERNAL_KEYS.has('matchedCase')).toBe(true);
      expect(ROUTING_INTERNAL_KEYS.has('condition_result')).toBe(true);
    });
  });
});
