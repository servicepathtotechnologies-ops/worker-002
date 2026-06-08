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

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runStructuralPromptStage } from '../structural-prompt-stage';
import { runStructuralPromptStageRemote } from '../structural-prompt-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRunStructuralPromptStageRemote = runStructuralPromptStageRemote as jest.Mock;

const intent = {
  intent: 'Send an email when triggered',
  triggerType: 'manual_trigger' as const,
  actions: ['send an email'],
  dataFlows: [],
  constraints: [],
  originalPrompt: 'Send an email when triggered',
};

const validBlueprint =
  'WORKFLOW: Route emails on trigger.\n\nTRIGGER: Manual Trigger - starts on demand.\n\nFLOW:\n1. Gmail - sends an email\n\nCONNECTIONS: Manual Trigger passes payload to Gmail.';

const remoteSuccess = {
  ok: true as const,
  structuralPrompt: validBlueprint,
  durationMs: 15,
  llmCall: { model: 'gemini-3.5-flash', temperature: 0.2, promptTokens: 8, completionTokens: 12 },
};

describe('runStructuralPromptStage remote delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses ai-generator result and skips local Gemini on remote success', async () => {
    mockRunStructuralPromptStageRemote.mockResolvedValue(remoteSuccess);

    const result = await runStructuralPromptStage(intent, '[]', 'remote-success');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structuralPrompt).toBe(validBlueprint);
    expect(result.llmCall.model).toBe('gemini-3.5-flash');
    expect(result.llmCall.promptTokens).toBe(8);
    expect(result.llmCall.completionTokens).toBe(12);

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunStructuralPromptStageRemote).toHaveBeenCalledWith(
      intent,
      '[]',
      'remote-success',
      undefined,
    );
  });

  it('falls back to local Gemini when ai-generator returns null (AI_GENERATOR_URL unset)', async () => {
    mockRunStructuralPromptStageRemote.mockResolvedValue(null);
    mockProcessRequest.mockResolvedValue(validBlueprint);

    const result = await runStructuralPromptStage(intent, '[]', 'no-url');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-generation',
      expect.objectContaining({ message: expect.any(String) }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.2, cache: false }),
    );
  });

  it('falls back to local Gemini when ai-generator returns INVALID_LLM_RESPONSE', async () => {
    mockRunStructuralPromptStageRemote.mockResolvedValue({
      ok: false as const,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'bad response',
      durationMs: 5,
    });
    mockProcessRequest.mockResolvedValue(validBlueprint);

    const result = await runStructuralPromptStage(intent, '[]', 'remote-invalid');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'workflow-generation',
      expect.objectContaining({ message: expect.any(String) }),
      expect.objectContaining({ model: 'gemini-3.5-flash' }),
    );
  });
});
