import { describe, expect, it } from '@jest/globals';
import {
  autoRepairCanonicalChainForIntent,
  autoRepairCanonicalChainSemantics,
  canonicalizePlanChainStrict,
  validateCanonicalChainCompleteness,
  validateCanonicalChainSemantics,
} from '../plan-chain-guards';

describe('generate-workflow canonical plan chain gates', () => {
  it('rejects non-canonical aliases with explicit issues', () => {
    const result = canonicalizePlanChainStrict(['form', 'gmail', 'log_output']);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.input === 'gmail')).toBe(true);
  });

  it('flags branching chain when downstream targets are missing', () => {
    const issues = validateCanonicalChainCompleteness(['form', 'if_else', 'log_output'], {
      userPrompt: 'If age > 18 send gmail else send slack message',
    });
    expect(issues.some((i) => i.reason.includes('branch_downstream_outputs_insufficient'))).toBe(true);
  });

  it('auto-repairs branching chain with intent-mentioned outputs', () => {
    const repaired = autoRepairCanonicalChainForIntent(
      ['form', 'if_else', 'google_gmail', 'log_output'],
      'If age > 18 send Gmail else send Slack'
    );
    expect(repaired.canonical.includes('slack_message')).toBe(true);
    const issues = validateCanonicalChainCompleteness(repaired.canonical, {
      userPrompt: 'If age > 18 send Gmail else send Slack',
    });
    expect(issues).toHaveLength(0);
  });

  it('does not inject unrelated fallback outputs when explicit branch outputs are present', () => {
    const repaired = autoRepairCanonicalChainForIntent(
      ['form', 'if_else', 'google_gmail', 'log_output'],
      'If age > 18 send Gmail else send Slack'
    );
    expect(repaired.canonical.includes('slack_message')).toBe(true);
    expect(repaired.canonical.includes('email')).toBe(false);
  });

  it('drops generic email node when google_gmail is already in the plan (redundant email channel)', () => {
    const repaired = autoRepairCanonicalChainForIntent(
      ['manual_trigger', 'switch', 'google_gmail', 'slack_message', 'email', 'log_output'],
      'If red Slack, if blue Gmail, if green logout'
    );
    expect(repaired.canonical.includes('google_gmail')).toBe(true);
    expect(repaired.canonical.includes('email')).toBe(false);
    expect(repaired.repairs.some((r) => r.startsWith('deduped_email_family:'))).toBe(true);
  });

  it('keeps generic email when user explicitly asks for SMTP / non-Gmail', () => {
    const repaired = autoRepairCanonicalChainForIntent(
      ['manual_trigger', 'switch', 'google_gmail', 'email', 'log_output'],
      'Send via Gmail for team A and SMTP email for team B'
    );
    expect(repaired.canonical.includes('google_gmail')).toBe(true);
    expect(repaired.canonical.includes('email')).toBe(true);
  });

  it('accepts non-branching chains without forced branch inflation', () => {
    const issues = validateCanonicalChainCompleteness(['form', 'google_gmail', 'log_output'], {
      userPrompt: 'Collect form and send Gmail confirmation',
    });
    expect(issues).toHaveLength(0);
  });

  it('flags over-broad chains for simple branching intent', () => {
    const issues = validateCanonicalChainCompleteness(
      ['form', 'delay', 'wait', 'if_else', 'supabase', 'google_sheets', 'google_gmail', 'salesforce', 'log_output'],
      { userPrompt: 'Users submit form, if age > 18 send gmail else send slack' }
    );
    expect(issues.some((i) => i.reason.includes('over_broad_chain_non_intent_nodes'))).toBe(true);
  });

  it('flags semantic reversal when transformation appears before data source', () => {
    const issues = validateCanonicalChainSemantics(
      ['manual_trigger', 'ai_agent', 'google_sheets', 'slack_message', 'log_output'],
      { userPrompt: 'Fetch tickets from Google Sheets, summarize, then send to Slack' }
    );
    expect(issues.some((i) => i.reason.includes('semantic_order_violation:transformation_before_data_source'))).toBe(true);
  });

  it('passes semantic checks for fetch -> summarize -> send ordering', () => {
    const issues = validateCanonicalChainSemantics(
      ['manual_trigger', 'google_sheets', 'ai_agent', 'slack_message', 'log_output'],
      { userPrompt: 'Fetch tickets from Google Sheets, summarize, then send to Slack' }
    );
    expect(issues).toHaveLength(0);
  });

  it('auto-repairs invalid branch order into semantically valid sequence', () => {
    const repaired = autoRepairCanonicalChainSemantics(
      ['form', 'google_gmail', 'if_else', 'slack_message', 'log_output'],
      { userPrompt: 'If age > 18 send Gmail else send Slack' }
    );
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.canonical.indexOf('if_else')).toBeGreaterThan(repaired.canonical.indexOf('form'));
    expect(repaired.canonical.indexOf('if_else')).toBeLessThan(repaired.canonical.indexOf('google_gmail'));
    const issues = validateCanonicalChainSemantics(repaired.canonical, {
      userPrompt: 'If age > 18 send Gmail else send Slack',
    });
    expect(issues).toHaveLength(0);
  });
});
