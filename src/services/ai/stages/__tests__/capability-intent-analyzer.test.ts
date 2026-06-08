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

import { runIntentAnalysis, buildSystemPromptForTest } from '../capability-intent-analyzer';
import { geminiOrchestrator } from '../../gemini-orchestrator';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;

const CATALOG = '["google_gmail","slack","webhook_trigger"]';

function singleTriggerJson(): string {
  return JSON.stringify([
    {
      unitId: 'uid-1',
      label: 'Trigger: webhook received',
      semanticRole: 'trigger',
      description: 'Fires when a webhook POST is received',
      orderIndex: 0,
    },
  ]);
}

function twoUnitJson(): string {
  return JSON.stringify([
    {
      unitId: 'uid-1',
      label: 'Trigger: webhook received',
      semanticRole: 'trigger',
      description: 'Fires when a webhook POST is received',
      orderIndex: 0,
    },
    {
      unitId: 'uid-2',
      label: 'Send email via Gmail',
      semanticRole: 'output',
      description: 'Send a confirmation email via Gmail',
      orderIndex: 1,
    },
  ]);
}

describe('buildSystemPromptForTest', () => {
  it('returns a non-empty string embedding the catalog', () => {
    const prompt = buildSystemPromptForTest(CATALOG);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain(CATALOG);
  });

  it('includes all six valid semanticRole values', () => {
    const prompt = buildSystemPromptForTest(CATALOG);
    for (const role of ['trigger', 'data_source', 'communication', 'transformation', 'output', 'logic']) {
      expect(prompt).toContain(role);
    }
  });

  it('includes instructions about exactly one trigger unit', () => {
    const prompt = buildSystemPromptForTest(CATALOG);
    expect(prompt).toMatch(/exactly one.*trigger|one unit.*trigger/i);
  });
});

