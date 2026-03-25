import { describe, it, expect, jest } from '@jest/globals';
import { executeNodeDynamically } from '../dynamic-node-executor';
import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';

// Mocks to ensure the test focuses on the runtime "AI resolve -> validate -> guarantee fill" contract.
jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    migrateConfig: jest.fn((_: string, config: Record<string, any>) => config),
    validateConfig: jest.fn(() => ({ valid: true, errors: [] })),
  },
}));

jest.mock('../../ai-input-resolver', () => ({
  aiInputResolver: {
    resolveInput: jest.fn(),
  },
}));

jest.mock('../../utils/node-authority', () => ({
  assertValidNodeType: jest.fn(() => true),
}));

jest.mock('../../intent-driven-json-router', () => ({
  // Router should never activate in this test, but mock anyway for safety.
  shouldActivateRouter: jest.fn(() => false),
  IntentDrivenJsonRouter: jest.fn().mockImplementation(() => ({
    route: jest.fn(),
  })),
}));

jest.mock('../../../services/ai/ai-field-detector', () => ({
  aiFieldDetector: {
    detectAIFields: jest.fn(() => []),
  },
}));

describe('Runtime Input Guarantee (AI -> validate -> deterministic fill)', () => {
  it('fills required inputs from upstream payload when AI returns incomplete JSON', async () => {
    const { unifiedNodeRegistry } = await import('../../registry/unified-node-registry');
    const { aiInputResolver } = await import('../../ai-input-resolver');

    const executeSpy = jest.fn(async (context: any) => {
      expect(context.inputs).toBeTruthy();
      expect(context.inputs.message).toBe('Hello');
      expect(context.inputs.count).toBe(5);
      expect(typeof context.inputs.count).toBe('number');

      return {
        success: true,
        output: { ok: true },
      };
    });

    (unifiedNodeRegistry.get as jest.Mock).mockReturnValue({
      type: 'target_node',
      label: 'Target Node',
      category: 'utility',
      description: 'Test node definition',
      version: '1.0.0',

      inputSchema: {
        message: {
          type: 'string',
          description: 'Message',
          required: true,
        },
        count: {
          type: 'number',
          description: 'Count',
          required: true,
        },
      },
      outputSchema: {},
      requiredInputs: ['message', 'count'],
      defaultConfig: () => ({}),
      validateConfig: () => ({ valid: true, errors: [] }),
      execute: executeSpy,

      // unused by executor in this test
      incomingPorts: ['default'],
      outgoingPorts: ['default'],
      isBranching: false,
    });

    // Force the AI to return incomplete JSON so the guarantee layer must fill required fields.
    // Cast to any to avoid TS "never" inference due to jest.mock typings.
    (aiInputResolver as any).resolveInput.mockResolvedValue({
      mode: 'json',
      value: {},
      explanation: 'mock',
    });

    const nodeOutputs = new LRUNodeOutputsCache(10);
    // Simulate Node N-1 output sitting in the runtime cache.
    nodeOutputs.set('upstream1', { message: 'Hello', count: '5' }, false);

    const node: any = {
      id: 'target1',
      type: 'target_node',
      data: {
        type: 'target_node',
        label: 'Target Node',
        category: 'utility',
        config: {
          // Guarantee layer uses _mappingMetadata -> selectedUpstreamKey to pull values from upstream.
          _mappingMetadata: {
            message: { selectedUpstreamKey: 'message' },
            count: { selectedUpstreamKey: 'count' },
          },
          message: '',
          count: undefined,
        },
      },
    };

    await executeNodeDynamically({
      node,
      // input is null => executor uses getPreviousNodeOutput(nodeOutputs) under the hood.
      input: null,
      nodeOutputs,
      supabase: {} as any,
      workflowId: 'wf_test',
      userId: 'u_test',
      currentUserId: 'u_test',
    });

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the immediately previous node output (node2 -> node3) for required inputs', async () => {
    const { unifiedNodeRegistry } = await import('../../registry/unified-node-registry');
    const { aiInputResolver } = await import('../../ai-input-resolver');

    jest.clearAllMocks();

    const node2ExecuteSpy = jest.fn(async (context: any) => {
      // Node2 should receive inputs filled from node1 output (count coerced to number).
      expect(context.inputs.message).toBe('FROM_NODE_1');
      expect(context.inputs.count).toBe(1);
      expect(typeof context.inputs.count).toBe('number');

      return {
        success: true,
        output: { node2: true },
      };
    });

    const node3ExecuteSpy = jest.fn(async (context: any) => {
      // Node3 should receive inputs filled from node2 output (not node1 output).
      expect(context.inputs.message).toBe('FROM_NODE_2');
      expect(context.inputs.count).toBe(2);
      expect(typeof context.inputs.count).toBe('number');

      return {
        success: true,
        output: { node3: true },
      };
    });

    (unifiedNodeRegistry.get as any).mockImplementation((nodeType: string) => {
      if (nodeType === 'node2_type') {
        return {
          type: 'node2_type',
          label: 'Node 2',
          category: 'utility',
          description: 'Node2 test definition',
          version: '1.0.0',
          inputSchema: {
            message: { type: 'string', description: 'Message', required: true },
            count: { type: 'number', description: 'Count', required: true },
          },
          outputSchema: {},
          requiredInputs: ['message', 'count'],
          defaultConfig: () => ({}),
          execute: node2ExecuteSpy,
          incomingPorts: ['default'],
          outgoingPorts: ['default'],
          isBranching: false,
        };
      }

      if (nodeType === 'node3_type') {
        return {
          type: 'node3_type',
          label: 'Node 3',
          category: 'utility',
          description: 'Node3 test definition',
          version: '1.0.0',
          inputSchema: {
            message: { type: 'string', description: 'Message', required: true },
            count: { type: 'number', description: 'Count', required: true },
          },
          outputSchema: {},
          requiredInputs: ['message', 'count'],
          defaultConfig: () => ({}),
          execute: node3ExecuteSpy,
          incomingPorts: ['default'],
          outgoingPorts: ['default'],
          isBranching: false,
        };
      }

      return null;
    });

    // Make AI always return incomplete JSON; the guarantee layer must fill from previous output.
    (aiInputResolver as any).resolveInput.mockResolvedValue({
      mode: 'json',
      value: {},
      explanation: 'mock',
    });

    const nodeOutputs = new LRUNodeOutputsCache(10);

    // node1 output exists first.
    nodeOutputs.set('node1', { message: 'FROM_NODE_1', count: '1' }, false);

    const node2: any = {
      id: 'node2',
      type: 'node2_type',
      data: {
        type: 'node2_type',
        label: 'Node 2',
        category: 'utility',
        config: {
          _mappingMetadata: {
            message: { selectedUpstreamKey: 'message' },
            count: { selectedUpstreamKey: 'count' },
          },
          message: '',
          count: undefined,
        },
      },
    };

    await executeNodeDynamically({
      node: node2,
      input: null,
      nodeOutputs,
      supabase: {} as any,
      workflowId: 'wf_test',
      userId: 'u_test',
      currentUserId: 'u_test',
    });

    // Simulate real workflow storage: after node2 runs, node2 output is added.
    nodeOutputs.set('node2', { message: 'FROM_NODE_2', count: '2' }, false);

    const node3: any = {
      id: 'node3',
      type: 'node3_type',
      data: {
        type: 'node3_type',
        label: 'Node 3',
        category: 'utility',
        config: {
          _mappingMetadata: {
            message: { selectedUpstreamKey: 'message' },
            count: { selectedUpstreamKey: 'count' },
          },
          message: '',
          count: undefined,
        },
      },
    };

    await executeNodeDynamically({
      node: node3,
      input: null,
      nodeOutputs,
      supabase: {} as any,
      workflowId: 'wf_test',
      userId: 'u_test',
      currentUserId: 'u_test',
    });

    expect(node2ExecuteSpy).toHaveBeenCalledTimes(1);
    expect(node3ExecuteSpy).toHaveBeenCalledTimes(1);
  });
});

