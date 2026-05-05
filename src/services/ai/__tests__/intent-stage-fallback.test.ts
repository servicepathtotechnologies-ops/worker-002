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
});
