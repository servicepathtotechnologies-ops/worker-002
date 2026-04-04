import { resolveWorkflowRuntimeIntent } from '../workflow-runtime-intent';

describe('resolveWorkflowRuntimeIntent', () => {
  it('prefers metadata.originalUserPrompt over user_prompt and name', () => {
    expect(
      resolveWorkflowRuntimeIntent(
        {
          metadata: { originalUserPrompt: 'Post to LinkedIn about our launch' },
          user_prompt: 'Different legacy prompt',
          name: 'My workflow',
        },
        {}
      )
    ).toBe('Post to LinkedIn about our launch');
  });

  it('uses graph.metadata.originalUserPrompt when top-level metadata has no intent', () => {
    expect(
      resolveWorkflowRuntimeIntent(
        {
          graph: { metadata: { originalUserPrompt: 'From graph only' } },
          name: 'Named',
        },
        {}
      )
    ).toBe('From graph only');
  });

  it('lets per-run execution payload override stored metadata', () => {
    expect(
      resolveWorkflowRuntimeIntent(
        {
          metadata: { originalUserPrompt: 'Stored intent' },
        },
        { workflowIntent: 'Override for this run' }
      )
    ).toBe('Override for this run');
  });

  it('falls back to user_prompt then description then name', () => {
    expect(
      resolveWorkflowRuntimeIntent({ user_prompt: 'From user_prompt' }, {})
    ).toBe('From user_prompt');
    expect(
      resolveWorkflowRuntimeIntent({ description: 'Desc', name: 'N' }, {})
    ).toBe('Desc');
    expect(resolveWorkflowRuntimeIntent({ name: 'Only name' }, {})).toBe('Only name');
  });

  it('reads nested execution keys (inputData, body, etc.)', () => {
    expect(
      resolveWorkflowRuntimeIntent(
        { metadata: { originalUserPrompt: 'Stored' } },
        { inputData: { workflowIntent: 'From form' } }
      )
    ).toBe('From form');
    expect(
      resolveWorkflowRuntimeIntent({}, { body: { prompt: 'Body prompt' } })
    ).toBe('Body prompt');
  });

  it('returns default when nothing is set', () => {
    expect(resolveWorkflowRuntimeIntent(null, {})).toBe('Process workflow data');
    expect(resolveWorkflowRuntimeIntent({}, null)).toBe('Process workflow data');
    expect(resolveWorkflowRuntimeIntent(undefined, undefined)).toBe('Process workflow data');
  });

  it('treats whitespace-only storage as empty and falls through', () => {
    expect(
      resolveWorkflowRuntimeIntent(
        { metadata: { originalUserPrompt: '   ' }, name: 'Fallback name' },
        {}
      )
    ).toBe('Fallback name');
  });
});
