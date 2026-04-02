import { describe, expect, it } from '@jest/globals';
import { IntentAutoExpander } from '../intent-auto-expander';
import type { StructuredIntent } from '../intent-structurer';

describe('intent auto expander', () => {
  it('expands vague notification prompt using deterministic assumptions', async () => {
    const expander = new IntentAutoExpander();
    const intent: StructuredIntent = {
      trigger: '',
      actions: [],
      requires_credentials: [],
    };

    const result = await expander.expandIntent('Build a notification workflow', intent, 0.4);

    expect(result).not.toBeNull();
    expect(result?.requires_confirmation).toBe(true);
    expect(result?.assumed_trigger).toBeTruthy();
    expect((result?.assumed_actions || []).length).toBeGreaterThan(0);
    expect(result?.expanded_intent).toContain('Workflow Goal');
  });

  it('does not expand concrete intent with clear trigger and actions', async () => {
    const expander = new IntentAutoExpander();
    const intent: StructuredIntent = {
      trigger: 'form',
      actions: [{ type: 'google_gmail', operation: 'send' }],
      requires_credentials: [],
    };

    const result = await expander.expandIntent(
      'Send welcome email when user submits registration form',
      intent,
      0.98
    );

    expect(result).toBeNull();
  });

  it('generates generic assumptions when no template matches', async () => {
    const expander = new IntentAutoExpander();
    const intent: StructuredIntent = {
      trigger: '',
      actions: [],
      requires_credentials: [],
    };

    const result = await expander.expandIntent('Analyze data and send email', intent, 0.5);

    expect(result).not.toBeNull();
    expect(result?.assumed_actions).toEqual(expect.arrayContaining(['google_gmail:send']));
    expect(result?.assumptions?.length || 0).toBeGreaterThan(0);
  });
});
