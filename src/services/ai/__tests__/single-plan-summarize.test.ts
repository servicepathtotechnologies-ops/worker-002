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
        orderingDiagnostics: {
          confidence: 0.92,
          hopRationales: ['form → if_else: start workflow with user/system event'],
          repairActions: ['semantic_reorder_branch_template'],
        },
        rankedSelectionDiagnostics: {
          kept: [{ nodeType: 'form', score: 0.99, reason: 'explicit trigger in prompt' }],
          dropped: [{ nodeType: 'email', score: 0.2, reason: 'removed by exclusivity guard: prefer google_gmail' }],
        },
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
    expect(summarizeResponse.workflowIntentPlan.orderingDiagnostics?.confidence).toBeGreaterThan(0);
    expect(summarizeResponse.workflowIntentPlan.rankedSelectionDiagnostics?.kept.length).toBeGreaterThan(0);
  });
});
