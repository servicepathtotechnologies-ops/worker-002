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

jest.mock('../validation-stage-client', () => ({
  runValidationStageRemote: jest.fn(),
}));

jest.mock('../../system-prompt-builder', () => ({
  systemPromptBuilder: {
    build: jest.fn((params: any) => ({ systemPrompt: `${params.stage.toUpperCase()}_SYSTEM_PROMPT` })),
  },
}));

jest.mock('../../../../core/orchestration/unified-graph-orchestrator', () => ({
  unifiedGraphOrchestrator: {
    validateWorkflow: jest.fn(),
  },
}));

jest.mock('../../../../core/utils/node-field-intelligence', () => ({
  validateWorkflowNodeIntelligence: jest.fn(() => []),
}));

import { logger } from '../../../../core/logger';
import { unifiedGraphOrchestrator } from '../../../../core/orchestration/unified-graph-orchestrator';
import { validateWorkflowNodeIntelligence } from '../../../../core/utils/node-field-intelligence';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runValidationStage } from '../validation-stage';
import { runValidationStageRemote } from '../validation-stage-client';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockValidateWorkflow = unifiedGraphOrchestrator.validateWorkflow as jest.Mock;
const mockValidateWorkflowNodeIntelligence = validateWorkflowNodeIntelligence as jest.Mock;
const mockRunValidationStageRemote = runValidationStageRemote as jest.Mock;

const minimalWorkflow = {
  nodes: [
    {
      id: 'node_manual_trigger_1',
      type: 'manual_trigger',
      data: { label: 'Trigger', type: 'manual_trigger', category: 'trigger', config: {} },
    },
    {
      id: 'node_google_gmail_1',
      type: 'google_gmail',
      data: { label: 'Gmail', type: 'google_gmail', category: 'communication', config: {} },
    },
  ],
  edges: [{ id: 'edge_1', source: 'node_manual_trigger_1', target: 'node_google_gmail_1', type: 'main' }],
};

const selectedNodes = [
  {
    type: 'manual_trigger',
    role: 'trigger' as const,
    reason: 'Start manually',
    nodeId: 'node_manual_trigger_1',
  },
  {
    type: 'google_gmail',
    role: 'terminal' as const,
    reason: 'Send the Gmail message',
    nodeId: 'node_google_gmail_1',
  },
];

const proposedEdges = [
  {
    source: 'node_manual_trigger_1',
    target: 'node_google_gmail_1',
    type: 'main',
  },
];

function remoteSuccess(issues: Array<Record<string, unknown>> = []) {
  return {
    ok: true as const,
    status: 'pass' as const,
    issues,
    durationMs: 8,
    llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 11, completionTokens: 13 },
  };
}

function validationJson(status: 'pass' | 'fail', issues: Array<Record<string, unknown>>) {
  return JSON.stringify({ status, issues });
}

