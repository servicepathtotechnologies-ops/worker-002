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

import { createHash } from 'crypto';
import { logger } from '../../../../core/logger';
import { runIntentAnalysis } from '../capability-intent-analyzer';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import type { UseCaseUnit } from '../capability-types';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;

const CATALOG = '["form_trigger","slack"]';
const PROMPT = 'When a form arrives, post a summary to Slack';

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

function unit(overrides: Partial<UseCaseUnit> = {}): UseCaseUnit {
  return {
    unitId: 'unit-trigger',
    label: 'Collect form submission',
    semanticRole: 'trigger',
    description: 'Fires when a form is submitted',
    orderIndex: 0,
    ...overrides,
  };
}

function validUnitsJson(): string {
  return JSON.stringify([
    unit(),
    unit({
      unitId: 'unit-slack',
      label: 'Send Slack notification',
      semanticRole: 'communication',
      description: 'Posts the form summary to Slack',
      orderIndex: 1,
    }),
  ]);
}

function noTriggerUnitsJson(): string {
  return JSON.stringify([
    unit({
      unitId: 'unit-slack',
      label: 'Send Slack notification',
      semanticRole: 'communication',
      description: 'Posts the form summary to Slack',
      orderIndex: 0,
    }),
  ]);
}

describe('runIntentAnalysis logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start and end metadata with prompt hash, prompt length, unit count, and measured duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1048);
    mockProcessRequest.mockResolvedValue(validUnitsJson());
    const expectedHash = hashPrompt(PROMPT);

    const result = await runIntentAnalysis(PROMPT, CATALOG, 'cap-intent-success');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected intent analysis to succeed');
    expect(result.durationMs).toBe(48);
    expect(result.promptHash).toBe(expectedHash);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'capability_intent_analysis_start',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-success',
      promptHash: expectedHash,
      promptLength: PROMPT.length,
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'capability_intent_analysis_end',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-success',
      promptHash: expectedHash,
      unitCount: 2,
      durationMs: 48,
    });
  });

  it('logs parse retry diagnostics before the retry call and marks the success as retried', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2037);
    mockProcessRequest
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(validUnitsJson());
    const expectedHash = hashPrompt(PROMPT);

    const result = await runIntentAnalysis(PROMPT, CATALOG, 'cap-intent-parse-retry');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected intent analysis retry to succeed');
    expect(result.durationMs).toBe(37);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'capability_intent_analysis_retry',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-parse-retry',
      promptHash: expectedHash,
      reason: expect.stringContaining('JSON parse failed on first attempt'),
    });
    expect(mockLoggerWarn.mock.invocationCallOrder[0]).toBeLessThan(
      mockProcessRequest.mock.invocationCallOrder[1],
    );
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'capability_intent_analysis_end',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-parse-retry',
      promptHash: expectedHash,
      unitCount: 2,
      durationMs: 37,
      retried: true,
    });
  });

  it('logs validation retry diagnostics and final invalid-response details when retry validation fails', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(3000).mockReturnValueOnce(3044);
    mockProcessRequest.mockResolvedValue(noTriggerUnitsJson());
    const expectedHash = hashPrompt(PROMPT);

    const result = await runIntentAnalysis(PROMPT, CATALOG, 'cap-intent-validation-failed');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
    expect(result.durationMs).toBe(44);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'capability_intent_analysis_retry',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-validation-failed',
      promptHash: expectedHash,
      reason: expect.stringContaining('MISSING_TRIGGER'),
    });
    expect(mockLoggerWarn.mock.invocationCallOrder[0]).toBeLessThan(
      mockProcessRequest.mock.invocationCallOrder[1],
    );
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'capability_intent_analysis_error',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-validation-failed',
      promptHash: expectedHash,
      error: 'INVALID_LLM_RESPONSE',
      violation: expect.stringContaining('MISSING_TRIGGER'),
      durationMs: 44,
    });
  });

  it('logs first-call LLM failure with prompt hash and measured duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(4000).mockReturnValueOnce(4019);
    mockProcessRequest.mockRejectedValue(new Error('upstream unavailable'));
    const expectedHash = hashPrompt(PROMPT);

    const result = await runIntentAnalysis(PROMPT, CATALOG, 'cap-intent-llm-failed');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(result.durationMs).toBe(19);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'capability_intent_analysis_error',
      stage: 'capability-intent-analyzer',
      correlationId: 'cap-intent-llm-failed',
      promptHash: expectedHash,
      error: 'LLM_CALL_FAILED',
      message: 'Error: upstream unavailable',
      durationMs: 19,
    });
  });
});
