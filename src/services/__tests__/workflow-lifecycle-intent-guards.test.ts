import {
  applyEmailTransportExclusivity,
  detectLogoutIntent,
  isSummarizationNodeType,
  needsSummarizationNode,
} from '../workflow-lifecycle-manager';

describe('workflow lifecycle intent guards', () => {
  it('detects summarize intent from prompt text', () => {
    expect(needsSummarizationNode('Get rows and summarize them')).toBe(true);
    expect(needsSummarizationNode('Build a webhook to append sheet')).toBe(false);
  });

  it('recognizes canonical summarization node types', () => {
    expect(isSummarizationNodeType('ai_chat_model')).toBe(true);
    expect(isSummarizationNodeType('text_summarizer')).toBe(true);
    expect(isSummarizationNodeType('google_sheets')).toBe(false);
  });

  it('enforces gmail/email exclusivity by prompt context', () => {
    const both = ['google_gmail', 'email', 'log_output'];
    expect(applyEmailTransportExclusivity(both, 'send email via gmail')).toContain('google_gmail');
    expect(applyEmailTransportExclusivity(both, 'send email via gmail')).not.toContain('email');
    expect(applyEmailTransportExclusivity(both, 'send an email notification')).toContain('email');
    expect(applyEmailTransportExclusivity(both, 'send an email notification')).not.toContain('google_gmail');
  });

  it('detects logout intent phrases', () => {
    expect(detectLogoutIntent('if green then logout user')).toBe(true);
    expect(detectLogoutIntent('sign out this session')).toBe(true);
    expect(detectLogoutIntent('send slack notification')).toBe(false);
  });
});

