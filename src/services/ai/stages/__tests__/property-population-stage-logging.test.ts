jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

jest.mock('../property-population-stage-client', () => ({
  runPropertyPopulationJsonRemote: jest.fn(),
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getBuildValueContext: jest.fn(),
  },
}));

import { logger } from '../../../../core/logger';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { Workflow } from '../../../../core/types/ai-types';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runPropertyPopulationJsonRemote } from '../property-population-stage-client';
import { runPropertyPopulationStage } from '../property-population-stage';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockGetBuildValueContext = unifiedNodeRegistry.getBuildValueContext as jest.Mock;
const mockRunPropertyPopulationJsonRemote = runPropertyPopulationJsonRemote as jest.Mock;

function makeWorkflow(): Workflow {
  return {
    nodes: [
      {
        id: 'node_1',
        type: 'set_variable',
        data: {
          label: 'Set Variable',
          type: 'set_variable',
          category: 'logic',
          config: {},
        },
      },
    ],
    edges: [{ id: 'edge_1', source: 'trigger_1', target: 'node_1' }],
  };
}

function remoteSuccess(values: Record<string, unknown>) {
  return {
    ok: true,
    values,
    durationMs: 8,
    llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 1, completionTokens: 1 },
  };
}

function installRegistryNode(inputSchema: Record<string, any>, defaultConfig: () => Record<string, unknown>) {
  mockRegistryGet.mockReturnValue({
    inputSchema,
    defaultConfig,
  });
}

describe('runPropertyPopulationStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPropertyPopulationJsonRemote.mockResolvedValue(null);
    mockGetBuildValueContext.mockReturnValue({ upstreamFields: [], targetFields: [] });
  });

  it('logs stage start and end with summaries, correlationId, and measured duration', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1042);
    mockRunPropertyPopulationJsonRemote.mockResolvedValue(remoteSuccess({ subject: 'Lead follow up' }));
    installRegistryNode(
      {
        subject: {
          type: 'string',
          description: 'Message subject',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      () => ({ subject: '' }),
    );

    try {
      const result = await runPropertyPopulationStage({
        workflow: makeWorkflow(),
        userIntent: 'Send a follow-up message to new leads.',
        structuralPrompt: 'trigger -> set_variable',
        correlationId: 'property-logging-success',
      });

      expect(result.propertyPopulationSummary).toEqual({ node_1: ['subject'] });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ai_pipeline_stage_start',
          stage: 'property_population',
          correlationId: 'property-logging-success',
          inputSummary: 'nodes=1',
        }),
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ai_pipeline_stage_end',
          stage: 'property_population',
          correlationId: 'property-logging-success',
          outputSummary: 'populated=1 nodes',
          durationMs: 42,
        }),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('logs a node-scoped fallback warning when ai-generator returns invalid JSON', async () => {
    mockRunPropertyPopulationJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not json',
      durationMs: 5,
    });
    mockProcessRequest.mockResolvedValue(JSON.stringify({ subject: 'Recovered subject' }));
    installRegistryNode(
      {
        subject: {
          type: 'string',
          description: 'Message subject',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      () => ({ subject: '' }),
    );

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Recover property population locally.',
      structuralPrompt: 'trigger -> set_variable',
      correlationId: 'property-remote-invalid',
    });

    expect(result.propertyPopulationSummary.node_1).toEqual(['subject']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_warn',
        stage: 'property_population',
        correlationId: 'property-remote-invalid',
        nodeId: 'node_1',
        nodeType: 'set_variable',
        reason: expect.stringContaining('ai-generator returned INVALID_LLM_RESPONSE'),
      }),
    );
  });

  it('logs a retry warning with node context after an unparseable local response', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(JSON.stringify({ subject: 'Retried subject' }));
    installRegistryNode(
      {
        subject: {
          type: 'string',
          description: 'Message subject',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      () => ({ subject: '' }),
    );

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Retry invalid local JSON.',
      structuralPrompt: 'trigger -> set_variable',
      correlationId: 'property-local-retry',
    });

    expect(result.propertyPopulationSummary.node_1).toEqual(['subject']);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_warn',
        stage: 'property_population',
        correlationId: 'property-local-retry',
        nodeId: 'node_1',
        nodeType: 'set_variable',
        reason: expect.stringContaining('unparseable JSON'),
      }),
    );
  });

  it('logs default-config fallback after local retry exhaustion and still ends the stage', async () => {
    mockProcessRequest.mockResolvedValue('still-not-json');
    installRegistryNode(
      {
        subject: {
          type: 'string',
          description: 'Message subject',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      () => ({ subject: 'Default subject' }),
    );

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Use defaults when local JSON cannot be parsed.',
      structuralPrompt: 'trigger -> set_variable',
      correlationId: 'property-default-fallback',
    });

    expect(result.ok).toBe(true);
    expect(result.propertyPopulationSummary).toEqual({});
    expect(result.workflow.nodes[0].data.config).toEqual({ subject: 'Default subject' });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_warn',
        stage: 'property_population',
        correlationId: 'property-default-fallback',
        nodeId: 'node_1',
        nodeType: 'set_variable',
        reason: expect.stringContaining('using defaultConfig'),
      }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_end',
        stage: 'property_population',
        correlationId: 'property-default-fallback',
        outputSummary: 'populated=0 nodes',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('logs field-specific JSON parse failures for array string values', async () => {
    mockRunPropertyPopulationJsonRemote.mockResolvedValue(remoteSuccess({ conditions: 'not an array json' }));
    installRegistryNode(
      {
        conditions: {
          type: 'array',
          description: 'Filter conditions',
          fillMode: { default: 'buildtime_ai_once' },
          ownership: 'value',
        },
      },
      () => ({ conditions: [{ field: '$json.status', operator: 'equals', value: 'active' }] }),
    );

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Filter active users.',
      structuralPrompt: 'trigger -> set_variable',
      correlationId: 'property-field-parse-failure',
    });

    expect(result.workflow.nodes[0].data.config.conditions).toEqual([
      { field: '$json.status', operator: 'equals', value: 'active' },
    ]);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_warn',
        stage: 'property_population',
        correlationId: 'property-field-parse-failure',
        nodeId: 'node_1',
        nodeType: 'set_variable',
        field: 'conditions',
        reason: expect.stringContaining('Failed to JSON.parse string value'),
      }),
    );
  });
});
