/**
 * Unit Tests for Node Schema Registry
 */

import { NodeSchemaRegistry } from '../node-schema-registry';
import { unifiedNormalizeNodeType } from '../../utils/unified-node-type-normalizer';

describe('NodeSchemaRegistry', () => {
  let registry: NodeSchemaRegistry;

  beforeEach(() => {
    registry = NodeSchemaRegistry.getInstance();
  });

  describe('Node Type Normalization', () => {
    test('should normalize custom type nodes', () => {
      const node = {
        id: 'test1',
        type: 'custom',
        data: { type: 'schedule' }
      };

      const normalized = unifiedNormalizeNodeType(node);
      expect(normalized).toBe('schedule');
    });

    test('should handle direct type nodes', () => {
      const node = {
        id: 'test2',
        type: 'manual_trigger',
        data: { type: 'manual_trigger' }
      };

      const normalized = unifiedNormalizeNodeType(node);
      expect(normalized).toBe('manual_trigger');
    });
  });

  describe('Node Validation', () => {
    test('should validate schedule node with cron', () => {
      const node = {
        id: 'schedule1',
        type: 'custom',
        data: {
          type: 'schedule',
          config: {
            cron: '0 9 * * *'
          }
        }
      };

      const result = registry.validateNode(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject schedule node without cron', () => {
      const node = {
        id: 'schedule2',
        type: 'custom',
        data: {
          type: 'schedule',
          config: {}
        }
      };

      const result = registry.validateNode(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required config field: cron');
    });

    test('should validate slack node with required fields', () => {
      const node = {
        id: 'slack1',
        type: 'custom',
        data: {
          type: 'slack_message',
          config: {
            channel: '#general',
            text: 'Hello'
          }
        }
      };

      const result = registry.validateNode(node);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid node type', () => {
      const node = {
        id: 'invalid1',
        type: 'custom',
        data: {
          type: 'nonexistent_node_type'
        }
      };

      const result = registry.validateNode(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not registered'))).toBe(true);
    });
  });

  describe('Edge Validation', () => {
    test('should validate correct manual_trigger to slack connection', () => {
      const sourceNode = {
        id: 'trigger1',
        type: 'custom',
        data: { type: 'manual_trigger' }
      };

      const targetNode = {
        id: 'slack1',
        type: 'custom',
        data: { type: 'slack_message' }
      };

      const edge = {
        id: 'edge1',
        source: 'trigger1',
        target: 'slack1',
        sourceHandle: 'inputData',
        targetHandle: 'text'
      };

      const result = registry.validateEdge(sourceNode, targetNode, edge);
      expect(result.valid).toBe(true);
    });

    test('should reject incorrect manual_trigger port', () => {
      const sourceNode = {
        id: 'trigger1',
        type: 'custom',
        data: { type: 'manual_trigger' }
      };

      const targetNode = {
        id: 'slack1',
        type: 'custom',
        data: { type: 'slack_message' }
      };

      const edge = {
        id: 'edge1',
        source: 'trigger1',
        target: 'slack1',
        sourceHandle: 'data', // Wrong port
        targetHandle: 'text'
      };

      const result = registry.validateEdge(sourceNode, targetNode, edge);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('inputData'))).toBe(true);
    });

    test('should validate schedule to slack connection', () => {
      const sourceNode = {
        id: 'schedule1',
        type: 'custom',
        data: { type: 'schedule' }
      };

      const targetNode = {
        id: 'slack1',
        type: 'custom',
        data: { type: 'slack_message' }
      };

      const edge = {
        id: 'edge1',
        source: 'schedule1',
        target: 'slack1',
        sourceHandle: 'output',
        targetHandle: 'text'
      };

      const result = registry.validateEdge(sourceNode, targetNode, edge);
      expect(result.valid).toBe(true);
    });
  });

  describe('Schema Lookup', () => {
    test('should get schema for registered node type', () => {
      const schema = registry.get('schedule');
      expect(schema).toBeDefined();
      expect(schema?.nodeType).toBe('schedule');
      expect(schema?.requiredConfig).toContain('cron');
    });

    test('should return null for unregistered node type', () => {
      const schema = registry.get('nonexistent_type');
      expect(schema).toBeNull();
    });

    test('should get all schemas', () => {
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas.some(s => s.nodeType === 'schedule')).toBe(true);
    });
  });
});
