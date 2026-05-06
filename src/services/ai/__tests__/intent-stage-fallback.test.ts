import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { runIntentStage } from '../stages/intent-stage';
import { geminiOrchestrator } from '../gemini-orchestrator';

jest.mock('../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

const mockedProcessRequest = geminiOrchestrator.processRequest as jest.MockedFunction<
  typeof geminiOrchestrator.processRequest
>;

describe('IntentStage fallback', () => {
  beforeEach(() => {
    mockedProcessRequest.mockReset();
  });

  it('returns a deterministic intent when both LLM responses are invalid JSON', async () => {
    mockedProcessRequest.mockResolvedValue('not-json');

    const result = await runIntentStage(
      'Every day get rows from Google Sheets, summarize them, then send the summary to Gmail',
      '[]',
      'test-correlation-id',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.fallback).toBe(true);
    expect(result.intent.triggerType).toBe('schedule');
    expect(result.intent.actions).toEqual([
      'Every day get rows from Google Sheets',
      'summarize them',
      'send the summary to Gmail',
    ]);
  });

  it('returns a deterministic intent when the LLM call fails', async () => {
    mockedProcessRequest.mockRejectedValue(new Error('provider unavailable'));

    const result = await runIntentStage('Submit a form then send a Slack message', '[]');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.fallback).toBe(true);
    expect(result.intent.triggerType).toBe('form');
    expect(result.intent.actions).toEqual(['Submit a form', 'send a Slack message']);
  });

  it('parses fenced JSON intent responses without falling back', async () => {
    mockedProcessRequest.mockResolvedValue([
      '```json',
      JSON.stringify({
        intent: 'Submit a form and route by age',
        triggerType: 'form',
        actions: ['submit form with age', 'check if age > 18', 'send Gmail', 'send Slack'],
        dataFlows: [],
        constraints: [],
      }),
      '```',
    ].join('\n'));

    const result = await runIntentStage('Submit a form and route by age', '[]');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBeUndefined();
    expect(result.intent.actions).toEqual([
      'submit form with age',
      'check if age > 18',
      'send Gmail',
      'send Slack',
    ]);
  });

  it('splits conditional fallback prompts into discrete actions', async () => {
    mockedProcessRequest.mockResolvedValue('not-json');

    const result = await runIntentStage(
      'Create an autonomous workflow where a user submits details through a form including age. If age > 18, mark the user as eligible and send a confirmation email via Gmail. If age \u2264 18, mark as not eligible and send a notification message via Slack.',
      '[]',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBe(true);
    expect(result.intent.triggerType).toBe('form');
    expect(result.intent.actions).toEqual(expect.arrayContaining([
      'a user submits details through a form including age',
      'check if age > 18',
      'send a confirmation email via Gmail',
      'check if age \u2264 18',
      'send a notification message via Slack',
    ]));
    expect(result.intent.actions.length).toBeGreaterThanOrEqual(5);
  });
});
