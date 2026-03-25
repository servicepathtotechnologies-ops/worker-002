import { describe, expect, it } from '@jest/globals';
import { CredentialPreflightChecker } from '../credential-preflight-check';

const checker = new CredentialPreflightChecker();

describe('CredentialPreflightChecker (registry-driven)', () => {
  it('does not require credentials for manual_trigger', () => {
    expect(checker.requiresCredentials('manual_trigger')).toBe(false);
  });

  it('requires credentials for google_gmail', () => {
    expect(checker.requiresCredentials('google_gmail')).toBe(true);
  });

  it('requires credentials for slack_message', () => {
    expect(checker.requiresCredentials('slack_message')).toBe(true);
  });

  it('resolves Google OAuth when existingAuth has google key', async () => {
    const result = await checker.checkCredentials(
      [{ id: 'n1', type: 'google_gmail', data: { label: 'Gmail' } } as any],
      {
        google: { access_token: 'tok', scopes: ['https://www.googleapis.com/auth/gmail.send'] },
      }
    );
    expect(result.ready).toBe(true);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].exists).toBe(true);
    expect(result.checks[0].valid).toBe(true);
  });

  it('marks missing when no auth for slack_message', async () => {
    const result = await checker.checkCredentials([{ id: 's1', type: 'slack_message', data: {} } as any], {});
    expect(result.ready).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});
