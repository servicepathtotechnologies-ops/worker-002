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

jest.mock('../intent-stage-client', () => ({
  runIntentStageRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn(() => ({ systemPrompt: 'INTENT_SYSTEM_PROMPT' })),
  },
}));

jest.mock('../../node-catalog-builder', () => ({
  buildNodeCatalogText: jest.fn(() => '[{"type":"manual_trigger"}]'),
}));

import { logger } from '../../../../core/logger';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runIntentStage } from '../intent-stage';
import { runIntentStageRemote } from '../intent-stage-client';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRunIntentStageRemote = runIntentStageRemote as jest.Mock;

function makeIntentJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    intent: 'Send a Gmail message when manually triggered',
    triggerType: 'manual_trigger',
    actions: ['send a Gmail message'],
    dataFlows: [],
    constraints: [],
    ...overrides,
  });
}

function remoteSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    intent: {
      intent: 'Send a Gmail message when manually triggered',
      triggerType: 'manual_trigger' as const,
      actions: ['send a Gmail message'],
      dataFlows: [],
      constraints: [],
      originalPrompt: 'remote prompt',
    },
    durationMs: 9,
    llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 7, completionTokens: 11 },
    ...overrides,
  };
}

describe('runIntentStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunIntentStageRemote.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs stage start and remote end summaries with correlationId and measured duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1044);
    mockRunIntentStageRemote.mockResolvedValue(remoteSuccess());
    const prompt = 'Send a Gmail message when manually triggered';
    const catalog = '[{"type":"manual_trigger"},{"type":"google_gmail"}]';

    const result = await runIntentStage(prompt, catalog, 'intent-remote-success');

    expect(result.ok).toBe(true);
    expect(result.durationMs).toBe(9);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'intent',
      correlationId: 'intent-remote-success',
      inputSummary: `prompt_len=${prompt.length}, catalog_nodes=2`,
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_stage_end',
      stage: 'intent',
      correlationId: 'intent-remote-success',
      source: 'remote',
      durationMs: 44,
    });
  });

  it('logs remote invalid-response fallback before the local Gemini call', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2028);
    mockRunIntentStageRemote.mockResolvedValue({
      ok: false as const,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not-json',
      durationMs: 5,
    });
    mockProcessRequest.mockResolvedValue(makeIntentJson({
      actions: ['read the trigger', 'send a Gmail message'],
      dataFlows: [{ from: 'manual_trigger', to: 'google_gmail', dataDescription: 'message details' }],
    }));

    const result = await runIntentStage(
      'Send a Gmail message after manual approval',
      '[]',
      'intent-remote-invalid',
    );

    expect(result.ok).toBe(true);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_pipeline_stage_warn',
      stage: 'intent',
      correlationId: 'intent-remote-invalid',
      reason: expect.stringContaining('ai-generator returned INVALID_LLM_RESPONSE'),
    }));
    expect(mockLoggerWarn.mock.invocationCallOrder[0]).toBeLessThan(
      mockProcessRequest.mock.invocationCallOrder[0],
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith({
      event: 'ai_pipeline_llm_call',
      stage: 'intent',
      correlationId: 'intent-remote-invalid',
      model: 'gemini-3.5-flash',
      temperature: 0.1,
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'intent',
      correlationId: 'intent-remote-invalid',
      outputSummary: 'actions=2, dataFlows=1',
      durationMs: 28,
    });
  });

  it('logs local retry diagnostics and retry output summary when the second parse succeeds', async () => {
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(3000)
      .mockReturnValueOnce(3012)
      .mockReturnValueOnce(3036)
      .mockReturnValue(3037);
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(makeIntentJson({
        intent: 'Summarize daily rows',
        triggerType: 'schedule',
        actions: ['get rows', 'summarize rows'],
      }));

    const result = await runIntentStage('Every day summarize rows', '[]', 'intent-local-retry');

    expect(result.ok).toBe(true);
    expect(result.durationMs).toBe(37);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_retry',
      stage: 'intent',
      correlationId: 'intent-local-retry',
      reason: 'JSON parse failed on first attempt',
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'intent',
      correlationId: 'intent-local-retry',
      outputSummary: 'actions=2 (retry)',
      durationMs: 36,
    });
  });

  it('logs parse failure and deterministic fallback after local retry exhaustion', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(4000).mockReturnValueOnce(4014).mockReturnValue(4041);
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce('still-not-json');

    const result = await runIntentStage(
      'Every day fetch rows and then send Slack summary',
      '[]',
      'intent-local-invalid',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected deterministic fallback to succeed');
    expect(result.fallback).toBe(true);
    expect(result.durationMs).toBe(41);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_retry',
      stage: 'intent',
      correlationId: 'intent-local-invalid',
      reason: 'JSON parse failed on first attempt',
    });
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_error',
      stage: 'intent',
      correlationId: 'intent-local-invalid',
      error: 'INVALID_LLM_RESPONSE',
      llmResponse: 'still-not-json',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_fallback',
      stage: 'intent',
      correlationId: 'intent-local-invalid',
      reason: 'INVALID_LLM_RESPONSE',
      outputSummary: 'actions=2',
    });
  });
});
