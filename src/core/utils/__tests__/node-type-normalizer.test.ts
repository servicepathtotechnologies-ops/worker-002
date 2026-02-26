/**
 * Unit Tests for Node Type Normalizer
 */

import { 
  normalizeNodeType, 
  isValidNodeType,
  getNormalizedNodeTypeWithValidation 
} from '../node-type-normalizer';

describe('NodeTypeNormalizer', () => {
  describe('normalizeNodeType', () => {
    test('should extract type from data.type when type is custom', () => {
      const node = {
        id: 'test1',
        type: 'custom',
        data: { type: 'schedule' }
      };

      const result = normalizeNodeType(node);
      expect(result).toBe('schedule');
    });

    test('should use type directly when not custom', () => {
      const node = {
        id: 'test2',
        type: 'manual_trigger',
        data: { type: 'manual_trigger' }
      };

      const result = normalizeNodeType(node);
      expect(result).toBe('manual_trigger');
    });

    test('should fallback to data.nodeType', () => {
      const node = {
        id: 'test3',
        type: '',
        data: { nodeType: 'slack_message' }
      };

      const result = normalizeNodeType(node);
      expect(result).toBe('slack_message');
    });

    test('should fallback to data.type directly', () => {
      const node = {
        id: 'test4',
        type: '',
        data: { type: 'instagram' }
      };

      const result = normalizeNodeType(node);
      expect(result).toBe('instagram');
    });

    test('should return empty string for invalid node', () => {
      const node = {
        id: 'test5',
        type: '',
        data: {}
      };

      const result = normalizeNodeType(node);
      expect(result).toBe('');
    });
  });

  describe('isValidNodeType', () => {
    test('should return true for valid node type', () => {
      const node = {
        id: 'test1',
        type: 'custom',
        data: { type: 'schedule' }
      };

      expect(isValidNodeType(node)).toBe(true);
    });

    test('should return false for custom type without data.type', () => {
      const node = {
        id: 'test2',
        type: 'custom',
        data: {}
      };

      expect(isValidNodeType(node)).toBe(false);
    });

    test('should return false for empty type', () => {
      const node = {
        id: 'test3',
        type: '',
        data: {}
      };

      expect(isValidNodeType(node)).toBe(false);
    });
  });

  describe('getNormalizedNodeTypeWithValidation', () => {
    test('should return valid result for valid node', () => {
      const node = {
        id: 'test1',
        type: 'custom',
        data: { type: 'schedule' }
      };

      const result = getNormalizedNodeTypeWithValidation(node, ['schedule', 'manual_trigger']);
      
      expect(result.valid).toBe(true);
      expect(result.type).toBe('schedule');
      expect(result.error).toBeUndefined();
    });

    test('should return invalid for node not in available types', () => {
      const node = {
        id: 'test2',
        type: 'custom',
        data: { type: 'nonexistent' }
      };

      const result = getNormalizedNodeTypeWithValidation(node, ['schedule', 'manual_trigger']);
      
      expect(result.valid).toBe(false);
      expect(result.type).toBe('nonexistent');
      expect(result.error).toBeDefined();
    });

    test('should return invalid for custom type without data.type', () => {
      const node = {
        id: 'test3',
        type: 'custom',
        data: {}
      };

      const result = getNormalizedNodeTypeWithValidation(node);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
