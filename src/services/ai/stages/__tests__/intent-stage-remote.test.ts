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
  buildNodeCatalogText: jest.fn(() => '[]'),
}));

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runIntentStage } from '../intent-stage';
import { runIntentStageRemote } from '../intent-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRunIntentStageRemote = runIntentStageRemote as jest.Mock;

const remoteSuccess = {
  ok: true as const,
  intent: {
    intent: 'Send an email when triggered',
    triggerType: 'manual_trigger' as const,
    actions: ['send an email'],
    dataFlows: [],
    constraints: [],
    originalPrompt: 'remote-set-prompt',
  },
  durationMs: 15,
  llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 8, completionTokens: 12 },
};

describe('runIntentStage remote delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses ai-generator result and skips local Gemini on remote success', async () => {
    mockRunIntentStageRemote.mockResolvedValue(remoteSuccess);

    const result = await runIntentStage('Send an email when triggered', '[]', 'remote-success');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intent.intent).toBe('Send an email when triggered');
    expect(result.intent.triggerType).toBe('manual_trigger');
    expect(result.llmCall.model).toBe('gemini-3.5-flash');
    expect(result.llmCall.promptTokens).toBe(8);
    expect(result.llmCall.completionTokens).toBe(12);

    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunIntentStageRemote).toHaveBeenCalledWith(
      'Send an email when triggered',
      '[]',
      'remote-success',
    );
  });

  it('always overwrites originalPrompt with the input userPrompt even when remote returns a different value', async () => {
    mockRunIntentStageRemote.mockResolvedValue(remoteSuccess);

    const result = await runIntentStage('My actual user prompt', '[]', 'corr-prompt');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // remote.intent.originalPrompt is 'remote-set-prompt' — must be overwritten
    expect(result.intent.originalPrompt).toBe('My actual user prompt');
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('falls back to local Gemini when ai-generator returns null (AI_GENERATOR_URL unset)', async () => {
    mockRunIntentStageRemote.mockResolvedValue(null);
    const localJson = JSON.stringify({
      intent: 'Send an email',
      triggerType: 'manual_trigger',
      actions: ['send an email'],
      dataFlows: [],
      constraints: [],
    });
    mockProcessRequest.mockResolvedValue(localJson);

    const result = await runIntentStage('Send an email', '[]', 'no-url');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'intent-analysis',
      expect.objectContaining({
        system: 'INTENT_SYSTEM_PROMPT',
        message: 'Send an email',
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('falls back to local Gemini when ai-generator returns INVALID_LLM_RESPONSE', async () => {
    mockRunIntentStageRemote.mockResolvedValue({
      ok: false as const,
      code: 'INVALID_LLM_RESPONSE' as const,
      rawResponse: 'not json',
      durationMs: 5,
    });
    const localJson = JSON.stringify({
      intent: 'Send an email',
      triggerType: 'manual_trigger',
      actions: ['send an email'],
      dataFlows: [],
      constraints: [],
    });
    mockProcessRequest.mockResolvedValue(localJson);

    const result = await runIntentStage('Send an email', '[]', 'remote-invalid');

    expect(result.ok).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledWith(
      'intent-analysis',
      expect.objectContaining({ message: 'Send an email' }),
      expect.objectContaining({ model: 'gemini-3.5-flash' }),
    );
  });
});
