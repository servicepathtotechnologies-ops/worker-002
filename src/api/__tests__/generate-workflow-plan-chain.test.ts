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
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(true);
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

  it('accepts switch prompt when two cases share same output type', () => {
    const issues = validateCanonicalChainCompleteness(
      ['form', 'switch', 'google_gmail', 'slack_message', 'slack_message', 'log_output'],
      {
        userPrompt:
          'Route by status: success send gmail, pending send slack, failed send slack alert',
      }
    );
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(false);
  });

  it('accepts if_else prompt when both branches share same output type', () => {
    const issues = validateCanonicalChainCompleteness(
      ['form', 'if_else', 'google_gmail', 'google_gmail', 'log_output', 'log_output'],
      {
        userPrompt:
          'If age is above 18 send gmail and if age is 18 or below also send gmail notification.',
      }
    );
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(false);
  });

  it('accepts payment-status switch prompt with repeated output categories', () => {
    const canonical = ['form', 'switch', 'google_gmail', 'slack_message', 'google_gmail', 'log_output', 'log_output'];
    const issues = validateCanonicalChainCompleteness(
      canonical,
      {
        userPrompt:
          'Create an autonomous workflow with a form trigger that collects payment status as input. Use a switch condition: if status is success, send a confirmation email via Gmail; if pending, send a reminder via Slack; if failed, send an alert via Slack. Ensure the workflow correctly routes each status to the appropriate action.',
      }
    );
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(false);
  });

  it('accepts switch prompt with four cases even when output type repeats', () => {
    const issues = validateCanonicalChainCompleteness(
      ['form', 'switch', 'google_gmail', 'slack_message', 'slack_message', 'google_gmail', 'log_output', 'log_output'],
      {
        userPrompt:
          'Switch by status: success Gmail, pending Slack, failed Slack, escalated Gmail.',
      }
    );
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(false);
  });

  it('accepts switch prompt with five cases and repeated output families', () => {
    const issues = validateCanonicalChainCompleteness(
      ['form', 'switch', 'google_gmail', 'slack_message', 'slack_message', 'google_gmail', 'slack_message', 'log_output', 'log_output'],
      {
        userPrompt:
          'Switch by state: s1 Gmail, s2 Slack, s3 Slack, s4 Gmail, s5 Slack.',
      }
    );
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(false);
  });

  it.each([
    {
      label: 'if_else with duplicate output type and two terminals',
      canonical: ['form', 'if_else', 'google_gmail', 'google_gmail', 'log_output', 'log_output'],
      userPrompt:
        'If marks are pass send Gmail with pass message, else send Gmail with fail message and include score.',
    },
    {
      label: 'switch with duplicate slack outputs and per-case terminal',
      canonical: ['form', 'switch', 'google_gmail', 'slack_message', 'slack_message', 'log_output', 'log_output'],
      userPrompt:
        'Route by status: success send Gmail, pending send Slack reminder, failed send Slack alert.',
    },
    {
      label: 'switch with repeated gmail and slack outputs',
      canonical: ['form', 'switch', 'google_gmail', 'slack_message', 'google_gmail', 'log_output', 'log_output'],
      userPrompt:
        'Switch by payment status: success Gmail receipt, pending Slack reminder, failed Gmail escalation.',
    },
    {
      label: 'if_else with duplicate slack outputs and two terminals',
      canonical: ['form', 'if_else', 'slack_message', 'slack_message', 'log_output', 'log_output'],
      userPrompt:
        'If score is above 40 send Slack pass alert, else send Slack fail alert with remediation.',
    },
    {
      label: 'if_else with gmail and slack with duplicated terminals',
      canonical: ['form', 'if_else', 'google_gmail', 'slack_message', 'log_output', 'log_output'],
      userPrompt:
        'If approved send Gmail confirmation, else send Slack rejection notice.',
    },
    {
      label: 'switch with three outputs and repeated gmail',
      canonical: ['form', 'switch', 'google_gmail', 'slack_message', 'google_gmail', 'log_output', 'log_output'],
      userPrompt:
        'Route application status: accepted Gmail, hold Slack, rejected Gmail with reason.',
    },
    {
      label: 'switch with three outputs and repeated slack',
      canonical: ['form', 'switch', 'slack_message', 'google_gmail', 'slack_message', 'log_output', 'log_output'],
      userPrompt:
        'Route ticket severity: critical Slack page, medium Gmail summary, low Slack backlog note.',
    },
    {
      label: 'switch with all outputs gmail variants',
      canonical: ['form', 'switch', 'google_gmail', 'google_gmail', 'google_gmail', 'log_output', 'log_output'],
      userPrompt:
        'Switch by region and send Gmail with region-specific content for each branch.',
    },
    {
      label: 'switch with all outputs slack variants',
      canonical: ['form', 'switch', 'slack_message', 'slack_message', 'slack_message', 'log_output', 'log_output'],
      userPrompt:
        'Switch by environment and send Slack updates with environment-specific payload.',
    },
    {
      label: 'manual trigger switch mixed outputs with duplicate slack',
      canonical: ['manual_trigger', 'switch', 'google_gmail', 'slack_message', 'slack_message', 'log_output', 'log_output'],
      userPrompt:
        'Route deployment result: success Gmail, warning Slack, failed Slack escalation.',
    },
    {
      label: 'manual trigger if_else duplicate gmail with personalized branch copy',
      canonical: ['manual_trigger', 'if_else', 'google_gmail', 'google_gmail', 'log_output', 'log_output'],
      userPrompt:
        'If attendance is above threshold send Gmail congratulation, else send Gmail warning with action plan.',
    },
  ])('accepts branch slot completeness for $label', ({ canonical, userPrompt }) => {
    const issues = validateCanonicalChainCompleteness(canonical, { userPrompt });
    expect(issues.some((i) => i.reason.includes('branch_slots_insufficient'))).toBe(false);
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
