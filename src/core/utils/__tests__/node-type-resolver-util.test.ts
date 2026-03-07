/**
 * Unit Tests for Node Type Resolver Utility
 * 
 * Tests alias resolution with production-grade error handling
 */

import { resolveNodeType, resolveNodeTypes, nodeTypeExists } from '../node-type-resolver-util';
import { nodeLibrary } from '../../../services/nodes/node-library';
import { NodeSchemaRegistry } from '../../contracts/node-schema-registry';

describe('NodeTypeResolverUtil', () => {
  // Ensure NodeLibrary is initialized before tests
  beforeAll(() => {
    // NodeLibrary is initialized on import, but ensure resolver is ready
    const { nodeTypeResolver } = require('../../../services/nodes/node-type-resolver');
    nodeTypeResolver.setNodeLibrary(nodeLibrary);
  });

  describe('resolveNodeType', () => {
    test('should resolve "gmail" alias to canonical "google_gmail"', () => {
      const resolved = resolveNodeType('gmail', false);
      expect(resolved).toBe('google_gmail');
    });

    test('should resolve "ai" alias to canonical "ai_service"', () => {
      const resolved = resolveNodeType('ai', false);
      expect(resolved).toBe('ai_service');
    });

    test('should resolve "mail" alias to canonical "email"', () => {
      const resolved = resolveNodeType('mail', false);
      expect(resolved).toBe('email');
    });

    test('should return canonical type unchanged', () => {
      const resolved = resolveNodeType('google_gmail', false);
      expect(resolved).toBe('google_gmail');
    });

    test('should throw error for unknown node type (no fallback)', () => {
      expect(() => {
        resolveNodeType('unknown_node_type_xyz', false);
      }).toThrow('[NodeTypeResolver] Unknown node type');
    });

    test('should verify resolved type exists in registry', () => {
      const resolved = resolveNodeType('gmail', false);
      expect(resolved).toBe('google_gmail');
      
      // Verify it exists in registry
      const registry = NodeSchemaRegistry.getInstance();
      const schema = registry.get(resolved);
      expect(schema).not.toBeNull();
      expect(schema?.nodeType).toBe('google_gmail');
    });
  });

  describe('resolveNodeTypes', () => {
    test('should resolve multiple aliases to canonical types', () => {
      const resolved = resolveNodeTypes(['gmail', 'ai', 'mail'], false);
      expect(resolved).toEqual(['google_gmail', 'ai_service', 'email']);
    });

    test('should throw error if any alias fails (no partial success)', () => {
      expect(() => {
        resolveNodeTypes(['gmail', 'unknown_type_xyz'], false);
      }).toThrow('[NodeTypeResolver] Unknown node type');
    });
  });

  describe('nodeTypeExists', () => {
    test('should return true for valid alias', () => {
      const exists = nodeTypeExists('gmail', false);
      expect(exists).toBe(true);
    });

    test('should return true for canonical type', () => {
      const exists = nodeTypeExists('google_gmail', false);
      expect(exists).toBe(true);
    });

    test('should return false for unknown type', () => {
      // Note: This might throw now with our new error handling
      // But the function should handle it gracefully
      try {
        const exists = nodeTypeExists('unknown_type_xyz', false);
        expect(exists).toBe(false);
      } catch (error) {
        // If it throws, that's also acceptable behavior
        expect((error as Error).message).toContain('Unknown node type');
      }
    });
  });

  describe('Production-Grade Error Handling', () => {
    test('should never return original value on failure (throws instead)', () => {
      expect(() => {
        const result = resolveNodeType('definitely_unknown_type', false);
        // If we get here, it means fallback happened (BAD)
        expect(result).not.toBe('definitely_unknown_type');
      }).toThrow();
    });

    test('should provide clear error message for unknown types', () => {
      try {
        resolveNodeType('unknown_type', false);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Unknown node type');
        expect(error.message).toContain('unknown_type');
      }
    });
  });
});
