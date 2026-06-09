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

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRunStructuralPromptStageRemote = runStructuralPromptStageRemote as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;

const intent = {
  intent: 'When a form is submitted, route payment status updates',
  triggerType: 'form' as const,
  actions: ['evaluate payment status', 'send success email', 'post failed payment alert'],
  dataFlows: [
    { from: 'Form Trigger', to: 'Switch', dataDescription: 'payment_status and order_id' },
    { from: 'Switch', to: 'Gmail', dataDescription: 'successful payment payload' },
  ],
  constraints: ['use selected nodes only'],
  originalPrompt: 'Route payment status updates',
};

const blueprint =
  'WORKFLOW: Route payment updates by status.\n\n' +
  'TRIGGER: Form Trigger - collects payment status.\n\n' +
  'FLOW:\n' +
  '1. Switch - evaluates payment_status\n' +
  '  -> Case "success": Gmail - sends confirmation\n\n' +
  'CONNECTIONS: Form Trigger passes payment_status to Switch.';

describe('runStructuralPromptStage local Gemini behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunStructuralPromptStageRemote.mockResolvedValue(null);
  });

  it('returns a trimmed blueprint from a string Gemini response', async () => {
    mockProcessRequest.mockResolvedValue(`\n${blueprint}\n`);

    const result = await runStructuralPromptStage(intent, '[]', 'local-string');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful structural prompt result');
    expect(result.structuralPrompt).toBe(blueprint);
    expect(result.llmCall).toEqual({
      model: 'gemini-3.5-flash',
      temperature: 0.2,
      promptTokens: expect.any(Number),
      completionTokens: Math.ceil((`\n${blueprint}\n`).length / 4),
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-generation',
      expect.objectContaining({
        system: expect.stringContaining('workflow blueprint architect'),
        message: expect.stringContaining('USER_INTENT:'),
      }),
      { model: 'gemini-3.5-flash', temperature: 0.2, cache: false },
    );
  });

  it('extracts the blueprint from an object text field', async () => {
    mockProcessRequest.mockResolvedValue({ text: `  ${blueprint}  ` });

    const result = await runStructuralPromptStage(intent, '[]', 'local-text');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful structural prompt result');
    expect(result.structuralPrompt).toBe(blueprint);
    expect(result.llmCall.completionTokens).toBe(Math.ceil((`  ${blueprint}  `).length / 4));
  });

  it('extracts the blueprint from an object content field', async () => {
    mockProcessRequest.mockResolvedValue({ content: `\t${blueprint}\t` });

    const result = await runStructuralPromptStage(intent, '[]', 'local-content');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful structural prompt result');
    expect(result.structuralPrompt).toBe(blueprint);
    expect(result.llmCall.completionTokens).toBe(Math.ceil((`\t${blueprint}\t`).length / 4));
  });

  it('forwards selected node constraints to remote and embeds them in the local prompt', async () => {
    const constraints = {
      selectedNodeConstraintsByStep: {
        '1': ['form', 'switch'],
        '2': ['gmail'],
      },
      selectedNodeConstraintsFlat: ['form', 'switch', 'gmail'],
    };
    mockProcessRequest.mockResolvedValue(blueprint);

    const result = await runStructuralPromptStage(intent, 'catalog text', 'with-constraints', constraints);

    expect(result.ok).toBe(true);
    expect(mockRunStructuralPromptStageRemote).toHaveBeenCalledWith(
      intent,
      'catalog text',
      'with-constraints',
      constraints,
    );
    const message = mockProcessRequest.mock.calls[0][1].message as string;
    expect(message).toContain('SELECTED_NODES: form, switch, gmail');
    expect(message).toContain('"selectedNodeConstraintsByStep": {');
    expect(message).toContain('"1": [');
    expect(message).toContain('"gmail"');
  });

  it('uses an intent-based selected-node placeholder when constraints are absent', async () => {
    mockProcessRequest.mockResolvedValue(blueprint);

    await runStructuralPromptStage(intent, '[]', 'no-constraints');

    const message = mockProcessRequest.mock.calls[0][1].message as string;
    expect(message).toContain('SELECTED_NODES: nodes from intent');
    expect(message).toContain('"selectedNodeConstraintsByStep": {}');
    expect(message).toContain('"selectedNodeConstraintsFlat": []');
  });

  it('retries once with an explicit format reminder when the first response is empty', async () => {
    const retryBlueprint = `${blueprint}\nRetry recovered.`;
    mockProcessRequest
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce({ text: retryBlueprint });

    const result = await runStructuralPromptStage(intent, '[]', 'retry-empty');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful retry result');
    expect(result.structuralPrompt).toBe(retryBlueprint);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai_pipeline_stage_retry', stage: 'structural_prompt' }),
    );
    expect(mockProcessRequest.mock.calls[1][1].system).toContain('CRITICAL: You MUST return');
  });

  it('retries once when Gemini returns an object without text or content', async () => {
    mockProcessRequest
      .mockResolvedValueOnce({ candidates: [] })
      .mockResolvedValueOnce({ content: blueprint });

    const result = await runStructuralPromptStage(intent, '[]', 'retry-object');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful retry result');
    expect(result.structuralPrompt).toBe(blueprint);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns INVALID_LLM_RESPONSE when the first local Gemini call throws', async () => {
    mockProcessRequest.mockRejectedValue(new Error('local failure'));

    const result = await runStructuralPromptStage(intent, '[]', 'first-throw');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'Error: local failure',
      durationMs: expect.any(Number),
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai_pipeline_stage_error', error: 'LLM_CALL_FAILED' }),
    );
  });

  it('returns INVALID_LLM_RESPONSE when the retry call throws', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('retry failure'));

    const result = await runStructuralPromptStage(intent, '[]', 'retry-throw');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'Error: retry failure',
      durationMs: expect.any(Number),
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai_pipeline_stage_error', error: 'LLM_RETRY_FAILED' }),
    );
  });

  it('returns INVALID_LLM_RESPONSE when the retry response is still empty', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce({ text: '' });

    const result = await runStructuralPromptStage(intent, '[]', 'retry-empty-again');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: '',
      durationMs: expect.any(Number),
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai_pipeline_stage_error', error: 'INVALID_LLM_RESPONSE' }),
    );
  });

  it('warns and falls back locally when the remote stage returns an invalid response', async () => {
    mockRunStructuralPromptStageRemote.mockResolvedValue({
      ok: false,
      code: 'INVALID_LLM_RESPONSE',
      rawResponse: 'not a blueprint',
      durationMs: 8,
    });
    mockProcessRequest.mockResolvedValue(blueprint);

    const result = await runStructuralPromptStage(intent, '[]', 'remote-invalid-local');

    expect(result.ok).toBe(true);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_warn',
        stage: 'structural_prompt',
        reason: expect.stringContaining('INVALID_LLM_RESPONSE'),
      }),
    );
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });
});
