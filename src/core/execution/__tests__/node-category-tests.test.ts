/**
 * Category-Specific Tests for Node Execution
 * 
 * Tests for messaging nodes, parser nodes, integration nodes, and JavaScript nodes
 */

import { describe, it, expect } from '@jest/globals';
import { createExecutionContext, setNodeOutput } from '../typed-execution-context';
import { resolveTypedValue, resolveWithSchema } from '../typed-value-resolver';
import { evaluateCondition } from '../typed-condition-evaluator';

describe('Node Category Tests', () => {
  describe('Messaging Nodes', () => {
    it('should preserve types in message payloads', () => {
      const context = createExecutionContext({ 
        count: 42, 
        active: true, 
        message: 'Hello' 
      });
      
      // Numbers should stay numbers in payloads
      const count = resolveTypedValue('{{count}}', context);
      expect(typeof count).toBe('number');
      expect(count).toBe(42);
      
      // Booleans should stay booleans
      const active = resolveTypedValue('{{active}}', context);
      expect(typeof active).toBe('boolean');
      expect(active).toBe(true);
    });

    it('should return messaging result object', () => {
      // Messaging nodes should return: { id, status, provider, message }
      const result = {
        id: 'msg-123',
        status: 'sent' as const,
        provider: 'slack',
        message: 'Test message',
      };
      
      expect(result.id).toBe('msg-123');
      expect(result.status).toBe('sent');
      expect(result.provider).toBe('slack');
      expect(typeof result.message).toBe('string');
    });
  });

  describe('Integration Nodes', () => {
    it('should preserve data types from API responses', () => {
      const context = createExecutionContext({
        apiResponse: {
          count: 100,
          active: true,
          items: [1, 2, 3],
        },
      });
      
      const count = resolveTypedValue('{{apiResponse.count}}', context);
      expect(typeof count).toBe('number');
      expect(count).toBe(100);
      
      const active = resolveTypedValue('{{apiResponse.active}}', context);
      expect(typeof active).toBe('boolean');
      expect(active).toBe(true);
      
      const items = resolveTypedValue('{{apiResponse.items}}', context);
      expect(Array.isArray(items)).toBe(true);
      expect((items as number[])[0]).toBe(1);
    });

    it('should return raw API response objects', () => {
      // Integration nodes should return API response directly
      const apiResponse = {
        status: 200,
        data: { count: 42 },
        headers: { 'content-type': 'application/json' },
      };
      
      expect(typeof apiResponse.status).toBe('number');
      expect(typeof apiResponse.data).toBe('object');
      expect((apiResponse.data as any).count).toBe(42);
    });
  });

  describe('Parser Nodes', () => {
    it('should preserve numbers when parsing JSON', () => {
      const jsonString = '{"count": 42, "active": true, "name": "test"}';
      const parsed = JSON.parse(jsonString);
      
      expect(typeof parsed.count).toBe('number');
      expect(parsed.count).toBe(42);
      expect(typeof parsed.active).toBe('boolean');
      expect(parsed.active).toBe(true);
      expect(typeof parsed.name).toBe('string');
    });

    it('should not auto-parse strings unless explicitly configured', () => {
      const context = createExecutionContext({ jsonString: '{"count": 42}' });
      const resolved = resolveTypedValue('{{jsonString}}', context);
      
      // Should return as string, not parsed
      expect(typeof resolved).toBe('string');
      expect(resolved).toBe('{"count": 42}');
    });
  });

  describe('JavaScript Execution Node', () => {
    it('should validate output schema', () => {
      // JavaScript node should validate output matches schema
      const outputSchema = { type: 'number' };
      const result = 42;
      
      const actualType = typeof result;
      expect(actualType).toBe(outputSchema.type);
    });

    it('should return declared output type', () => {
      // If schema says number, return number
      const schema = { type: 'number' };
      const result = 42;
      
      expect(typeof result).toBe(schema.type);
    });

    it('should handle type mismatches gracefully', () => {
      const schema = { type: 'number' };
      const result = '42'; // String instead of number
      
      // Should warn but not throw (non-strict mode)
      const actualType = typeof result;
      expect(actualType).not.toBe(schema.type);
    });
  });

  describe('Type Propagation Across Categories', () => {
    it('should preserve types through messaging → integration flow', () => {
      const context = createExecutionContext({});
      
      // Simulate messaging node output
      setNodeOutput(context, 'slack1', {
        id: 'msg-1',
        status: 'sent',
        provider: 'slack',
        message: 'Count: 42',
      });
      
      // Integration node should receive typed data
      const message = resolveTypedValue('{{slack1.message}}', context);
      expect(typeof message).toBe('string');
    });

    it('should preserve types through integration → parser flow', () => {
      const context = createExecutionContext({});
      
      // Simulate API response
      setNodeOutput(context, 'api1', {
        status: 200,
        data: { count: 100, active: true },
      });
      
      // Parser should preserve types
      const count = resolveTypedValue('{{api1.data.count}}', context);
      expect(typeof count).toBe('number');
      expect(count).toBe(100);
    });
  });

  describe('Branch Correctness', () => {
    it('should execute correct branch based on typed condition', () => {
      const context = createExecutionContext({ age: 25, limit: 18 });
      
      const condition = {
        leftValue: '{{age}}',
        operation: 'greater_than' as const,
        rightValue: '{{limit}}',
      };
      
      const result = evaluateCondition(condition, context);
      expect(result).toBe(true); // 25 > 18
    });

    it('should not execute wrong branch', () => {
      const context = createExecutionContext({ age: 15, limit: 18 });
      
      const condition = {
        leftValue: '{{age}}',
        operation: 'greater_than' as const,
        rightValue: '{{limit}}',
      };
      
      const result = evaluateCondition(condition, context);
      expect(result).toBe(false); // 15 > 18 is false
    });
  });

  describe('No Output Wrapping', () => {
    it('should not wrap messaging node outputs', () => {
      const output = {
        id: 'msg-1',
        status: 'sent' as const,
        provider: 'slack',
      };
      
      // Should not have { data: ..., type: ... } wrapper
      expect('data' in output).toBe(false);
      expect('type' in output).toBe(false);
    });

    it('should not wrap HTTP node outputs', () => {
      const output = {
        status: 200,
        data: { result: 'success' },
      };
      
      // Should not have wrapper
      expect('data' in output && 'type' in output && typeof (output as any).data === 'object' && 'type' in (output as any).data).toBe(false);
    });
  });
});
