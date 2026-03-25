import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../core/execution/dynamic-node-executor', () => ({
  executeNodeDynamically: jest.fn(),
}));

import { executeNode } from '../execute-workflow';
import { executeNodeDynamically } from '../../core/execution/dynamic-node-executor';

describe('executeNode registry success contract', () => {
  const mockDynamic = executeNodeDynamically as any;

  const baseNode: any = {
    id: 'node_text_formatter_1',
    type: 'text_formatter',
    data: {
      type: 'text_formatter',
      label: 'Text Formatter',
      config: {},
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts primitive output from dynamic executor as success', async () => {
    mockDynamic.mockResolvedValue('formatted output string');

    const result = await executeNode(
      baseNode,
      {},
      {} as any,
      {} as any,
      'workflow_1'
    );

    expect(result).toBe('formatted output string');
  });

  it('throws strict registry-only error when registry miss is returned', async () => {
    mockDynamic.mockResolvedValue({
      _error: "node type 'text_formatter' not found in registry",
      _nodeType: 'text_formatter',
    });

    await expect(
      executeNode(baseNode, {}, {} as any, {} as any, 'workflow_1')
    ).rejects.toThrow('Registry-only mode enabled');
  });

  it('allows flow continuation past text_formatter primitive output', async () => {
    const manualTriggerNode = { ...baseNode, id: 'n1', type: 'manual_trigger', data: { ...baseNode.data, type: 'manual_trigger' } };
    const sheetsNode = { ...baseNode, id: 'n2', type: 'google_sheets', data: { ...baseNode.data, type: 'google_sheets' } };
    const formatterNode = { ...baseNode, id: 'n3', type: 'text_formatter', data: { ...baseNode.data, type: 'text_formatter' } };
    const summarizerNode = { ...baseNode, id: 'n4', type: 'text_summarizer', data: { ...baseNode.data, type: 'text_summarizer' } };

    mockDynamic
      .mockResolvedValueOnce({}) // trigger
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // sheets
      .mockResolvedValueOnce('formatted payload') // formatter primitive output
      .mockResolvedValueOnce({ summary: 'ok' }); // downstream still executes

    const out1 = await executeNode(manualTriggerNode, { _trigger: 'manual' }, {} as any, {} as any, 'workflow_1');
    const out2 = await executeNode(sheetsNode, out1, {} as any, {} as any, 'workflow_1');
    const out3 = await executeNode(formatterNode, out2, {} as any, {} as any, 'workflow_1');
    const out4 = await executeNode(summarizerNode, out3, {} as any, {} as any, 'workflow_1');

    expect(out3).toBe('formatted payload');
    expect(out4).toEqual({ summary: 'ok' });
  });
});

