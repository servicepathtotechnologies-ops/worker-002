import { overrideGoogleTasks } from '../google-tasks';
import type { UnifiedNodeDefinition } from '../../../types/unified-node-contract';

const baseDefinition: UnifiedNodeDefinition = {
  type: 'google_tasks',
  label: 'Google Tasks',
  category: 'data',
  description: 'Manage tasks',
  version: '1.0.0',
  inputSchema: {
    operation: { type: 'string', description: 'Operation', required: false },
  },
  outputSchema: {},
  requiredInputs: [],
  defaultConfig: () => ({}),
  validateConfig: () => ({ valid: true, errors: [] }),
  execute: async () => ({ success: true, output: {} }),
  incomingPorts: ['default'],
  outgoingPorts: ['default'],
  isBranching: false,
};

describe('Google Tasks acknowledgement handling', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns success for DELETE when Google acknowledges with an empty 204 body', async () => {
    global.fetch = jest.fn(async () => new Response(null, {
      status: 204,
      headers: { 'content-type': 'application/json' },
    })) as any;

    const definition = overrideGoogleTasks(baseDefinition, {} as any);
    const result = await definition.execute({
      nodeId: 'node_1',
      nodeType: 'google_tasks',
      config: {},
      inputs: {
        accessToken: 'test-token',
        operation: 'delete',
        taskListId: '@default',
        taskId: 'task_123',
      },
      rawInput: {},
      upstreamOutputs: new Map(),
      workflowId: 'workflow_1',
      db: {},
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      operation: 'delete',
      data: { deleted: true, taskId: 'task_123' },
    });
    expect(result.metadata).toMatchObject({
      operationStatus: 'succeeded',
      acknowledgementStatus: 'empty_success',
      persistenceStatus: 'saved',
    });
  });
});
