import { attachCanonicalPipelineMetadata } from '../ai-first-pipeline';
import type { Workflow } from '../../../core/types/ai-types';

describe('attachCanonicalPipelineMetadata', () => {
  it('sets originalUserPrompt, structuralBlueprintSummary, aiPipelineCorrelationId, and timestamp', () => {
    const wf: Workflow = {
      nodes: [],
      edges: [],
    };
    const out = attachCanonicalPipelineMetadata(wf, {
      userPrompt: '  Send a weekly report  ',
      structuralPrompt: 'Linear: trigger → sheets → gmail',
      correlationId: 'corr-test-1',
    });
    expect(out.metadata?.originalUserPrompt).toBe('Send a weekly report');
    expect(out.metadata?.structuralBlueprintSummary).toContain('Linear:');
    expect(out.metadata?.aiPipelineCorrelationId).toBe('corr-test-1');
    expect(typeof out.metadata?.timestamp).toBe('string');
    expect((out.metadata?.timestamp as string).length).toBeGreaterThan(10);
  });

  it('truncates very long structural prompts', () => {
    const long = 'x'.repeat(5000);
    const out = attachCanonicalPipelineMetadata(
      { nodes: [], edges: [] },
      { userPrompt: 'p', structuralPrompt: long, correlationId: 'c' },
    );
    expect(out.metadata?.structuralBlueprintSummary?.length).toBeLessThanOrEqual(4001);
    expect(out.metadata?.structuralBlueprintSummary?.endsWith('…')).toBe(true);
  });

  it('preserves existing metadata keys and overwrites canonical fields', () => {
    const wf: Workflow = {
      nodes: [],
      edges: [],
      metadata: { customKey: 1, originalUserPrompt: 'old' },
    };
    const out = attachCanonicalPipelineMetadata(wf, {
      userPrompt: 'new intent',
      structuralPrompt: 'bp',
      correlationId: 'id2',
    });
    expect((out.metadata as any).customKey).toBe(1);
    expect(out.metadata?.originalUserPrompt).toBe('new intent');
  });
});
