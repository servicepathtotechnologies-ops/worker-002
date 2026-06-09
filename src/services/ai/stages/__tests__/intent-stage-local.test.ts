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

import { geminiOrchestrator } from '../../gemini-orchestrator';
import { buildNodeCatalogText } from '../../node-catalog-builder';
import { systemPromptBuilder } from '../../system-prompt-builder';
import { runIntentStage } from '../intent-stage';
import { runIntentStageRemote } from '../intent-stage-client';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockBuildNodeCatalogText = buildNodeCatalogText as jest.Mock;
const mockBuildPrompt = systemPromptBuilder.build as jest.Mock;
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

describe('runIntentStage local Gemini behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunIntentStageRemote.mockResolvedValue(null);
  });

  it('uses the default node catalog when none is provided for the local prompt', async () => {
    mockProcessRequest.mockResolvedValue(makeIntentJson());

    const result = await runIntentStage('Send a Gmail message when triggered', undefined, 'default-catalog');

    expect(result.ok).toBe(true);
    expect(mockBuildNodeCatalogText).toHaveBeenCalledTimes(1);
    expect(mockRunIntentStageRemote).toHaveBeenCalledWith(
      'Send a Gmail message when triggered',
      '[{"type":"manual_trigger"}]',
      'default-catalog',
    );
    expect(mockBuildPrompt).toHaveBeenCalledWith({
      stage: 'intent',
      nodeCatalog: '[{"type":"manual_trigger"}]',
      userIntent: 'Send a Gmail message when triggered',
    });
  });

  it('parses nested fenced JSON with a BOM and overwrites originalPrompt from local Gemini', async () => {
    mockProcessRequest.mockResolvedValue([
      '\uFEFF```json',
      '```json',
      makeIntentJson({
        intent: 'Route an incoming webhook',
        triggerType: 'webhook',
        actions: ['receive webhook', 'send a Slack message'],
        dataFlows: [{ from: 'webhook', to: 'slack_message', dataDescription: 'payload summary' }],
        constraints: ['only notify once'],
        originalPrompt: 'model supplied prompt',
      }),
      '```',
      '```',
    ].join('\n'));

    const result = await runIntentStage('Actual prompt text', '[]', 'nested-fence');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBeUndefined();
    expect(result.intent).toEqual({
      intent: 'Route an incoming webhook',
      triggerType: 'webhook',
      actions: ['receive webhook', 'send a Slack message'],
      dataFlows: [{ from: 'webhook', to: 'slack_message', dataDescription: 'payload summary' }],
      constraints: ['only notify once'],
      originalPrompt: 'Actual prompt text',
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('recovers required fields from a truncated local JSON response without retrying', async () => {
    mockProcessRequest.mockResolvedValue(
      '{"intent":"Route webhook payloads","triggerType":"webhook","actions":["receive webhook","send Slack alert"',
    );

    const result = await runIntentStage('Route webhook payloads', '[]', 'partial-json');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBeUndefined();
    expect(result.intent).toEqual({
      intent: 'Route webhook payloads',
      triggerType: 'webhook',
      actions: ['receive webhook', 'send Slack alert'],
      dataFlows: [],
      constraints: [],
      originalPrompt: 'Route webhook payloads',
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('retries once with a schema reminder after an invalid first local response', async () => {
    const retryJson = makeIntentJson({
      intent: 'Summarize daily rows',
      triggerType: 'schedule',
      actions: ['get rows', 'summarize rows'],
    });
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(retryJson);

    const result = await runIntentStage('Every day summarize rows', '[]', 'retry-success');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBeUndefined();
    expect(result.intent.triggerType).toBe('schedule');
    expect(result.intent.actions).toEqual(['get rows', 'summarize rows']);
    expect(result.llmCall).toEqual({
      model: 'gemini-3.5-flash',
      temperature: 0.1,
      promptTokens: Math.ceil('INTENT_SYSTEM_PROMPT'.length / 4),
      completionTokens: Math.ceil(retryJson.length / 4),
    });
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'intent-analysis',
      expect.objectContaining({
        system: expect.stringContaining('CRITICAL: Your previous response was not valid JSON'),
        message: 'Every day summarize rows',
      }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
  });

  it('returns INVALID_LLM_RESPONSE when the retry local Gemini call throws', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not-json')
      .mockRejectedValueOnce(new Error('retry provider unavailable'));

    const result = await runIntentStage('Send an email after manual approval', '[]', 'retry-throws');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
    expect(result.rawResponse).toBe('Error: retry provider unavailable');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('stringifies object responses from local Gemini before parsing intent JSON', async () => {
    mockProcessRequest.mockResolvedValue({
      intent: 'Handle a form submission',
      triggerType: 'form',
      actions: ['read form submission', 'send confirmation email'],
      dataFlows: [],
      constraints: ['do not send duplicates'],
    });

    const result = await runIntentStage('Handle a form submission', '[]', 'object-response');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intent.triggerType).toBe('form');
    expect(result.intent.actions).toEqual(['read form submission', 'send confirmation email']);
    expect(result.intent.constraints).toEqual(['do not send duplicates']);
    expect(result.llmCall.completionTokens).toBeGreaterThan(0);
  });
});
