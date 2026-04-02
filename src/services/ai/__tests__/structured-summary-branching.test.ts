import { AIIntentClarifier } from '../summarize-layer';

describe('structured summary branching connection plan', () => {
  it('renders if_else connection plan using explicit true/false branch labels', () => {
    const clarifier = new AIIntentClarifier() as any;
    const summary: string = clarifier.buildStructuredSummaryFromChain(
      ['form', 'if_else', 'google_gmail', 'slack_message', 'log_output'],
      'If age is greater than 18 send gmail, else send slack',
      {
        branchKind: 'if_else',
        discriminatorField: 'value',
        cases: [
          { id: 'if_1', label: 'true', condition: { type: 'equality', left: 'value', matchValue: 'true' }, targetNodeTypes: ['google_gmail'], isDefault: false },
          { id: 'if_2', label: 'false', condition: { type: 'equality', left: 'value', matchValue: 'false' }, targetNodeTypes: ['slack_message'], isDefault: false },
        ],
        estimatedBranchCount: 2,
        confidence: 0.9,
      }
    );

    expect(summary).toContain('If/Else (if_else)');
    expect(summary).toContain('[true]');
    expect(summary).toContain('[false]');
    expect(summary).toContain('Gmail (google_gmail)');
    expect(summary).toContain('Slack (slack_message)');
    expect(summary).toContain('branch-path observable output');
  });

  it('renders parallel branches from output→log pairs when branch metadata is absent', () => {
    const clarifier = new AIIntentClarifier() as any;
    const summary: string = clarifier.buildStructuredSummaryFromChain(
      ['form', 'if_else', 'google_gmail', 'log_output', 'slack_message', 'log_output'],
      'If experience > 3 years shortlist and Gmail, else Slack.',
      undefined
    );

    const executionOnly = summary.split('## Configuration contract')[0] || summary;

    expect(executionOnly).toContain('[true]');
    expect(executionOnly).toContain('[false]');
    expect(executionOnly).toContain('If/Else (if_else)');
    expect(executionOnly).toContain('Gmail (google_gmail)');
    expect(executionOnly).toContain('Slack (slack_message)');
    expect(executionOnly).not.toMatch(/\(log_output\)\s*→\s*Slack/i);
    expect(executionOnly).toMatch(/Slack \(slack_message\).*→.*log_output/is);
    expect(executionOnly).toMatch(/Gmail \(google_gmail\).*→.*log_output/is);
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

  it('keeps explicit switch outputs without generic output fan-out', () => {
    const clarifier = new AIIntentClarifier() as any;
    const selected = clarifier.buildIntentMinimalNodeSelection(
      'Use switch by ball color: red to slack, blue to gmail, green to logout.',
      ['form', 'switch', 'google_gmail', 'slack_message', 'email', 'log_output']
    );

    expect(selected.selectedNodeTypes).toContain('switch');
    expect(selected.selectedNodeTypes).toContain('google_gmail');
    expect(selected.selectedNodeTypes).toContain('slack_message');
    expect(selected.selectedNodeTypes).not.toContain('email');
  });

  it('does not treat intent-alignment field labels as canonical node mentions', () => {
    const clarifier = new AIIntentClarifier() as any;
    const chain = ['form', 'google_gmail', 'log_output'];
    const summary: string = clarifier.buildStructuredSummaryFromChain(
      chain,
      'When I submit a form with name and email, send a welcome email, then write a log entry.',
      undefined,
      'Collected inputs aligned to form/conditions: name (Name), email (Email).'
    );

    expect(() =>
      clarifier.assertPlanConsistency(
        { proposedNodeChain: chain, structuredSummary: summary },
        'When I submit a form with name and email, send a welcome email, then write a log entry.',
        ['form', 'google_gmail']
      )
    ).not.toThrow();
  });
});
