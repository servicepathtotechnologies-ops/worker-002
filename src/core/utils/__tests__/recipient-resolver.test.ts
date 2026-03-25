import { describe, expect, it } from '@jest/globals';
import { resolveRecipients } from '../recipient-resolver';

describe('recipient-resolver', () => {
  it('resolves manual recipientEmails when provided', () => {
    const result = resolveRecipients({
      credentialInputRecipientEmails: 'one@example.com, two@example.com',
      recipientSource: 'manual_entry',
      userIntent: '',
      upstreamOutputs: [],
    });
    expect(result.source).toBe('explicit_user_input');
    expect(result.recipientList).toEqual(['one@example.com', 'two@example.com']);
  });

  it('returns missing for manual_entry without recipientEmails', () => {
    const result = resolveRecipients({
      credentialInputRecipientEmails: '',
      recipientSource: 'manual_entry',
      userIntent: '',
      upstreamOutputs: [],
    });
    expect(result.source).toBe('missing');
    expect(result.recipientList).toEqual([]);
  });

  it('prefers upstream sheet rows with email-like columns before needing aggressive scan', () => {
    const result = resolveRecipients({
      credentialInputRecipientEmails: '',
      recipientSource: 'extract_from_sheet',
      userIntent: '',
      upstreamOutputs: [{ items: [{ email: 'a@x.com' }] }],
    });
    expect(result.source).toBe('upstream_detected_email');
    expect(result.recipientList).toEqual(['a@x.com']);
  });

  it('uses aggressive scan when enabled and no email-like column names', () => {
    const result = resolveRecipients({
      credentialInputRecipientEmails: '',
      recipientSource: 'extract_from_sheet',
      userIntent: '',
      upstreamOutputs: [{ items: [{ col_a: 'x', weird_col: 'foo@bar.com' }] }],
      useAggressiveRowScan: true,
    });
    expect(result.source).toBe('upstream_detected_email');
    expect(result.recipientList).toContain('foo@bar.com');
  });

  it('does not use aggressive scan when disabled and columns are not email-like', () => {
    const result = resolveRecipients({
      credentialInputRecipientEmails: '',
      recipientSource: 'extract_from_sheet',
      userIntent: '',
      upstreamOutputs: [{ items: [{ col_a: 'x', weird_col: 'foo@bar.com' }] }],
      useAggressiveRowScan: false,
    });
    expect(result.recipientList).toEqual([]);
  });
});
