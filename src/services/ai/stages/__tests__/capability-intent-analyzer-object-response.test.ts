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

import { runIntentAnalysis } from '../capability-intent-analyzer';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import type { UseCaseUnit } from '../capability-types';

const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;

const CATALOG = '["form_trigger","slack"]';

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

function validUnits(): UseCaseUnit[] {
  return [
    unit(),
    unit({
      unitId: 'unit-slack',
      label: 'Send Slack notification',
      semanticRole: 'communication',
      description: 'Posts the form summary to Slack',
      orderIndex: 1,
    }),
  ];
}

describe('runIntentAnalysis object responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a raw array response from the LLM and normalizes unit text', async () => {
    mockProcessRequest.mockResolvedValue([
      unit({
        label: '  Collect form submission  ',
        description: '  Fires when the form is submitted  ',
      }),
    ]);

    const result = await runIntentAnalysis('When a form is submitted, start the workflow', CATALOG, 'corr-102');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units).toHaveLength(1);
    expect(result.units[0].label).toBe('Collect form submission');
    expect(result.units[0].description).toBe('Fires when the form is submitted');
    expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
  });

  it('accepts a raw array response on the parse-failure retry', async () => {
    mockProcessRequest
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(validUnits());

    const result = await runIntentAnalysis('Notify Slack when a form is submitted', CATALOG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units.map((u) => u.unitId)).toEqual(['unit-trigger', 'unit-slack']);
    expect(result.llmCall.model).toBeTruthy();
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);

    const retryPayload = mockProcessRequest.mock.calls[1][1];
    expect(retryPayload.system).toContain('could not be parsed as a JSON array');
  });

  it('accepts a raw array response on the validation retry and includes the violation context', async () => {
    mockProcessRequest
      .mockResolvedValueOnce(JSON.stringify([
        unit(),
        unit({
          unitId: 'unit-invalid',
          label: 'Post to social media',
          semanticRole: 'social_media' as UseCaseUnit['semanticRole'],
          description: 'Posts an update',
          orderIndex: 1,
        }),
      ]))
      .mockResolvedValueOnce(validUnits());

    const result = await runIntentAnalysis('Send Slack when a form is submitted', CATALOG, 'corr-validation');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.units).toHaveLength(2);
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);

    const retryPayload = mockProcessRequest.mock.calls[1][1];
    expect(retryPayload.system).toContain('invalid semanticRole "social_media"');
    expect(retryPayload.system).toContain('trigger, data_source, communication, transformation, output, logic');
  });
});
