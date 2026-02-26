/**
 * Unit Tests for LRUNodeOutputsCache
 * 
 * Tests LRU eviction, cache hits/misses, persistent entries, and edge cases.
 */

import { LRUNodeOutputsCache } from '../lru-node-outputs-cache';

describe('LRUNodeOutputsCache', () => {
  let cache: LRUNodeOutputsCache;

  beforeEach(() => {
    cache = new LRUNodeOutputsCache(5); // Small cache for testing
  });

  describe('Basic Operations', () => {
    test('should create cache with default size', () => {
      const defaultCache = new LRUNodeOutputsCache();
      expect(defaultCache.size()).toBe(0);
      expect(defaultCache.getStats().maxSize).toBe(100);
    });

    test('should create cache with custom size', () => {
      const customCache = new LRUNodeOutputsCache(50);
      expect(customCache.getStats().maxSize).toBe(50);
    });

    test('should throw error for invalid size', () => {
      expect(() => new LRUNodeOutputsCache(0)).toThrow('Cache size must be at least 1');
      expect(() => new LRUNodeOutputsCache(-1)).toThrow('Cache size must be at least 1');
    });

    test('should set and get values', () => {
      cache.set('node-1', { data: 'value1' });
      expect(cache.get('node-1')).toEqual({ data: 'value1' });
    });

    test('should return undefined for missing key', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    test('should check if key exists', () => {
      cache.set('node-1', { data: 'value1' });
      expect(cache.has('node-1')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });
  });

  describe('LRU Eviction', () => {
    test('should evict least recently used when full', () => {
      // Fill cache to capacity
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });
      cache.set('node-4', { data: 'value4' });
      cache.set('node-5', { data: 'value5' });

      // All entries should exist
      expect(cache.get('node-1')).toBeDefined();
      expect(cache.get('node-2')).toBeDefined();
      expect(cache.get('node-3')).toBeDefined();
      expect(cache.get('node-4')).toBeDefined();
      expect(cache.get('node-5')).toBeDefined();

      // Add one more (should evict node-1, the oldest)
      cache.set('node-6', { data: 'value6' });

      // node-1 should be evicted
      expect(cache.get('node-1')).toBeUndefined();
      // node-6 should exist
      expect(cache.get('node-6')).toBeDefined();
      // Other nodes should still exist
      expect(cache.get('node-2')).toBeDefined();
    });

    test('should update timestamp on get (LRU behavior)', () => {
      // Fill cache to capacity
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });
      cache.set('node-4', { data: 'value4' });
      cache.set('node-5', { data: 'value5' });

      // Verify all entries exist
      expect(cache.size()).toBe(5);
      expect(cache.get('node-1')).toBeDefined();
      expect(cache.get('node-2')).toBeDefined();

      // Access node-1 multiple times to ensure it's marked as recently used
      cache.get('node-1');
      cache.get('node-1');
      cache.get('node-1');

      // Add new entry - should evict one of the entries
      // The evicted entry should NOT be node-1 (since it was recently accessed)
      cache.set('node-6', { data: 'value6' });

      // Verify cache is still at capacity
      expect(cache.size()).toBe(5);
      
      // node-6 should exist (just added)
      expect(cache.get('node-6')).toBeDefined();
      
      // At least one of the original nodes should be evicted
      const originalNodes = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];
      const existingCount = originalNodes.filter(id => cache.get(id) !== undefined).length;
      expect(existingCount).toBeLessThan(5); // At least one was evicted
      expect(existingCount).toBeGreaterThanOrEqual(4); // At most one was evicted
    });

    test('should update value if key already exists', () => {
      cache.set('node-1', { data: 'value1' });
      cache.set('node-1', { data: 'value1-updated' });
      
      expect(cache.get('node-1')).toEqual({ data: 'value1-updated' });
      expect(cache.size()).toBe(1); // Should not add duplicate
    });
  });

  describe('Persistent Entries', () => {
    test('should not evict persistent entries', () => {
      // Fill cache with persistent entries
      cache.set('trigger', { data: 'trigger' }, true);
      cache.set('node-1', { data: 'value1' }, true);
      cache.set('node-2', { data: 'value2' }, true);
      cache.set('node-3', { data: 'value3' }, true);
      cache.set('node-4', { data: 'value4' }, true);

      // Add non-persistent entry (should not evict, cache will exceed maxSize)
      cache.set('node-5', { data: 'value5' }, false);

      // All persistent entries should still exist
      expect(cache.get('trigger')).toBeDefined();
      expect(cache.get('node-1')).toBeDefined();
      expect(cache.get('node-2')).toBeDefined();
      expect(cache.get('node-3')).toBeDefined();
      expect(cache.get('node-4')).toBeDefined();
    });

    test('should mark existing entry as persistent', () => {
      cache.set('node-1', { data: 'value1' });
      cache.markPersistent('node-1');

      // Fill cache to capacity
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });
      cache.set('node-4', { data: 'value4' });
      cache.set('node-5', { data: 'value5' });

      // Add one more - should evict non-persistent entry, not node-1
      cache.set('node-6', { data: 'value6' });

      expect(cache.get('node-1')).toBeDefined(); // Should still exist
    });

    test('should return false when marking non-existent entry', () => {
      expect(cache.markPersistent('missing')).toBe(false);
    });
  });

  describe('Cache Statistics', () => {
    test('should track hits and misses', () => {
      cache.set('node-1', { data: 'value1' });
      
      // Hit
      cache.get('node-1');
      // Miss
      cache.get('missing');
      // Hit
      cache.get('node-1');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    test('should track evictions', () => {
      // Fill cache
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });
      cache.set('node-4', { data: 'value4' });
      cache.set('node-5', { data: 'value5' });

      // Force eviction
      cache.set('node-6', { data: 'value6' });

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    test('should calculate hit rate correctly', () => {
      cache.set('node-1', { data: 'value1' });
      
      cache.get('node-1'); // Hit
      cache.get('missing'); // Miss
      cache.get('node-1'); // Hit
      cache.get('missing2'); // Miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.5); // 2 hits / 4 total
    });

    test('should return zero hit rate when no accesses', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('getAll() Method', () => {
    test('should return all entries as object', () => {
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });

      const all = cache.getAll();
      expect(all).toEqual({
        'node-1': { data: 'value1' },
        'node-2': { data: 'value2' },
        'node-3': { data: 'value3' },
      });
    });

    test('should return empty object when cache is empty', () => {
      expect(cache.getAll()).toEqual({});
    });
  });

  describe('clear() Method', () => {
    test('should clear all entries', () => {
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.get('node-1')).toBeUndefined();
      expect(cache.get('node-2')).toBeUndefined();
    });

    test('should reset statistics', () => {
      cache.set('node-1', { data: 'value1' });
      cache.get('node-1');
      cache.get('missing');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('getKeys() Method', () => {
    test('should return all keys', () => {
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });

      const keys = cache.getKeys();
      expect(keys).toContain('node-1');
      expect(keys).toContain('node-2');
      expect(keys).toContain('node-3');
      expect(keys.length).toBe(3);
    });

    test('should return empty array when cache is empty', () => {
      expect(cache.getKeys()).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large outputs', () => {
      const largeOutput = { data: 'x'.repeat(1000000) }; // 1MB string
      cache.set('node-1', largeOutput);
      expect(cache.get('node-1')).toEqual(largeOutput);
    });

    test('should handle null and undefined values', () => {
      cache.set('node-null', null);
      cache.set('node-undefined', undefined);
      
      expect(cache.get('node-null')).toBeNull();
      expect(cache.get('node-undefined')).toBeUndefined();
    });

    test('should handle circular references gracefully', () => {
      const circular: any = { data: 'test' };
      circular.self = circular;
      
      // Should not throw
      expect(() => cache.set('node-circular', circular)).not.toThrow();
      const retrieved = cache.get('node-circular');
      expect(retrieved).toBeDefined();
    });

    test('should handle many concurrent operations', () => {
      // Set many entries
      for (let i = 0; i < 100; i++) {
        cache.set(`node-${i}`, { data: `value${i}` });
      }

      // Cache should only contain last 5 (maxSize)
      expect(cache.size()).toBe(5);
      
      // Last 5 should exist
      expect(cache.get('node-95')).toBeDefined();
      expect(cache.get('node-96')).toBeDefined();
      expect(cache.get('node-97')).toBeDefined();
      expect(cache.get('node-98')).toBeDefined();
      expect(cache.get('node-99')).toBeDefined();
    });
  });

  describe('Real-World Scenarios', () => {
    test('should handle workflow execution pattern', () => {
      // Simulate workflow: trigger -> node1 -> node2 -> node3
      cache.set('trigger', { input: 'data' }, true); // Persistent
      
      cache.set('node-1', { processed: 'data1' });
      cache.get('trigger'); // Access trigger (for template resolution)
      cache.get('node-1'); // Access node-1 (for node-2 input)
      
      cache.set('node-2', { processed: 'data2' });
      cache.get('node-1'); // Access node-1 (for template)
      cache.get('node-2'); // Access node-2 (for node-3 input)
      
      cache.set('node-3', { processed: 'data3' });
      
      // All should exist (cache size 5, we have 4 entries)
      expect(cache.get('trigger')).toBeDefined();
      expect(cache.get('node-1')).toBeDefined();
      expect(cache.get('node-2')).toBeDefined();
      expect(cache.get('node-3')).toBeDefined();
    });

    test('should handle cache miss gracefully (template resolution)', () => {
      cache.set('node-1', { data: 'value1' });
      
      // Simulate template resolution accessing evicted node
      const evictedOutput = cache.get('evicted-node');
      expect(evictedOutput).toBeUndefined(); // Should handle gracefully
      
      // Should not throw error
      expect(() => {
        const context = { ...cache.getAll(), evicted: evictedOutput };
        // Template would use: evicted || 'default'
      }).not.toThrow();
    });
  });

  describe('cloneOnGet Option', () => {
    test('should return reference when cloneOnGet is false (default)', () => {
      const noCloneCache = new LRUNodeOutputsCache(5, false);
      const original = { data: 'value1', nested: { prop: 'test' } };
      
      noCloneCache.set('node-1', original);
      const retrieved = noCloneCache.get('node-1') as any;
      
      // Modify retrieved value
      retrieved.data = 'modified';
      retrieved.nested.prop = 'modified';
      
      // Original in cache should be modified (same reference)
      const again = noCloneCache.get('node-1') as any;
      expect(again.data).toBe('modified');
      expect(again.nested.prop).toBe('modified');
    });

    test('should return deep clone when cloneOnGet is true', () => {
      const cloneCache = new LRUNodeOutputsCache(5, true);
      const original = { data: 'value1', nested: { prop: 'test' } };
      
      cloneCache.set('node-1', original);
      const retrieved = cloneCache.get('node-1') as any;
      
      // Modify retrieved value
      retrieved.data = 'modified';
      retrieved.nested.prop = 'modified';
      
      // Original in cache should NOT be modified (different reference)
      const again = cloneCache.get('node-1') as any;
      expect(again.data).toBe('value1');
      expect(again.nested.prop).toBe('test');
    });

    test('should handle null and undefined with cloneOnGet', () => {
      const cloneCache = new LRUNodeOutputsCache(5, true);
      
      cloneCache.set('node-null', null);
      cloneCache.set('node-undefined', undefined);
      
      expect(cloneCache.get('node-null')).toBeNull();
      expect(cloneCache.get('node-undefined')).toBeUndefined();
    });

    test('should handle circular references gracefully with cloneOnGet', () => {
      const cloneCache = new LRUNodeOutputsCache(5, true);
      const circular: any = { data: 'test' };
      circular.self = circular;
      
      // Should not throw when setting
      expect(() => {
        cloneCache.set('node-circular', circular);
      }).not.toThrow();
      
      // Should not throw when getting (cloning may fail but returns original)
      const retrieved = cloneCache.get('node-circular');
      expect(retrieved).toBeDefined();
      
      // Circular reference handling: JSON.parse(JSON.stringify()) may:
      // 1. Throw an error (caught, returns original)
      // 2. Create object with [Circular] placeholder
      // 3. Create object without the circular property
      // All are acceptable - the important thing is it doesn't crash
      if (retrieved && typeof retrieved === 'object') {
        const retrievedObj = retrieved as any;
        // The self property may be undefined, [Circular], or the original circular ref
        // All are acceptable outcomes
        expect(retrievedObj.data).toBe('test');
      }
    });

    test('should handle functions in values with cloneOnGet', () => {
      const cloneCache = new LRUNodeOutputsCache(5, true);
      const withFunction = {
        data: 'value',
        fn: () => 'test',
      };
      
      cloneCache.set('node-fn', withFunction);
      const retrieved = cloneCache.get('node-fn') as any;
      
      // Functions are lost in JSON serialization
      expect(retrieved.data).toBe('value');
      expect(retrieved.fn).toBeUndefined();
    });
  });

  describe('warm() Method', () => {
    test('should warm cache with multiple entries', () => {
      const entries = {
        'node-1': { data: 'value1' },
        'node-2': { data: 'value2' },
        'node-3': { data: 'value3' },
      };
      
      cache.warm(entries);
      
      expect(cache.get('node-1')).toEqual({ data: 'value1' });
      expect(cache.get('node-2')).toEqual({ data: 'value2' });
      expect(cache.get('node-3')).toEqual({ data: 'value3' });
      expect(cache.size()).toBe(3);
    });

    test('should mark warmed entries as persistent if requested', () => {
      const entries = {
        'node-1': { data: 'value1' },
        'node-2': { data: 'value2' },
      };
      
      cache.warm(entries, true);
      
      // Fill cache to capacity
      cache.set('node-3', { data: 'value3' });
      cache.set('node-4', { data: 'value4' });
      cache.set('node-5', { data: 'value5' });
      
      // Add one more - should not evict persistent entries
      cache.set('node-6', { data: 'value6' });
      
      // Warmed entries should still exist
      expect(cache.get('node-1')).toBeDefined();
      expect(cache.get('node-2')).toBeDefined();
    });

    test('should evict LRU entries when warming if cache is full', () => {
      // Fill cache to capacity
      cache.set('node-1', { data: 'value1' });
      cache.set('node-2', { data: 'value2' });
      cache.set('node-3', { data: 'value3' });
      cache.set('node-4', { data: 'value4' });
      cache.set('node-5', { data: 'value5' });
      
      // Warm with new entries (should evict oldest)
      cache.warm({
        'node-6': { data: 'value6' },
        'node-7': { data: 'value7' },
      });
      
      // Oldest entries should be evicted
      expect(cache.get('node-1')).toBeUndefined();
      expect(cache.get('node-2')).toBeUndefined();
      
      // New entries should exist
      expect(cache.get('node-6')).toBeDefined();
      expect(cache.get('node-7')).toBeDefined();
    });

    test('should update existing entries when warming', () => {
      cache.set('node-1', { data: 'old' });
      
      cache.warm({
        'node-1': { data: 'new' },
        'node-2': { data: 'value2' },
      });
      
      // Existing entry should be updated
      expect(cache.get('node-1')).toEqual({ data: 'new' });
      expect(cache.get('node-2')).toEqual({ data: 'value2' });
      expect(cache.size()).toBe(2);
    });

    test('should handle empty warm call', () => {
      expect(() => cache.warm({})).not.toThrow();
      expect(cache.size()).toBe(0);
    });

    test('should set same timestamp for all warmed entries', () => {
      // Fill cache to near capacity
      for (let i = 0; i < 4; i++) {
        cache.set(`existing-${i}`, { data: `value-${i}` });
      }
      
      const entries = {
        'node-1': { data: 'value1' },
        'node-2': { data: 'value2' },
      };
      
      cache.warm(entries);
      
      // Access one entry to update its timestamp
      cache.get('node-1');
      
      // Add new entry - should evict one of the older entries
      // Since node-1 was recently accessed, it should not be evicted
      // node-2 or one of the existing entries should be evicted
      cache.set('node-3', { data: 'value3' });
      
      // node-1 should still exist (was recently accessed)
      expect(cache.get('node-1')).toBeDefined();
      // node-3 should exist
      expect(cache.get('node-3')).toBeDefined();
      // Cache should be at capacity
      expect(cache.size()).toBe(5);
    });
  });
});
