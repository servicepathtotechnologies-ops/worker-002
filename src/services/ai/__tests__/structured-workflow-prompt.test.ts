import {
  formatArchitecturalWorkflowPrompt,
  structuredPromptAlreadyHasArchitecture,
} from '../structured-workflow-prompt';

describe('structured-workflow-prompt', () => {
  it('formatArchitecturalWorkflowPrompt includes Goal and Terminal', () => {
    const s = formatArchitecturalWorkflowPrompt({
      goal: 'Post AI content to LinkedIn',
      proposedNodeChain: ['manual_trigger', 'ai_agent', 'linkedin', 'log_output'],
    });
    expect(s).toContain('Goal:');
    expect(s).toContain('Post AI content to LinkedIn');
    expect(s).toContain('manual_trigger');
    expect(s).toContain('Terminal: log_output');
  });

  it('structuredPromptAlreadyHasArchitecture detects execution layout', () => {
    expect(structuredPromptAlreadyHasArchitecture('foo')).toBe(false);
    expect(structuredPromptAlreadyHasArchitecture('Execution:\n1. a (a)')).toBe(true);
  });

  it('includes registry fill contract when requested', () => {
    const s = formatArchitecturalWorkflowPrompt({
      goal: 'Test',
      proposedNodeChain: ['manual_trigger', 'log_output'],
      includeRegistryFillContract: true,
    });
    expect(s).toContain('Configuration contract (registry');
    expect(s).toContain('manual_trigger');
  });

  it('describes multiple log_output terminals', () => {
    const s = formatArchitecturalWorkflowPrompt({
      goal: 'Branch',
      proposedNodeChain: ['form', 'if_else', 'google_gmail', 'log_output', 'slack_message', 'log_output'],
    });
    expect(s).toContain('2 × log_output');
  });
});
