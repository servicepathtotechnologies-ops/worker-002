import { AIIntentClarifier } from '../summarize-layer';

describe('structured summary branching connection plan', () => {
  it('renders if_else connection plan using explicit true/false branch labels', () => {
    const clarifier = new AIIntentClarifier() as any;
    const summary: string = clarifier.buildStructuredSummaryFromChain(
      ['form', 'if_else', 'google_gmail', 'slack_message', 'log_output'],
      'If age is greater than 18 send gmail, else send slack',
      'Branching node routes data into separate paths based on condition/case evaluation.'
    );

    expect(summary).toContain('If/Else (if_else) ->');
    expect(summary).toContain('[true]');
    expect(summary).toContain('[false]');
    expect(summary).toContain('Gmail (google_gmail)');
    expect(summary).toContain('Slack (slack_message)');
    expect(summary).toContain('persist true-path observable output');
    expect(summary).toContain('persist false-path observable output');
  });

  it('does not add extra branch output when prompt explicitly names two targets', () => {
    const clarifier = new AIIntentClarifier() as any;
    const selected = clarifier.buildIntentMinimalNodeSelection(
      'If amount >= 500 send Gmail, else send Slack.',
      ['form', 'if_else', 'google_gmail', 'slack_message', 'email', 'log_output']
    );

    expect(selected.selectedNodeTypes).toContain('google_gmail');
    expect(selected.selectedNodeTypes).toContain('slack_message');
    expect(selected.selectedNodeTypes).not.toContain('email');
  });
});