describe('runValidationStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunValidationStageRemote.mockResolvedValue(null);
    mockValidateWorkflow.mockReturnValue({ valid: true, errors: [] });
    mockValidateWorkflowNodeIntelligence.mockReturnValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs stage start and end summaries with correlationId and measured duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1048);
    mockRunValidationStageRemote.mockResolvedValue(remoteSuccess());

    const result = await runValidationStage(
      minimalWorkflow,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      selectedNodes,
      proposedEdges,
      'validation-remote-success',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected validation to succeed');
    expect(result.durationMs).toBe(48);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledTimes(2);
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'validation',
      correlationId: 'validation-remote-success',
      inputSummary: 'nodes=2, edges=1',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_stage_end',
      stage: 'validation',
      correlationId: 'validation-remote-success',
      outputSummary: 'status=pass, warnings=0',
      durationMs: 48,
    });
  });

  it('logs remote invalid-response fallback before ending from the orchestrator safety net', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValue(2026);
    mockRunValidationStageRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not-json',
      durationMs: 5,
    });

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send a Gmail message',
      undefined,
      undefined,
      'validation-remote-invalid',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected safety net to accept the workflow');
    expect(result.durationMs).toBe(26);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_error',
      stage: 'validation',
      correlationId: 'validation-remote-invalid',
      error: 'INVALID_LLM_RESPONSE',
      message: 'not-json',
      note: 'Falling through to orchestrator safety net',
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'validation',
      correlationId: 'validation-remote-invalid',
      outputSummary: 'status=pass (orchestrator fallback), warnings=0',
      durationMs: 26,
    });
  });

  it('logs local retry, parse failure, and safety-net fallback when JSON remains invalid', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(3000).mockReturnValueOnce(3005).mockReturnValue(3033);
    mockProcessRequest.mockResolvedValue('still-not-json');

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send a Gmail message',
      undefined,
      undefined,
      'validation-local-invalid',
    );

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_retry',
      stage: 'validation',
      correlationId: 'validation-local-invalid',
      reason: 'JSON parse failed on first attempt',
    });
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_validation_parse_failed',
      stage: 'validation',
      correlationId: 'validation-local-invalid',
      note: 'Falling through to orchestrator safety net',
    });
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(3, {
      event: 'ai_pipeline_stage_error',
      stage: 'validation',
      correlationId: 'validation-local-invalid',
      error: 'INVALID_LLM_RESPONSE',
      message: 'still-not-json',
      note: 'Falling through to orchestrator safety net',
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'validation',
      correlationId: 'validation-local-invalid',
      outputSummary: 'status=pass (orchestrator fallback), warnings=0',
      durationMs: 33,
    });
  });

  it('logs repair pass and incomplete repair diagnostics for unresolved error issues', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(4000).mockReturnValueOnce(4000).mockReturnValue(4045);
    const errorIssue = {
      severity: 'error',
      description: 'Gmail is disconnected',
      suggestedFix: 'Connect trigger to Gmail',
    };
    mockProcessRequest
      .mockResolvedValueOnce(validationJson('fail', [errorIssue]))
      .mockResolvedValueOnce('repair-did-not-return-json');

    const result = await runValidationStage(
      minimalWorkflow,
      'CATALOG_TEXT',
      'Send a Gmail message when manually triggered',
      selectedNodes,
      proposedEdges,
      'validation-repair-incomplete',
    );

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerInfo).toHaveBeenCalledWith({
      event: 'ai_pipeline_repair_pass',
      stage: 'validation',
      correlationId: 'validation-repair-incomplete',
      errorCount: 1,
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      event: 'ai_pipeline_repair_incomplete',
      stage: 'validation',
      correlationId: 'validation-repair-incomplete',
      remainingErrors: 1,
    });
    expect(mockLoggerInfo).toHaveBeenLastCalledWith({
      event: 'ai_pipeline_stage_end',
      stage: 'validation',
      correlationId: 'validation-repair-incomplete',
      outputSummary: 'status=fail, warnings=0',
      durationMs: 45,
    });
  });

  it('logs orchestrator structural failures without a stage-end success log', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(5000).mockReturnValue(5019);
    mockRunValidationStageRemote.mockResolvedValue(remoteSuccess());
    mockValidateWorkflow.mockReturnValue({ valid: false, errors: ['Missing trigger node'] });

    const result = await runValidationStage(
      minimalWorkflow,
      '[]',
      'Send a Gmail message',
      undefined,
      undefined,
      'validation-structural-failure',
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected structural validation to fail');
    expect(result.code).toBe('ORCHESTRATOR_VALIDATION_FAILED');
    expect(result.durationMs).toBe(19);
    expect(mockLoggerError).toHaveBeenCalledWith({
      event: 'ai_pipeline_stage_error',
      stage: 'validation',
      correlationId: 'validation-structural-failure',
      error: 'ORCHESTRATOR_VALIDATION_FAILED',
      errors: ['Missing trigger node'],
    });
    expect(mockLoggerInfo).not.toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_pipeline_stage_end',
      stage: 'validation',
    }));
  });
});
