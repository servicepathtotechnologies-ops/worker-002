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

import { logger } from '../../../../core/logger';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { Workflow, WorkflowNode } from '../../../../core/types/ai-types';
import { runFieldOwnershipStage } from '../field-ownership-stage';

const mockLoggerInfo = logger.info as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;

function makeNode(id: string, type: string): WorkflowNode {
  return {
    id,
    type,
    data: {
      label: type,
      type,
      category: 'utility',
      config: {},
    },
  };
}

describe('runFieldOwnershipStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start and end summaries for discovered field ownership', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1042);
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'slack') {
        return {
          inputSchema: {
            channel: { fillMode: { default: 'manual_static' } },
            text: { fillMode: { default: 'runtime_ai' } },
          },
        };
      }
      if (type === 'manual_trigger') {
        return {
          inputSchema: {
            payload: {},
          },
        };
      }
      return undefined;
    });
    const workflow: Workflow = {
      nodes: [
        makeNode('slack_1', 'slack'),
        makeNode('trigger_1', 'manual_trigger'),
        makeNode('unknown_1', 'unknown'),
      ],
      edges: [],
    };

    const result = await runFieldOwnershipStage(workflow, 'corr-112');

    expect(result.ok).toBe(true);
    expect(result.durationMs).toBe(42);
    expect(result.fieldOwnershipMap).toEqual({
      slack_1: {
        channel: 'manual_static',
        text: 'runtime_ai',
      },
      trigger_1: {
        payload: 'manual_static',
      },
    });
    expect(mockLoggerInfo).toHaveBeenCalledTimes(2);
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'field_ownership',
      correlationId: 'corr-112',
      inputSummary: 'nodes=3',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_stage_end',
      stage: 'field_ownership',
      correlationId: 'corr-112',
      outputSummary: 'nodes=2, fields=3',
      durationMs: 42,
    });
  });

  it('logs an empty ownership summary when no fields are discovered', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2015);
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'empty_schema') {
        return { inputSchema: {} };
      }
      return undefined;
    });
    const workflow: Workflow = {
      nodes: [makeNode('empty_1', 'empty_schema'), makeNode('missing_1', 'missing')],
      edges: [],
    };

    const result = await runFieldOwnershipStage(workflow, 'corr-empty');

    expect(result.ok).toBe(true);
    expect(result.durationMs).toBe(15);
    expect(result.fieldOwnershipMap).toEqual({});
    expect(mockLoggerInfo).toHaveBeenCalledTimes(2);
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'field_ownership',
      correlationId: 'corr-empty',
      inputSummary: 'nodes=2',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_stage_end',
      stage: 'field_ownership',
      correlationId: 'corr-empty',
      outputSummary: 'nodes=0, fields=0',
      durationMs: 15,
    });
  });
});
