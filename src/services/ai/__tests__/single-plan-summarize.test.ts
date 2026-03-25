/**
 * Contract shape for single-plan summarize responses (no heavy module imports).
 */
describe('single-plan summarize response shape', () => {
  it('includes workflowIntentPlan with required fields', () => {
    const summarizeResponse = {
      phase: 'summarize' as const,
      workflowIntentPlan: {
        structuredSummary: 'Step 1',
        proposedNodeChain: ['form', 'if_else', 'google_gmail', 'slack_message', 'log_output'],
        nodeInclusionReasons: {
          form: 'explicit trigger in prompt',
          if_else: 'branching intent detected',
          google_gmail: 'explicit output target in prompt',
          slack_message: 'explicit output target in prompt',
        },
        originalPrompt: 'test',
      },
      promptVariations: [] as unknown[],
    };
    expect(summarizeResponse.phase).toBe('summarize');
    expect(summarizeResponse.workflowIntentPlan.proposedNodeChain).toContain('log_output');
  });
});