describe('runIntentAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok:true with normalized units on valid first-attempt response', async () => {
    mockProcessRequest.mockResolvedValue(twoUnitJson());

    const result = await runIntentAnalysis('Send email when webhook fires', CATALOG, 'corr-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units).toHaveLength(2);
    expect(result.units[0].semanticRole).toBe('trigger');
    expect(result.units[1].semanticRole).toBe('output');
    expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof result.durationMs).toBe('number');
    expect(result.llmCall.model).toBeTruthy();
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('auto-generates unitId when missing from LLM response', async () => {
    const noId = JSON.stringify([
      { label: 'Trigger', semanticRole: 'trigger', description: 'Fires on event', orderIndex: 0 },
    ]);
    mockProcessRequest.mockResolvedValue(noId);

    const result = await runIntentAnalysis('test prompt', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.units[0].unitId).toBe('string');
    expect(result.units[0].unitId.length).toBeGreaterThan(0);
  });

  it('assigns orderIndex from array position when not provided by LLM', async () => {
    const noIndex = JSON.stringify([
      { unitId: 'u1', label: 'Trigger', semanticRole: 'trigger', description: 'fires' },
      { unitId: 'u2', label: 'Send', semanticRole: 'output', description: 'sends' },
    ]);
    mockProcessRequest.mockResolvedValue(noIndex);

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units[0].orderIndex).toBe(0);
    expect(result.units[1].orderIndex).toBe(1);
  });

  it('strips markdown code fences before parsing', async () => {
    mockProcessRequest.mockResolvedValue('```json\n' + twoUnitJson() + '\n```');

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units).toHaveLength(2);
  });

  it('returns LLM_CALL_FAILED when processRequest throws on first attempt', async () => {
    mockProcessRequest.mockRejectedValue(new Error('Network timeout'));

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(result.message).toContain('Network timeout');
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds when first response cannot be parsed as JSON', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not valid json at all')
      .mockResolvedValueOnce(twoUnitJson());

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units).toHaveLength(2);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns INVALID_LLM_RESPONSE when both parse attempts fail', async () => {
    mockProcessRequest.mockResolvedValue('definitely not json');

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_CALL_FAILED when the parse-failure retry also throws', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not json')
      .mockRejectedValueOnce(new Error('Retry failed too'));

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns EMPTY_UNIT_LIST immediately without retry when LLM returns empty array', async () => {
    mockProcessRequest.mockResolvedValue('[]');

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('EMPTY_UNIT_LIST');
    // No retry for empty list — terminal error
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('retries with violation context when no trigger unit is present, succeeds on retry', async () => {
    const noTrigger = JSON.stringify([
      { unitId: 'u1', label: 'Send email', semanticRole: 'output', description: 'sends', orderIndex: 0 },
    ]);
    mockProcessRequest
      .mockResolvedValueOnce(noTrigger)
      .mockResolvedValueOnce(twoUnitJson());

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units.some(u => u.semanticRole === 'trigger')).toBe(true);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns INVALID_LLM_RESPONSE when validation-retry response also fails validation', async () => {
    const noTrigger = JSON.stringify([
      { unitId: 'u1', label: 'Send email', semanticRole: 'output', description: 'sends', orderIndex: 0 },
    ]);
    // Both attempts return a no-trigger response
    mockProcessRequest.mockResolvedValue(noTrigger);

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('retries when multiple trigger units are detected', async () => {
    const multiTrigger = JSON.stringify([
      { unitId: 'u1', label: 'Trigger 1', semanticRole: 'trigger', description: 'fires', orderIndex: 0 },
      { unitId: 'u2', label: 'Trigger 2', semanticRole: 'trigger', description: 'also fires', orderIndex: 1 },
    ]);
    mockProcessRequest
      .mockResolvedValueOnce(multiTrigger)
      .mockResolvedValueOnce(twoUnitJson());

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('retries when a unit has an invalid semanticRole', async () => {
    const badRole = JSON.stringify([
      { unitId: 'u1', label: 'Trigger', semanticRole: 'trigger', description: 'fires', orderIndex: 0 },
      { unitId: 'u2', label: 'Step', semanticRole: 'social_media', description: 'posts', orderIndex: 1 },
    ]);
    mockProcessRequest
      .mockResolvedValueOnce(badRole)
      .mockResolvedValueOnce(twoUnitJson());

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_CALL_FAILED when the validation-retry LLM call throws', async () => {
    const noTrigger = JSON.stringify([
      { unitId: 'u1', label: 'Send', semanticRole: 'output', description: 'sends', orderIndex: 0 },
    ]);
    mockProcessRequest
      .mockResolvedValueOnce(noTrigger)
      .mockRejectedValueOnce(new Error('Validation retry threw'));

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_CALL_FAILED');
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
  });

  it('passes the user prompt as the message field to the LLM call', async () => {
    mockProcessRequest.mockResolvedValue(singleTriggerJson());

    await runIntentAnalysis('My specific user prompt', CATALOG, 'corr-abc');

    expect(mockProcessRequest).toHaveBeenCalledWith(
      'intent-analysis',
      expect.objectContaining({ message: 'My specific user prompt' }),
      expect.objectContaining({ model: expect.any(String), temperature: expect.any(Number), cache: false }),
    );
  });

  it('includes the catalog in the system prompt sent to the LLM', async () => {
    mockProcessRequest.mockResolvedValue(singleTriggerJson());

    await runIntentAnalysis('test prompt', CATALOG);

    const [[, { system }]] = mockProcessRequest.mock.calls;
    expect(system).toContain(CATALOG);
  });

  it('returns INVALID_LLM_RESPONSE when validation-retry parse also fails', async () => {
    const noTrigger = JSON.stringify([
      { unitId: 'u1', label: 'Send', semanticRole: 'output', description: 'sends', orderIndex: 0 },
    ]);
    mockProcessRequest
      .mockResolvedValueOnce(noTrigger)
      .mockResolvedValueOnce('not json at all');

    const result = await runIntentAnalysis('test', CATALOG);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_LLM_RESPONSE');
  });
});
