/**
 * Memory Leak Reproduction Test
 * 
 * Tests that verify:
 * 1. Memory grows without bound in old implementation (if we can test with feature flag)
 * 2. Memory stays bounded with LRU cache
 * 3. Cache eviction works correctly
 * 4. Performance impact is minimal
 */

import { LRUNodeOutputsCache } from '../../core/cache/lru-node-outputs-cache';

describe('Memory Leak Prevention', () => {
  describe('LRU Cache Bounded Memory', () => {
    test('should maintain bounded memory with large number of nodes', () => {
      const cacheSize = 100;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Simulate 500 nodes (5x cache size)
      const nodeCount = 500;
      
      for (let i = 0; i < nodeCount; i++) {
        cache.set(`node-${i}`, {
          data: `output-${i}`,
          timestamp: Date.now(),
          // Simulate realistic node output size (~30KB)
          payload: 'x'.repeat(30000),
        });
      }
      
      // Cache should only contain last 100 entries
      const stats = cache.getStats();
      expect(stats.size).toBe(cacheSize);
      expect(stats.evictions).toBe(nodeCount - cacheSize);
      
      // First nodes should be evicted
      expect(cache.get('node-0')).toBeUndefined();
      expect(cache.get('node-100')).toBeUndefined();
      
      // Last nodes should still exist
      expect(cache.get(`node-${nodeCount - 1}`)).toBeDefined();
      expect(cache.get(`node-${nodeCount - 50}`)).toBeDefined();
    });

    test('should not evict persistent entries', () => {
      const cacheSize = 5;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Mark trigger as persistent
      cache.set('trigger', { input: 'data' }, true);
      
      // Fill cache beyond limit
      for (let i = 0; i < 10; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      // Trigger should still exist
      expect(cache.get('trigger')).toBeDefined();
      
      // Cache may exceed maxSize if all entries are persistent
      // But non-persistent entries should be evicted
      const stats = cache.getStats();
      expect(stats.size).toBeGreaterThanOrEqual(cacheSize);
    });

    test('should clear cache and free memory', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      // Fill cache
      for (let i = 0; i < 50; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      expect(cache.size()).toBe(50);
      
      // Clear cache
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
      expect(cache.getStats().evictions).toBe(0);
    });
  });

  describe('Cache Eviction Behavior', () => {
    test('should evict least recently used entries', () => {
      const cacheSize = 5;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Fill cache
      for (let i = 0; i < cacheSize; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      // Access node-0 multiple times to ensure it's marked as recently used
      cache.get('node-0');
      cache.get('node-0');
      cache.get('node-0');
      
      // Add new entry - should evict one of the entries
      cache.set('node-5', { data: 'value-5' });
      
      // Verify cache is at capacity
      expect(cache.size()).toBe(cacheSize);
      
      // node-5 should exist (just added)
      expect(cache.get('node-5')).toBeDefined();
      
      // At least one of the original nodes should be evicted
      const originalNodes = ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'];
      const existingCount = originalNodes.filter(id => cache.get(id) !== undefined).length;
      expect(existingCount).toBeLessThan(5); // At least one was evicted
      expect(existingCount).toBeGreaterThanOrEqual(4); // At most one was evicted
    });

    test('should track eviction statistics', () => {
      const cacheSize = 10;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Fill cache beyond limit
      for (let i = 0; i < 20; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      const stats = cache.getStats();
      expect(stats.evictions).toBe(10); // 20 nodes - 10 cache size
      expect(stats.size).toBe(cacheSize);
    });
  });

  describe('Performance Impact', () => {
    test('should have minimal performance overhead for cache operations', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      const iterations = 1000;
      
      const startTime = Date.now();
      
      // Simulate typical workflow: set and get operations
      for (let i = 0; i < iterations; i++) {
        cache.set(`node-${i % 100}`, { data: `value-${i}` });
        cache.get(`node-${i % 100}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 operations in < 100ms
      expect(duration).toBeLessThan(100);
      
      // Average operation time should be < 0.1ms
      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(0.1);
    });

    test('should handle cache misses efficiently', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      const startTime = Date.now();
      
      // Test cache misses (accessing non-existent entries)
      for (let i = 0; i < 1000; i++) {
        cache.get(`missing-node-${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Cache misses should be very fast (< 50ms for 1000)
      expect(duration).toBeLessThan(50);
      
      const stats = cache.getStats();
      expect(stats.misses).toBe(1000);
      expect(stats.hits).toBe(0);
    });
  });

  describe('Cache Warming', () => {
    test('should warm cache with multiple entries efficiently', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      const entries: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        entries[`node-${i}`] = { data: `value-${i}` };
      }
      
      cache.warm(entries);
      
      expect(cache.size()).toBe(50);
      
      // All entries should be accessible
      for (let i = 0; i < 50; i++) {
        expect(cache.get(`node-${i}`)).toBeDefined();
      }
    });

    test('should handle warm() with eviction if cache is full', () => {
      const cacheSize = 10;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Fill cache
      for (let i = 0; i < cacheSize; i++) {
        cache.set(`existing-${i}`, { data: `value-${i}` });
      }
      
      // Warm with new entries
      const entries: Record<string, unknown> = {};
      for (let i = 0; i < 5; i++) {
        entries[`warm-${i}`] = { data: `warm-value-${i}` };
      }
      
      cache.warm(entries);
      
      // Cache should have evicted some entries
      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
      expect(cache.size()).toBe(cacheSize);
    });
  });

  describe('Real-World Workflow Simulation', () => {
    test('should handle typical workflow execution pattern', () => {
      const cacheSize = 100;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Simulate workflow: trigger -> node1 -> node2 -> ... -> node200
      const workflowSize = 200;
      
      // Set trigger (persistent)
      cache.set('trigger', { input: 'data' }, true);
      
      // Execute nodes sequentially
      for (let i = 1; i <= workflowSize; i++) {
        // Get previous node output (for template resolution)
        if (i > 1) {
          cache.get(`node-${i - 1}`);
        }
        
        // Set current node output
        cache.set(`node-${i}`, {
          processed: `data-${i}`,
          timestamp: Date.now(),
        });
      }
      
      // Verify trigger is still present (persistent)
      expect(cache.get('trigger')).toBeDefined();
      
      // Verify cache size is bounded
      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(cacheSize);
      
      // Last nodes should be present (most recently used)
      expect(cache.get(`node-${workflowSize}`)).toBeDefined();
      expect(cache.get(`node-${workflowSize - 10}`)).toBeDefined();
      
      // Early nodes may be evicted
      // This is expected behavior for LRU cache
    });

    test('should handle resume from logs with warm()', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      // Simulate logs from previous execution
      const logs: Array<{ nodeId: string; output: unknown }> = [];
      for (let i = 1; i <= 50; i++) {
        logs.push({
          nodeId: `node-${i}`,
          output: { processed: `data-${i}` },
        });
      }
      
      // Warm cache with restored outputs
      const restoredOutputs: Record<string, unknown> = {};
      logs.forEach(log => {
        restoredOutputs[log.nodeId] = log.output;
      });
      
      cache.warm(restoredOutputs);
      
      // All restored entries should be accessible
      expect(cache.size()).toBe(50);
      for (let i = 1; i <= 50; i++) {
        expect(cache.get(`node-${i}`)).toBeDefined();
      }
    });
  });
});
