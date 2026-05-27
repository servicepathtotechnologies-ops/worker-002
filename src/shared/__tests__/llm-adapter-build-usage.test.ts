import { LLMAdapter } from '../llm-adapter';
import { runWithBuildUsageTracking, snapshotBuildAiUsage } from '../../core/ai/build-usage-context';

describe('LLMAdapter build usage tracking', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('records usage from Gemini response when tracking is active', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: 'hi' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 7,
          candidatesTokenCount: 3,
          totalTokenCount: 15,
        },
      }),
    }) as unknown as typeof fetch;

    await runWithBuildUsageTracking(async () => {
      const adapter = new LLMAdapter();
      await adapter.chat(
        'gemini',
        [{ role: 'user', content: 'hello' }],
        { model: 'gemini-3.5-flash', apiKey: 'test-key', usageStage: 'unit' }
      );
      const snap = snapshotBuildAiUsage();
      expect(snap.totals.callCount).toBe(1);
      expect(snap.totals.totalTokens).toBe(15);
      expect(snap.calls[0].stage).toBe('unit');
    });
  });

  it('normalizes old Gemini model IDs before calling the API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    }) as unknown as jest.Mock;
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new LLMAdapter();
    await adapter.chat(
      'gemini',
      [{ role: 'user', content: 'hello' }],
      { model: 'gemini-2.5-flash', apiKey: 'test-key' }
    );

    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.5-flash:generateContent');
  });
});
