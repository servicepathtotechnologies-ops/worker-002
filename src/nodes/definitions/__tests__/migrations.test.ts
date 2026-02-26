/**
 * Node Migration Tests
 * 
 * Tests for node input migrations (backward compatibility).
 */

import { nodeDefinitionRegistry } from '../../../core/types/node-definition';

describe('Node Migration Tests', () => {
  describe('If/Else Node Migration', () => {
    it('should migrate v1 condition string to v2 conditions array', () => {
      const definition = nodeDefinitionRegistry.get('if_else');
      expect(definition).toBeDefined();
      expect(definition!.migrations).toBeDefined();
      expect(definition!.migrations!.length).toBeGreaterThan(0);

      // Old v1 format
      const oldInputs = {
        condition: '{{input.age}} >= 18'
      };

      // Apply migrations
      const migrated = nodeDefinitionRegistry.migrateInputs('if_else', oldInputs, 1);

      // Should have conditions array
      expect(migrated).toHaveProperty('conditions');
      expect(Array.isArray(migrated.conditions)).toBe(true);
      expect(migrated.conditions.length).toBeGreaterThan(0);
      expect(migrated.conditions[0]).toHaveProperty('expression');
      expect(migrated.conditions[0].expression).toBe('{{input.age}} >= 18');
    });

    it('should preserve v2 format (no migration needed)', () => {
      const v2Inputs = {
        conditions: [
          { expression: '{{input.age}} >= 18' }
        ]
      };

      const migrated = nodeDefinitionRegistry.migrateInputs('if_else', v2Inputs, 2);

      // Should remain unchanged
      expect(migrated).toEqual(v2Inputs);
    });

    it('should handle empty condition string', () => {
      const oldInputs = {
        condition: ''
      };

      const migrated = nodeDefinitionRegistry.migrateInputs('if_else', oldInputs, 1);

      // Should create empty conditions array or handle gracefully
      expect(migrated).toHaveProperty('conditions');
    });
  });

  describe('Migration Registry', () => {
    it('should handle nodes without migrations', () => {
      const definition = nodeDefinitionRegistry.get('manual_trigger');
      expect(definition).toBeDefined();

      const inputs = {};
      const migrated = nodeDefinitionRegistry.migrateInputs('manual_trigger', inputs);

      // Should return unchanged
      expect(migrated).toEqual(inputs);
    });

    it('should handle unknown node types gracefully', () => {
      const inputs = { test: 'value' };
      const migrated = nodeDefinitionRegistry.migrateInputs('unknown_node', inputs);

      // Should return unchanged (no migrations for unknown nodes)
      expect(migrated).toEqual(inputs);
    });
  });
});
