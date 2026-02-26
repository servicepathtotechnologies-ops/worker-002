/**
 * Edge Case Tests for LRU Cache Integration
 * 
 * Tests edge cases and boundary conditions:
 * - Minimum cache size (1)
 * - Large cache size (1000)
 * - Resume from logs with warm()
 * - Template resolution with evicted nodes
 * - Concurrent workflow execution
 */

import { LRUNodeOutputsCache } from '../../core/cache/lru-node-outputs-cache';

describe('LRU Cache Edge Cases', () => {
  describe('Minimum Cache Size', () => {
    test('should work with cache size 1', () => {
      const cache = new LRUNodeOutputsCache(1, false);
      
      // Set first entry
      cache.set('node-1', { data: 'value1' });
      expect(cache.get('node-1')).toBeDefined();
      
      // Set second entry - should evict first
      cache.set('node-2', { data: 'value2' });
      expect(cache.get('node-1')).toBeUndefined();
      expect(cache.get('node-2')).toBeDefined();
      
      // Access node-2, then add node-3
      cache.get('node-2');
      cache.set('node-3', { data: 'value3' });
      
      // node-2 should be evicted (was accessed but node-3 is newer)
      expect(cache.get('node-2')).toBeUndefined();
      expect(cache.get('node-3')).toBeDefined();
    });

    test('should handle persistent entry with cache size 1', () => {
      const cache = new LRUNodeOutputsCache(1, false);
      
      // Set persistent entry
      cache.set('trigger', { input: 'data' }, true);
      
      // Try to add another entry
      cache.set('node-1', { data: 'value1' });
      
      // Trigger should still exist (persistent)
      expect(cache.get('trigger')).toBeDefined();
      
      // Cache may exceed maxSize if all entries are persistent
      expect(cache.size()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Large Cache Size', () => {
    test('should handle cache size 1000 efficiently', () => {
      const cacheSize = 1000;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      const startTime = Date.now();
      
      // Fill large cache
      for (let i = 0; i < cacheSize; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      const fillTime = Date.now() - startTime;
      
      // Should fill 1000 entries in < 200ms
      expect(fillTime).toBeLessThan(200);
      
      // All entries should exist
      expect(cache.size()).toBe(cacheSize);
      expect(cache.get('node-0')).toBeDefined();
      expect(cache.get(`node-${cacheSize - 1}`)).toBeDefined();
    });

    test('should evict correctly with large cache', () => {
      const cacheSize = 1000;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Fill cache
      for (let i = 0; i < cacheSize; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      // Add one more - should evict first entry
      cache.set('node-1000', { data: 'value-1000' });
      
      expect(cache.get('node-0')).toBeUndefined();
      expect(cache.get('node-1000')).toBeDefined();
      expect(cache.size()).toBe(cacheSize);
    });
  });

  describe('Resume from Logs', () => {
    test('should warm cache with logs efficiently', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      // Simulate logs from previous execution
      const logs = Array.from({ length: 50 }, (_, i) => ({
        nodeId: `node-${i + 1}`,
        output: { processed: `data-${i + 1}` },
      }));
      
      const restoredOutputs: Record<string, unknown> = {};
      logs.forEach(log => {
        restoredOutputs[log.nodeId] = log.output;
      });
      
      const startTime = Date.now();
      cache.warm(restoredOutputs);
      const warmTime = Date.now() - startTime;
      
      // Should warm 50 entries in < 50ms
      expect(warmTime).toBeLessThan(50);
      
      // All entries should be accessible
      expect(cache.size()).toBe(50);
      logs.forEach(log => {
        expect(cache.get(log.nodeId)).toBeDefined();
      });
    });

    test('should handle warm() with existing entries', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      // Set some existing entries
      cache.set('node-1', { data: 'old' });
      cache.set('node-2', { data: 'old' });
      
      // Warm with overlapping entries
      cache.warm({
        'node-2': { data: 'new' },
        'node-3': { data: 'new' },
      });
      
      // node-2 should be updated
      expect(cache.get('node-2')).toEqual({ data: 'new' });
      
      // node-3 should be added
      expect(cache.get('node-3')).toBeDefined();
      
      // node-1 should still exist
      expect(cache.get('node-1')).toBeDefined();
    });
  });

  describe('Template Resolution with Evicted Nodes', () => {
    test('should handle undefined gracefully in getAll()', () => {
      const cache = new LRUNodeOutputsCache(5, false);
      
      // Fill cache beyond limit
      for (let i = 0; i < 10; i++) {
        cache.set(`node-${i}`, { field: `value-${i}` });
      }
      
      // Early nodes should be evicted
      expect(cache.get('node-0')).toBeUndefined();
      
      // getAll() should only return current entries
      const all = cache.getAll();
      expect(all['node-0']).toBeUndefined();
      expect(all['node-9']).toBeDefined();
      
      // Template resolution should handle undefined
      const context = {
        ...all,
        input: {},
      };
      
      // Accessing evicted node should return undefined
      expect((context as Record<string, unknown>)['node-0']).toBeUndefined();
    });

    test('should handle template variables with evicted nodes', () => {
      const cache = new LRUNodeOutputsCache(10, false);
      
      // Create workflow that will evict early nodes
      for (let i = 0; i < 20; i++) {
        cache.set(`node-${i}`, { field: `value-${i}` });
      }
      
      // node-0 should be evicted
      expect(cache.get('node-0')).toBeUndefined();
      
      // Template context should work
      const context = {
        ...cache.getAll(),
        input: {},
      };
      
      // Template resolution should handle undefined
      // This is expected behavior - templates should use optional chaining
      expect((context as Record<string, unknown>)['node-0']).toBeUndefined();
      expect((context as Record<string, unknown>)['node-19']).toBeDefined();
    });
  });

  describe('Concurrent Workflow Execution', () => {
    test('should maintain separate caches for different workflows', () => {
      const cache1 = new LRUNodeOutputsCache(100, false);
      const cache2 = new LRUNodeOutputsCache(100, false);
      
      // Workflow 1
      cache1.set('trigger', { workflow: 1 }, true);
      cache1.set('node-1', { data: 'workflow1' });
      
      // Workflow 2
      cache2.set('trigger', { workflow: 2 }, true);
      cache2.set('node-1', { data: 'workflow2' });
      
      // Caches should be independent
      expect(cache1.get('node-1')).toEqual({ data: 'workflow1' });
      expect(cache2.get('node-1')).toEqual({ data: 'workflow2' });
      
      // Clearing one shouldn't affect the other
      cache1.clear();
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(2);
    });

    test('should handle rapid cache operations', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      // Simulate rapid operations from concurrent workflows
      const operations: Array<() => void> = [];
      
      for (let i = 0; i < 1000; i++) {
        operations.push(() => {
          cache.set(`node-${i % 100}`, { data: `value-${i}` });
          cache.get(`node-${i % 100}`);
        });
      }
      
      const startTime = Date.now();
      operations.forEach(op => op());
      const duration = Date.now() - startTime;
      
      // Should complete 1000 operations in < 200ms
      expect(duration).toBeLessThan(200);
      
      // Cache should still be bounded
      expect(cache.size()).toBeLessThanOrEqual(100);
    });
  });

  describe('Configuration Validation', () => {
    test('should handle invalid cache size gracefully', () => {
      // Cache constructor should throw for invalid sizes
      expect(() => new LRUNodeOutputsCache(0)).toThrow();
      expect(() => new LRUNodeOutputsCache(-1)).toThrow();
      
      // Valid sizes should work
      expect(() => new LRUNodeOutputsCache(1)).not.toThrow();
      expect(() => new LRUNodeOutputsCache(100)).not.toThrow();
    });

    test('should handle missing environment variable (defaults)', () => {
      // When NODE_OUTPUTS_CACHE_SIZE is not set, should use default 100
      const cache = new LRUNodeOutputsCache(); // Uses default
      expect(cache.getStats().maxSize).toBe(100);
    });
  });

  describe('Cache Statistics Edge Cases', () => {
    test('should handle zero hits/misses', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    test('should calculate hit rate correctly', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      cache.set('node-1', { data: 'value1' });
      
      // 2 hits, 1 miss
      cache.get('node-1'); // Hit
      cache.get('node-1'); // Hit
      cache.get('missing'); // Miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });
  });
});
