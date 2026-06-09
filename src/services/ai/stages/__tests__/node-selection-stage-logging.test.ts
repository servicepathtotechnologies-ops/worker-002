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

jest.mock('../node-selection-stage-client', () => ({
  runNodeSelectionJsonRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  NODE_SELECTION_OUTPUT_SCHEMA: {
    type: 'object',
    properties: { selectedNodes: { type: 'array' } },
  },
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'NODE_SELECTION_SYSTEM_PROMPT' })),
  },
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    resolveAlias: jest.fn((type: string) => (type === 'gmail_alias' ? 'google_gmail' : type)),
    get: jest.fn(),
    isTrigger: jest.fn((type: string) => type === 'manual_trigger'),
    getCategory: jest.fn((type: string) => {
      if (type === 'manual_trigger') return 'trigger';
      if (type === 'switch') return 'logic';
      return 'communication';
    }),
  },
}));

jest.mock('../../pipeline-observability', () => ({
  incrementPipelineCounter: jest.fn(),
}));

import { logger } from '../../../../core/logger';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runNodeSelectionStage } from '../node-selection-stage';
import { runNodeSelectionJsonRemote } from '../node-selection-stage-client';
import type { StructuredIntent } from '../intent-stage';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRunNodeSelectionJsonRemote = runNodeSelectionJsonRemote as jest.Mock;

const intent: StructuredIntent = {
  intent: 'Send a Gmail message when manually triggered',
  triggerType: 'manual_trigger',
  actions: ['send a Gmail message'],
  dataFlows: [],
  constraints: [],
  originalPrompt: 'Send a Gmail message when manually triggered',
};

function makeSelectionJson(selectedNodes: Array<{ type: string; role: string; reason: string }>) {
  return JSON.stringify({ selectedNodes });
}

function mockRegistryDefinitions() {
  mockRegistryGet.mockImplementation((type: string) => {
    if (type === 'manual_trigger') {
      return {
        type,
        label: 'Manual Trigger',
        category: 'trigger',
      };
    }
    if (type === 'google_gmail') {
      return {
        type,
        label: 'Gmail',
        category: 'communication',
        workflowBehavior: { alwaysTerminal: true },
      };
    }
    if (type === 'http_request') {
      return {
        type,
        label: 'HTTP Request',
        category: 'integration',
      };
    }
    return undefined;
  });
}

describe('runNodeSelectionStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryDefinitions();
    mockRunNodeSelectionJsonRemote.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start, remote selection call, and end summaries for remote success', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1042);
    mockRunNodeSelectionJsonRemote.mockResolvedValue({
      ok: true,
      selectedNodes: [
        { type: 'manual_trigger', role: 'trigger', reason: 'Start manually' },
        { type: 'google_gmail', role: 'terminal', reason: 'Send the Gmail message' },
      ],
      durationMs: 12,
      llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 7, completionTokens: 13 },
    });

    const result = await runNodeSelectionStage(intent, 'CATALOG_TEXT', 'node-remote-success');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected remote node selection to succeed');
    expect(result.durationMs).toBe(42);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'node_selection',
      correlationId: 'node-remote-success',
      inputSummary: 'actions=1, triggerType=manual_trigger',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_llm_call',
      stage: 'node_selection',
      correlationId: 'node-remote-success',
      model: 'gemini-3.5-flash',
      temperature: 0.1,
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(3, {
      event: 'ai_pipeline_stage_end',
      stage: 'node_selection',
      correlationId: 'node-remote-success',
      outputSummary: 'selectedNodes=2',
      durationMs: 42,
    });
  });

  it('logs remote fallback warning before the local Gemini call', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2031);
    mockRunNodeSelectionJsonRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not-json',
      durationMs: 9,
    });
    mockProcessRequest.mockResolvedValue(makeSelectionJson([
      { type: 'manual_trigger', role: 'trigger', reason: 'Start manually' },
      { type: 'google_gmail', role: 'terminal', reason: 'Send Gmail' },
    ]));

    const result = await runNodeSelectionStage(intent, '[]', 'node-remote-invalid');

    expect(result.ok).toBe(true);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_pipeline_stage_warn',
      stage: 'node_selection',
      correlationId: 'node-remote-invalid',
      reason: expect.stringContaining('ai-generator returned INVALID_LLM_RESPONSE'),
    }));
    expect(mockLoggerWarn.mock.invocationCallOrder[0]).toBeLessThan(
      mockProcessRequest.mock.invocationCallOrder[0],
    );
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'node_selection',
      correlationId: 'node-remote-invalid',
      outputSummary: 'selectedNodes=2',
      durationMs: 31,
    });
  });

  it('logs local retry diagnostics and final selection summary when retry parsing succeeds', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(3000).mockReturnValueOnce(3036);
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(makeSelectionJson([
        { type: 'manual_trigger', role: 'trigger', reason: 'Start manually' },
        { type: 'google_gmail', role: 'terminal', reason: 'Send Gmail' },
      ]));

    const result = await runNodeSelectionStage(intent, '[]', 'node-local-retry');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_retry',
      stage: 'node_selection',
      correlationId: 'node-local-retry',
      reason: 'STRUCTURED_DECODE_FAILED',
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'node_selection',
      correlationId: 'node-local-retry',
      outputSummary: 'selectedNodes=2',
      durationMs: 36,
    });
  });

  it('logs invalid retry output and deterministic recovery fallback', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(4000).mockReturnValueOnce(4041);
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('still-not-json');

    const result = await runNodeSelectionStage(
      intent,
      '[]',
      'node-local-invalid',
      undefined,
      { requiredNodeTypes: ['gmail_alias', 'http_request'] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected deterministic node selection recovery to succeed');
    expect(result.durationMs).toBe(41);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_retry',
      stage: 'node_selection',
      correlationId: 'node-local-invalid',
      reason: 'STRUCTURED_DECODE_FAILED',
    });
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_error',
      stage: 'node_selection',
      correlationId: 'node-local-invalid',
      error: 'INVALID_LLM_RESPONSE',
      llmResponse: 'still-not-json',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_fallback',
      stage: 'node_selection',
      correlationId: 'node-local-invalid',
      reason: 'DETERMINISTIC_RECOVERY_FROM_INTENT_AND_REQUIRED_TYPES',
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'node_selection',
      correlationId: 'node-local-invalid',
      outputSummary: 'selectedNodes=3',
      durationMs: 41,
    });
  });
});
