/**
 * Comprehensive Tests for Typed Execution Engine
 * 
 * Tests numeric comparisons, condition evaluation, data propagation,
 * execution order, and output contract enforcement.
 */

import { describe, it, expect } from '@jest/globals';
import { createExecutionContext, setNodeOutput } from '../typed-execution-context';
import { resolveTypedValue, resolveWithSchema } from '../typed-value-resolver';
import { evaluateCondition } from '../typed-condition-evaluator';
import { normalizeNodeOutput, getNodeOutputType } from '../node-output-contract';

describe('Typed Execution Engine', () => {
  describe('Typed Value Resolution', () => {
    it('should preserve number types', () => {
      const context = createExecutionContext({ age: 25, count: 100 });
      const resolved = resolveTypedValue('{{age}}', context);
      expect(typeof resolved).toBe('number');
      expect(resolved).toBe(25);
    });

    it('should preserve string types', () => {
      const context = createExecutionContext({ name: 'John', status: 'active' });
      const resolved = resolveTypedValue('{{name}}', context);
      expect(typeof resolved).toBe('string');
      expect(resolved).toBe('John');
    });

    it('should preserve boolean types', () => {
      const context = createExecutionContext({ active: true, enabled: false });
      const resolved = resolveTypedValue('{{active}}', context);
      expect(typeof resolved).toBe('boolean');
      expect(resolved).toBe(true);
    });

    it('should resolve with schema-driven casting', () => {
      const context = createExecutionContext({ value: '25' });
      const resolved = resolveWithSchema('{{value}}', context, 'number');
      expect(typeof resolved).toBe('number');
      expect(resolved).toBe(25);
    });

    it('should handle nested object access', () => {
      const context = createExecutionContext({ user: { age: 30, name: 'Alice' } });
      const resolved = resolveTypedValue('{{user.age}}', context);
      expect(typeof resolved).toBe('number');
      expect(resolved).toBe(30);
    });

    it('should handle $json syntax', () => {
      const context = createExecutionContext({ age: 25 });
      const resolved = resolveTypedValue('{{$json.age}}', context);
      expect(typeof resolved).toBe('number');
      expect(resolved).toBe(25);
    });
  });

  describe('Condition Evaluation', () => {
    it('should compare numbers correctly (greater than)', () => {
      const context = createExecutionContext({ age: 25, limit: 18 });
      const result = evaluateCondition({
        leftValue: '{{age}}',
        operation: 'greater_than',
        rightValue: '{{limit}}',
      }, context);
      expect(result).toBe(true);
    });

    it('should compare numbers correctly (less than)', () => {
      const context = createExecutionContext({ age: 15, limit: 18 });
      const result = evaluateCondition({
        leftValue: '{{age}}',
        operation: 'less_than',
        rightValue: '{{limit}}',
      }, context);
      expect(result).toBe(true);
    });

    it('should compare numbers correctly (equals)', () => {
      const context = createExecutionContext({ value: 20, target: 20 });
      const result = evaluateCondition({
        leftValue: '{{value}}',
        operation: 'equals',
        rightValue: '{{target}}',
      }, context);
      expect(result).toBe(true);
    });

    it('should compare numbers correctly (not equals)', () => {
      const context = createExecutionContext({ value: 20, target: 10 });
      const result = evaluateCondition({
        leftValue: '{{value}}',
        operation: 'not_equals',
        rightValue: '{{target}}',
      }, context);
      expect(result).toBe(true);
    });

    it('should handle modulo expressions', () => {
      const context = createExecutionContext({ value: 20 });
      const result = evaluateCondition('{{value}} % 2 === 0', context);
      expect(result).toBe(true);
    });

    it('should handle string comparisons', () => {
      const context = createExecutionContext({ status: 'active', target: 'active' });
      const result = evaluateCondition({
        leftValue: '{{status}}',
        operation: 'equals',
        rightValue: '{{target}}',
      }, context);
      expect(result).toBe(true);
    });

    it('should handle boolean comparisons', () => {
      const context = createExecutionContext({ enabled: true, required: true });
      const result = evaluateCondition({
        leftValue: '{{enabled}}',
        operation: 'equals',
        rightValue: '{{required}}',
      }, context);
      expect(result).toBe(true);
    });

    it('should NOT compare strings as numbers (type safety)', () => {
      const context = createExecutionContext({ value: '20', target: '10' });
      const result = evaluateCondition({
        leftValue: '{{value}}',
        operation: 'greater_than',
        rightValue: '{{target}}',
      }, context);
      // String comparison: "20" > "10" is false (lexicographic)
      // This is correct behavior - strings should not be compared as numbers
      expect(result).toBe(false);
    });

    it('should compare numbers correctly even when passed as strings in config', () => {
      const context = createExecutionContext({ value: 20, target: 10 });
      // Even if config has strings, typed resolution converts them
      const result = evaluateCondition({
        leftValue: '{{value}}',
        operation: 'greater_than',
        rightValue: '{{target}}',
      }, context);
      expect(result).toBe(true);
    });
  });

  describe('Node Output Contracts', () => {
    it('should normalize log node output to string', () => {
      const output = 'Debug message';
      const normalized = normalizeNodeOutput(output, 'string', 'log');
      expect(typeof normalized).toBe('string');
      expect(normalized).toBe('Debug message');
    });

    it('should normalize math node output to number', () => {
      const output = 42;
      const normalized = normalizeNodeOutput(output, 'number', 'math');
      expect(typeof normalized).toBe('number');
      expect(normalized).toBe(42);
    });

    it('should normalize if_else node output to boolean', () => {
      const output = true;
      const normalized = normalizeNodeOutput(output, 'boolean', 'if_else');
      expect(typeof normalized).toBe('boolean');
      expect(normalized).toBe(true);
    });

    it('should get correct output type for log node', () => {
      const type = getNodeOutputType('log');
      expect(type).toBe('string');
    });

    it('should get correct output type for math node', () => {
      const type = getNodeOutputType('math');
      expect(type).toBe('number');
    });

    it('should get correct output type for if_else node', () => {
      const type = getNodeOutputType('if_else');
      expect(type).toBe('boolean');
    });
  });

  describe('Data Propagation', () => {
    it('should propagate node outputs correctly', () => {
      const context = createExecutionContext({ initial: 10 });
      
      // Simulate node 1 output
      setNodeOutput(context, 'node1', { result: 20 });
      
      // Node 2 should see node 1's output
      const resolved = resolveTypedValue('{{node1.result}}', context);
      expect(resolved).toBe(20);
    });

    it('should maintain type through propagation', () => {
      const context = createExecutionContext({});
      
      // Math node returns number
      setNodeOutput(context, 'math1', 42);
      
      // Next node should receive number, not string
      const resolved = resolveTypedValue('{{math1}}', context);
      expect(typeof resolved).toBe('number');
      expect(resolved).toBe(42);
    });

    it('should handle multiple node outputs', () => {
      const context = createExecutionContext({});
      
      setNodeOutput(context, 'node1', { value: 10 });
      setNodeOutput(context, 'node2', { value: 20 });
      setNodeOutput(context, 'node3', { value: 30 });
      
      const resolved1 = resolveTypedValue('{{node1.value}}', context);
      const resolved2 = resolveTypedValue('{{node2.value}}', context);
      const resolved3 = resolveTypedValue('{{node3.value}}', context);
      
      expect(resolved1).toBe(10);
      expect(resolved2).toBe(20);
      expect(resolved3).toBe(30);
    });
  });

  describe('Execution Order', () => {
    it('should maintain deterministic execution order', () => {
      const context = createExecutionContext({});
      const outputs: unknown[] = [];
      
      // Simulate sequential node execution
      setNodeOutput(context, 'node1', { step: 1 });
      outputs.push(context.lastOutput);
      
      setNodeOutput(context, 'node2', { step: 2 });
      outputs.push(context.lastOutput);
      
      setNodeOutput(context, 'node3', { step: 3 });
      outputs.push(context.lastOutput);
      
      // Verify order
      expect((outputs[0] as any).step).toBe(1);
      expect((outputs[1] as any).step).toBe(2);
      expect((outputs[2] as any).step).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const context = createExecutionContext({ value: null });
      const resolved = resolveTypedValue('{{value}}', context);
      expect(resolved).toBeNull();
    });

    it('should handle undefined values', () => {
      const context = createExecutionContext({});
      const resolved = resolveTypedValue('{{missing}}', context);
      expect(resolved).toBeNull();
    });

    it('should handle empty strings', () => {
      const context = createExecutionContext({ value: '' });
      const resolved = resolveTypedValue('{{value}}', context);
      expect(resolved).toBe('');
    });

    it('should handle zero values', () => {
      const context = createExecutionContext({ value: 0 });
      const resolved = resolveTypedValue('{{value}}', context);
      expect(typeof resolved).toBe('number');
      expect(resolved).toBe(0);
    });
  });
});
