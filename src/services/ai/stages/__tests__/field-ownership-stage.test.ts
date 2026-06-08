jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

import { runFieldOwnershipStage } from '../field-ownership-stage';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { Workflow, WorkflowNode } from '../../../../core/types/ai-types';

const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;

function makeNode(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return {
    id,
    type,
    data: { label: type, type, category: 'utility', config },
  };
}

describe('runFieldOwnershipStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok:true with empty map for workflow with no nodes', async () => {
    const workflow: Workflow = { nodes: [], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap).toEqual({});
    expect(typeof result.durationMs).toBe('number');
  });

  it('skips nodes with no registry entry', async () => {
    mockRegistryGet.mockReturnValue(undefined);
    const workflow: Workflow = { nodes: [makeNode('n1', 'unknown_type')], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap).toEqual({});
  });

  it('skips nodes whose registry entry has no inputSchema', async () => {
    mockRegistryGet.mockReturnValue({ label: 'Gmail', description: 'Send email' });
    const workflow: Workflow = { nodes: [makeNode('n1', 'google_gmail')], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap).toEqual({});
  });

  it('builds fieldOwnershipMap for node with inputSchema', async () => {
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        subject: { fillMode: { default: 'manual_static' } },
        body: { fillMode: { default: 'runtime_ai' } },
      },
    });
    const workflow: Workflow = { nodes: [makeNode('n1', 'google_gmail')], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap['n1']).toEqual({
      subject: 'manual_static',
      body: 'runtime_ai',
    });
  });

  it('defaults fillMode to manual_static when field has no fillMode.default', async () => {
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        noFillMode: {},
        withDefault: { fillMode: { default: 'buildtime_ai_once' } },
      },
    });
    const workflow: Workflow = { nodes: [makeNode('n1', 'slack')], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap['n1']['noFillMode']).toBe('manual_static');
    expect(result.fieldOwnershipMap['n1']['withDefault']).toBe('buildtime_ai_once');
  });

  it('skips nodes whose inputSchema is an empty object', async () => {
    mockRegistryGet.mockReturnValue({ inputSchema: {} });
    const workflow: Workflow = { nodes: [makeNode('n1', 'manual_trigger')], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap).toEqual({});
  });

  it('stamps _fillMode into node.data.config', async () => {
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        to: { fillMode: { default: 'manual_static' } },
        subject: { fillMode: { default: 'runtime_ai' } },
      },
    });
    const node = makeNode('n1', 'google_gmail');
    const workflow: Workflow = { nodes: [node], edges: [] };

    await runFieldOwnershipStage(workflow);

    const config = node.data.config as Record<string, any>;
    expect(config._fillMode).toEqual({ to: 'manual_static', subject: 'runtime_ai' });
  });

  it('does not overwrite existing _fillMode entries (prior stage wins)', async () => {
    mockRegistryGet.mockReturnValue({
      inputSchema: {
        to: { fillMode: { default: 'manual_static' } },
        subject: { fillMode: { default: 'manual_static' } },
      },
    });
    // subject was stamped by a prior stage with runtime_ai — must be preserved
    const node = makeNode('n1', 'google_gmail', { _fillMode: { subject: 'runtime_ai' } });
    const workflow: Workflow = { nodes: [node], edges: [] };

    await runFieldOwnershipStage(workflow);

    const config = node.data.config as Record<string, any>;
    expect(config._fillMode.subject).toBe('runtime_ai');
    expect(config._fillMode.to).toBe('manual_static');
  });

  it('reads node type from data.type when present (data.type takes priority over node.type)', async () => {
    mockRegistryGet.mockReturnValue({
      inputSchema: { channel: { fillMode: { default: 'manual_static' } } },
    });
    const node: WorkflowNode = {
      id: 'n1',
      type: 'default',
      data: { label: 'Slack', type: 'slack', category: 'output', config: {} },
    };
    const workflow: Workflow = { nodes: [node], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(mockRegistryGet).toHaveBeenCalledWith('slack');
    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap['n1']).toEqual({ channel: 'manual_static' });
  });

  it('processes multiple nodes independently', async () => {
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'manual_trigger') {
        return { inputSchema: { payload: { fillMode: { default: 'manual_static' } } } };
      }
      if (type === 'slack') {
        return { inputSchema: { channel: { fillMode: { default: 'runtime_ai' } } } };
      }
      return undefined;
    });
    const n1 = makeNode('n1', 'manual_trigger');
    const n2 = makeNode('n2', 'slack');
    const n3 = makeNode('n3', 'unknown'); // no registry entry
    const workflow: Workflow = { nodes: [n1, n2, n3], edges: [] };

    const result = await runFieldOwnershipStage(workflow);

    expect(result.ok).toBe(true);
    expect(result.fieldOwnershipMap['n1']).toEqual({ payload: 'manual_static' });
    expect(result.fieldOwnershipMap['n2']).toEqual({ channel: 'runtime_ai' });
    expect(result.fieldOwnershipMap['n3']).toBeUndefined();
  });

  it('stamps _fillMode into nodes that have no pre-existing config object', async () => {
    mockRegistryGet.mockReturnValue({
      inputSchema: { text: { fillMode: { default: 'runtime_ai' } } },
    });
    const node: WorkflowNode = {
      id: 'n1',
      type: 'slack',
      data: { label: 'Slack', type: 'slack', category: 'output', config: {} },
    };
    const workflow: Workflow = { nodes: [node], edges: [] };

    await runFieldOwnershipStage(workflow);

    const config = node.data.config as Record<string, any>;
    expect(config._fillMode).toEqual({ text: 'runtime_ai' });
  });
});
