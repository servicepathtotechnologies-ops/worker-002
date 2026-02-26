/**
 * Phase 3: Performance Testing for Validation
 * 
 * Measures validation overhead to ensure it doesn't impact workflow performance.
 * Target: < 2ms overhead per validation
 */

import { describe, it, expect } from '@jest/globals';
import { validationMiddleware } from '../validation-middleware';
import { validateNodeConfig } from '../node-schemas';

describe('Validation Performance', () => {
  const iterations = 1000;

  describe('Config Validation Performance', () => {
    it('should validate JavaScript node config quickly', () => {
      const config = {
        code: 'return input.value * 2;',
        timeout: 5000,
      };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        validationMiddleware.validateConfig('javascript', config, 'node-1');
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`[Performance] JavaScript config validation: ${avgTime.toFixed(3)}ms per validation`);
      expect(avgTime).toBeLessThan(2); // Target: < 2ms
    });

    it('should validate HTTP request node config quickly', () => {
      const config = {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        validationMiddleware.validateConfig('http_request', config, 'node-1');
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`[Performance] HTTP request config validation: ${avgTime.toFixed(3)}ms per validation`);
      expect(avgTime).toBeLessThan(2); // Target: < 2ms
    });

    it('should validate AI agent node config quickly', () => {
      const config = {
        systemPrompt: 'You are a helpful assistant',
        mode: 'chat',
        model: 'qwen2.5:14b-instruct-q4_K_M',
      };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        validationMiddleware.validateConfig('ai_agent', config, 'node-1');
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`[Performance] AI agent config validation: ${avgTime.toFixed(3)}ms per validation`);
      expect(avgTime).toBeLessThan(2); // Target: < 2ms
    });
  });

  describe('Template Validation Performance', () => {
    it('should validate template resolution quickly', () => {
      const context = {
        input: { value: 'test', count: 42 },
        node1: { data: 'data' },
        node2: { result: 100 },
      };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        validationMiddleware.validateTemplateValue(
          '{{input.value}}',
          'test',
          context
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`[Performance] Template validation: ${avgTime.toFixed(3)}ms per validation`);
      expect(avgTime).toBeLessThan(1); // Target: < 1ms (lighter validation)
    });
  });

  describe('Validation Overhead Comparison', () => {
    it('should have minimal absolute overhead', () => {
      const config = {
        code: 'return input.value * 2;',
        timeout: 5000,
      };

      // Measure validation time
      const validationStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        validateNodeConfig('javascript', config, 'node-1');
      }
      const validationTime = performance.now() - validationStart;
      const avgValidationTime = validationTime / iterations;

      console.log(`[Performance] Average validation time: ${avgValidationTime.toFixed(3)}ms`);
      console.log(`[Performance] Total validation time for ${iterations} validations: ${validationTime.toFixed(2)}ms`);
      
      // Validation should be < 2ms per validation (absolute time)
      expect(avgValidationTime).toBeLessThan(2);
    });
  });

  describe('Batch Validation Performance', () => {
    it('should handle batch validation efficiently', () => {
      const nodes = [
        { type: 'javascript', config: { code: 'return 1;' }, id: 'node-1' },
        { type: 'http_request', config: { url: 'https://api.example.com' }, id: 'node-2' },
        { type: 'ai_agent', config: { systemPrompt: 'Test' }, id: 'node-3' },
        { type: 'set_variable', config: { name: 'var1', value: 'test' }, id: 'node-4' },
        { type: 'log', config: { message: 'Test log' }, id: 'node-5' },
      ];

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        nodes.forEach(node => {
          validationMiddleware.validateConfig(node.type, node.config, node.id);
        });
      }
      const end = performance.now();
      const avgTime = (end - start) / (nodes.length * 100);

      console.log(`[Performance] Batch validation (5 nodes): ${avgTime.toFixed(3)}ms per node`);
      expect(avgTime).toBeLessThan(2); // Target: < 2ms per node
    });
  });
});
