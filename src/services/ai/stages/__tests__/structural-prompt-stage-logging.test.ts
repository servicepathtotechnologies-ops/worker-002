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

jest.mock('../structural-prompt-stage-client', () => ({
  runStructuralPromptStageRemote: jest.fn(),
}));

import { logger } from '../../../../core/logger';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runStructuralPromptStage } from '../structural-prompt-stage';
import { runStructuralPromptStageRemote } from '../structural-prompt-stage-client';

const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRunStructuralPromptStageRemote = runStructuralPromptStageRemote as jest.Mock;

const intent = {
  intent: 'Route payment status updates from a form',
  triggerType: 'form' as const,
  actions: ['evaluate payment status', 'send success email'],
  dataFlows: [
    { from: 'Form Trigger', to: 'Switch', dataDescription: 'payment_status' },
  ],
  constraints: [],
  originalPrompt: 'Route payment status updates from a form',
};

const blueprint =
  'WORKFLOW: Route payment updates by status.\n\n' +
  'TRIGGER: Form Trigger - collects payment status.\n\n' +
  'FLOW:\n' +
  '1. Switch - evaluates payment_status\n' +
  '  -> Case "success": Gmail - sends confirmation\n\n' +
  'CONNECTIONS: Form Trigger passes payment_status to Switch.';

describe('runStructuralPromptStage logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start and remote end summaries with measured stage duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1036);
    mockRunStructuralPromptStageRemote.mockResolvedValue({
      ok: true,
      structuralPrompt: blueprint,
      durationMs: 12,
      llmCall: {
        model: 'gemini-3.5-flash',
        temperature: 0.2,
        promptTokens: 8,
        completionTokens: 16,
      },
    });

    const result = await runStructuralPromptStage(intent, 'CATALOG_TEXT', 'corr-113-remote');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected structural prompt to use remote result');
    expect(result.durationMs).toBe(12);
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledTimes(2);
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'structural_prompt',
      correlationId: 'corr-113-remote',
      inputSummary: 'actions=2',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_stage_end',
      stage: 'structural_prompt',
      correlationId: 'corr-113-remote',
      source: 'remote',
      durationMs: 36,
    });
  });

  it('logs remote fallback warning, local LLM call, and local end summary', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2049);
    mockRunStructuralPromptStageRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not a blueprint',
      durationMs: 7,
    });
    mockProcessRequest.mockResolvedValue(blueprint);

    const result = await runStructuralPromptStage(intent, 'CATALOG_TEXT', 'corr-113-local');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected structural prompt to fall back locally');
    expect(result.durationMs).toBe(49);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_pipeline_stage_warn',
      stage: 'structural_prompt',
      correlationId: 'corr-113-local',
      reason: expect.stringContaining('INVALID_LLM_RESPONSE'),
    }));
    expect(mockLoggerInfo).toHaveBeenCalledTimes(3);
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(1, {
      event: 'ai_pipeline_stage_start',
      stage: 'structural_prompt',
      correlationId: 'corr-113-local',
      inputSummary: 'actions=2',
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(2, {
      event: 'ai_pipeline_llm_call',
      stage: 'structural_prompt',
      correlationId: 'corr-113-local',
      model: 'gemini-3.5-flash',
      temperature: 0.2,
    });
    expect(mockLoggerInfo).toHaveBeenNthCalledWith(3, {
      event: 'ai_pipeline_stage_end',
      stage: 'structural_prompt',
      correlationId: 'corr-113-local',
      outputSummary: `len=${blueprint.length}`,
      durationMs: 49,
    });
  });
});
