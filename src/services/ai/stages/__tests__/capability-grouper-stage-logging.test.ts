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

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    has: jest.fn(),
    getRequiredCredentials: jest.fn(),
  },
}));

jest.mock('../../../credential-vault', () => ({
  getCredentialVault: jest.fn(),
}));

import { logger } from '../../../../core/logger';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runCapabilityGrouping } from '../capability-grouper-stage';
import type { UseCaseUnit } from '../capability-types';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockRegistryHas = unifiedNodeRegistry.has as jest.Mock;
const mockRegistryGetRequiredCredentials = unifiedNodeRegistry.getRequiredCredentials as jest.Mock;

const CATALOG = '["slack","google_gmail"]';

function mockNow(start: number, end: number): void {
  jest.spyOn(Date, 'now').mockReturnValueOnce(start).mockReturnValue(end);
}

function unit(overrides: Partial<UseCaseUnit> = {}): UseCaseUnit {
  return {
    unitId: 'unit-slack',
    label: 'Send Slack notification',
    semanticRole: 'communication',
    description: 'Posts a workflow update to a Slack channel',
    orderIndex: 0,
    ...overrides,
  };
}

function containerJson(label: string, candidates: unknown[]): string {
  return JSON.stringify({
    containerId: 'llm-container-id',
    label,
    candidates,
  });
}

describe('runCapabilityGrouping logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryHas.mockImplementation((nodeType: string) => nodeType === 'slack');
    mockRegistryGet.mockImplementation((nodeType: string) => {
      if (nodeType === 'slack') {
        return {
          category: 'output',
          label: 'Slack',
          description: 'Send Slack messages',
        };
      }
      return undefined;
    });
    mockRegistryGetRequiredCredentials.mockReturnValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start and end metadata with correlation id, counts, and measured duration', async () => {
    mockNow(1000, 1042);
    mockProcessRequest.mockResolvedValue(containerJson('Send Slack Message', ['slack']));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-1', 'grouper-success');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected grouping to succeed');
    expect(result.durationMs).toBe(42);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'capability_grouper_start',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-success',
      unitCount: 1,
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'capability_grouper_end',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-success',
      containerCount: 1,
      durationMs: 42,
    });
  });

  it('logs parse retry diagnostics before the second LLM call and ends with success metadata', async () => {
    mockNow(2000, 2036);
    mockProcessRequest
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(containerJson('Slack Retry', ['slack']));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-2', 'grouper-parse-retry');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected grouping retry to succeed');
    expect(result.durationMs).toBe(36);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'capability_grouper_retry',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-parse-retry',
      unitId: 'unit-slack',
      reason: expect.stringContaining('JSON parse failed on first attempt'),
    });
    expect(mockLoggerWarn.mock.invocationCallOrder[0]).toBeLessThan(
      mockProcessRequest.mock.invocationCallOrder[1],
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'capability_grouper_end',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-parse-retry',
      containerCount: 1,
      durationMs: 36,
    });
  });

  it('logs invalid candidates, retry diagnostics, and failed end metadata when retry stays empty', async () => {
    mockNow(3000, 3055);
    mockRegistryHas.mockReturnValue(false);
    mockProcessRequest
      .mockResolvedValueOnce(containerJson('Bad First Attempt', ['bad_node']))
      .mockResolvedValueOnce(containerJson('Bad Retry', ['still_bad']));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-3', 'grouper-empty');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('EMPTY_CONTAINER');
    expect(result.durationMs).toBe(55);
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'capability_grouper_invalid_candidate',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-empty',
      unitId: 'unit-slack',
      candidate: 'bad_node',
      reason: 'Not found in unifiedNodeRegistry',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'capability_grouper_retry',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-empty',
      unitId: 'unit-slack',
      reason: expect.stringContaining('All candidates invalid after registry validation'),
      invalidCandidates: ['bad_node'],
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'capability_grouper_invalid_candidate',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-empty',
      unitId: 'unit-slack',
      candidate: 'still_bad',
      reason: 'Not found in unifiedNodeRegistry',
    });
    expect(mockLoggerError).toHaveBeenNthCalledWith(1, {
      event: 'capability_grouper_error',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-empty',
      unitId: 'unit-slack',
      error: 'EMPTY_CONTAINER',
      message: 'No valid candidates after registry validation retry',
    });
    expect(mockLoggerError).toHaveBeenNthCalledWith(2, {
      event: 'capability_grouper_end',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-empty',
      error: 'EMPTY_CONTAINER',
      failedUnitId: 'unit-slack',
      durationMs: 55,
    });
  });

  it('logs first-call LLM failure and failed end metadata with measured duration', async () => {
    mockNow(4000, 4023);
    mockProcessRequest.mockRejectedValue(new Error('upstream unavailable'));

    const result = await runCapabilityGrouping([unit()], CATALOG, 'user-4', 'grouper-llm-failed');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(result.durationMs).toBe(23);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenNthCalledWith(1, {
      event: 'capability_grouper_llm_error',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-llm-failed',
      unitId: 'unit-slack',
      error: 'LLM_CALL_FAILED',
      message: 'Error: upstream unavailable',
    });
    expect(mockLoggerError).toHaveBeenNthCalledWith(2, {
      event: 'capability_grouper_end',
      stage: 'capability-grouper-stage',
      correlationId: 'grouper-llm-failed',
      error: 'LLM_CALL_FAILED',
      failedUnitId: 'unit-slack',
      durationMs: 23,
    });
  });
});
