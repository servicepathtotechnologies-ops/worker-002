import { describe, expect, it } from '@jest/globals';
import {
  buildCredentialWizardView,
  matchCredentialStatusForQuestion,
  type CredentialStatusRow,
} from '../wizard-credential-view';
import type { ComprehensiveNodeQuestion } from '../comprehensive-node-questions-generator';

const baseQ = (overrides: Partial<ComprehensiveNodeQuestion>): ComprehensiveNodeQuestion =>
  ({
    id: 'cred_1',
    text: 'API Key',
    type: 'password',
    nodeId: 'n1',
    nodeType: 'openai_gpt',
    nodeLabel: 'GPT',
    fieldName: 'apiKey',
    category: 'credential',
    required: true,
    askOrder: 0,
    ownershipUiMode: 'locked',
    ownershipLockReason: 'vault_or_oauth',
    ...overrides,
  }) as ComprehensiveNodeQuestion;

describe('wizard-credential-view', () => {
  it('matchCredentialStatusForQuestion matches by fieldName to credentialId', () => {
    const q = baseQ({ fieldName: 'webhookUrl', text: 'Slack webhook URL' });
    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'n1',
        credentialId: 'slack_webhook',
        displayName: 'Slack Webhook URL',
        status: 'required_missing',
      },
    ];
    expect(matchCredentialStatusForQuestion(q, statuses)).toBe('required_missing');
  });

  it('buildCredentialWizardView groups by node and sets requiresInput for missing', () => {
    const questions: ComprehensiveNodeQuestion[] = [
      baseQ({
        id: 'q1',
        nodeId: 'n_slack',
        nodeLabel: 'Slack',
        nodeType: 'slack_message',
        fieldName: 'webhookUrl',
        text: 'Webhook URL',
        category: 'credential',
        isUnlockableCredential: true,
        ownershipUiMode: 'locked',
        ownershipLockReason: 'credential_locked_until_unlock',
      }),
    ];
    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'n_slack',
        credentialId: 'webhook',
        displayName: 'Slack Webhook URL',
        status: 'required_missing',
      },
    ];
    const { rows, groups } = buildCredentialWizardView(questions, statuses);
    expect(rows).toHaveLength(1);
    expect(rows[0].requiresInput).toBe(true);
    expect(rows[0].ownershipSummary).toBe('unlockable_locked');
    expect(rows[0].kind).toBe('webhook');
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(1);
  });

  it('marks resolved_connected and does not require input', () => {
    const questions: ComprehensiveNodeQuestion[] = [
      baseQ({
        id: 'q_g',
        nodeId: 'n_g',
        nodeLabel: 'Gmail',
        nodeType: 'google_gmail',
        fieldName: 'credentialId',
        text: 'Google account',
        category: 'credential',
      }),
    ];
    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'n_g',
        credentialId: 'google',
        displayName: 'Google OAuth (Gmail)',
        status: 'resolved_connected',
      },
    ];
    const { rows } = buildCredentialWizardView(questions, statuses);
    expect(rows[0].status).toBe('resolved_connected');
    expect(rows[0].requiresInput).toBe(false);
  });

  it('excludes non-credential configuration questions', () => {
    const questions: ComprehensiveNodeQuestion[] = [
      baseQ({ category: 'configuration', ownershipClass: undefined, fieldName: 'subject' }),
    ];
    const { rows } = buildCredentialWizardView(questions, []);
    expect(rows).toHaveLength(0);
  });
});
