import { pickPrimaryNarrativeStringFromUpstreamOutput } from '../upstream-narrative-text';

describe('pickPrimaryNarrativeStringFromUpstreamOutput', () => {
  test('uses declared string output property when registry has outputSchema (text_summarizer → response)', () => {
    const s = pickPrimaryNarrativeStringFromUpstreamOutput('text_summarizer', {
      response: 'This is the long summary text from the model.',
      model: 'gemini-3.5-flash',
    });
    expect(s).toContain('summary');
    expect(s?.length).toBeGreaterThan(20);
  });

  test('without upstream type, picks longest top-level string', () => {
    const s = pickPrimaryNarrativeStringFromUpstreamOutput(undefined, {
      a: 'short',
      b: 'much longer narrative content here',
    });
    expect(s).toBe('much longer narrative content here');
  });

  test('returns undefined for non-object', () => {
    expect(pickPrimaryNarrativeStringFromUpstreamOutput('text_summarizer', null)).toBeUndefined();
    expect(pickPrimaryNarrativeStringFromUpstreamOutput('text_summarizer', 'x')).toBeUndefined();
  });
});
