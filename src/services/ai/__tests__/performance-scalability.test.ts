/**
 * Performance and Scalability Tests
 * 
 * ✅ PHASE 5: Tests for 1M users scale
 * 
 * Tests:
 * - Registry performance
 * - Intent extraction performance
 * - Workflow generation performance
 * - Memory usage
 * - Concurrent requests
 */

import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { intentExtractor } from '../intent-extractor';
import { intentAwarePlanner } from '../intent-aware-planner';
import { fallbackIntentGenerator } from '../fallback-intent-generator';

describe('Performance and Scalability', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  describe('Registry Performance', () => {
    it('should quickly retrieve node definitions', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const startTime = Date.now();
      
      // Retrieve all node definitions
      for (const nodeType of allNodeTypes) {
        unifiedNodeRegistry.get(nodeType);
      }
      
      const duration = Date.now() - startTime;
      
      // Should be fast (< 100ms for all nodes)
      expect(duration).toBeLessThan(100);
    });
    
    it('should handle concurrent registry access', async () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const concurrentRequests = 100;
      
      const promises = Array.from({ length: concurrentRequests }, async () => {
        const randomType = allNodeTypes[Math.floor(Math.random() * allNodeTypes.length)];
        return unifiedNodeRegistry.get(randomType);
      });
      
      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // Should handle concurrent access efficiently
      expect(duration).toBeLessThan(500);
    });
  });
  
  describe('Intent Extraction Performance', () => {
    it('should extract SimpleIntent quickly (fallback)', () => {
      const prompt = 'Send email from Gmail to Slack';
      const startTime = Date.now();
      
      const result = fallbackIntentGenerator.generateFromPrompt(prompt);
      
      const duration = Date.now() - startTime;
      
      // Fallback should be very fast (< 50ms)
      expect(duration).toBeLessThan(50);
      expect(result.intent).toBeDefined();
    });
    
    it('should handle multiple concurrent extractions', async () => {
      const prompts = Array.from({ length: 10 }, (_, i) => 
        `Send data from source ${i} to destination ${i}`
      );
      
      const startTime = Date.now();
      const results = await Promise.all(
        prompts.map(prompt => intentExtractor.extractIntent(prompt))
      );
      const duration = Date.now() - startTime;
      
      // Should handle concurrent extractions
      expect(results.length).toBe(10);
      expect(results.every(r => r.intent)).toBe(true);
      
      // Average should be reasonable
      const avgDuration = duration / prompts.length;
      expect(avgDuration).toBeLessThan(1000); // < 1s per extraction
    });
  });
  
  describe('Workflow Planning Performance', () => {
    it('should plan workflow quickly', async () => {
      const simpleIntent = {
        verbs: ['send'],
        sources: ['Gmail'],
        destinations: ['Slack'],
      };
      
      const startTime = Date.now();
      const result = await intentAwarePlanner.planWorkflow(simpleIntent);
      const duration = Date.now() - startTime;
      
      // Planning should be fast (< 500ms)
      expect(duration).toBeLessThan(500);
      expect(result.structuredIntent).toBeDefined();
    });
    
    it('should handle complex intents efficiently', async () => {
      const simpleIntent = {
        verbs: ['read', 'summarize', 'filter', 'send'],
        sources: ['Google Sheets', 'Gmail'],
        destinations: ['Slack', 'Email'],
        transformations: ['summarize', 'filter'],
        conditions: [
          { description: 'if value > 10', type: 'if' },
        ],
      };
      
      const startTime = Date.now();
      const result = await intentAwarePlanner.planWorkflow(simpleIntent);
      const duration = Date.now() - startTime;
      
      // Complex planning should still be reasonable (< 1s)
      expect(duration).toBeLessThan(1000);
      expect(result.structuredIntent).toBeDefined();
      expect(result.errors.length).toBe(0);
    });
  });
  
  describe('Memory Usage', () => {
    it('should not leak memory with repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        const simpleIntent = {
          verbs: ['send'],
          sources: ['Gmail'],
          destinations: ['Slack'],
        };
        await intentAwarePlanner.planWorkflow(simpleIntent);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (< 50MB for 100 operations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
  
  describe('Scalability - 1M Users', () => {
    it('should handle high throughput (simulated)', async () => {
      const concurrentRequests = 50; // Simulate 50 concurrent users
      const requestsPerUser = 10; // 10 requests per user
      
      const allPrompts = Array.from({ length: concurrentRequests * requestsPerUser }, (_, i) => 
        `Send data from source ${i % 10} to destination ${i % 10}`
      );
      
      const startTime = Date.now();
      
      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < allPrompts.length; i += batchSize) {
        const batch = allPrompts.slice(i, i + batchSize);
        await Promise.all(batch.map(prompt => intentExtractor.extractIntent(prompt)));
      }
      
      const duration = Date.now() - startTime;
      const throughput = allPrompts.length / (duration / 1000); // requests per second
      
      // Should handle at least 10 requests/second
      expect(throughput).toBeGreaterThan(10);
    });
  });
});
