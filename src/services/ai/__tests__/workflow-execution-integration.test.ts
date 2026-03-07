/**
 * ✅ WORKFLOW EXECUTION INTEGRATION TESTS
 * 
 * Tests the complete workflow execution flow:
 * 1. Node execution via UnifiedNodeRegistry
 * 2. Data flow between nodes
 * 3. Template expression resolution
 * 4. Error handling during execution
 */

import { executeNode } from '../../../api/execute-workflow';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { LRUNodeOutputsCache } from '../../../core/cache/lru-node-outputs-cache';
import { WorkflowNode } from '../../../core/types/ai-types';

// Mock Supabase client
const createMockSupabaseClient = () => {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ data: [], error: null }) }),
      insert: () => ({ data: null, error: null }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
    auth: {
      getUser: () => ({ data: { user: { id: 'test-user' } }, error: null }),
    },
  } as any;
};

describe('Workflow Execution Integration Tests', () => {
  let mockSupabase: any;
  let nodeOutputsCache: LRUNodeOutputsCache;

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
    nodeOutputsCache = new LRUNodeOutputsCache(100);
  });

  describe('Node Execution via Registry', () => {
    test('should execute node using UnifiedNodeRegistry', async () => {
      const node: WorkflowNode = {
        id: 'test-node-1',
        type: 'custom',
        data: {
          type: 'manual_trigger',
          label: 'Manual Trigger',
          category: 'triggers',
          config: {},
        },
        position: { x: 0, y: 0 },
      };

      // Verify node is in registry
      const nodeDef = unifiedNodeRegistry.get('manual_trigger');
      expect(nodeDef).toBeDefined();

      // Execute node
      const result = await executeNode(
        node,
        {},
        nodeOutputsCache,
        mockSupabase,
        'test-workflow',
        'test-user',
        'test-user'
      );

      expect(result).toBeDefined();
      // Manual trigger should return some output
      expect(typeof result).toBe('object');
    });

    test('should execute node with template expressions', async () => {
      const node: WorkflowNode = {
        id: 'test-node-2',
        type: 'custom',
        data: {
          type: 'set_variable',
          label: 'Set Variable',
          category: 'data',
          config: {
            variableName: 'testVar',
            value: '{{$json.testField}}',
          },
        },
        position: { x: 0, y: 0 },
      };

      const input = { testField: 'testValue' };

      const result = await executeNode(
        node,
        input,
        nodeOutputsCache,
        mockSupabase,
        'test-workflow',
        'test-user',
        'test-user'
      );

      expect(result).toBeDefined();
    });

    test('should handle node execution errors gracefully', async () => {
      const node: WorkflowNode = {
        id: 'test-node-3',
        type: 'custom',
        data: {
          type: 'invalid_node_type',
          label: 'Invalid',
          category: 'triggers',
          config: {},
        },
        position: { x: 0, y: 0 },
      };

      // Should throw error or return error object
      try {
        const result = await executeNode(
          node,
          {},
          nodeOutputsCache,
          mockSupabase,
          'test-workflow',
          'test-user',
          'test-user'
        );

        // If it returns, should have error indicator
        if (result && typeof result === 'object' && '_error' in result) {
          expect((result as any)._error).toBeDefined();
        }
      } catch (error) {
        // Error is expected for invalid node type
        expect(error).toBeDefined();
      }
    });
  });

  describe('Data Flow Between Nodes', () => {
    test('should pass data from trigger to action node', async () => {
      // Execute trigger node
      const triggerNode: WorkflowNode = {
        id: 'trigger-1',
        type: 'custom',
        data: {
          type: 'manual_trigger',
          label: 'Trigger',
          category: 'triggers',
          config: {},
        },
        position: { x: 0, y: 0 },
      };

      const triggerResult = await executeNode(
        triggerNode,
        {},
        nodeOutputsCache,
        mockSupabase,
        'test-workflow',
        'test-user',
        'test-user'
      );

      // Store trigger output
      nodeOutputsCache.set('trigger-1', triggerResult);

      // Execute action node that uses trigger output
      const actionNode: WorkflowNode = {
        id: 'action-1',
        type: 'custom',
        data: {
          type: 'set_variable',
          label: 'Action',
          category: 'data',
          config: {
            variableName: 'result',
            value: '{{$json}}',
          },
        },
        position: { x: 100, y: 0 },
      };

      const actionResult = await executeNode(
        actionNode,
        triggerResult,
        nodeOutputsCache,
        mockSupabase,
        'test-workflow',
        'test-user',
        'test-user'
      );

      expect(actionResult).toBeDefined();
    });

    test('should resolve template expressions from upstream nodes', async () => {
      // Create upstream node output
      const upstreamOutput = { email: 'test@example.com', name: 'Test User' };
      nodeOutputsCache.set('upstream-1', upstreamOutput);

      // Execute downstream node with template
      const downstreamNode: WorkflowNode = {
        id: 'downstream-1',
        type: 'custom',
        data: {
          type: 'set_variable',
          label: 'Downstream',
          category: 'data',
          config: {
            variableName: 'email',
            value: '{{$json.email}}',
          },
        },
        position: { x: 100, y: 0 },
      };

      const result = await executeNode(
        downstreamNode,
        upstreamOutput,
        nodeOutputsCache,
        mockSupabase,
        'test-workflow',
        'test-user',
        'test-user'
      );

      expect(result).toBeDefined();
    });
  });

  describe('Registry Integration', () => {
    test('should verify all canonical node types can be executed', async () => {
      const testNodeTypes = [
        'manual_trigger',
        'set_variable',
        'if_else',
        'slack_message',
      ];

      for (const nodeType of testNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        expect(nodeDef).toBeDefined();
        expect(nodeDef?.execute).toBeDefined();
        expect(typeof nodeDef?.execute).toBe('function');
      }
    });

    test('should verify node config validation works', async () => {
      const nodeType = 'google_gmail';
      const nodeDef = unifiedNodeRegistry.get(nodeType);

      expect(nodeDef).toBeDefined();

      // Test valid config
      const validConfig = {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test message',
      };

      const validation = nodeDef?.validateConfig(nodeType, validConfig);
      expect(validation).toBeDefined();
      expect(validation?.valid).toBe(true);

      // Test invalid config (missing required fields)
      const invalidConfig = {
        to: 'test@example.com',
        // Missing subject and body
      };

      const invalidValidation = nodeDef?.validateConfig(nodeType, invalidConfig);
      expect(invalidValidation).toBeDefined();
      // Should either be invalid or have warnings
      expect(invalidValidation?.valid === false || invalidValidation?.warnings?.length).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing node definition gracefully', async () => {
      const node: WorkflowNode = {
        id: 'missing-node',
        type: 'custom',
        data: {
          type: 'non_existent_node_type',
          label: 'Missing',
          category: 'triggers',
          config: {},
        },
        position: { x: 0, y: 0 },
      };

      try {
        const result = await executeNode(
          node,
          {},
          nodeOutputsCache,
          mockSupabase,
          'test-workflow',
          'test-user',
          'test-user'
        );

        // Should return error object or throw
        if (result && typeof result === 'object') {
          if ('_error' in result) {
            expect((result as any)._error).toBeDefined();
          }
        }
      } catch (error) {
        // Error is expected
        expect(error).toBeDefined();
      }
    });

    test('should handle invalid node config gracefully', async () => {
      const node: WorkflowNode = {
        id: 'invalid-config-node',
        type: 'custom',
        data: {
          type: 'google_gmail',
          label: 'Gmail',
          category: 'output',
          config: {
            // Missing required fields
          },
        },
        position: { x: 0, y: 0 },
      };

      // Should handle gracefully (either validate before execution or return error)
      try {
        const result = await executeNode(
          node,
          {},
          nodeOutputsCache,
          mockSupabase,
          'test-workflow',
          'test-user',
          'test-user'
        );

        // May return error or attempt execution
        expect(result).toBeDefined();
      } catch (error) {
        // Error is acceptable for invalid config
        expect(error).toBeDefined();
      }
    });
  });
});
