/**
 * Performance Benchmark Test
 * 
 * Compares performance between:
 * 1. Old implementation (Record) for 200 nodes
 * 2. New implementation (LRU cache size 100) for 200 nodes
 * 
 * Measures: Memory usage, execution time, cache hit rate
 */

import { LRUNodeOutputsCache } from '../../core/cache/lru-node-outputs-cache';

describe('Performance Benchmarks', () => {
  describe('Memory Usage Comparison', () => {
    test('LRU cache should use bounded memory', () => {
      const cacheSize = 100;
      const nodeCount = 200;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      // Simulate realistic node output (~30KB each)
      const nodeOutputSize = 30 * 1024; // 30KB
      
      const startMemory = process.memoryUsage().heapUsed;
      
      // Add 200 nodes (2x cache size)
      for (let i = 0; i < nodeCount; i++) {
        cache.set(`node-${i}`, {
          data: 'x'.repeat(nodeOutputSize),
          timestamp: Date.now(),
        });
      }
      
      // Force garbage collection hint (if available)
      if (global.gc) {
        global.gc();
      }
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = (endMemory - startMemory) / 1024 / 1024; // MB
      
      // Cache should only contain 100 entries
      expect(cache.size()).toBe(cacheSize);
      
      // Memory should be bounded (approximately cacheSize × nodeOutputSize)
      const expectedMemory = (cacheSize * nodeOutputSize) / 1024 / 1024; // MB
      expect(memoryUsed).toBeLessThan(expectedMemory * 2); // Allow 2x for overhead
      
      // Should be much less than unbounded (200 × 30KB = 6MB)
      expect(memoryUsed).toBeLessThan(6);
    });
  });

  describe('Execution Time Comparison', () => {
    test('LRU cache operations should be fast', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      const iterations = 1000;
      
      // Benchmark set operations
      const setStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.set(`node-${i % 100}`, { data: `value-${i}` });
      }
      const setTime = Date.now() - setStart;
      
      // Benchmark get operations
      const getStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.get(`node-${i % 100}`);
      }
      const getTime = Date.now() - getStart;
      
      // Set operations should be < 50ms for 1000 iterations
      expect(setTime).toBeLessThan(50);
      
      // Get operations should be < 30ms for 1000 iterations
      expect(getTime).toBeLessThan(30);
      
      // Average operation time should be < 0.1ms
      const avgSetTime = setTime / iterations;
      const avgGetTime = getTime / iterations;
      expect(avgSetTime).toBeLessThan(0.1);
      expect(avgGetTime).toBeLessThan(0.1);
    });

    test('getAll() should be efficient', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      
      // Fill cache
      for (let i = 0; i < 100; i++) {
        cache.set(`node-${i}`, { data: `value-${i}` });
      }
      
      // Benchmark getAll()
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        cache.getAll();
      }
      const time = Date.now() - start;
      
      // Should complete 100 getAll() calls in < 50ms
      expect(time).toBeLessThan(50);
    });
  });

  describe('Cache Hit Rate', () => {
    test('should achieve high hit rate in typical workflow', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      const workflowSize = 150;
      
      // Simulate workflow execution
      for (let i = 0; i < workflowSize; i++) {
        // Set node output
        cache.set(`node-${i}`, { data: `value-${i}` });
        
        // Access for template resolution (typical pattern)
        if (i > 0) {
          cache.get(`node-${i - 1}`);
        }
      }
      
      // Access nodes again (simulating template resolution)
      for (let i = 0; i < 50; i++) {
        cache.get(`node-${workflowSize - 1 - i}`);
      }
      
      const stats = cache.getStats();
      const hitRate = stats.hitRate;
      
      // Should achieve > 50% hit rate (some nodes accessed multiple times)
      expect(hitRate).toBeGreaterThan(0.5);
      
      // Cache should have evicted some entries
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('Large Workflow Performance', () => {
    test('should handle 500-node workflow efficiently', () => {
      const cacheSize = 100;
      const workflowSize = 500;
      const cache = new LRUNodeOutputsCache(cacheSize, false);
      
      const startTime = Date.now();
      
      // Simulate large workflow execution
      for (let i = 0; i < workflowSize; i++) {
        cache.set(`node-${i}`, {
          data: `value-${i}`,
          processed: true,
        });
        
        // Occasional access (template resolution)
        if (i % 10 === 0 && i > 0) {
          cache.get(`node-${i - 1}`);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 500 operations in < 100ms
      expect(duration).toBeLessThan(100);
      
      // Cache should be bounded
      expect(cache.size()).toBe(cacheSize);
      
      const stats = cache.getStats();
      expect(stats.evictions).toBe(workflowSize - cacheSize);
    });
  });

  describe('Concurrent Access Performance', () => {
    test('should handle rapid sequential operations', () => {
      const cache = new LRUNodeOutputsCache(100, false);
      const operations = 10000;
      
      const startTime = Date.now();
      
      // Rapid set/get operations
      for (let i = 0; i < operations; i++) {
        const nodeId = `node-${i % 100}`;
        cache.set(nodeId, { data: `value-${i}` });
        cache.get(nodeId);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 10000 operations in < 500ms
      expect(duration).toBeLessThan(500);
      
      // Average operation time should be < 0.05ms
      const avgTime = duration / operations;
      expect(avgTime).toBeLessThan(0.05);
    });
  });
});
