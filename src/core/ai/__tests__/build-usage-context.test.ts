import {
  runWithBuildUsageTracking,
  snapshotBuildAiUsage,
  recordLlmUsage,
  mergePersistedBuildAiUsage,
} from '../build-usage-context';

describe('build-usage-context', () => {
  it('snapshot is empty outside tracking', () => {
    expect(snapshotBuildAiUsage().totals.callCount).toBe(0);
  });

  it('records LLM usage inside runWithBuildUsageTracking', async () => {
    await runWithBuildUsageTracking(async () => {
      recordLlmUsage({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        stage: 'test',
      });
      recordLlmUsage({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        stage: 'test',
      });
      const snap = snapshotBuildAiUsage();
      expect(snap.totals.callCount).toBe(2);
      expect(snap.totals.promptTokens).toBe(15);
      expect(snap.totals.completionTokens).toBe(25);
      expect(snap.totals.totalTokens).toBe(40);
      expect(snap.byStage.test.callCount).toBe(2);
    });
  });

  it('mergePersistedBuildAiUsage accumulates totals and calls', () => {
    const merged = mergePersistedBuildAiUsage(null, {
      calls: [
        {
          at: 't',
          provider: 'gemini',
          model: 'm',
          stage: 'llm',
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
        },
      ],
      totals: { promptTokens: 1, completionTokens: 2, totalTokens: 3, callCount: 1 },
      byStage: {
        llm: { promptTokens: 1, completionTokens: 2, totalTokens: 3, callCount: 1 },
      },
    });
    const again = mergePersistedBuildAiUsage(merged, {
      calls: [
        {
          at: 't2',
          provider: 'gemini',
          model: 'm',
          stage: 'llm',
          promptTokens: 2,
          completionTokens: 0,
          totalTokens: 2,
        },
      ],
      totals: { promptTokens: 2, completionTokens: 0, totalTokens: 2, callCount: 1 },
      byStage: {
        llm: { promptTokens: 2, completionTokens: 0, totalTokens: 2, callCount: 1 },
      },
    });
    expect(again.totals.callCount).toBe(2);
    expect(again.totals.totalTokens).toBe(5);
    expect(again.calls.length).toBe(2);
  });
});
